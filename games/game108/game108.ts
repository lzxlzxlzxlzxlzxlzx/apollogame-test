// game108《拳律》—— 卡带宿主层（mount/host·契约明许·零玩法逻辑）。
// 职责都在 sim 外：建 Engine + 运行环、把 world 投影成 DuelView、把 UI action 入队成引擎输入、cleanup。
// 玩法规则一律在 blueprint.ts 的数据 + 引擎能力里。
import { mountUI, resolveBindings } from '@zerocraft/engine/ui/components/index.js';
import type { MountHandle, LayoutNode, UIDataSource } from '@zerocraft/engine/ui/components/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { loadGameArtOverrides } from '@zerocraft/engine/assets/index.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { Resource, GameFlow, StringVar } from '@zerocraft/engine/engine/protocol/components.js';
import type { WorldSnapshot, EntityId } from '@zerocraft/engine/engine/core/types.js';
import { buildBlueprint } from './blueprint.js';
import { buildDuelScreen, emptyView, loadPct, type AppPick, type SdkRow, type DuelView, type Phase } from './duel-screen.js';
import { DUEL_THEME, VIEW_W, VIEW_H, HANDS, SIDES, HP_MAX, HP_RES, chargeEntity, lastThrowVar, PHASE_TICKS, TPS, type Hand, type Side } from './theme.js';
import { READ_MID, loadMemory, saveMemory, loadHelpSeen, saveHelpSeen, type Memory } from './theme.js';
import { DEFAULT_CARD, MOOD_AI, type CardCharacter } from './card-character.js';
import { UI_ACT, ACT } from './theme.js';
import { loadLang, saveLang, t, type Lang } from './strings.js';
import { createAudio, loadAudioFlags, type Sfx } from './audio.js';
import { createVoice, voiceLine, type VoiceEvent } from './voice.js';

// 舞台外框（画布之外那圈·稿子里是 `#171310` 深木底衬着 1920×1080 的对局屏）。
const STAGE_BG = '#171310';
/** 【S6】舞台背景的**皮肤槽键**（台账 art-04 据此认作有槽·孤儿审计读 `data-scene-bg-skin`）。 */
export const SCENE_BG_SKIN = 'game108/scene/stage';
/**
 * 背景图的已解析 URL —— **同步取自本游戏的美术索引**（`filledSrc` 只认 `status:'filled'`）。
 * 取不到（今天就是取不到：还没有这张图）→ null → `mountHost` 纯回退程序化底。
 * 走索引而不是写死路径，是「换了没反应」那条铁律：创作台替换进了索引就该上画面。
 */
const sceneBgUrl: string | null = null;

/**
 * 卡片角色（约会对象）—— owner 2026-08-07：「对手是我们传进来的卡片角色……卡片的心情就是它的 AI」。
 *
 * **不能挂在 `mount` 的第二个参数上**：`mount(el, host?)` 的第二位已被 launcher 的宿主契约占用
 * （`src/launcher/game-runner.tsx`·`{exit}`），改签名会把卡带装载面整条打红（tsc 实测）。
 * 故走「装载前先 `setCard`」这条：宿主拿到卡片 → `setCard(card)` → `mount(el)`。
 * 没设 = 内置兜底卡片（探针与本机试玩走这条），屏上一切照常。
 * DokiWorld 真 schema 到手后，在这里加一个适配函数即可，`mount` 一行不动。
 */
let currentCard: CardCharacter = DEFAULT_CARD;
export function setCard(card: CardCharacter): void { currentCard = card; }

/**
 * 世界只读观察口（DokiWorld 出包线·REQ-DOKIPACK）—— 与 `setCard` 同款的宿主侧通道：
 * 装载前 `setWorldObserver(fn)`，此后**每帧 redraw 之后**把当前引擎的 world 递出去一次。
 *
 * 为什么需要它：`mount()` 把引擎收在闭包里，外层宿主（DokiWorld 接线层）要把终局
 * 投影成 GameResult（读 `flow` 的 GameFlow / 两侧 hp——与验收剧本 readWorld 同口径），
 * 没有这条缝就只能撬 DOM。**只读投影，零规则**：观察者不写世界、不进 sim/hash/录放，
 * 与 readView 同属表现层旁路；「再来一局」换引擎后闭包里的 `engine` 已是新台，天然跟随。
 */
type WorldObserver = (world: Engine['world']) => void;
let worldObserver: WorldObserver | undefined;
export function setWorldObserver(fn?: WorldObserver): void { worldObserver = fn; }

/**
 * 「换个游戏玩」推荐位（DokiWorld「获取卡带」·REQ-DOKI-APPS·owner 2026-08-16 判）——
 * 与 `setCard` 同款的宿主侧通道，但**可以在装载之后到货**（`apps.list` 是宿主 capability，
 * 异步且可能降级）。故它比 `setCard` 多一件事：到货时**主动重画一次**（`picksNotify`
 * 在 mount 期间挂上、卸载时摘掉）——不重挂、不重启引擎，同美术索引异步到货那条路。
 *
 * **纯表现零规则**：推荐位只进 `readView` 的投影（`ui.*` 本地动作），
 * **不写世界、不进 sim/hash/录放/lockstep**——拉起隔壁 App 是宿主的事，世界不该知道。
 * 没设 / 空列表 = 终局屏整条不画（本机试玩与渲染探针走这条·屏上逐像素同旧版）。
 */
let appPicks: readonly AppPick[] = [];
let picksNotify: (() => void) | undefined;
export function setAppPicks(picks: readonly AppPick[]): void {
  appPicks = Array.isArray(picks) ? [...picks] : [];
  picksNotify?.();
}
/** 玩家点了推荐位某一格（arg=appId）。宿主接住去 `apps.launch`；**没接住就当没这颗键**——
 *  不挂 handler 时点了会静默入队成信号污染世界，故这一颗永远由本文件的 handler 兜底消费。 */
type AppPickHandler = (appId: string) => void;
let appPickHandler: AppPickHandler | undefined;
export function onAppPick(fn?: AppPickHandler): void { appPickHandler = fn; }

/**
 * 【persona】玩家自己是谁（DokiWorld `persona` 模块·owner 2026-08-17 判做）——
 * 与 `setCard`（对手是谁）对称的那一半。装载后可到货，到货重画一次。
 * **纯表现零规则**：名字与画像只进 `readView` 的投影，不写世界、不进 hash/录放/lockstep。
 * 没设 = 屏上仍是写死的「你」+ 首字（本机试玩与渲染探针走这条·逐像素同旧版）。
 */
let myPersona: { name?: string; avatarUrl?: string } | undefined;

/**
 * 【episode】这一局的赌注（剧情侧传下来的一句话·如「输了要请她吃饭」）。
 * **纯表现**：它不改任何规则，只是让玩家知道这一局是为什么打的。没设 = 不画。
 */
let stakesLine: string | undefined;
export function setStakes(text?: string): void {
  stakesLine = typeof text === 'string' && text.trim() ? text.trim() : undefined;
  sdkNotify?.();
}
export function setMyPersona(p?: { name?: string; avatarUrl?: string }): void {
  myPersona = p && (p.name || p.avatarUrl) ? { ...p } : undefined;
  sdkNotify?.();      // 与演示台共用同一条重画通知（都是"宿主异步到货"那条路）
}

/**
 * 【speech + dialogue】角色的**声音**与**台词**（owner 2026-08-17 判做）。
 *
 * 这两条走同一个缝，因为屏上它们本来就是同一件事：**她说了一句话**。
 * 现在这句话是本地写死的七句（`voice.ts LINES`），声音是浏览器 TTS。接上 DokiWorld 之后：
 *   台词 ← `dialogue`（这个角色会说的话·每局不同）
 *   声音 ← `speech`（这个角色的音色·不是浏览器那把塑料嗓）
 *
 * ⚠ **两条都必须是"到货即用、没到就退"**，绝不让对局等它们：
 *   · `setVoiceClips` 收的是**已经合成好的 URL 表**（接线层在开局那 1.4 秒加载条里预取），
 *     播的时候只是查表 —— 合成延迟被加载条吃掉了，对局中零等待。
 *   · `setVoiceLines` 收的是**台词覆盖表**（接线层提前一个回合生成好），查不到就用本地那句。
 * 两张表都是**部分覆盖**：有几条算几条，缺的各自退回本地，玩家看不出接缝。
 *
 * **纯表现零规则**：声音与台词不写世界、不进 hash/录放/lockstep（同 `lang` 那条分界）。
 */
let voiceClips: Partial<Record<VoiceEvent, string>> = {};
/** 正在播的那一段（同一时刻只许有一段·放新的前先停它）。 */
let voiceAudio: HTMLAudioElement | undefined;
export function setVoiceClips(clips: Partial<Record<VoiceEvent, string>>): void {
  voiceClips = { ...clips };
}
let voiceOverrides: Partial<Record<VoiceEvent, string>> = {};
export function setVoiceLines(lines: Partial<Record<VoiceEvent, string>>): void {
  voiceOverrides = { ...lines };
  sdkNotify?.();     // 字幕文本变了要重画（同"宿主异步到货"那条路）
}

/**
 * 【SDK 演示台】九行状态的宿主侧通道（owner 2026-08-17「把所有 SDK 功能实践一遍」）。
 * 与 `setAppPicks` 同款：装载后可随时到货，到货就重画一次。
 * **纯表现零规则**——面板只进 `readView` 的投影，不写世界、不进 sim/hash/录放/lockstep。
 * 没设 = 菜单里那一行照样在，但面板是空的（本机试玩与渲染探针走这条）。
 */
let sdkRows: readonly SdkRow[] = [];
/**
 * 【SDK 日志】屏上那块日志区的内容（**最新在最前**）。
 * owner 2026-08-17：「我在应用中无法看到日志」——DokiWorld 的 iframe 里没有控制台，
 * 所以「调了什么 / 得到了什么」必须能在屏上读到。console 那份照打，这份是给人看的。
 */
let sdkLog: readonly string[] = [];
export function setSdkLog(lines: readonly string[]): void {
  sdkLog = Array.isArray(lines) ? [...lines] : [];
  sdkNotify?.();
}
/** 【版本号】构建注入（`__APP_VERSION__`）→ 屏上（开始屏角落 + 演示台标题旁）。 */
let appVersion: string | undefined;
export function setAppVersion(v?: string): void {
  appVersion = typeof v === 'string' && v ? v : undefined;
  sdkNotify?.();
}
let sdkNotify: (() => void) | undefined;
export function setSdkRows(rows: readonly SdkRow[]): void {
  sdkRows = Array.isArray(rows) ? [...rows] : [];
  sdkNotify?.();
}
/** 玩家按了某一行的「试一下」（arg = 模块 key）。宿主接住去真调那个 capability。 */
type SdkTryHandler = (key: string) => void;
let sdkTryHandler: SdkTryHandler | undefined;
export function onSdkTry(fn?: SdkTryHandler): void { sdkTryHandler = fn; }

/**
 * 世界恢复口（DokiWorld 挂起/恢复·规范 §6 checkpoint）—— `setWorldObserver` 的孪生缝：
 * 装载前 `setWorldRestore({snapshot, order})`，下一次 `mount()` 起局时把快照灌回世界
 * （`world.restore()`——引擎自己的读档原语，system/蓝图不动，只换实体状态），并跳过
 * 「点开始」闸门直接续局（玩家早开过局了，挂起恢复不该再问一次）。
 *
 * **纯接线零规则**：快照来自世界自身 `snapshot()/snapshotOrder()`，本缝不解释内容、
 * 不挑字段——挑字段就是把「哪些状态算局面」这条规则写进了宿主层。**只吃一次**
 * （`consumeWorldRestore` 拿走即清）：「再来一局」仍走全新蓝图，不会把旧快照又灌回来。
 */
export interface WorldRestorePayload { snapshot: WorldSnapshot; order?: readonly EntityId[] }
let pendingRestore: WorldRestorePayload | undefined;
export function setWorldRestore(r?: WorldRestorePayload): void { pendingRestore = r; }
/** mount 起局时消费（拿走即清·独立导出为的是不起 DOM 也能点名测试这条一次性语义）。 */
export function consumeWorldRestore(): WorldRestorePayload | undefined {
  const r = pendingRestore;
  pendingRestore = undefined;
  return r;
}

export function mount(container: HTMLElement): () => void {
  const card = currentCard;
  const { scene, teardown } = mountHost(container, {
    fieldW: VIEW_W, fieldH: VIEW_H, sceneBackground: STAGE_BG, wrapperBackground: '#171310',
    /**
     * 【S6】**可换背景槽**（`REQ-ART ②`·手册「程序化背景 = 可换背景槽」）。
     *
     * 在这之前舞台底是一个写死的十六进制色——**换不了**，于是"给这游戏配张背景"这件事
     * 在美术线上根本没有落点（台账里加一行也是孤儿行，红线明令禁止）。
     * 挂上槽之后：**有生成图就叠图、没有就纯回退程序化底**（`resolveSceneBg` 的语义·兜底永不丢），
     * 孤儿审计也据 `data-scene-bg-skin` 认得出「此场景有可换背景槽」。
     *
     * `imageUrl` 现在恒为 null —— **本仓还没有这张图**（要文生图，而 `DASHSCOPE_API_KEY` 未配，
     * 探针见 S6 交付说明）。**不拿 mock 顶替**：手册红线写死「mock 永不上画面」。
     */
    sceneBgSkin: { skinKey: SCENE_BG_SKIN, imageUrl: sceneBgUrl, fit: 'cover' },
  });

  // UI action → 引擎输入：QueuedInputSource 同时是 Engine 的输入源与 mountUI 的 ActionSink
  // （同 game101 口径）——屏上的 `action` 入队成 InputQueue 动作，再由 t2-keybind 转成 Signal。
  const queue = new QueuedInputSource('p1');
  /**
   * 起一台引擎并装载世界。**每局一台**——`Engine.load()` 是「往现有世界里加」不是「换一个世界」
   * （`src/runtime/engine.ts`：逐个 `addSystem` / `createEntity`），
   * 对同一台引擎二次 `load` 会把 system 加两遍、实体重建一遍，**是脏局不是新局**。
   * 所以「再来一局」= 停掉旧的、起一台新的（见 `restart()`）。
   * 心情 → 出招规律是一张查表（`card-character.ts MOOD_AI`），换心情不写一行代码。
   */
  const boot = (): Engine => {
    const e = new Engine({ input: queue });
    // 【R-108-34】跨局画像灌回世界（owner 2026-08-08：「本地可以把玩家的数据落地」）。
    // **每局重灌一次**：局与局之间世界是新的，不灌就等于每局都是新玩家、
    // 「它有更长的记忆所以更强」当场变成空话。
    e.load(buildBlueprint(MOOD_AI[card.mood], loadMemory()));
    return e;
  };
  let engine = boot();
  // 【DokiWorld 挂起/恢复】装载前塞了快照 → 灌回世界续局（只影响首局；「再来一局」走全新蓝图）。
  const resume = consumeWorldRestore();
  if (resume) engine.world.restore(resume.snapshot, resume.order);
  let lang: Lang = loadLang();
  let menuOpen = false;
  let helpOpen = false;
  let sdkOpen = false;          // 【SDK 演示台】从设置菜单第六行进（owner 2026-08-17）
  /**
   * 这一次的说明屏是不是「首次进入自动弹的那一次」（owner 2026-08-15 试玩：
   * 「刚出来的时候是要先跳一下玩法说明。如果说玩家可以选跳过，这还是要有的」）。
   *
   * 落在**宿主**而不是世界里：看没看过说明是玩家这台机器的偏好，与对局规则无关——
   * 进了世界就会进 hash / 录放 / lockstep，两台机器"看过没看过"不同就判不一致（同 lang 那条分界）。
   * 续局（resume）不弹：玩家早就在打这一局了，中途糊一屏说明是打断不是引导。
   */
  let firstRunHelp = !resume && !loadHelpSeen();
  // owner 2026-08-08：「我还没有点开始，它就直接三个牌飞上来了」——**第一次进来必须先有开始键**。
  // 做法是**根本不启动引擎**（不是暂停）：玩家点下去看到的是完完整整的第一拍，
  // 而不是已经播过一半的 T1。顺带它还是整局第一个真实手势，BGM 从这里起（浏览器自动播放策略）。
  // 挂起恢复（resume）例外：玩家早点过开始了，续局直接开跑（见文件头 setWorldRestore）。
  let started = !!resume;
  /** 【S6】skinKey → URL（异步到货·空表 = 全部回退程序化底）。 */
  let skins: Record<string, string> = {};
  // 音频门面（声音=数据·端口在引擎）。无 AudioContext（探针/测试）→ 端口内建静默 no-op。
  const audio = createAudio(loadAudioFlags());
  // 角色配音：TTS 链；发不出声（headless / 没装音色）时 `say` 返回 false → 走字幕兜底。
  const voice = createVoice(card.id, card.mood, lang);
  let subtitle = '';
  let subtitleUntil = 0;          // 用**回合数**计时，不用墙钟——同一条纪律：表现层也别引入第二个时钟
  /**
   * 角色说一句 —— **带冷却**（owner 2026-08-08 试玩：「有点太聒噪了，少说点话」）。
   * 冷却用宿主自己的帧计数（`frames`·每次 redraw +1 = 每 tick 一次），**不用墙钟**——
   * 表现层也不许引入第二个时钟（同字幕用回合数计时那条纪律）。
   */
  const SAY_COOLDOWN = 8 * TPS;   // 同一张嘴至少隔 8 秒再开口
  const say = (ev: VoiceEvent): void => {
    if (!audio.flags.voice) return;
    if (frames - lastSayAt < SAY_COOLDOWN) return;
    lastSayAt = frames;
    // 【speech】三级降级链，**第一级换成宿主合成**：宿主音色 → 本地 TTS → 字幕。
    // `voiceClips` 是接线层在加载条那段就预取好的 URL 表，这里只是查表 + 播——零等待。
    // 播不出来（自动播放被拦/格式不支持）也照走下一级，绝不静默吞掉这一句。
    const clip = voiceClips[ev];
    let spoke = false;
    if (clip) {
      // ⚠ **单一句柄 + 放新的前先停旧的**（照 storyteller 的 `speak()`）：
      // 每次 `new Audio()` 各放各的，两句叠在一起 —— 本作有满蓄/亮拳/胜负连着触发的时候。
      try {
        voiceAudio?.pause();
        voiceAudio = new Audio(clip);
        void voiceAudio.play().catch(() => { /* 自动播放被拦 → 当没播·下面还有两级 */ });
        spoke = true;
      } catch { spoke = false; }
    }
    if (!spoke) voice.say(ev, lang);   // 返回 false 也照打字幕：听得见的两样都有，听不见的至少看得见
    // 【dialogue】字幕文本：宿主生成的那句优先，没有才用本地写死的七句之一。
    subtitle = voiceOverrides[ev] ?? voiceLine(ev, lang);
    subtitleUntil = shownRound + 1;
  };

  const num = (eid: string): number => engine.world.getComponent<Resource>(eid, 'Resource')?.current ?? 0;
  const str = (eid: string): string => engine.world.getComponent<StringVar>(eid, 'StringVar')?.value ?? '';

  /**
   * 把这一局积累的玩家画像写回 localStorage（【R-108-34】维度一的落地端）。
   * **从世界读、不在宿主另记一份**——宿主记一份就有了第二个真相，两边一漂移
   * 就是"AI 表现和存档对不上"这类查不出来的 bug。
   */
  const persist = (): void => {
    const m: Memory = {
      hist: Object.fromEntries(HANDS.map((h) => [h, num(`hist:${h}`)])) as Record<Hand, number>,
      style: num('style:p1'),
      read: num('read:p2'),
    };
    // 读准度**只有大师那一档存在**（前四档没有 `read:p2` 实体 → `num` 返回 0）。
    // 拿这个 0 覆盖上次存的真值 = 打一局复读机就把喂给大师的记忆抹平了。
    // ⚠ 兜底**不能写成 `?? m.read`**——那正是 0 本身，等于没兜（真浏览器旅程当场逮到：
    // 打完五回合复读机，存下来的是 `read: 0`）。没有旧值就回到中位，别回到 0。
    if (!engine.world.hasComponent('read:p2', 'Resource')) m.read = loadMemory()?.read ?? READ_MID;
    saveMemory(m);
  };

  /** world → 视图（**纯读**·outcome-first；不在这里做任何规则计算）。 */
  function readView(): DuelView {
    frames++;
    const flow = engine.world.getComponent<GameFlow>('flow', 'GameFlow');
    const raw = flow?.current ?? 'charge';
    // 【R-108-04】v3：世界里的 `throwPenalty` / `throwPenaltyHit` 是 T2 的读秒尾巴，**不是第五拍**——
    // 屏上仍写「出招」，只是倒计时环换成"你已经欠了多少"。故投影时折回 `throw`。
    const inPenalty = raw === 'throwPenalty' || raw === 'throwPenaltyHit';
    // 【R-108-01】v4：`throwLag` = 出手后揭晓前的那半秒（owner 2026-08-08：「等半秒吧」）。
    // 屏上仍是「出招」——手还扣着，悬念未破；只是**没有倒计时**了（你已经交卷了）。
    const inLag = raw === 'throwLag';
    // `lockIn`/`lockIn2` 是 T1/T2 之间的**各一拍**（AI 定手窗·【R-108-33】），共 33ms，
    // 屏上没有它们这一拍：并进「出招」。
    const phase = (inPenalty || inLag || raw === 'lockIn' || raw === 'lockIn2' ? 'throw' : raw) as Phase;
    const elapsed = flow?.elapsed ?? 0;
    // T4（`settle: 0`）与罚血读秒都**没有倒计时**：前者是玩家闸门，后者已经超时了。
    // 不能 `?? PHASE_TICKS.charge` 兜底——那会在结算屏画出一圈 2.5 秒的环，玩家以为不点也会自动过。
    const total = inPenalty || inLag ? 0 : PHASE_TICKS[phase as keyof typeof PHASE_TICKS] ?? 0;
    const charge = Object.fromEntries(SIDES.map((s) => [
      s, Object.fromEntries(HANDS.map((h) => [h, num(chargeEntity(s, h))])) as Record<Hand, number>,
    ])) as Record<Side, Record<Hand, number>>;
    const shown = Object.fromEntries(SIDES.map((s) => [s, str(`var:${s}`) as Hand | ''])) as Record<Side, Hand | ''>;
    const hp = { p1: num('p1'), p2: num('p2') };

    // ── 表现层派生（**不是规则**·不写世界·不进 hash）───────────────────────
    // ① 本回合我提交了什么：读世界里我这侧的 DuelIntent（接缝挂上去的那份）。
    const intent = engine.world.getComponent('p1', 'DuelIntent') as { throw: Hand } | undefined;
    // ② 上一次结算「谁赢了、打了多少」：**比对上一帧的血量**。为什么这么做——
    //    `DuelOutcome` 在 Commit 被 announce 消费掉、跨不到宿主；而"谁掉了多少血"本身就是
    //    玩家看得见的事实，用它反推展示是**投影不是判定**（规则仍只在引擎里）。
    // 同理：罚血掉的血**不算战果**，不许写进 `lastOutcome`——否则结果横幅会把 −1 当成「被打中」。
    if (!inPenalty) {
      for (const s of SIDES) {
        if (prevHp[s] > hp[s]) lastOutcome = { winner: s === 'p1' ? 'p2' : 'p1', damage: prevHp[s] - hp[s] };
      }
    }
    const round = num('round') || 1;
    // **本回合结算落地了没有**（真渲染目击到的坑）：亮手读的是 `lastThrow`、结果读的是血量差，
    // 而这两样都要等结算那一拍才更新——结算比「进对决」晚一拍。不判这个，进对决的头一小段
    // 屏上摆的是**上一回合**的手和伤害：我明明出了布，屏上写「你 ✌️剪 · 被打中 -20」。
    // 判据用回合数：结算会把 `round` +1，所以 `round > roundAtClash` ⇔ 本回合已结算。
    if (phase === 'clash' && prevPhase !== 'clash') {
      roundAtClash = round; lastOutcome = undefined; tieThisRound = true;
      // 【R-108-06/09】开打前的快照：血槽双段条与蓄力回撤都拿它当参照系（见 DuelView.before）。
      before = { hp: { ...hp }, charge: { p1: { ...charge.p1 }, p2: { ...charge.p2 } } };
    }
    // 【R-108-07】T1 注水的起点：看见我方总层数涨了就记一笔（哪只手 + 此刻在 T1 里的毫秒数）。
    if (phase === 'charge' && prevPhase !== 'charge') charged = undefined;
    const settled = round > roundAtClash;
    if (lastOutcome && lastOutcome.damage > 0) tieThisRound = false;
    // ── 音画同步（**纯表现**·读世界之后触发·绝不回写）───────────────────
    // 手册红线：音频/语音是表现层旁路，不进 sim/hash/录放。所以全部挂在"世界已经变成这样"之后。
    shownRound = round;
    if (subtitleUntil && round > subtitleUntil) subtitle = '';
    const myCharge = HANDS.reduce((n, h) => n + charge.p1[h], 0);
    if (myCharge > prevCharge) {
      audio.play(HANDS.some((h) => charge.p1[h] >= 3) ? 'full' : 'charge');
      // 【R-108-07】哪只手涨了 = 这一回合注水的那张卡；起点毫秒数直接由相位时钟换算。
      const grew = HANDS.find((h) => charge.p1[h] > (prevChargeByHand[h] ?? 0));
      if (grew && phase === 'charge') charged = { hand: grew, atMs: (elapsed / TPS) * 1000 };
    }
    prevCharge = myCharge;
    prevChargeByHand = { ...charge.p1 };
    const foeFull = HANDS.some((h) => charge.p2[h] >= 3);
    if (foeFull && !prevFoeFull) { audio.play('full'); say('foeFull'); }
    prevFoeFull = foeFull;
    const sub = intent?.throw ?? '';
    if (sub && sub !== prevSubmitted) audio.play('throw');
    prevSubmitted = phase === 'charge' ? '' : sub;
    if (phase === 'clash' && prevPhase !== 'clash') { audio.play('reveal'); say('clash'); }
    if (phase === 'charge' && prevPhase === 'settle') say('roundStart');
    // **罚血掉的血不是战果**：不出挨打音、不说胜负台词（定稿把这条写死成「不走横幅、不放大字号、
    // 不震屏、不触发胜负判定」——音这一路是同一条规则的另一半）。
    // owner 2026-08-08 实测报的正是这个：罚血每扣一秒就重新触发一次「看吧，我说中了」。
    if (!inPenalty) {
      for (const s of SIDES) {
        if (prevHp[s] > hp[s]) { audio.play(s === 'p1' ? 'taken' : 'hit'); say(s === 'p1' ? 'foeWin' : 'youWin'); }
      }
    }
    // 【R-108-34】画像落地：**每回合结算时**存一次，不等终局。
    // 等终局的话玩家中途关页面（本作最常见的退出方式）这一局就白打了，
    // 而"它记得你"正是第五档唯一的强项。存的是三样公开数，不含任何隐私。
    if (phase === 'settle' && prevPhase !== 'settle') persist();
    if (phase === 'p1win' && prevPhase !== 'p1win') { audio.play('win'); say('gameWin'); }
    if (phase === 'p2win' && prevPhase !== 'p2win') { audio.play('lose'); say('gameLose'); }

    prevHp = { ...hp }; prevPhase = phase;

    return {
      phase,
      phaseLeft: total > 0 ? Math.max(0, 1 - elapsed / total) : 0,
      // 环心读数（稿子的「N.N 秒」）：剩余 tick / TPS。
      phaseSec: total > 0 ? Math.max(0, (total - elapsed) / TPS) : 0,
      elapsedMs: (elapsed / TPS) * 1000,
      foeName: card.name,
      // 定稿 §⑥：心情上屏（名字下一枚小签）——它直接解释对手为什么这样打。
      foeMood: t(lang, `mood.${card.mood}` as const),
      // 画像两侧各一张：p2 来自角色卡，p1 来自 persona（两条都可能缺·缺了各自退回首字）。
      ...(card.portrait || myPersona?.avatarUrl
        ? { portrait: { ...(card.portrait ? { p2: card.portrait } : {}), ...(myPersona?.avatarUrl ? { p1: myPersona.avatarUrl } : {}) } }
        : {}),
      ...(myPersona?.name ? { myName: myPersona.name } : {}),
      ...(stakesLine ? { stakes: stakesLine } : {}),
      lang,
      menuOpen,
      audio: audio.flags,
      ...(subtitle ? { subtitle } : {}),
      round,
      hp,
      charge,
      penalty: { active: inPenalty, debt: num('debt:p1') },
      ...(Object.keys(skins).length ? { skins } : {}),
      // 【REQ-DOKI-APPS】宿主给了才带（空=终局屏整条不画·非 DokiWorld 宿主逐像素同旧版）。
      ...(appPicks.length ? { appPicks } : {}),
      ...(started ? {} : { notStarted: true, bootMs }),
      ...(helpOpen ? { helpOpen: true, ...(firstRunHelp ? { helpFirstRun: true } : {}) } : {}),
      ...(sdkOpen ? { sdkOpen: true } : {}),
      ...(sdkRows.length ? { sdk: sdkRows } : {}),
      ...(sdkLog.length ? { sdkLog } : {}),
      ...(appVersion ? { appVersion } : {}),
      ...(phase === 'settle' ? { awaitNext: true } : {}),
      ...(charged ? { charged } : {}),
      ...(before ? { before } : {}),
      smoke: { uses: num('smoke:uses:p1'), hidden: !!(engine.world.getComponent('smoke:res:p1', 'Flag') as { active: boolean } | undefined)?.active },
      ...(intent ? { submitted: intent.throw } : {}),
      // 只有本回合真结算了才亮手/出结果——否则揭晓期摆的是上一回合的数据（见上面 settled 注释）。
      ...(settled && (phase === 'clash' || phase === 'settle') ? { shown } : {}),
      ...(settled && lastOutcome ? { outcome: lastOutcome }
        : settled && tieThisRound && (phase === 'clash' || phase === 'settle') && shown.p1 && shown.p2
          ? { outcome: { winner: 'tie' as const, damage: 0 } } : {}),
    };
  }

  // 表现层记忆（render-only·不进 sim/hash）：用于「上一次结算掉了多少血」的横幅 + 音画同步。
  let shownRound = 1;
  let prevCharge = 0;             // 我方三槽总层数——涨了就是"又蓄了一层"
  let prevChargeByHand: Record<Hand, number> = { rock: 0, paper: 0, scissors: 0 };  // 逐手上一帧值（认出"涨的是哪只手"）
  let frames = 0;        // 宿主帧计数（= tick 数·**render-only**）——配音冷却用它，不引入墙钟
  let lastSayAt = -1e9;  // 上次开口的帧号
  let prevFoeFull = false;        // 对手是否已有满蓄的一手（由无到有 = 一记提醒）
  let prevSubmitted: Hand | '' = '';

  /**
   * 表现层记忆归零。**新局必须连它一起清**——否则上一局的血量/回合/结果会跟着进新局：
   * 血量记忆停在 0 会让新局第一帧就判"掉血"，把上一局的伤害横幅和挨打音再放一遍。
   */
  const resetPresentation = (): void => {
    prevHp = { p1: HP_MAX, p2: HP_MAX };
    prevPhase = 'charge'; tieThisRound = false; roundAtClash = 0; lastOutcome = undefined;
    frames = 0; lastSayAt = -1e9;
    shownRound = 1; prevCharge = 0; prevChargeByHand = { rock: 0, paper: 0, scissors: 0 }; prevFoeFull = false; prevSubmitted = '';
    subtitle = ''; subtitleUntil = 0;
    charged = undefined; before = undefined;
  };
  /** 【R-108-07】本回合蓄了哪只手 + 蓄下去那一刻在 T1 里的毫秒数（注水动画的起点）。 */
  let charged: { hand: Hand; atMs: number } | undefined;
  /** 【R-108-06/09】进 T3 那一拍抓的快照（血槽双段条 / 蓄力回撤的参照系）。 */
  let before: { hp: Record<Side, number>; charge: Record<Side, Record<Hand, number>> } | undefined;
  let prevHp: Record<Side, number> = { p1: HP_MAX, p2: HP_MAX };
  let prevPhase: Phase = 'charge';
  let tieThisRound = false;
  let roundAtClash = 0;
  let lastOutcome: { winner: Side | 'tie'; damage: number } | undefined;

  /**
   * 世界数据源（引擎的 DI 接缝）：`LayoutNode` 里的 `props.bind` **不会自己生效**——
   * `mountUI` 没有数据源入口，得游戏在交树之前自己跑一遍 `resolveBindings(tree, ds)`。
   * 不跑 = `bind` 是个哑弹：条永远画在 0，**不报错**（2026-08-07 点击探针截图目击：
   * 石槽文字已 3/3、条却是空的）。
   * 只读（显示）；写世界一律走 action 信号——两端分明是这条接缝的红线。
   */
  const dataSource: UIDataSource = {
    resource: (id) => {
      for (const [e] of engine.world.query('Resource')) {
        const r = engine.world.getComponent<Resource>(e, 'Resource');
        if (r && r.id === id) return { current: r.current, ...(r.max !== undefined ? { max: r.max } : {}) };
      }
      return undefined;
    },
  };
  const screen = (v: DuelView): LayoutNode => resolveBindings(buildDuelScreen(v), dataSource);
  void helpOpen;   // 由 readView 投影进视图（见上）

  // handlers **只挂表现层本地动作**（`ui.*`）：换语言是纯显示设置，不该进世界
  //（进了就会进 hash / 录放 / lockstep，两端语言不同就判不一致——那是灾难）。
  // 写世界的动作一律不挂 handler，走 `ActionSink` 入队成 Signal（信号铁律不变）。
  const redraw = (): void => { ui.update(screen(readView()), DUEL_THEME); worldObserver?.(engine.world); };

  /**
   * 【S6】**皮肤图**：把本游戏美术索引里 `filled` 的条目解析成 `skinKey → URL`，交给屏那一层。
   *
   * 红线「游戏侧消费必须读台账/skinMap·**禁只读硬编码路径**」的落点：
   * 少了这一步，创作台把图换进索引了、游戏里照样不上画面（「换了没反应」那个病·game-101 踩过）。
   * 拉不到 / 解析失败 → 空表 → 屏那边全部回退程序化底，**观感与今天逐像素相同**（美术是增量不是依赖）。
   * 异步到货后 `redraw()` 一次即换装——不重挂、不重启引擎。
   */
  void (async () => {
    // **走基座件**（`assets/game-art-load` 形态②）而不是自己 fetch+parse：
    // 它已经把「无 fetch / 非 200 / schema 不合法 / 无真图」四条全兜成空表且绝不抛。
    const next = await loadGameArtOverrides('game108');
    if (Object.keys(next).length === 0) return;   // 空表 = 全部回退程序化底（观感零变化）
    skins = next;
    redraw();                                      // 异步到货即换装——不重挂、不重启引擎
  })();

  /**
   * 「再来一局」（`duel.next`）——**局的生命周期归宿主**，不是世界里的一次状态跳转。
   *
   * 为什么不做成 flow 转移：终局态 `p1win/p2win` 要回到开局，得把**双方**的血、六条槽、
   * 回合数、上一手全部复位；而判定表那套按侧寻址在「全局 id 路由」上一直吃瘪（本仓第 5 例）。
   * 与其在世界里堆一串复位规则，不如**重新装载同一份蓝图**——那本来就是"新局"的定义，
   * 且和 mount 时走的是同一条路（同一个 `boot()`），不会出现"只有重开局才有的状态"。
   *
   * 信号铁律不破：`duel.next` 仍是**词表里的世界动作名**，只是它的消费者是宿主的局生命周期，
   * 不是某个 sim 能力——同 `ui.*` 那条分界，只不过这条不是显示设置而是"换一个世界"。
   */
  const restart = (): void => {
    engine.stop();
    engine = boot();
    resetPresentation();
    started = true;   // 「再来一局」是玩家明确要打，不必再问一次「开始吗」
    engine.subscribe(redraw);
    engine.start();
    audio.play('ui');
    redraw();
  };
  /**
   * `duel.next` **v3 起是一键两用**，落点由当前相位定：
   *   T4 结算 → 世界里的【R-108-05】玩家闸门（进下一回合）⇒ **入队走信号**，规则归引擎；
   *   终局屏 → 换一个世界（上面的 `restart`）⇒ 局的生命周期归宿主。
   * handler 挂着就**不会**自动进 ActionSink（本地 handler 优先），所以闸门那一路要**自己 enqueue**。
   * 忘了这一句 = 结算屏那枚键点了没反应、且不报错——正是 2026-08-07「再来一局是死键」那个病的形状。
   */
  const nextOrRestart = (): void => {
    audio.start();
    const cur = engine.world.getComponent<GameFlow>('flow', 'GameFlow')?.current ?? 'charge';
    if (cur === 'p1win' || cur === 'p2win') { restart(); return; }
    queue.enqueueAction(ACT.next);
    audio.play('ui');
  };
  /**
   * 【启动画面】假进度条的帧循环。**只在没开局那一段跑**：引擎还没 start（这是上一轮
   * owner 要的那道闸门——「我还没有点开始，它就直接三个牌飞上来了」），所以世界不会
   * 替我们发帧，加载条得自己走。
   *
   * 这是宿主里**唯一一处墙钟**，且刻意只服务表现层：世界的一切（含罚血读秒、字幕冷却）
   * 仍然按 tick 计时——「表现层也别引入第二个时钟」那条纪律管的是**参与规则的计时**，
   * 而这条进度是假的、开局即弃，进不了世界也进不了 hash。
   * 走完就**自己停**（不空转 rAF），点下去 `startGame` 再收一次尾。
   */
  let bootMs = 0;
  let bootStart = 0;
  let bootRaf = 0;
  const tickBoot = (now: number): void => {
    if (started) return;
    if (bootStart === 0) bootStart = now;
    const was = loadPct(bootMs);
    bootMs = now - bootStart;
    const next = loadPct(bootMs);
    if (next !== was) redraw();                 // 只在**量化后的挡位**变了才重画（见 loadPct 注释）
    if (next < 1) bootRaf = requestAnimationFrame(tickBoot);
    else bootRaf = 0;
  };
  const stopBoot = (): void => { if (bootRaf !== 0) { cancelAnimationFrame(bootRaf); bootRaf = 0; } };
  /** 开局：起引擎 + 起 BGM（这是整局第一个真实用户手势，浏览器的自动播放门在这儿开）。 */
  const startGame = (): void => {
    if (started) return;         // 连点幂等——同「再来一局」那条对抗性输入
    // 加载没走完就点不动：整屏那枚键在 `startScreen` 里是**加载完才挂 action** 的，
    // 这里再挡一道——handler 是公开面（键位/脚本都发得出），别只靠"没画按钮"。
    if (loadPct(bootMs) < 1) return;
    // 【首次进入】按任意键**先弹玩法说明**，再按一次（「跳过 · 开始」）才真开局。
    // 同一枚 `ui.start` 走两段，而不是新造一个动作：说明屏那枚键在玩家眼里就是"开始"，
    // 词表里多一个只在一种情形下存在的动作名反而更难对账（【R-108-70】）。
    if (firstRunHelp && !helpOpen) {
      helpOpen = true;
      audio.start(); audio.play('ui');   // 这一下已经是真实手势，音频门就在这儿开
      redraw();
      return;
    }
    if (firstRunHelp) { firstRunHelp = false; helpOpen = false; saveHelpSeen(); }
    started = true;
    stopBoot();
    audio.start(); audio.play('ui');
    engine.start();
    redraw();
  };
  const ui: MountHandle = mountUI(scene, screen(emptyView()), {
    [UI_ACT.start]: startGame,
    // 每个本地动作都先「起一次 BGM」：浏览器的自动播放策略要求**真实用户手势之后**才准出声，
    // 而设置菜单这几个键正好都是真手势（`audio.start()` 幂等）。
    [ACT.next]: nextOrRestart,
    [UI_ACT.menu]: (): void => { menuOpen = !menuOpen; if (!menuOpen) helpOpen = false; audio.start(); audio.play('ui'); redraw(); },
    // 说明屏从菜单进、点关闭回菜单（菜单不关）——玩家是"来查一眼规则"，不是"要退出设置"。
    [UI_ACT.help]: (): void => { helpOpen = !helpOpen; audio.play('ui'); redraw(); },
    // 【SDK 演示台】开/合 + 逐行「试一下」。**两颗都必须挂 handler**：
    // 不挂的话点击会静默入队成信号污染世界（`ui.*` 本来就不该进世界·同 appPick 那条）。
    [UI_ACT.sdk]: (): void => { sdkOpen = !sdkOpen; audio.play('ui'); redraw(); },
    [UI_ACT.sdkTry]: (arg?: string): void => {
      audio.play('ui');
      if (typeof arg === 'string' && arg) sdkTryHandler?.(arg);
      redraw();
    },
    [UI_ACT.lang]: (): void => { lang = lang === 'zh' ? 'en' : 'zh'; saveLang(lang); voice.setLang(lang); audio.play('ui'); redraw(); },
    [UI_ACT.bgm]: (): void => { audio.toggle('bgm'); audio.start(); audio.play('ui'); redraw(); },
    [UI_ACT.sfx]: (): void => { audio.toggle('sfx'); audio.play('ui'); redraw(); },
    [UI_ACT.voice]: (): void => { const f = audio.toggle('voice'); if (!f.voice) voice.stop(); audio.play('ui'); redraw(); },
    // 【REQ-DOKI-APPS】推荐位：**必须挂 handler**（哪怕宿主没接）——不挂的话本地 handler 缺席，
    // mountUI 会把它当世界动作 `enqueueAction` 进 InputQueue，一个纯表现的点击就污染了世界。
    // 宿主接了就转交（去 apps.launch），没接就只出一声（`reject` 类分支：什么都没发生也要留痕）。
    [UI_ACT.appPick]: (arg?: string): void => {
      audio.start(); audio.play('ui');
      if (!arg) return;
      if (!appPickHandler) { console.info('[game108] 推荐位点了但宿主没接 onAppPick（非 DokiWorld 宿主属正常）'); return; }
      appPickHandler(arg);
    },
  }, DUEL_THEME, queue);
  // 推荐位到货即重画（`apps.list` 是异步 capability·同美术索引异步到货那条路）。
  picksNotify = redraw;
  sdkNotify = redraw;      // 【SDK 演示台】行状态到货即重画（同推荐位那条路）

  // 运行环走**引擎自己的** `start()`（房屋口径·同 game101）——不许自己搓 rAF 圈直接调
  // `world.tick()`：`Engine.step()` 在 tick 之前那一句 `applyCommands(world, input.commandsForTick(...))`
  // 才是把 UI 入队的动作注进世界的**唯一**接缝，绕过它 = 队列一直填、永远没人取
  // ⇒ 点了没反应，而且**不报错**（2026-08-07 点击探针实测抓到，单测与渲染探针都照绿）。
  // 另有固定步长时钟（真实流逝时间 → 整数模拟步），自搓的圈还会让相位时长随帧率漂。
  engine.subscribe(redraw);
  if (resume) {
    // 【DokiWorld 挂起/恢复】表现层参照系对齐恢复后的世界（render-only·零规则）：
    // 这些 prev* 缺省按「开局满血零蓄力」初始化，不对齐的话恢复后第一帧会把
    // 「恢复前后差值」误判成刚发生的事——假挨打横幅 + 假音效 + 亮上一回合的手。
    prevHp = { p1: num('p1'), p2: num('p2') };
    prevCharge = HANDS.reduce((n, h) => n + num(chargeEntity('p1', h)), 0);
    prevChargeByHand = Object.fromEntries(HANDS.map((h) => [h, num(chargeEntity('p1', h))])) as Record<Hand, number>;
    prevFoeFull = HANDS.some((h) => num(chargeEntity('p2', h)) >= 3);
    roundAtClash = num('round') || 1;   // 恢复帧不算「本回合已结算」——不亮存档前那回合的手/横幅
    engine.start();                     // 续局直接开跑（闸门语义见 started 初始化处）
    redraw();
  } else {
    // **不 start()**：等玩家点「开始」（见 startGame）。先画一帧把启动屏摆出来，
    // 再起那圈只服务加载条的 rAF（走完自停·见 tickBoot）。
    redraw();
    bootRaf = requestAnimationFrame(tickBoot);
  }

  // 卸载要**摘掉推荐位的重画口**：留着的话，卸载后宿主再 setAppPicks 会去画一台已经拆了的 UI
  //（`ui.update` 打在已卸载的 DOM 上——「什么都没发生」类的静默错，最难查的那一形状）。
  return () => { picksNotify = undefined; sdkNotify = undefined; voiceAudio?.pause(); voiceAudio = undefined; stopBoot(); engine.stop(); audio.stop(); voice.dispose(); ui(); teardown(); };
}

export { lastThrowVar, HP_RES };
