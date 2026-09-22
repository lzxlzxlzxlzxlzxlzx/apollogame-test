// game101 ·《海港绯闻》—— 卡带宿主层（工程师写的 mount/host·契约明许·零玩法逻辑）。
//
// 玩法+美术**结合**：完整 S1 漂亮界面（HUD+顾客订单+Twemoji 板+导航）+ **活板**——
//   引擎 sim 跑（生成器点击产出/资源/体力恢复/自动合并·headless 测过），每帧把世界态投影进 S1 板格
//   （物品显真 Twemoji·合并即变·生成器格可点·体力/金币实时）。宿主只搭 UI/输入/投影胶水·零玩法逻辑。
// 交互：生成器格 Panel.action=tap_<id> → mountUI ActionSink 入队 → KeyBinding 转信号 → craft-recipe/caster。
// 交付（G2 核心 meta·已接）：拖成品落顾客卡 → DeliverDrop{item,order} → t2-order-fulfill 裁模板匹配未满槽
//   → 销毁该实例 + 置满槽 + 集齐发奖（钳限·可重置）。多槽（最多 3·orders.json needItems 数组）天然内建。
// ⚠ 缺口（主程/PUI 域·数据已备待接）：加权掉落 REQ-TAPSPAWN（现固定产出）；异型限时菜单卡 REQ-UI-异型容器（PUI·现矩形卡顶着）。
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import { mountHost } from '@zerocraft/engine/engine/host/mount-host.js';
import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import type { HandlerMap, MountHandle } from '@zerocraft/engine/ui/components/index.js';
import type { Resource, PrefabOrigin, Transform, MergeDrop, Order, DeliverDrop, Timer, Blocker, Flag } from '@zerocraft/engine/engine/protocol/components.js';
import { buildBlueprint } from './blueprint.js';
import { buildS1Live, type S1State, type CellView, type OrderView, type SlotView } from './s1.js';
import { GAME101_THEME } from './ui-theme.js';
import { GAME, RES, ENERGY, GENERATORS, ORDERS, ORDER_SAT_MAX, TICKS_PER_SEC, CUST_PORTRAITS, BUBBLES, PROGRESSION, LEVEL_DONE_FLAG, ITEM_EMOJI, ITEMS, moodFace, cellIndexOf, cellCenter } from './theme.js';

const GEN_CELLS = new Set(GENERATORS.map((g) => g.cell));

const SCREEN_W = 1080;
const SCREEN_H = 1920;

export function mount(container: HTMLElement, _host?: { exit: () => void }): () => void {
  const { scene, teardown } = mountHost(container, {
    fieldW: SCREEN_W,
    fieldH: SCREEN_H,
    sceneBackground: GAME101_THEME.pageBg,
    wrapperBackground: '#2a1c12',
  });
  // 拖拽手感·宿主容器设定：禁文字多选高亮（游戏里拖拽不该像选文字）+ 禁触摸滚动/长按菜单（拖拽独占手势）。
  // 防 focus-scroll 位移（右缘按钮被点=浏览器把它 scrollIntoView·滚动 overflow:hidden 的 wrapper·整屏偏移）：
  // scene 布局宽 1080 > 视口(scale 前)，任意右缘按钮 focus 即滚。监听 wrapper.scroll 立即归零消除偏移。
  const sceneWrapper = scene.parentElement;
  const resetScroll = (): void => { if (sceneWrapper && (sceneWrapper.scrollLeft || sceneWrapper.scrollTop)) { sceneWrapper.scrollLeft = 0; sceneWrapper.scrollTop = 0; } };
  sceneWrapper?.addEventListener('scroll', resetScroll, { passive: true });
  scene.style.userSelect = 'none';
  (scene.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
  scene.style.touchAction = 'none';
  (scene.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout = 'none';

  const input = new QueuedInputSource('101');
  const engine = new Engine({ input });
  engine.load(buildBlueprint());

  // cell index → 物品实例 id（拖拽用·readState 每帧刷新）。
  const TOTAL_CELLS = GAME.board.cols * GAME.board.rows;
  const cellEntity: (string | null)[] = new Array(TOTAL_CELLS).fill(null);
  const coveredCells = new Set<number>(); // 阻碍层覆盖格（不可拖入/不可落子·readState 每帧刷新）
  const bubbleCells = new Set<number>(); // 泡泡锁格（不可拖入/不可落子·点破才出物）
  const starLockCells = new Set<number>(); // 星锁区格（不可拖入/不可落子·攒够星里程碑解锁）
  // 皮肤槽映射（textureKey → 当前美术图 URL）：mount 时读 art-ledger.json 填充·美术就绪/被替换即在板上换装。
  // 空=回退 Twemoji（美术是增量非依赖·读失败不炸）。owner 在创作台替换台账图后·此 map 指向新图 → 板上即换。
  let skinMap: Record<string, string> = {};
  // 信息菜单（view 态·host 持·local handler 切换·非写世界）：开关 + 当前页 + 事件日志环。
  let menuOpen = false;
  let menuTab: 'play' | 'chains' | 'log' = 'play';
  const eventLog: string[] = [];
  const pushLog = (s: string): void => { eventLog.unshift(s); if (eventLog.length > 14) eventLog.pop(); };
  let lastPassed = 0; // 已过里程碑数（新过 → 记日志）
  let lastLevelDone = false;

  // 生成器产出落点修正：caster at:'self' 把新物产在生成器**自己那格**（被生成器盖住=不可见/不可拖）。
  // 宿主每帧扫描落在生成器格上的物 → 用 merge-on-place 的**移动意图**把它挪到最近空格（引擎做实际移动·
  // 宿主只挑目标空格=同拖拽落点合成·非游戏逻辑）。让「点生成器→物弹进空格」真正可见可玩。
  function relocateGenSpawns(): void {
    const w = engine.world;
    const occupied = new Set<number>([...GENERATORS.map((g) => g.cell), ...coveredCells, ...bubbleCells, ...starLockCells]); // 覆盖格/泡泡格/星锁格也不占用产出
    const stray: string[] = [];
    for (const [eid] of w.query('PrefabOrigin')) {
      const t = w.getComponent<Transform>(eid, 'Transform');
      if (!t) continue;
      const idx = cellIndexOf(t.x, t.y);
      if (idx < 0) continue;
      if (GEN_CELLS.has(idx)) stray.push(eid); // 落在生成器格 = 待挪
      else occupied.add(idx);
    }
    for (const eid of stray) {
      let free = -1;
      for (let i = 0; i < TOTAL_CELLS; i++) if (!occupied.has(i)) { free = i; break; }
      if (free < 0) break; // 板满
      occupied.add(free);
      const p = cellCenter(free);
      const cid = `reloc-${eid}`;
      if (!w.hasComponent(cid, 'MergeDrop')) w.createEntity(cid);
      w.addComponent(cid, { type: 'MergeDrop', from: eid, x: p.x, y: p.y } as MergeDrop); // 无 to = 移动到空格
    }
  }

  // 世界态 → S1State（纯读·outcome-first）：板格=生成器(可点)/物品 Twemoji；HUD=真资源。同帧刷新 cellEntity。
  function readState(): S1State {
    const w = engine.world;
    const res = (id: string): number => w.getComponent<Resource>(id, 'Resource')?.current ?? 0;
    const cells: (CellView | null)[] = new Array(GAME.board.cols * GAME.board.rows).fill(null);
    cellEntity.fill(null);
    coveredCells.clear();
    const genByCell = new Map(GENERATORS.map((g) => [g.cell, g]));
    // ① 阻碍层覆盖格**先**占格（挖掘解锁·初始关卡：开局只挖开小洞·大半盖住·生成器也可被盖住待挖）。
    for (const [bid] of w.query('Blocker')) {
      const bk = w.getComponent<Blocker>(bid, 'Blocker');
      const t = w.getComponent<Transform>(bid, 'Transform');
      if (!bk || !t || bk.layers <= 0) continue;
      const idx = cellIndexOf(t.x, t.y);
      if (idx >= 0 && !cells[idx]) {
        // 沙下埋的预览（锁着也显里面是啥·勾引挖）：⚡能量/💎宝石/🎁宝箱；覆盖的生成器格显其 emoji 预览。
        const rv = bk.reveal; const g = genByCell.get(idx);
        let coverReward: string | undefined; let coverSkin: string | undefined;
        if (g) { coverReward = g.emoji; coverSkin = skinMap[g.sprite]; } // 埋着的生成器·显其观感（皮肤槽就绪即与解锁后同图·owner：锁前锁后同一美术资源）
        else if (rv?.kind === 'resource') coverReward = rv.resourceId === 'energy' ? `⚡${rv.amount ?? ''}` : rv.resourceId === 'stars' ? '💎' : rv.resourceId === 'coins' ? '🎁' : undefined;
        else if (rv?.kind === 'spawn' && rv.templateId) { coverReward = ITEM_EMOJI[rv.templateId] ?? '📦'; coverSkin = skinMap[ITEMS[rv.templateId]?.sprite ?? '']; } // 埋着的物品·显该物大图标（皮肤槽就绪即同解锁后图）
        cells[idx] = { emoji: '🔒', cover: bk.layers, coverReward, ...(coverSkin ? { coverSkin } : {}) }; coveredCells.add(idx);
      }
    }
    // ② 泡泡锁格（未被覆盖处·泡泡实体尚在=未点破）：显 🫧 裹真物 + 金币价·点破扣币出真物。
    bubbleCells.clear();
    for (const b of BUBBLES) {
      if (coveredCells.has(b.cell) || cells[b.cell]) continue;
      if (!w.hasComponent(`bubble-${b.id}`, 'Tag')) continue; // 已点破=实体销毁=不再显
      cells[b.cell] = { emoji: '🫧', bubble: { itemEmoji: ITEM_EMOJI[b.item] ?? '❓', cost: b.cost, id: b.id } };
      bubbleCells.add(b.cell);
    }
    // ②b 星锁区格（进度推进②）：marker 实体还在=未解锁 → 显 ⭐N 解锁门槛（攒够星里程碑 destroy-tagged 清之）。
    starLockCells.clear();
    PROGRESSION.milestones.forEach((m) => {
      for (const cell of m.cells) {
        if (coveredCells.has(cell) || cells[cell]) continue;
        if (!w.hasComponent(`starlock-${m.id}-${cell}`, 'Tag')) continue; // 已解锁=marker 销毁=不再显
        cells[cell] = { emoji: '⭐', starLock: { needStars: m.atStars } };
        starLockCells.add(cell);
      }
    });
    // ③ 生成器：只在**未被覆盖/非泡泡**的格摆出；冷却中显 ⏱剩余秒（G4·CD·charge<满=冷却中·剩余读 cd 计时器）。
    const timerLeft = (tid: string): number => { for (const [eid] of w.query('Timer')) { const t = w.getComponent<Timer>(eid, 'Timer'); if (t && t.id === tid) return Math.max(0, Math.ceil((t.duration - t.elapsed) / TICKS_PER_SEC)); } return 0; };
    // 冷却计时器的**分数进度**（remaining/duration·0..1）→ 圆环连续收缩(owner：连续减少·仿 game-i 逐帧驱动进度)。
    const timerFrac = (tid: string): number => { for (const [eid] of w.query('Timer')) { const t = w.getComponent<Timer>(eid, 'Timer'); if (t && t.id === tid) return t.duration > 0 ? Math.max(0, Math.min(1, (t.duration - t.elapsed) / t.duration)) : 0; } return 0; };
    for (const g of GENERATORS) {
      if (coveredCells.has(g.cell) || cells[g.cell]) continue;
      const cooling = (g.cooldownSec ?? 0) > 0 && res(`charge_${g.id}`) < 1;
      const cd = cooling ? timerLeft(`cd_${g.id}`) : undefined;
      const cdProg = cooling ? timerFrac(`cd_${g.id}`) : undefined;
      const gsk = skinMap[g.sprite];
      cells[g.cell] = { emoji: g.emoji, gen: g.id, ...(gsk ? { skin: gsk } : {}), ...(cd ? { cd, cdMax: g.cooldownSec, cdProg } : {}) };
    }
    const onBoard = new Set<string>(); // 板上现有的物品模板集（订单可交付判定）
    const cellTpl: (string | null)[] = new Array(cells.length).fill(null);
    for (const [eid] of w.query('PrefabOrigin')) {
      const po = w.getComponent<PrefabOrigin>(eid, 'PrefabOrigin');
      const t = w.getComponent<Transform>(eid, 'Transform');
      if (!po || !t) continue;
      onBoard.add(po.templateId);
      const idx = cellIndexOf(t.x, t.y);
      if (idx >= 0 && !cells[idx]) {
        const isk = skinMap[ITEMS[po.templateId]?.sprite ?? ''];
        cells[idx] = { emoji: ITEM_EMOJI[po.templateId] ?? '❓', ...(isk ? { skin: isk } : {}) }; cellEntity[idx] = eid; cellTpl[idx] = po.templateId;
        // 限时物：读 id='life' 的 Timer → 剩余秒（到 0 由 lifetime 销毁）。
        const tm = w.getComponent<Timer>(eid, 'Timer');
        if (tm && tm.id === 'life') cells[idx]!.timer = Math.max(0, Math.ceil((tm.duration - tm.elapsed) / TICKS_PER_SEC));
      }
    }
    // 限时特惠订单倒计时（读共享 menu Timer 剩余秒·循环）。
    const menuTm = w.getComponent<Timer>('menu-timer', 'Timer');
    const menuLeft = menuTm ? Math.max(0, Math.ceil((menuTm.duration - menuTm.elapsed) / TICKS_PER_SEC)) : undefined;
    // 订单交付态（读 Order 组件·多槽）：各 slot filled/需求物；want=板上有该物且此槽未满。
    const wanted = new Set<string>(); // 当前被某订单未满槽需要的模板集（板格 ✓ 提示）
    const orders: OrderView[] = ORDERS.map((o, oi) => {
      const ord = w.getComponent<Order>(`order-${o.id}`, 'Order');
      const need = ord?.needItems ?? o.needItems;
      const filledArr = ord?.filled ?? o.needItems.map(() => false);
      const slots: SlotView[] = need.map((tpl, j) => {
        const filled = !!filledArr[j];
        if (!filled) wanted.add(tpl);
        return { itemEmoji: ITEM_EMOJI[tpl] ?? '❓', filled, want: !filled && onBoard.has(tpl) };
      });
      const sat = res(`sat_${o.id}`);
      // 立绘皮肤槽：优先台账当前图（skinMap cust_portrait_N·美术就绪/owner 替换即换脸）·回退硬编码 CUST_PORTRAITS。
      const pIdx = oi % CUST_PORTRAITS.length;
      const portrait = skinMap[`cust_portrait_${pIdx + 1}`] ?? CUST_PORTRAITS[pIdx];
      return { char: o.char, slots, coins: o.reward.coins, stars: o.reward.stars ?? 0, deliverable: slots.some((sl) => sl.want), mood: sat / ORDER_SAT_MAX, moodFace: moodFace(sat), timed: o.timed, timeLeft: o.timed ? menuLeft : undefined, portrait };
    });
    // 板格 ✓ = 该成品被某订单未满槽需要（可拖去交付）。
    for (let i = 0; i < cells.length; i++) if (cells[i] && cellTpl[i] && wanted.has(cellTpl[i]!)) cells[i]!.deliverable = true;
    // 进度推进②：星数 → 目标进度条 + 已过里程碑数（关卡等级）+ 达标关卡完成旗。
    const stars = Math.round(res(RES.stars));
    const passed = PROGRESSION.milestones.filter((m) => stars >= m.atStars).length;
    const levelComplete = !!w.getComponent<Flag>('level-flag', 'Flag')?.active;
    // 体力涓流恢复倒计时（读 OverTime 'regen' 剩余·仅体力未满时显·HUD 参考图「00:34」）。
    let energyRegen: number | undefined;
    if (res(RES.energy) < ENERGY.cap) {
      for (const [eid] of w.query('OverTime')) {
        const ot = w.getComponent(eid, 'OverTime') as unknown as { effects?: { id: string; period: number; elapsed: number }[] } | undefined;
        const e = ot?.effects?.find((x) => x.id === 'regen');
        if (e && e.period > 0) { energyRegen = Math.max(0, Math.ceil((e.period - (e.elapsed % e.period)) / TICKS_PER_SEC)); break; }
      }
    }
    // HUD 图标皮肤槽（可替换美术资源·就绪即换·空则回退 emoji 字形）。
    const hudSkins = {
      energy: skinMap.hud_energy, coins: skinMap.hud_coins, gems: skinMap.hud_gems, cart: skinMap.hud_cart, avatar: skinMap.hud_avatar,
      barEnergy: skinMap.hud_bar_energy, barCoins: skinMap.hud_bar_coins, barGems: skinMap.hud_bar_gems, barAvatar: skinMap.hud_bar_avatar, barCart: skinMap.hud_bar_cart,
      scene: skinMap.ui_scene, order: skinMap.ui_order, menu: skinMap.ui_menu, board: skinMap.ui_board, well: skinMap.ui_well,
    };
    return {
      energy: res(RES.energy), coins: res(RES.coins), gems: Math.round(res(RES.stars)), level: 1 + passed, cells, orders,
      progress: { stars, goal: PROGRESSION.goalStars }, levelComplete, energyRegen, hudSkins,
    };
  }

  // ── 拖拽合并（宿主手势 → MergeDrop 意图 → merge-on-place 引擎裁决）──────────────
  // 板格 DOM id=t-live-<idx>；按下物品格→记源，抬起于目标格→注入 MergeDrop{from,to?}（引擎裁合并/移动/交换）。
  // 找到落点所属**格 Panel**（id=t-live-<idx>）——跳过内层 Label（t-live-<idx>-l 也匹配前缀·会误解析）。
  const cellIdxFromEl = (el: Element | null): number => {
    let cur: Element | null = el?.closest?.('[id^="t-live-"]') ?? null;
    while (cur) {
      const m = /^t-live-(\d+)$/.exec(cur.id);
      if (m) return Number(m[1]);
      cur = cur.parentElement?.closest?.('[id^="t-live-"]') ?? null;
    }
    return -1;
  };
  // 找落点所属**顾客卡 Panel**（id=ord-<i>）——跳过内层槽/头像（ord-<i>-... 也匹配前缀·会误解析）。
  const orderIdxFromEl = (el: Element | null): number => {
    let cur: Element | null = el?.closest?.('[id^="ord-"]') ?? null;
    while (cur) {
      const m = /^ord-(\d+)$/.exec(cur.id);
      if (m) return Number(m[1]);
      cur = cur.parentElement?.closest?.('[id^="ord-"]') ?? null;
    }
    return -1;
  };
  // 拖拽跟手飞影：指针视口坐标 → Screen(1080×1920) 坐标（scene 被 CSS 缩放·按 rect 反算）。
  const sceneToScreen = (cx: number, cy: number): { x: number; y: number } => {
    const r = scene.getBoundingClientRect();
    return { x: (cx - r.left) * (SCREEN_W / r.width), y: (cy - r.top) * (SCREEN_H / r.height) };
  };
  const emojiAt = (idx: number): string => {
    const eid = cellEntity[idx];
    if (!eid) return '❓';
    const po = engine.world.getComponent<PrefabOrigin>(eid, 'PrefabOrigin');
    return po ? (ITEM_EMOJI[po.templateId] ?? '❓') : '❓';
  };
  let dragFrom = -1;
  let dragGhost: { emoji: string; x: number; y: number } | null = null; // 跟手飞影态（render-only）
  let ghostRaf = 0; // rAF 节流句柄（拖动每帧至多重绘一次）
  const onDown = (ev: PointerEvent): void => {
    const idx = cellIdxFromEl(ev.target as Element);
    if (idx >= 0 && !GEN_CELLS.has(idx) && cellEntity[idx]) {
      dragFrom = idx; // 只拖物品格（非生成器/空格）
      dragGhost = { emoji: emojiAt(idx), ...sceneToScreen(ev.clientX, ev.clientY) }; // 拿起=飞影跟手
      paint(readState());
    }
  };
  const onMove = (ev: PointerEvent): void => {
    if (dragFrom < 0 || !dragGhost) return;
    dragGhost = { emoji: dragGhost.emoji, ...sceneToScreen(ev.clientX, ev.clientY) };
    if (!ghostRaf) ghostRaf = requestAnimationFrame(() => { ghostRaf = 0; paint(readState()); }); // 每帧至多一次重绘
  };
  const onUp = (ev: PointerEvent): void => {
    if (dragFrom < 0) return;
    const from = cellEntity[dragFrom]; const fromIdx = dragFrom; dragFrom = -1;
    if (dragGhost) { dragGhost = null; if (ghostRaf) { cancelAnimationFrame(ghostRaf); ghostRaf = 0; } paint(readState()); } // 落下=收飞影
    if (!from) return;
    const dropEl = document.elementFromPoint(ev.clientX, ev.clientY);
    // ① 落在顾客卡 → 交付意图（DeliverDrop）：引擎 order-fulfill 裁模板匹配→销毁实例+置满槽+集齐发奖。
    const ordIdx = orderIdxFromEl(dropEl);
    if (ordIdx >= 0 && ordIdx < ORDERS.length) {
      const cid = 'host-deliver';
      if (!engine.world.hasComponent(cid, 'DeliverDrop')) engine.world.createEntity(cid);
      engine.world.addComponent(cid, { type: 'DeliverDrop', item: from, order: `order-${ORDERS[ordIdx].id}` } as DeliverDrop);
      pendingDeliverIdx = ordIdx; // 供发奖飞行轨迹归位（金币从该卡飞进钱包）
      return;
    }
    // ② 落在板格 → 合并/移动/交换意图（MergeDrop）。
    const toIdx = cellIdxFromEl(dropEl);
    if (toIdx < 0 || toIdx === fromIdx || GEN_CELLS.has(toIdx) || coveredCells.has(toIdx) || bubbleCells.has(toIdx) || starLockCells.has(toIdx)) return; // 落生成器/覆盖/泡泡/星锁格/空放/原格=忽略
    const to = cellEntity[toIdx] ?? undefined; const p = cellCenter(toIdx);
    // 合成迸发（juice）：落格同模板=真合成 → 该格叠一次性星光爆。
    if (to) {
      const fpo = engine.world.getComponent<PrefabOrigin>(from, 'PrefabOrigin');
      const tpo = engine.world.getComponent<PrefabOrigin>(to, 'PrefabOrigin');
      if (fpo && tpo && fpo.templateId === tpo.templateId) fireBurst(toIdx);
    }
    const cid = 'host-drop';
    if (!engine.world.hasComponent(cid, 'MergeDrop')) engine.world.createEntity(cid);
    engine.world.addComponent(cid, { type: 'MergeDrop', from, ...(to ? { to } : {}), x: p.x, y: p.y } as MergeDrop);
  };
  scene.addEventListener('pointerdown', onDown);
  scene.addEventListener('pointermove', onMove);
  scene.addEventListener('pointerup', onUp);

  // 导航信号占位（真弹层=后续 slice）；生成器 tap_<id> **不放 handler** → 走 ActionSink 入队 → sim。
  const noop = (): void => {};
  // 菜单开关/切页 = 纯 view 态 local handler（不入 sim·不写世界）→ 改 host 态后立即重绘。
  const handlers: HandlerMap = {
    open_menu: () => { menuOpen = true; paint(readState()); },
    close_menu: () => { menuOpen = false; paint(readState()); },
    menu_play: () => { menuTab = 'play'; paint(readState()); },
    menu_chains: () => { menuTab = 'chains'; paint(readState()); },
    menu_log: () => { menuTab = 'log'; paint(readState()); },
    open_shop: noop, open_tasks: noop, open_reno: noop, open_events: noop, deliver_order: noop, gen_left: noop, gen_right: noop, delete_sel: noop,
  };

  const ui: MountHandle = mountUI(scene, buildS1Live(readState()), handlers, GAME101_THEME, input);

  // 交付发奖飞行轨迹（juice·render-only·不进 sim/hash）：金币从顾客卡沿弧飞进 HUD 钱包。
  // 用基座 layout.flyTo（唯一飞行原语·非自造）。activeFly 短暂注入进 OrderView·播完清（setTimeout=纯表现层清理）。
  let activeFly: { idx: number; id: string; label: string } | null = null;
  let activeBurst = -1; // 合成迸发格（juice·render-only）
  let dissolving: number[] = []; // 刚被挖到的格（沙/蛛网消融·render-only）
  let flySeq = 0;
  let pendingDeliverIdx = -1;
  let lastCoins = Math.round(readState().coins);
  const prevCover = new Map<number, number>(); // cell → 上帧阻碍层数（挖到=层减/消失→消融）
  const flyTimers = new Set<ReturnType<typeof setTimeout>>();
  const paint = (st: S1State): void => {
    const orders = activeFly ? st.orders.map((o, i) => (i === activeFly!.idx ? { ...o, fly: { id: activeFly!.id, label: activeFly!.label }, celebrate: true, moodFace: '😍' } : o)) : st.orders;
    ui.update(buildS1Live({ ...st, orders, burstCell: activeBurst >= 0 ? activeBurst : undefined, dragGhost: dragGhost ?? undefined, liftedCell: dragFrom >= 0 ? dragFrom : undefined, dissolveCells: dissolving.length ? dissolving : undefined, menuOpen, menuTab, log: eventLog.slice() }), GAME101_THEME);
  };

  // 皮肤槽装载（美术就绪即换装·非依赖）：读 art-ledger.json → textureKey→当前图 URL。
  // 现况优先 gen.servedPath（apollo-procedural 占位 / owner 创作台替换图皆走此字段）> path > placeholder.servedPath。
  // 读失败/无台账 → skinMap 空 → 板回退 Twemoji（美术是增量·绝不炸游戏）。装载完重绘一次即换装。
  void (async () => {
    try {
      const r = await fetch('/games/game101/art/art-ledger.json', { cache: 'no-store' });
      if (!r.ok) return;
      const led = await r.json() as { rows?: Array<{ skinKey?: string; id?: string; status?: string; path?: string; gen?: { servedPath?: string }; placeholder?: { servedPath?: string } }> };
      const map: Record<string, string> = {};
      for (const row of led.rows ?? []) {
        const key = row.skinKey ?? row.id;
        const url = row.gen?.servedPath ?? row.path ?? row.placeholder?.servedPath;
        if (key && url && row.status !== 'retired') map[key] = url;
      }
      skinMap = map;
      paint(readState()); // 换装重绘（美术就绪即上板）
    } catch { /* 无台账/读失败 → 回退 Twemoji */ }
  })();

  // 沙/蛛网消融：对比上帧阻碍层，被挖到的格（层减或清）叠尘土 Particles，600ms 后清。
  function detectDissolve(st: S1State): void {
    const dug: number[] = [];
    const nowCover = new Map<number, number>();
    st.cells.forEach((c, i) => { if (c?.cover != null) nowCover.set(i, c.cover); });
    for (const [cell, prev] of prevCover) { const cur = nowCover.get(cell); if (cur === undefined || cur < prev) dug.push(cell); }
    prevCover.clear(); for (const [c, l] of nowCover) prevCover.set(c, l);
    if (dug.length) {
      dissolving = dug;
      const t = setTimeout(() => { dissolving = []; flyTimers.delete(t); paint(readState()); }, 850);
      flyTimers.add(t);
    }
  }
  // 合成迸发：该格叠一次性星光爆，700ms 后清（纯表现层）。
  function fireBurst(cell: number): void {
    activeBurst = cell;
    paint(readState());
    const t = setTimeout(() => { if (activeBurst === cell) activeBurst = -1; flyTimers.delete(t); paint(readState()); }, 700);
    flyTimers.add(t);
  }

  let lastSig = '';
  const unsub = engine.subscribe(() => {
    relocateGenSpawns(); // 生成器产出弹进空格（不然盖在生成器下不可见=像点了没反应）
    const st = readState();
    detectDissolve(st); // 沙/蛛网被挖到 → 消融尘土
    // 事件日志（菜单「日志」页）：里程碑解锁 + 关卡完成（交付在下方金币块记）。
    const starsNow = Math.round(st.progress?.stars ?? 0);
    const passed = PROGRESSION.milestones.filter((m) => starsNow >= m.atStars).length;
    if (passed > lastPassed) { for (let k = lastPassed; k < passed; k++) pushLog(`🔓 解锁 ${PROGRESSION.milestones[k].label}`); lastPassed = passed; }
    if (st.levelComplete && !lastLevelDone) { pushLog('🎉 关卡完成！码头声名远扬'); lastLevelDone = true; }
    const coins = Math.round(st.coins);
    // 金币增加（仅交付发奖来源）+ 有待归位交付 → 触发飞行轨迹。
    if (coins > lastCoins && pendingDeliverIdx >= 0) {
      const gain = coins - lastCoins;
      pushLog(`✅ ${ORDERS[pendingDeliverIdx].char} 订单达成 · 🪙+${gain}`);
      const id = `fly-${flySeq++}`;
      activeFly = { idx: pendingDeliverIdx, id, label: `🪙+${gain}` };
      pendingDeliverIdx = -1;
      paint(st);
      const t = setTimeout(() => { activeFly = null; flyTimers.delete(t); paint(readState()); }, 1250);
      flyTimers.add(t);
      lastCoins = coins;
      lastSig = ''; // 强制下一帧重绘（fly 清除后）
      return;
    }
    lastCoins = coins;
    const sig = `${Math.round(st.energy)}|${st.energyRegen ?? ''}|${coins}|${st.cells.map((c) => (c ? c.emoji : '') + (c?.gen ?? '') + (c?.deliverable ? '✓' : '') + (c?.timer != null ? `t${c.timer}` : '') + (c?.cover != null ? `k${c.cover}` : '') + (c?.cd != null ? `d${Math.round((c.cdProg ?? 0) * 48)}` : '')).join(',')}|${st.orders.map((o) => o.slots.map((sl) => (sl.filled ? 'F' : sl.want ? 'W' : '.')).join('') + o.moodFace + (o.timeLeft ?? '')).join('|')}`;
    if (sig !== lastSig) { lastSig = sig; paint(st); }
  });

  engine.start();

  return () => {
    unsub();
    for (const t of flyTimers) clearTimeout(t);
    flyTimers.clear();
    engine.stop();
    if (ghostRaf) cancelAnimationFrame(ghostRaf);
    sceneWrapper?.removeEventListener('scroll', resetScroll);
    scene.removeEventListener('pointerdown', onDown);
    scene.removeEventListener('pointermove', onMove);
    scene.removeEventListener('pointerup', onUp);
    ui();
    teardown();
  };
}
