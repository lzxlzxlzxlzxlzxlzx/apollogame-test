// game111《小都会》—— L0 世界数据表（纯数据·零逻辑）。
//
// 本文件是「最弱 LLM 也能一致产出」的那一面（framework.md §1.3 分面裁决）：地图、人设、需求曲线、
// 动词闭集、称号表全是查得到的常量。**行为流**不在这里——那是运行时由 LLM 产的，走 NpcAgentPort。
//
// 红线：本文件不许出现任何函数式判断逻辑。唯一允许的函数是**表展开**（把一张表按笛卡尔积摊成实体，
// 与 game-103 的 `ringSpawnerEntities()` 同形），不是解释器。
import type { IntentVerbSpec } from '@zerocraft/engine/engine/protocol/agent.js';

// ── 分区（素材「小都会地图」六区）────────────────────────────────────────
export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  /** 进 prompt 的一句话（给 LLM 看的场所气质）。 */
  readonly blurb: string;
}

export const ZONES: readonly ZoneDef[] = [
  { id: 'z-plaza', name: '中央广场', blurb: '小都会的心脏，喷泉与长椅，人来人往。' },
  { id: 'z-cafe', name: '野咖啡馆', blurb: '吧台与烘豆香，常有人在这里坐一下午。' },
  { id: 'z-library', name: '智慧书馆', blurb: '安静、层高很高，适合躲开所有人。' },
  { id: 'z-chapel', name: '圣心教堂', blurb: '彩窗与长凳，来这儿的人多半在想事情。' },
  { id: 'z-hill', name: '后山遗迹', blurb: '走上去要一会儿，傍晚的天空是粉紫色的。' },
  { id: 'z-studio', name: '音乐所', blurb: '隔音棉与走音的钢琴，声音从门缝漏出来。' },
];

export const ZONE_IDS: readonly string[] = ZONES.map((z) => z.id);

// ── 需求（素材调试日志的 NEEDS_DECAY）─────────────────────────────────────
export interface NeedDef {
  readonly key: string;
  readonly name: string;
  readonly start: number;
  readonly max: number;
  /** 每回合衰减量（整数·由 t2-over-time 结算）。 */
  readonly decay: number;
}

/** 一回合 = 多少拍。需求按回合衰减，故 period = TICKS_PER_TURN。 */
export const TICKS_PER_TURN = 1;

// 配平口径（2026-09-14 自证实测后定）：一回合只能做一件事 ⇒ 每回合的**回复总量 ≈ 一个动作的量**。
// 故「四项衰减之和」必须明显小于「单个动作的回复量」，否则小镇会稳定地饿死（首版 6+3+5+2=16 对
// 单动作 +25，实跑六回合全员归零——不是模型的问题，是表的问题）。现 4+2+3+2=11 < 18(最小动作量)。
export const NEEDS: readonly NeedDef[] = [
  { key: 'energy', name: '精力', start: 80, max: 100, decay: 4 },
  { key: 'mood', name: '心情', start: 70, max: 100, decay: 2 },
  { key: 'social', name: '社交欲', start: 60, max: 100, decay: 3 },
  { key: 'curiosity', name: '好奇心', start: 50, max: 100, decay: 2 },
];

export const NEED_KEYS: readonly string[] = NEEDS.map((n) => n.key);

// ── NPC 人设卡（智能等级 = 数据字段·不是代码分支·capability-plan §4.65）──────
/** L1 脚本化 / L2 感知响应 / L3 动机决策 / L4 认知规划 / L5 自主智能体。 */
export type NpcTier = 1 | 2 | 3 | 4 | 5;

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  /** 性格一句话（进 prompt·opponent-ai.md 规矩：必填）。 */
  readonly persona: string;
  readonly tier: NpcTier;
  readonly homeZone: string;
}

export const NPCS: readonly NpcDef[] = [
  { id: 'nao', name: '娜洛', persona: '有边界感的咖啡店主，热心但不讨好；话少，记性好。', tier: 4, homeZone: 'z-cafe' },
  { id: 'mor', name: '茉尔', persona: '爱闲逛爱拍照的年轻人，容易无聊，什么都想试一下。', tier: 4, homeZone: 'z-plaza' },
  { id: 'gud', name: '谷多曼', persona: '街市引导员，逢人就搭话，记得每个人上次说过什么。', tier: 2, homeZone: 'z-plaza' },
  { id: 'tai', name: '苔莉丝', persona: '书馆管理员，怕吵，对打听闲事的人不客气。', tier: 2, homeZone: 'z-library' },
  { id: 'ala', name: '阿莱', persona: '音乐所的主持人，嗓门大，日程雷打不动。', tier: 1, homeZone: 'z-studio' },
];

export const NPC_IDS: readonly string[] = NPCS.map((n) => n.id);
/** 调 LLM 的只有 L4+（L1/L2 走确定性能力·断网降级路径同此集合）。 */
export const AGENT_NPC_IDS: readonly string[] = NPCS.filter((n) => n.tier >= 4).map((n) => n.id);

// ── 意图闭集（framework.md §2 · 地基）────────────────────────────────────
// 动词表是**纯数据**。闭集外的一切由 t2-intent-barrier 拒收并记 reject——game111 不含任何校验代码。
export const INTENT_VERBS: readonly IntentVerbSpec[] = [
  { verb: 'move_to', arity: 1 }, // 去某个分区
  { verb: 'talk_to', arity: 1 }, // 找某个 NPC 搭话
  { verb: 'rest', arity: 0 }, // 休息（回精力）
  { verb: 'observe', arity: 0 }, // 四处看看（回好奇心）
];

/** barrier 超期降级补的动词（必须在闭集内·无参）。 */
export const DEFAULT_VERB = 'rest';

// ── 记忆标签闭集 + 衰减率（t2-memory 的 MemoryRules.decay）──────────────────
export const MEMORY_TAGS = ['talk', 'move', 'player', 'gossip'] as const;

export const MEMORY_DECAY: ReadonlyArray<{ tag: string; amount: number }> = [
  { tag: 'player', amount: 1 }, // 玩家说的话忘得最慢
  { tag: 'talk', amount: 3 },
  { tag: 'gossip', amount: 4 }, // 转述来的忘得快
  { tag: 'move', amount: 8 }, // 谁去过哪儿，两三回合就忘
];

/** 转述一次剩几成（千分比·600 = 六成）。链式影响的衰减系数。 */
export const SHARE_DISCOUNT = 600;
/** 每个 NPC 的记忆条目上限（超了丢最弱的）。 */
export const MEMORY_MAX = 40;
/** 强度低于此值即遗忘。 */
export const FORGET_BELOW = 1;

// ── 称号表（素材「关系养成·称号系统」）────────────────────────────────────
// 铁律（framework.md §5.1）：**称号是「NPC 给的」，不是「系统发的」**——每条必须归属一个具体 NPC。
export interface TitleDef {
  readonly id: string;
  /** 由谁授予（= 好感度达标的那个 NPC）。 */
  readonly byNpc: string;
  /** 该 NPC 对玩家的好感度达到多少即解锁。 */
  readonly minAffinity: number;
  readonly text: string;
  readonly rarity: 'common' | 'rare' | 'epic';
}

export const TITLES: readonly TitleDef[] = [
  { id: 't-nao-regular', byNpc: 'nao', minAffinity: 20, text: '老位子那位', rarity: 'common' },
  { id: 't-nao-trusted', byNpc: 'nao', minAffinity: 60, text: '我不必寒暄的人', rarity: 'epic' },
  { id: 't-mor-pal', byNpc: 'mor', minAffinity: 20, text: '一起瞎逛的', rarity: 'common' },
  { id: 't-mor-muse', byNpc: 'mor', minAffinity: 60, text: '我拍的第一百张照片里的人', rarity: 'epic' },
  { id: 't-gud-known', byNpc: 'gud', minAffinity: 30, text: '街市熟脸', rarity: 'rare' },
  { id: 't-tai-quiet', byNpc: 'tai', minAffinity: 40, text: '懂得安静的人', rarity: 'rare' },
];

// ── 玩家能说的话（闭集·L0 纯数据）────────────────────────────────────────
// 这是素材那条核心卖点的入口：「玩家只需在闲聊中自然说话，就能改变 NPC 后续的行动意图」。
// 落法：一句话 = 一条写进该 NPC 记忆的条目（tag `player`·**衰减最慢**）+ 好感增量。
// 下一回合这条记忆进 prompt → 模型看到的东西变了 → 它的意图跟着变 → 链式影响起点。
export interface TopicDef {
  readonly id: string;
  /** 选项上显示的短标签。 */
  readonly label: string;
  /** 真正写进记忆的那句话（也是进 prompt 的那句）。 */
  readonly text: string;
  /** 记忆标签（含 `player` 才享受最慢衰减）。 */
  readonly tags: readonly string[];
  /** 好感增量。 */
  readonly affinity: number;
  /** 记忆初始强度。 */
  readonly strength: number;
}

export const TOPICS: readonly TopicDef[] = [
  { id: 'weather', label: '聊聊天气', text: '你说今天云走得真快', tags: ['player', 'talk'], affinity: 3, strength: 40 },
  { id: 'praise', label: '夸他一句', text: '你说他今天看起来状态很好', tags: ['player', 'talk'], affinity: 8, strength: 70 },
  { id: 'hill', label: '提起后山', text: '你说后山傍晚的天是粉紫色的', tags: ['player', 'move'], affinity: 5, strength: 85 },
  { id: 'gossip', label: '说点别人的事', text: '你提起谷多曼最近逢人就问同一个问题', tags: ['player', 'gossip'], affinity: 4, strength: 75 },
  { id: 'quiet', label: '什么都不说，陪着', text: '你什么也没说，只是在旁边坐了一会儿', tags: ['player'], affinity: 6, strength: 90 },
];

export const TOPIC_IDS: readonly string[] = TOPICS.map((t) => t.id);

/**
 * NPC 回话表 —— **桩（owner 2026-09-14 令「先用一个假的」）**。
 *
 * ⚠ 这是全项目**唯一**一处「假」的地方，故意集中在一张表里，且**不参与任何世界状态**：
 * 它只决定屏幕上显示哪句话，好感/记忆/意图一律走真链路。真模型上线后，这张表由端口回包顶替，
 * 世界那一侧一行都不用改——因为世界从来就没读过它。
 * 键 = `<npcId>:<topicId>`，缺省回落 `*:<topicId>`，再缺省回落 `*:*`。
 */
export const STUB_REPLIES: Readonly<Record<string, string>> = {
  'nao:quiet': '……嗯。（她没抬头，又给你续了半杯。）',
  'nao:praise': '你不用每次都这么说。……不过谢谢。',
  'nao:gossip': '别人的事我不太想聊。你自己呢？',
  'nao:weather': '云走得快，说明要变天了。外套带了吗。',
  'nao:hill': '后山啊。我已经很久没上去过了。',
  'mor:quiet': '诶？你不说话我反而有点紧张了。',
  'mor:praise': '真的吗！那我今天出门前照镜子照了三次是有用的。',
  'mor:gossip': '我也发现了！他是不是在找什么人啊。',
  'mor:weather': '那我得赶紧去拍两张，云跑了就没了。',
  'mor:hill': '我知道！我上周还去拍过，可惜手抖了。',
  '*:quiet': '（他安静地点了点头。）',
  '*:praise': '哈哈，被你这么一说我都不好意思了。',
  '*:gossip': '哦？还有这种事。',
  '*:weather': '是啊，今天天不错。',
  '*:hill': '后山那边我也挺久没去了。',
  '*:*': '嗯。',
};

/** 查桩回话（三级回落·纯查表）。 */
export function stubReply(npcId: string, topicId: string): string {
  return STUB_REPLIES[`${npcId}:${topicId}`]
    ?? STUB_REPLIES[`*:${topicId}`]
    ?? STUB_REPLIES['*:*'];
}

// ── 世界 id 约定（单点定义·各处引用不手拼）────────────────────────────────
export const BARRIER_ID = 'town-intents';
export const MEMORY_RULES_ID = 'town-memory';
export const TURN_RESOURCE = 'turn';
export const MAX_TURNS = 9999;

/** 某 NPC 某需求的 Resource.id。 */
export const needId = (npcId: string, key: string): string => `${npcId}.${key}`;
/** 某 NPC 所在分区的 State.fsmId（分区 = 状态·故 move_to 走 set-state）。 */
export const zoneFsm = (npcId: string): string => `zone.${npcId}`;
/** 某 NPC 对玩家的好感度 Resource.id。 */
export const affinityId = (npcId: string): string => `aff.${npcId}`;
/** 某称号的解锁 Flag.id。 */
export const titleFlag = (titleId: string): string => `title.${titleId}`;

/**
 * 一条意图对应的信号名 —— 意图落地的唯一接缝。
 *
 * 这是**命名约定**不是解释器：driver 发这个名字的 Signal，预先展开好的 Effect 实体接住它
 * （见 `blueprint.ts` 的 `intentEffectEntities`）。所以 game111 里没有任何「读 verb 然后 if/switch」的代码。
 */
export const intentSignal = (npcId: string, verb: string, args?: readonly (string | number)[]): string =>
  args && args.length > 0 ? `i:${npcId}:${verb}:${args.join(':')}` : `i:${npcId}:${verb}`;

/** 玩家对某 NPC 说某个话题的信号名（与意图同一条输入路径·玩家和 LLM 在引擎眼里一模一样）。 */
export const saySignal = (npcId: string, topicId: string): string => `say:${npcId}:${topicId}`;
