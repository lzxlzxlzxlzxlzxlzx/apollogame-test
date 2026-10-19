// game-103《幸存者核心原型》—— 卡带宿主层（mount/host·契约明许·零玩法逻辑）。
// 职责（都在 sim 外）：建 Engine + CanvasRenderer + 键盘输入源（WASD→move 命令·net applyCommands）；
// 把 world 资源/流程投影进 LayoutNode HUD；胜负浮层；重开；响应式缩放；皮肤资产；cleanup。
// 玩法规则一律在 blueprint.ts 的数据 + 引擎能力里（见其头注）。相机=引擎 camera-follow（play-field 卷动）。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { AssetManager, ImageAssetLoader, parseAssetIndex, registerAssetIndex } from '@zerocraft/engine/assets/index.js';
import { MultiInputSource } from '@zerocraft/engine/net/index.js';
import { KeyboardInputSource, QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import type { MountHandle, HandlerMap } from '@zerocraft/engine/ui/components/index.js';
import type { Resource, GameFlow } from '@zerocraft/engine/engine/protocol/components.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { rollOffer, applyPick } from '@zerocraft/engine/skills/tier2/index.js';
import type { DraftCandidate, DraftState } from '@zerocraft/engine/skills/tier2/index.js';
import { buildBlueprint } from './blueprint.js';
import { buildHud, buildResult, buildLevelUp, COMBO_MIN, type HudState, type LevelUpOffer } from './hud.js';
import { newlyUnlocked, loadUnlocked, saveUnlocked, type RunStats } from './achievements.js';
import { recordScore, loadBoard, saveBoard, type ScoreEntry } from './leaderboard.js';
import { VIEW_W, VIEW_H, PLAYER_DEF, LEVEL_XP, SURVIVOR_THEME, DRAFT_POOL, DRAFT_N, SLOT_CAP, WEAPONS, WEAPON_BY_KEY, TPS, DRAFT_ICON } from './theme.js';

// 战场底纹（暗色渐晕·render-only·屏幕固定）。BUG-01 修：移除原屏幕固定网格线（相机跟随时看着静止=像没动）；
// 地砖网格改由世界空间实体承载（blueprint groundGridEntities·随相机卷动=相对位移）。
const FIELD_BG = 'radial-gradient(120% 90% at 50% 45%, #12222c 0%, #060a10 82%)';

export function mount(container: HTMLElement): () => void {
  const { scene, overlayHost, teardown } = mountHost(container, {
    fieldW: VIEW_W, fieldH: VIEW_H,
    sceneBackground: FIELD_BG, wrapperBackground: '#04070c',
  });

  // ── HUD sink（稳定·跨重开不变）+ 键盘走位源，合流为引擎输入 ────────────────
  const hudQueue = new QueuedInputSource('hud');
  const keyboard = new KeyboardInputSource('p1');
  const input = new MultiInputSource([keyboard, hudQueue]);

  // ── HUD 读态：从 world 资源/流程投影出 HudState（纯读·outcome-first）────────
  function resOf(engine: Engine, eid: string): number { return engine.world.getComponent<Resource>(eid, 'Resource')?.current ?? 0; }
  function resMax(engine: Engine, eid: string): number { return engine.world.getComponent<Resource>(eid, 'Resource')?.max ?? 0; }
  function readState(engine: Engine): HudState {
    const cur = engine.world.getComponent<GameFlow>('flow', 'GameFlow')?.current;
    return {
      hp: Math.max(0, Math.round(resOf(engine, 'player'))),
      maxHp: PLAYER_DEF.maxHp,
      xp: Math.round(resOf(engine, 'collector')),
      xpMax: Math.round(resOf(engine, 'nextxp')) || LEVEL_XP, // v3 动态阈值（随级递增）
      level: Math.round(resOf(engine, 'level')),
      elapsed: Math.round(resOf(engine, 'clock')),
      score: Math.round(resOf(engine, 'killbox')),
      combo: 0, comboFlash: 0, toast: null, // host 派生（refreshHud 填）·非 sim
      status: cur === 'victory' ? 'victory' : cur === 'defeat' ? 'defeat' : 'playing',
    };
  }

  // ── 升级三选一 draft 态（宿主侧·draft-offer 纯函数消费·Lead 认可的编译期游戏直调）──
  const pool: DraftCandidate[] = DRAFT_POOL.map((u) => ({ id: u.id, weight: u.weight, slot: u.slot, maxLevel: u.maxLevel }));
  let draftState: DraftState = { owned: {}, slots: { weapon: { used: 0, cap: SLOT_CAP.weapon }, passive: { used: 0, cap: SLOT_CAP.passive } } };
  let prevLevel = 1;
  let showingLevelUp = false;
  const evolved = new Set<string>(); // 已进化的武器 key（防重复进化）

  // 选中一项：applyPick 回填态 → 入队 effectSignal（KeyBinding→Effect 应用到世界）→ 恢复 sim。
  function onPick(id: string): void {
    const cand = pool.find((c) => c.id === id);
    const def = DRAFT_POOL.find((u) => u.id === id);
    if (!cand || !def || !showingLevelUp) return;
    draftState = applyPick(id, cand, draftState);
    hudQueue.enqueueAction(def.effectSignal);
    showingLevelUp = false;
    if (sim) sim.engine.start(); // 恢复（refreshHud 下拍重绘回战斗 HUD）
  }
  // 进化（E2·重组）：选中金卡 → 标已进化 → 入队 evo_<key>（Effect destroy-tagged 删基础 + Caster spawn 进化体）→ 恢复。
  function onEvo(key: string): void {
    if (!showingLevelUp || evolved.has(key)) return;
    evolved.add(key);
    hudQueue.enqueueAction(`evo_${key}`);
    showingLevelUp = false;
    if (sim) sim.engine.start();
  }
  // 满级 + 持有 req 被动 + 未进化 → 该武器可进化。
  function evoReady(): typeof WEAPONS {
    return WEAPONS.filter((w) => w.evo && (draftState.owned[w.key] ?? 0) >= w.maxLevel && (draftState.owned[w.evo.req] ?? 0) >= 1 && !evolved.has(w.key));
  }

  const handlers: HandlerMap = { restart: () => restart(), pause: () => {} };
  for (const u of DRAFT_POOL) handlers[u.effectSignal] = () => onPick(u.id);
  for (const w of WEAPONS) if (w.evo) handlers[`evo_${w.key}`] = () => onEvo(w.key);

  const initial: HudState = { hp: PLAYER_DEF.maxHp, maxHp: PLAYER_DEF.maxHp, xp: 0, xpMax: LEVEL_XP, level: 1, elapsed: 0, score: 0, combo: 0, comboFlash: 0, toast: null, status: 'playing' };
  overlayHost.style.pointerEvents = 'auto';
  const hudUi: MountHandle = mountUI(overlayHost, buildHud(initial), handlers, SURVIVOR_THEME, hudQueue);
  let showingResult = false;

  // ⚠ BUG-04 根因：engine.start() 的 loop 在 notifyListeners() 之后才 `rafId = RAF(loop)` 重挂——
  // 从 listener(refreshHud) 里同步调 engine.stop() 会被下一行的重挂立刻覆盖，sim 根本停不下来（时停/局终冻结都失效）。
  // 修：把 stop 延到 microtask——它在 loop() 返回后、重挂的 RAF 触发前执行 → 干净取消，sim 真停。
  function pauseSim(): void { queueMicrotask(() => sim?.engine.stop()); }

  // 等级上升 → 时停 + 三选一 draft（rollOffer 过滤候选·seed=level 确定性）。
  function openLevelUp(level: number): void {
    const ready = evoReady();
    const offers = rollOffer(pool, draftState, { n: DRAFT_N, seed: level });
    if (offers.length === 0 && ready.length === 0) return; // 无候选也无进化→不停顿
    showingLevelUp = true;
    pauseSim();
    const items: LevelUpOffer[] = [];
    if (ready.length > 0) { // 进化就绪 → 金卡置顶（挤掉一张普通卡·保 3 张）
      const w = ready[0];
      items.push({ id: `evo-${w.key}`, name: WEAPON_BY_KEY[w.evo!.to].name, desc: WEAPON_BY_KEY[w.evo!.to].desc, accent: 'active', level: w.maxLevel, max: w.maxLevel, isNew: false, action: `evo_${w.key}`, icon: DRAFT_ICON[w.evo!.to] ?? '🌀', isEvo: true });
    }
    for (const c of offers.slice(0, DRAFT_N - items.length)) {
      const u = DRAFT_POOL.find((d) => d.id === c.id)!;
      const lvl = draftState.owned[c.id] ?? 0;
      items.push({ id: u.id, name: u.name, desc: u.desc, accent: u.accent, level: lvl, max: u.maxLevel, isNew: lvl === 0, action: u.effectSignal, icon: u.icon });
    }
    hudUi.update(buildLevelUp(items), SURVIVOR_THEME);
  }

  // ── 连杀（连击）host 派生（owner「1 秒内杀 5 个=连杀·左右上角闪动态数字」）───────────────
  // 击杀真相=sim 的 score（累计击杀·gem 入 killbox 环记 +1）。host 侧维护 1 秒滑窗击杀时刻表→窗内计数=combo。
  // 纯表现派生（不进 sim/hash·零确定性影响·零碰撞开销），换色闪由 simTick 相位驱动。
  const COMBO_WINDOW_SEC = 2;                     // 连杀滑窗秒数（owner 2026-07-26「放宽·2 秒杀 8 个」·配 COMBO_MIN=8）
  const COMBO_WINDOW_TICKS = Math.round(TPS * COMBO_WINDOW_SEC);
  let simTick = 0;
  let prevScore = 0;
  let killWin: number[] = []; // 窗内每次击杀的 simTick
  function computeCombo(score: number): { combo: number; comboFlash: number } {
    simTick++;
    const gained = score - prevScore;
    if (gained > 0) { for (let i = 0; i < gained; i++) killWin.push(simTick); prevScore = score; }
    else if (score < prevScore) prevScore = score; // 重开回退
    const cutoff = simTick - COMBO_WINDOW_TICKS; // 滑窗
    while (killWin.length && killWin[0] < cutoff) killWin.shift();
    return { combo: killWin.length, comboFlash: Math.floor(simTick / 5) % 2 }; // 每 5 拍换色=闪
  }

  // ── 成就（owner「解锁些成就」）：host 每帧比对局内统计 → 首次达成即持久解锁 + 排队弹横幅 ~2.5s ──
  const unlocked = loadUnlocked();          // 跨局持久集（localStorage）
  let peakCombo = 0;                         // 本局峰值连杀
  let toastUntil = 0;                        // 当前横幅显示到第几 simTick
  const toastQueue: Array<{ icon: string; name: string }> = [];
  let curToast: { icon: string; name: string } | null = null;
  const TOAST_TICKS = Math.round(TPS * 2.5); // 每条横幅显示时长
  function pumpAchievements(combo: number, st: HudState): { icon: string; name: string } | null {
    if (combo > peakCombo) peakCombo = combo;
    const stats: RunStats = { peakCombo, kills: st.score, elapsed: st.elapsed, level: st.level };
    for (const a of newlyUnlocked(stats, unlocked)) { unlocked.add(a.id); toastQueue.push({ icon: a.icon, name: a.name }); }
    if (toastQueue.length) saveUnlocked(unlocked);
    if (!curToast && toastQueue.length) { curToast = toastQueue.shift()!; toastUntil = simTick + TOAST_TICKS; }
    if (curToast && simTick >= toastUntil) { curToast = toastQueue.length ? toastQueue.shift()! : null; if (curToast) toastUntil = simTick + TOAST_TICKS; }
    return curToast;
  }

  // ── 本地排行榜（owner「死亡后排行榜 + 成绩一起展示·存本地」）：局终记一次成绩（击杀/时长/等级）→ localStorage ──
  let lastBoard: ScoreEntry[] = [];
  let lastRank = 0;

  let lastSig = '';
  function refreshHud(engine: Engine): void {
    const st = readState(engine);
    if (st.status !== 'playing') {
      if (!showingResult) {
        showingResult = true;
        // 记本局成绩一次（幂等·靠 showingResult 门）→ 并入榜 + 存回 localStorage。
        const entry: ScoreEntry = { score: st.score, time: st.elapsed, level: st.level, win: st.status === 'victory', at: Date.now() };
        const res = recordScore(entry, loadBoard());
        saveBoard(res.board);
        lastBoard = res.board; lastRank = res.rank;
        pauseSim(); // 局终冻结 sim（同 BUG-04·延到 microtask）
      }
      st.board = lastBoard; st.rank = lastRank;
      hudUi.update(buildResult(st), SURVIVOR_THEME);
      return;
    }
    if (showingResult) showingResult = false;
    const c = computeCombo(st.score);
    st.combo = c.combo; st.comboFlash = c.comboFlash;
    st.toast = pumpAchievements(c.combo, st);
    // 升级检测（等级上升 → 弹三选一·时停）——只在未展示时触发。
    if (st.level > prevLevel && !showingLevelUp) { prevLevel = st.level; openLevelUp(st.level); return; }
    prevLevel = st.level;
    if (showingLevelUp) return; // 时停中不重绘战斗 HUD
    // 连杀达门槛时把 combo+闪相位并入 sig → 每拍重绘（闪）；未连杀只按常规字段变化重绘（省）。
    const comboSig = st.combo >= COMBO_MIN ? `${st.combo}|${st.comboFlash}` : '0';
    const sig = `${st.hp}|${st.xp}|${st.level}|${st.elapsed}|${st.score}|${comboSig}|${st.toast?.name ?? ''}`;
    if (sig !== lastSig) { lastSig = sig; hudUi.update(buildHud(st), SURVIVOR_THEME); }
  }

  // ── 皮肤资产（美术就绪即换装·无 index/失败=回退 Shape 观感·美术是增量非依赖）──
  const skinAssets = new AssetManager(new ImageAssetLoader());
  void (async () => {
    try {
      const r = await fetch('/games/game-103/art/index.json', { cache: 'no-store' });
      if (!r.ok) return;
      registerAssetIndex(skinAssets, parseAssetIndex(await r.json()));
      await skinAssets.loadAll();
    } catch { /* 无美术目录 → 回退程序化观感·不炸游戏 */ }
  })();

  // ── sim 生命周期（可重开）──────────────────────────────────────────────────
  let sim: { engine: Engine; renderer: CanvasRenderer; unsub: () => void } | null = null;

  function startSim(): void {
    const engine = new Engine({ input });
    engine.load(buildBlueprint());
    const renderer = new CanvasRenderer({ width: VIEW_W, height: VIEW_H, background: 'transparent', assets: skinAssets });
    engine.attachRenderer(renderer, scene);
    const canvas = scene.querySelector('canvas') as HTMLCanvasElement;
    canvas.style.zIndex = '0';
    const unsub = engine.subscribe(() => refreshHud(engine));
    engine.start();
    lastSig = '';
    refreshHud(engine);
    sim = { engine, renderer, unsub };
  }

  function stopSim(): void {
    if (!sim) return;
    sim.unsub();
    sim.engine.stop();
    sim.renderer.destroy();
    sim = null;
  }

  function restart(): void {
    showingResult = false;
    showingLevelUp = false;
    prevLevel = 1;
    evolved.clear();
    prevScore = 0; killWin = []; // 连杀窗重置（重开）
    peakCombo = 0; curToast = null; toastQueue.length = 0; toastUntil = 0; // 成就横幅态重置（解锁集持久·不清）
    lastBoard = []; lastRank = 0; // 排行榜展示态重置（榜持久·下次局终重算）
    draftState = { owned: {}, slots: { weapon: { used: 0, cap: SLOT_CAP.weapon }, passive: { used: 0, cap: SLOT_CAP.passive } } };
    stopSim();
    hudUi.update(buildHud(initial), SURVIVOR_THEME);
    startSim();
  }

  startSim();

  // ── cleanup（launcher 卸载时调）──────────────────────────────────────────
  return () => {
    stopSim();
    hudUi();
    keyboard.dispose();
    teardown();
  };
}
