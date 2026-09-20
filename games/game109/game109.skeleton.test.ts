// @vitest-environment happy-dom
// ═══════════════════════════════════════════════════════════════════════════
//  Game 109 · 种田（暂名）—— S3 骨架关测试：蓝图立起 + 真引擎 load + 2tick 空跑
//  （「能存必须能跑」）+ 三拍握手装配断言 + 核心循环的真行为（点→信号→世界变了）。
//  （S4「终局出口」追加：结算屏 + 重开键的宿主生命周期——见文件尾那一节。）
//
//  与 S2 探针（probe.test.ts）的分工：探针证的是「引擎件够不够用」（P1~P7 最小夹具）；
//  本测试证的是「**这款游戏本体**照那套结论装出来能不能跑」——同一批断言打在 blueprint 的真实数据上。
//
//  ⚠ 夹具保真度（同 probe.test.ts:33 的注）：直接写 InputQueue **不会**被自动清空——真输入源每帧重投。
//  故每个 tap 前后都要显式重投/清空，否则残留的按下事件会每拍重复产信号（首轮实测：4 tick 长 3 阶）。
//
//  ⚠ 环境：**happy-dom**（S4 起改）。上面那批断言本来在 node 里跑（S3 就是），切换只多了一件事：
//  环境里有 DOM 与 rAF。S4 的「终局出口」要证的正是**宿主路径**——`mountRound` 挂骨架/渲染器/指针/DOM HUD、
//  结算屏真的出现在活体 DOM 里、重开键真的点得响——这些没有 DOM 就跑不了，而「重开真的重置了世界」这条
//  自证硬要求（self-check.md:38「点完要断言世界真的变了」）只能打在**真挂载出来的那一局**上。
//  引擎的循环挂在 rAF 上（宿主纪律 ①）⇒ 凡「等世界动」的判据一律用 `waitFor` **真等帧**
//  （等不到就返回 false、由断言当场报红），**不许手搓 world.tick() 绕过输入注入**。
//
// ⚠ S7 ②b「合一套」换了本测试的**夹具路径**（不是断言强度）：动作条那 6 枚从画布世界实体
//  （`btn-*`）搬进 DOM HUD（`hud.ts`）⇒ 选工具 / 睡觉 / 卖货在夹具里改走 `tapAction`（DOM 键路径，
//  与浏览器里点 HUD 按钮同一条链）。**地块照旧走指针路径**（`tap` + world 坐标——②b 没动地块）。
//  于是两条路径都还各自被测：`tap` 证指针 → 世界，`tapAction` 证 ActionSink → keybind → 世界。
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type {
  Flag, GameFlow, InputQueue, RawInputData, Resource, State,
} from '@zerocraft/engine/engine/protocol/components.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildBlueprint, plantId, tileId } from './blueprint.js';
import {
  ACTIONS, BALANCE, CROPS, FARM, FLOW, FROZEN_FLAG, GROW_PHASE_FLAG, LIFE_TINTS, RES, SIGNALS,
  TILE_FLAG, TILE_STATE, TOOLS,
} from './data.js';
import { HUD_ACTION, HUD_ID, buildHome, buildHud, readHudView, type HudView } from './hud.js';
import { mount, mountRound } from './game109.js';
import { ALL_SKIN_KEYS, FIELD_H, FIELD_W, HUD_H, Z, tileX, tileY } from './theme.js';

// ── 夹具 ─────────────────────────────────────────────────────────────────
const res = (e: Engine, id: string, resId: string): number | undefined => {
  const r = e.world.getComponent<Resource>(id, 'Resource');
  return r && r.id === resId ? r.current : undefined;
};
const flagOf = (e: Engine, id: string, flagId: string): boolean | undefined => {
  const f = e.world.getComponent<Flag>(id, 'Flag');
  return f && f.id === flagId ? f.active : undefined;
};
const stateOf = (e: Engine, id: string): string | undefined =>
  e.world.getComponent<State>(id, 'State')?.current;
const flowOf = (e: Engine): string | undefined =>
  e.world.getComponent<GameFlow>('flow', 'GameFlow')?.current;
/** 本帧指针输入（真链路由输入源采集，这里直接摆 InputQueue）。 */
const setInput = (e: Engine, actions: RawInputData[]): void => {
  const w = e.world;
  if (!w.hasComponent('input', 'InputQueue')) w.createEntity('input');
  w.addComponent('input', { type: 'InputQueue', actions } as InputQueue);
};
const clearInput = (e: Engine): void => setInput(e, []);
/** 点一下就只响一拍（点 → tick → 清残留）。 */
const tap = (e: Engine, x: number, y: number): void => {
  clearInput(e); setInput(e, [{ source: 'p1', x, y, phase: 'down' } as RawInputData]);
  e.world.tick(); clearInput(e);
};
/** 干活（点某格）——地块是**画布上的世界实体**，②b 没动它，故这条仍是**指针路径**。 */
const work = (e: Engine, row: number, colIndex: number): void => tap(e, tileX(colIndex), tileY(row));
/**
 * DOM HUD 的具名动作路径（**无坐标**的 action 相位）：夹具保真度同上——点一下就只响一拍。
 * 为什么无坐标还能响：`clickable` 明言忽略 `x === undefined` 的事件（它是空间命中器），
 * 这条由 keybind 接（InputQueue 的 key 命中 KeyBinding.key → 产 Signal）——两套生产者、同一份效果。
 */
const tapAction = (e: Engine, key: string): void => {
  clearInput(e); setInput(e, [{ source: 'p1', key, phase: 'action' } as RawInputData]);
  e.world.tick(); clearInput(e);
};
// ── 动作条三件套（选工具 / 睡觉 / 卖货）：S7 ②b 起一律走 **DOM 那条路** ──────────────────
//  ②b「合一套」把画布那 6 枚 `btn-*` 世界实体整批撤了（HUD 条盖住原按钮带，控件只剩 DOM 一套）
//  ⇒ 照老坐标 `tap(e, BTN_X0 + …)` 点下去**什么都点不到**（那几个常量也已从 theme.ts 退役）。
//  这三条改走 `tapAction`：与浏览器里点 HUD 按钮走的是**同一条链**（ActionSink → keybind → Effect）。
/** 选工具（写全局 RES.tool；`index` = TOOLS 下标）。 */
const pickTool = (e: Engine, index: number): void => tapAction(e, TOOLS[index].pickSignal);
/** 睡一觉（睡觉天然跨两拍：拍1 Commit 置相位，拍2 Resolve 各格生长 + 拍末收尾·P2-b）。 */
const sleepNight = (e: Engine): void => {
  tapAction(e, ACTIONS.find((a) => a.id === 'sleep')!.signal);
  clearInput(e); e.world.tick();
};
const clickAction = (e: Engine, id: string): void => {
  tapAction(e, ACTIONS.find((a) => a.id === id)!.signal);
};
const boot = (): Engine => { const e = new Engine(); e.load(buildBlueprint()); return e;};
/** 走完「锄地 → 播种 → 浇水」三步（每步一拍），返回该格。 */
const prepareWatered = (e: Engine, row: number, colIndex: number): void => {
  pickTool(e, 0); work(e, row, colIndex);
  pickTool(e, 1); work(e, row, colIndex);
  pickTool(e, 2); work(e, row, colIndex);
};
/** HUD 视图字面量（纯函数 buildHud 的输入；缺省取世界初值那一档·toolName 跟着 tool 走，除非显式覆盖）。 */
const hudView = (over: Partial<HudView> = {}): HudView => {
  const tool = over.tool ?? 0;
  return {
    energy: BALANCE.energyStart, energyMax: BALANCE.energyMax, gold: 0,
    goldTarget: BALANCE.goldTarget, day: BALANCE.dayStart,
    tool, toolName: TOOLS[tool].name,
    bag: CROPS.map(() => 0), // 开局背包空（按 CROPS 顺序）
    flow: FLOW.PLAYING, // 缺省=对局中（`won` 才换屏成结算面板）
    ...over,
  };
};
/** LayoutNode 树全节点（前序）。 */
const walkNodes = (n: LayoutNode): LayoutNode[] => [n, ...(n.children ?? []).flatMap(walkNodes)];
const propOf = (n: LayoutNode, k: string): unknown => (n.props as Record<string, unknown>)[k];
/** 某棵交树里某 id 的节点（断言前必须先确认存在，缺了要在这里当场红而不是后面 undefined 崩）。 */
const nodeById = (tree: LayoutNode, id: string): LayoutNode => {
  const n = walkNodes(tree).find((x) => x.id === id);
  expect(n, `交树里没有 ${id}`).toBeDefined();
  return n!;
};
/** 某棵交树的全部节点 id（换屏类断言用「在不在场」比对比整棵树更贴题）。 */
const idsOf = (tree: LayoutNode): string[] => walkNodes(tree).map((n) => n.id);

// ── 宿主路径的夹具（S4「终局出口」用）─────────────────────────────────────
/**
 * 等真帧（**宿主路径的判据只能这么等**）：引擎循环挂在 rAF 上、固定步长由真实流逝时间驱动，
 * 所以这里是真等，**不是**假跑 tick —— 手搓 `world.tick()` 会绕过输入注入（宿主纪律 ① 的反面教材）。
 * 等不到就返回 false，由调用点的断言当场报红（绝不静默空跑成假绿）。
 */
const waitFor = async (cond: () => boolean, ms = 1200): Promise<boolean> => {
  const t0 = Date.now();
  for (;;) {
    if (cond()) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise<void>((r) => setTimeout(r, 8));
  }
};
/** 给某个 world 的 tick 挂个计数（实例属性遮蔽原型方法）——判「旧引擎真的停了」用。 */
const spyTicks = (e: Engine): (() => number) => {
  let n = 0;
  const w = e.world as unknown as { tick: () => void };
  const orig = e.world.tick.bind(e.world);
  w.tick = (): void => { n++; orig(); };
  return () => n;
};
/** 挂一局到临时容器里（返回容器 + 收尾函数；收尾一定要跑，别留引擎空转）。 */
const mountInBody = (): { container: HTMLElement; done: () => void } => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, done: () => container.remove() };
};
/** DOM 里点一下（真事件冒泡到 mountUI 的委托监听——走的就是游戏里那条路）。 */
const clickIn = (container: HTMLElement, id: string): void => {
  const el = container.querySelector<HTMLElement>(`#${id}`);
  expect(el, `活体 DOM 里找不到 #${id}`).not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('Game 109 · 种田（S3 骨架关）', () => {
  // ── 静态：蓝图是纯数据 + 关键单例齐全 ────────────────────────────────────
  it('蓝图是纯数据：可序列化 + 能力≥10 且全是引擎既有能力对象 + 关键单例齐全', () => {
    const bp = buildBlueprint();
    expect(() => JSON.stringify(bp.entities)).not.toThrow();
    expect(bp.capabilities.length).toBeGreaterThanOrEqual(10);
    for (const cap of bp.capabilities) expect(typeof cap.id).toBe('string');
    const ids = Object.keys(bp.entities);
    for (const key of ['farm-rng', 'wallet', 'purse', 'calendar', 'toolbox', 'grow-phase', 'flow', 'day-end-when']) {
      expect(ids).toContain(key);
    }
    for (const c of CROPS) expect(ids).toContain(`barn-${c.id}`);
  });

  it('36 格 = 6×6（每列一种作物 12/12/12）：每格 10 件组件齐全 + 必有 Sprite 皮肤槽（art 红线）', () => {
    const bp = buildBlueprint();
    // 生长条与苗是地块的**子实体**，id 也以 `tile-` 开头（`tileId()` 加后缀：`tile-rXcY-plant` / `tile-rXcY-crop`）
    // ——数格时必须排掉它们。**这里改成白名单**（只认 `tile-rXcY` 本身），不再用 S3 的排除式（`!endsWith('-plant')`）：
    // 排除式只挡得住当时唯一的那类子实体，S6 新增第二类（苗·owner 裁 Q1=C「连作物逐阶也上地块」）时它会
    // **静默多数一倍**（本轮实测 72 格 = 36 格 + 36 苗，报红在 `toBe(36)`，靠的正是这条断言本身够窄）。
    // 白名单比旧写法**更严**：今后再加子实体也不会被误数成格子。
    const isTile = (k: string): boolean => /^tile-r\d+c\d+$/.test(k);
    const tiles = Object.keys(bp.entities).filter(isTile);
    expect(tiles.length).toBe(FARM.cols * FARM.rows); // 36
    // 白名单把「子实体整个没了」挡在断言之外（`filter(isTile)` 天然不数它们）⇒ 在这里补住两类子实体各自的满场数。
    for (const suffix of ['-plant', '-crop']) {
      const n = Object.keys(bp.entities).filter((k) => k.endsWith(suffix) && isTile(k.slice(0, -suffix.length))).length;
      expect(n, `地块子实体 ${suffix} 的数量`).toBe(FARM.cols * FARM.rows);
    }
    const byCrop: Record<string, number> = {};
    for (let row = 0; row < FARM.rows; row++) {
      for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
        // 组件名按字符串遍历 ⇒ 收窄成松记录（EntityBlueprint 的键是组件名联合，不能用 string 索引）。
        const t = bp.entities[tileId(row, colIndex)] as unknown as Record<string, Record<string, unknown> | undefined>;
        for (const comp of ['Transform', 'Shape', 'Sprite', 'Color', 'Tag', 'Clickable', 'Flag', 'State', 'Resource', 'SelfRule', 'SpriteBinding']) {
          expect(t[comp], `${tileId(row, colIndex)} 缺 ${comp}`).toBeDefined();
        }
        // 皮肤槽：主视觉实体必须能换皮（Sprite.textureKey 指向该格作物的 sheet）。
        const sprite = t['Sprite'] as Record<string, unknown>;
        expect(String(sprite['textureKey']).startsWith('109/')).toBe(true);
        const crop = t['StringVar'] as Record<string, unknown>;
        byCrop[String(crop['value'])] = (byCrop[String(crop['value'])] ?? 0) + 1;
      }
    }
    for (const c of CROPS) expect(byCrop[c.id]).toBe(12);
    // 皮肤槽清单无重键（S6 台账登记的键必须唯一）。
    expect(new Set(ALL_SKIN_KEYS).size).toBe(ALL_SKIN_KEYS.length);
  });

  // ── 地块可见性（R-10/R-11：地色随「生命周期 × 今日已浇」走）─────────────────────
  it('每格挂 SpriteBinding 两轴：states 三行 × flagId 最低位，tint 表 6 档（δ 轴·owner 裁「δ 全轴」）', () => {
    const bp = buildBlueprint();
    for (let row = 0; row < FARM.rows; row++) {
      for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
        const t = bp.entities[tileId(row, colIndex)] as unknown as Record<string, Record<string, unknown>>;
        const b = t['SpriteBinding'];
        expect(b['states']).toEqual([TILE_STATE.WILD, TILE_STATE.TILLED, TILE_STATE.SOWN]);
        expect(b['flagId']).toBe(TILE_FLAG);
        // ⚠ 证人（S4 复查条件①）：**必须断言实体上真正接线的那份值**，不能只断言长度。
        //   下面那两条断言（互不相同 / 湿比干暗）查的都是 `LIFE_TINTS` **常量本身**——
        //   把蓝图里的 `tints: LIFE_TINTS` 换成任意 6 个错值，那两条照样绿（S4 复查人实测：49 测试全绿）。
        //   加这条之后，「接线掉的包」与「常量被改坏」才会各自转红。**别把这行并进长度断言。**
        expect(b['tints']).toEqual(LIFE_TINTS);
        expect((b['tints'] as number[]).length).toBe(6); // 3 状态 × 2（干/湿）
      }
    }
    // 6 档底色互不相同（有语义的坡度被同色塌掉 = 等于没做）。
    expect(new Set(LIFE_TINTS).size).toBe(LIFE_TINTS.length);
    // 湿土那档必须比同状态的干土更暗（「今晚会长的那格」靠这条一眼可辨）。
    for (const dry of [0, 2, 4]) {
      const lum = (c: number): number => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
      expect(lum(LIFE_TINTS[dry + 1]), `行${dry + 1}（湿）不比行${dry}（干）暗`).toBeLessThan(lum(LIFE_TINTS[dry]));
    }
  });

  // ── 生长阶可见（owner 2026-09-19 裁「撤 Gauge·条走纯帧」）────────────────────────
  it('每格一条生长条子实体：Hierarchy 挂父 + Sprite + Frame/SpriteBinding 取帧；**不得再挂 Gauge**', () => {
    const bp = buildBlueprint();
    for (let row = 0; row < FARM.rows; row++) {
      for (let colIndex = 0; colIndex < FARM.cols; colIndex++) {
        const p = bp.entities[plantId(row, colIndex)] as unknown as Record<string, Record<string, unknown>>;
        expect(p, `${plantId(row, colIndex)} 不存在`).toBeDefined();
        // ⚠ Transform 是硬要求：hierarchy-resolve 查的是 query('Hierarchy','Transform')，缺了不解算。
        for (const comp of ['Transform', 'Hierarchy', 'Shape', 'Sprite', 'Frame', 'SpriteBinding']) {
          expect(p[comp], `${plantId(row, colIndex)} 缺 ${comp}`).toBeDefined();
        }
        expect((p['Hierarchy'] as Record<string, unknown>)['parentId']).toBe(tileId(row, colIndex));
        // ⚠ Sprite 也是硬要求：渲染器 zOrder **只从 Sprite 来**（renderable.ts:87）——没有它，
        //    条与地块并列 zOrder 0，谁在上就只看插入序（把语义交给了命名）。故这里钉死它高于地块。
        expect((p['Sprite'] as Record<string, unknown>)['zOrder']).toBeGreaterThan(Z.tile);
        // 长势轴：单轴取帧（无 states/flagId ⇒ i = 宿主那格的 stage），帧号必须落在 sheet 的 4 档内。
        expect(p['Frame']['total']).toBe(4); // art-09 的 4 档（0/33/66/100%）
        const b = p['SpriteBinding'];
        expect(b['resourceId']).toBe(RES.stage);
        expect(b['fromParent']).toBe(true); // 每格各持一份同名 stage ⇒ 必须读宿主那格，否则全读全局首个
        const idx = b['frames'] as number[];
        // 逐作物天数压到 0..3（`barFrames`）：首档恒 0（没长）、末档恒 3（成熟必满格）。
        expect(idx.length, `${plantId(row, colIndex)} 帧表长度 ${idx.length}`).toBeGreaterThanOrEqual(2);
        expect(idx[0]).toBe(0);
        expect(idx[idx.length - 1]).toBe(3);
        for (const i of idx) {
          expect(Number.isInteger(i) && i >= 0 && i < 4, `${plantId(row, colIndex)} 帧号越界：${i}`).toBe(true);
        }
        // ⚠ 反向钉：**Gauge 不许回来**。它写 `Hierarchy.localX = leftX + Shape.width/2` ⇒ 原点随比例移动，
        //    而 96 宽的贴图按 anchorX:0.5 居中画在**那个移动的原点**上 ⇒ 整条左偏半宽并随阶右移（owner
        //    2026-09-19 实测报的「黑条比方块靠左」）。宽度反馈已被 Q2=B 的帧取代 ⇒ 这条挡住「顺手挂回来」。
        expect(p['Gauge'], `${plantId(row, colIndex)} 又挂上了 Gauge（会重现条的错位）`).toBeUndefined();
      }
    }
  });

  it('动作条：**画布那 6 枚世界实体已撤**（②b 合一套），6 个信号仍各有具名生产者', () => {
    // ⚠ 反向钉（用意同「Gauge 不许回来」那条）：S3 起「① 世界内可点实体 ② DOM 按钮」两套并存，
    //   正是 S7 ②b 要拆的东西。若有人把 `buttonEntity()` 挂回来，那 6 枚会落在世界坐标 y 714..802
    //   —— ②b 之后**正好被 HUD 条盖住**（条顶缘 = 714）⇒ 屏幕上看不见、却仍然可点：
    //   一个**看不见的第二个入口**，比撤之前更坏。故这条断言的是「零枚」，不是「六枚」。
    const bp = buildBlueprint();
    const btns = Object.keys(bp.entities).filter((k) => k.startsWith('btn-'));
    expect(btns, `画布按钮实体又回来了：${btns.join(',')}`).toEqual([]);
    // 而 6 个动作**一个都没丢**：每个动作在 `kb-*` 里仍有具名生产者（DOM 现在是唯一的控件集）。
    // ⚠ id 用的是**动作 id**（`kb-till` / `kb-sleep`），不是信号名（`pick-till`）——`key` 字段才是信号名。
    // （`kb-*` 自身的形状由下面「HUD 的 6 个动作在世界侧都有具名生产者」那条逐字段断言。）
    const hudActions = [
      ...TOOLS.map((t) => ({ id: t.id, signal: t.pickSignal })),
      ...ACTIONS.map((a) => ({ id: a.id, signal: a.signal })),
    ];
    for (const a of hudActions) {
      const kb = bp.entities[`kb-${a.id}`];
      expect(kb, `${a.id} 没有 kb-* 生产者 ⇒ DOM 按钮点了会静默入队`).toBeDefined();
      expect((kb['KeyBinding'] as Record<string, unknown>)['key']).toBe(a.signal);
    }
  });

  it('定尺几何：画布仍 720×910（一格不动）；HUD 条顶缘**正好**落在旧按钮带顶缘', () => {
    // ① 画布定尺是**跨阶段硬契约**：S4 走查 `scripts/game109-playthrough.mjs:41` 把 720×910 写成锚点
    //    （「画布尺寸对不上 → 第一条断言当场红」）⇒ ②b 抬 HUD 条（84→196）**只许动 overlay**。
    expect(FIELD_W).toBe(720);
    expect(FIELD_H).toBe(910);
    // ② 「HUD 条盖住空出来的按钮带」这句话是**算出来的**，不是看起来差不多：
    //    条顶缘必须 = 旧按钮带顶缘（pad + rows·cell + barGap = 714）。少 1px 就在条顶露出
    //    一条 6px 的旧按钮带残影（按钮顶缘正落在 714）。这条把 theme.ts 里那段推导钉成断言。
    expect(HUD_H).toBe(FIELD_H - (FARM.pad + FARM.rows * FARM.cell + FARM.barGap));
    expect(HUD_H).toBe(196);
  });

  // ── 静态：三拍握手的装配形状（S2 探针 P7 的结论打在真实数据上）──────────────
  it('三拍握手：干活链每一拍都有**显式 order**；认领写临时态 busy；扣费的门读 busy（不是持久态）', () => {
    const bp = buildBlueprint();
    const work = Object.entries(bp.entities)
      .filter(([, e]) => (e['Effect'] as Record<string, unknown> | undefined)?.['onSignal'] === SIGNALS.WORK)
      .map(([id, e]) => [id, e['Effect'] as Record<string, unknown>] as const);
    expect(work.length).toBeGreaterThanOrEqual(10);

    // ① 没有一拍敢省 order（听凭 eid 字典序 = 把语义交给命名·P7-e 留档）。
    for (const [id, fx] of work) {
      expect(Number.isInteger(fx['order']), `${id} 缺显式 order`).toBe(true);
    }
    // ② 认领拍：写临时态 busy，且是逐源寻址（点谁改谁）。
    const claims = work.filter(([, fx]) => fx['kind'] === 'set-state' && fx['order'] === 0);
    expect(claims.length).toBe(TOOLS.length + CROPS.length - 1); // 锄/播/浇 3 + 收获逐作物 3 = 6
    for (const [id, fx] of claims) {
      expect(fx['value'], `${id} 认领拍必须写临时态`).toBe(TILE_STATE.BUSY);
      expect(fx['targetEntity'], `${id} 认领拍必须逐源寻址`).toBe('@signal-source');
    }
    // ③ 扣费拍：全场唯一一个，门读 **busy**（本次点击已被认领的瞬时事实），带全局体力门。
    const spends = work.filter(([, fx]) => fx['order'] === 1);
    expect(spends.length).toBe(1); // 任何工具认领成功都归它扣
    {
      const [id, fx] = spends[0];
      const when = fx['when'] as Record<string, unknown>;
      expect(when['kind']).toBe('state');
      expect(when['equals'], `${id} 的门必须读临时态 busy，读持久态必自锁`).toBe(TILE_STATE.BUSY);
      expect((fx['whenGlobal'] as Record<string, unknown>)['kind']).toBe('resource');
      expect(fx['targetId']).toBe(RES.energy);
    }
    // ④ 每一拍的 order 互不相同且升序可用（0..4 有界）。
    for (const [, fx] of work) expect(fx['order'] as number).toBeLessThanOrEqual(4);
  });

  it('条件树形状：not.of 必须是**单个**表达式（写成数组 ⇒ 求值 switch 穿透 → 恒真且不报错）', () => {
    // S3 首轮实红就死在这：`{kind:'not', of:[flag]}` 在 evaluateSelfCondition 里 expr.of.kind=undefined
    // → switch 无 default → 返回 undefined → `!undefined === true` ⇒ 「今日没浇过」永远成立，重复浇水白扣体力。
    // 这个坑**运行期静默**，只有类型标注 + 本断言能拦住。
    const bp = buildBlueprint();
    let notsSeen = 0;
    const walk = (expr: unknown, path: string): void => {
      if (!expr || typeof expr !== 'object') return;
      const ex = expr as Record<string, unknown>;
      if (ex['kind'] === 'not') {
        notsSeen++;
        expect(Array.isArray(ex['of']), `${path} 的 not.of 写成了数组`).toBe(false);
        walk(ex['of'], `${path}.not`);
        return;
      }
      if (ex['kind'] === 'and' || ex['kind'] === 'or') {
        const subs = ex['of'] as unknown[];
        expect(Array.isArray(subs), `${path} 的 ${String(ex['kind'])}.of 必须是数组`).toBe(true);
        subs.forEach((sub, i) => walk(sub, `${path}[${i}]`));
      }
    };
    for (const [id, raw] of Object.entries(bp.entities)) {
      const ent = raw as unknown as Record<string, Record<string, unknown> | undefined>;
      for (const comp of ['Effect', 'SelfRule', 'EventWhen']) {
        const c = ent[comp];
        if (!c) continue;
        walk(c['when'], `${id}.${comp}.when`);
        walk(c['whenGlobal'], `${id}.${comp}.whenGlobal`);
      }
    }
    expect(notsSeen).toBeGreaterThanOrEqual(2); // 浇水前置门 + 生长封顶门（防空跑假绿）
  });

  // ── 深走守卫（S3 复查建议①）─────────────────────────────────────────────────
  it('深走守卫：蓝图**实体**与交树里零 function 值（JSON.stringify 会静默丢函数 ⇒ 光靠它证不出接线掉了）', () => {
    // 实证来历（S3 复查）：往 wallet 实体里塞一个函数，**预告该红、实测 49/49 全绿**——
    // 因为 `JSON.stringify` 把函数值整个**丢掉**（对象里少一个键：不抛、不警告）。
    // 「蓝图是纯数据」那条断言（本文件第一条）用的正是 `JSON.stringify(...).not.toThrow`
    // ⇒ 它挡不住这种注入。这条闸门逐层深走，遇到 function **当场红并报出路径**。
    //
    // ⚠ 范围刻意**只含实体与交树**，不含 `bp.capabilities`：能力对象里带着引擎自己的 system 实现
    //   （`defineCapability({ systems:[…] })`·src/skills/atoms/transform/index.ts:80），那里有函数
    //   是**合法**的。「蓝图是纯数据」这句话说的是**实体**那一半——S3 复查注入的也正是实体。
    const offenders: string[] = [];
    let seen = 0;
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'function') { offenders.push(path); return; }
      if (!v || typeof v !== 'object') return;
      seen++;
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
    };
    const bp = buildBlueprint();
    walk(bp.entities, 'blueprint.entities');
    walk(buildHud(hudView()), 'hud.playing');
    walk(buildHud(hudView({ flow: FLOW.WON })), 'hud.won');
    walk(buildHome(), 'hud.home'); // 主菜单屏（S7 换屏）：house builder 的产物也过同一条守卫
    expect(offenders, `这些位置是函数（会被 JSON.stringify 静默丢掉）：${offenders.join(' / ')}`).toEqual([]);
    // 防空跑：守卫必须真的走到了东西（不然「零命中」可能只是没走）。
    expect(seen, '深走没走到几个节点 ⇒ 这条守卫是空的').toBeGreaterThan(1000);
  });

  // ── 卡带契约：launcher loader 要 import 的那个模块面 ──────────────────────
  it('index.js 透出 launcher 合约（mount 函数 + 蓝图/几何数据面·game-103 先例同形）', async () => {
    // 这条断言的意义：Lead 填 loader 时 import 的就是这个路径，导出名/形状错了要在这里当场红，
    // 而不是等 launcher 里 `if (!loader) return;` 静默落空（S3 已实查的假绿死法）。
    const mod = await import('./index.js');
    expect(typeof mod.mount).toBe('function'); // 宿主模块 game109.ts 的 mount（≤2 参可赋值给 loader 的 (el, host?) => () => void）
    expect(typeof mod.buildBlueprint).toBe('function');
    expect(typeof mod.tileId).toBe('function');
    expect(mod.VIEW).toEqual({ w: FIELD_W, h: FIELD_H });
    expect(mod.CROPS.length).toBe(3);
    expect(mod.TOOLS.length).toBe(4);
    expect(typeof mod.BALANCE.goldTarget).toBe('number');
  });

  // ── 引擎：能载能跑 + 确定性 ────────────────────────────────────────────
  it('真引擎 load + 2tick 空跑不崩（能存必须能跑）', () => {
    const e = new Engine();
    expect(() => e.load(buildBlueprint())).not.toThrow();
    expect(() => { e.world.tick(); e.world.tick(); }).not.toThrow();
  });

  it('确定性：同 seed 两次装载 tick 后 hash 一致（lockstep-safe·本作零随机）', () => {
    const a = boot(); a.world.tick(); a.world.tick();
    const b = boot(); b.world.tick(); b.world.tick();
    expect(a.hash()).toBe(b.hash());
  });

  // ── 行为：4 个动作各一条正路径 + 一条负路径（点一下，世界真的动了）──────────
  it('锄地：点荒地 → tilled 且体力 -1；再点一次（已翻土）→ 被拒且**不白扣体力**', () => {
    const e = boot();
    pickTool(e, 0);
    work(e, 0, 0);
    expect(stateOf(e, tileId(0, 0))).toBe(TILE_STATE.TILLED);
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyStart - 1);
    work(e, 0, 0);
    expect(stateOf(e, tileId(0, 0))).toBe(TILE_STATE.TILLED);
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyStart - 1); // 没白扣
  });

  it('工具前置门：选了播种 → 点**荒地**不播种、也不扣体力（前置是已翻土）', () => {
    const e = boot();
    pickTool(e, 1); // 选播种
    work(e, 0, 0);  // 但格还是 wild（前置是 tilled）
    expect(stateOf(e, tileId(0, 0))).toBe(TILE_STATE.WILD);
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyStart);
  });

  it('体力不够 → 动作被拒：土也不翻、体力也不动（S1 卡的核心机制）', () => {
    const e = boot();
    pickTool(e, 0);
    const wallet = e.world.getComponent<Resource>('wallet', 'Resource')!;
    wallet.current = 0; // 夹具直接改初值（同 probe P2-c 的「首值写在数据里」非作弊）
    work(e, 1, 0);
    expect(stateOf(e, tileId(1, 0))).toBe(TILE_STATE.WILD);
    expect(res(e, 'wallet', RES.energy)).toBe(0);
  });

  it('播种 + 浇水：三步走完 = sown + 今日已浇；重复浇水被拒（不白扣体力）', () => {
    const e = boot();
    prepareWatered(e, 2, 4); // (2,4) 是南瓜列
    expect(stateOf(e, tileId(2, 4))).toBe(TILE_STATE.SOWN);
    expect(flagOf(e, tileId(2, 4), TILE_FLAG)).toBe(true);
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyStart - 3);
    work(e, 2, 4); // 再浇一次
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyStart - 3);
  });

  it('睡觉：浇过水的长一阶（没浇的不长）→ 体力回满 → 日期 +1 → 浇水标记清空', () => {
    const e = boot();
    prepareWatered(e, 0, 0);   // 胡萝卜（1 天熟）：浇了水
    pickTool(e, 0); work(e, 3, 1); // 另一格只翻土，不播种不浇水
    pickTool(e, 1); work(e, 0, 2); // 小麦：播种了但**没浇水**
    sleepNight(e);

    expect(res(e, tileId(0, 0), RES.stage)).toBe(1); // 浇过水的长一阶
    expect(res(e, tileId(0, 2), RES.stage)).toBe(0); // 没浇的不长
    expect(stateOf(e, tileId(3, 1))).toBe(TILE_STATE.TILLED); // 非 sown 不长
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyRefill);
    expect(res(e, 'calendar', RES.day)).toBe(BALANCE.dayStart + 1);
    expect(flagOf(e, tileId(0, 0), TILE_FLAG)).toBe(false); // 标记清空（可再浇明天）
    expect(flagOf(e, 'grow-phase', GROW_PHASE_FLAG)).toBe(false); // 相位收尾（不卡死）
  });

  it('成熟即封顶：熟了再浇再睡也不长（阶停在 days·不然收获判定会漂）', () => {
    const e = boot();
    prepareWatered(e, 0, 0); // 胡萝卜 days=1
    sleepNight(e);
    expect(res(e, tileId(0, 0), RES.stage)).toBe(1);
    pickTool(e, 2); work(e, 0, 0); // 熟了也能再浇（标记已清）
    expect(flagOf(e, tileId(0, 0), TILE_FLAG)).toBe(true);
    sleepNight(e);
    expect(res(e, tileId(0, 0), RES.stage)).toBe(1); // 封顶在 days（Resource.max）
  });

  it('收获：成熟才收（没熟被拒）→ 入对应作物背包 + 生长阶归零 + 地还原成已翻土', () => {
    const e = boot();
    prepareWatered(e, 0, 0); // 胡萝卜
    pickTool(e, 3); // 选收获
    work(e, 0, 0);  // 还没长（stage 0 < 1）→ 被拒
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(0);
    expect(stateOf(e, tileId(0, 0))).toBe(TILE_STATE.SOWN);

    pickTool(e, 2); work(e, 0, 0); // 再浇一次水（睡前后都行：stage 0 未熟）
    sleepNight(e);                 // 睡一觉 → stage 1 = 熟
    expect(res(e, tileId(0, 0), RES.stage)).toBe(1);

    pickTool(e, 3); work(e, 0, 0);
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(1); // 进的是胡萝卜账
    expect(res(e, 'barn-pumpkin', CROPS[2].invRes)).toBe(0); // 不是别人的账
    expect(res(e, tileId(0, 0), RES.stage)).toBe(0);
    expect(stateOf(e, tileId(0, 0))).toBe(TILE_STATE.TILLED);
  });

  it('卖货：背包 × 卖价 → 金币，背包清零（先结账后清零靠显式 order）', () => {
    const e = boot();
    e.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 3;
    e.world.getComponent<Resource>('barn-pumpkin', 'Resource')!.current = 1;
    clickAction(e, 'sell');
    const expectGold = 3 * CROPS[0].price + 1 * CROPS[2].price;
    expect(res(e, 'purse', RES.gold)).toBe(expectGold); // 36 + 75 = 111
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(0);
    expect(res(e, 'barn-pumpkin', CROPS[2].invRes)).toBe(0);
  });

  it('通关：金币到线 → flow 转 won（没到线停在 playing）', () => {
    const poor = boot();
    clickAction(poor, 'sell');
    poor.world.tick();
    expect(flowOf(poor)).toBe('playing');

    const rich = boot();
    rich.world.getComponent<Resource>('purse', 'Resource')!.current = BALANCE.goldTarget - CROPS[0].price;
    rich.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 1;
    clickAction(rich, 'sell');
    rich.world.tick();
    expect(res(rich, 'purse', RES.gold)).toBe(BALANCE.goldTarget);
    expect(flowOf(rich)).toBe('won');
  });

  // ── R-20 终局冻结（owner 2026-09-18 裁「冻住」·见 requests.md §0.13）──────────
  //  ⚠ 上面那条只证到「flow 转了 won」——**「没碰坏」不等于「真冻住了」**。冻结自身要有牙：
  //    转 won 之后**世界的推进**必须停：睡觉不推天、干活不改地块态、卖货不清背包。
  //    没有这条断言时是活的（PE 实测过：终局屏点 canvas 那排按钮 7 天 → 8 天；
  //    DOM 侧早已换屏，canvas 侧那排按钮此前没人管——冻结就是给它们上的同一把锁）。
  it('终局冻结：转 won 后睡觉/干活/卖货一律落空，世界不再推进', () => {
    const e = boot();
    const day0 = res(e, 'calendar', RES.day)!;
    // 先证「冻结前这同一条路径是通的」——否则下面「没变」可能只是按钮本来就点不响（假绿）。
    pickTool(e, 0);
    work(e, 0, 0);
    expect(stateOf(e, tileId(0, 0)), '冻结前干活就不通 ⇒ 下面的「没变」不是冻结的功劳').toBe(TILE_STATE.TILLED);
    const energy0 = res(e, 'wallet', RES.energy)!; // 干完这一下之后的余额（= 19）

    // 推到通关（同「通关」那条的路径）。
    // ⚠ 实测的**两拍延迟**（探针量的，不是推的）：卖货那一拍金币就到线，但
    //   ① 金币到线后 flow 在**次拍**才转 won（flow 跑在 Update 早段，读的是上一拍落账的值）；
    //   ② 转移时置 `entered=false` ⇒ won 的 onEnter（置冻结旗）在**再一拍**才跑（`flow.ts:208` 的边沿语义）。
    //   故这里必须 tick 到 won **再多一拍**——少一拍翻不了旗（首轮就是这么红的）。
    e.world.getComponent<Resource>('purse', 'Resource')!.current = BALANCE.goldTarget - CROPS[0].price;
    e.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 1;
    clickAction(e, 'sell');
    for (let i = 0; i < 6 && flowOf(e) !== FLOW.WON; i++) e.world.tick(); // 等到转态（转不到由下面那条当场红）
    expect(flowOf(e), '金币到线了却没转 won').toBe(FLOW.WON);
    e.world.tick(); // 再一拍：跑 won 的 onEnter
    expect(flagOf(e, 'frozen', FROZEN_FLAG), 'won 没置冻结旗 ⇒ onEnter 那条 FlowAction 没跑').toBe(true);

    // ① 干活落空：换一格荒地再锄（工具仍是锄地），状态与体力都不许动。
    work(e, 0, 1);
    expect(stateOf(e, tileId(0, 1)), '终局后还能干活（地块状态被改了）').toBe(TILE_STATE.WILD);
    expect(res(e, 'wallet', RES.energy), '终局后干活还扣了体力').toBe(energy0);

    // ② 睡觉落空：日期不推。
    sleepNight(e);
    expect(res(e, 'calendar', RES.day), '终局后睡觉还推了天').toBe(day0);

    // ③ 卖货落空：不进账、不清背包。
    e.world.getComponent<Resource>('barn-wheat', 'Resource')!.current = 2;
    const gold0 = res(e, 'purse', RES.gold)!;
    clickAction(e, 'sell');
    e.world.tick();
    expect(res(e, 'purse', RES.gold), '终局后卖货还进账').toBe(gold0);
    expect(res(e, 'barn-wheat', CROPS[1].invRes), '终局后卖货清了背包').toBe(2);
  });

  // ── DOM HUD（S3 点击门要求：活体 DOM 里要有可驱动控件）──────────────────────
  //  下面这批断的是**离线可证的那一半**：交树形状（点击门靠它数控件）+ 具名动作真的能打进世界。
  //  浏览器那一半（挂载 / 点击 / DOM 真变）由 `node scripts/click-probe.mjs --game game109` 判。
  it('HUD 交树：三行结构 · 6 枚动作键（吃皮 Panel·名字在子 Label 上）各带唯一 id 与信号名', () => {
    const tree = buildHud(hudView());
    // 树规模：S3 那版是「一行五读数 + 六按钮」= 14 以内；②b 之后是三行 + 背包网格 + 每枚按钮的名字节点
    // （现测 31）。留一点余量给读数微调，但整棵树翻倍（≥62）就说明有人在 HUD 里长出了第二套控件。
    expect(walkNodes(tree).length).toBeLessThanOrEqual(40);
    // 「动作键」的判据 = 带 `action` 的可点容器（`PanelProps.action`·②b 起按钮是 Panel 不是 Button）
    // ⇒ 这样数出来的就是**点击门认的那批控件**（渲染成 `data-action`），与节点类型无关。
    const btns = walkNodes(tree).filter((n) => typeof propOf(n, 'action') === 'string');
    expect(btns.length).toBe(TOOLS.length + ACTIONS.length); // 6
    // id 与 action 一一对应（id=HUD_ID.btn(动作名)、action=信号名），顺序 = 工具在前、动作在后。
    expect(btns.map((b) => b.id)).toEqual([
      ...TOOLS.map((t) => HUD_ID.btn(t.id)), ...ACTIONS.map((a) => HUD_ID.btn(a.id)),
    ]);
    expect(btns.map((b) => propOf(b, 'action'))).toEqual([
      ...TOOLS.map((t) => t.pickSignal), ...ACTIONS.map((a) => a.signal),
    ]);
    expect(new Set(btns.map((b) => b.id)).size).toBe(btns.length); // 点击门按 id 点，重键必点错
    // 名字**必须真写在子 Label 上**（空名字 = 看不见的砖；S4 走查判选中态读的正是这串文本）。
    // ⚠ 别改成读容器自己的 `label`：`Panel` 没有那个 prop ⇒ `String(undefined)` = 'undefined' 长度 9，
    //   看着非空、实则什么都没证。
    for (const id of [...TOOLS.map((t) => t.id), ...ACTIONS.map((a) => a.id)]) {
      const lb = nodeById(tree, HUD_ID.btnLabel(id)); // id 缺了会在这里当场红（nodeById 自带断言）
      expect(String(propOf(lb, 'text')).length, `${id} 的名字是空的`).toBeGreaterThan(0);
    }
    // 读数：id 齐全且互不相同（同一条快照里按 id 认元素）。
    const ids = walkNodes(tree).map((n) => n.id);
    for (const id of [HUD_ID.root, HUD_ID.readouts, HUD_ID.actions, HUD_ID.energy, HUD_ID.gold, HUD_ID.day, HUD_ID.bag, HUD_ID.bagGrid, HUD_ID.tool]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('HUD 的 6 个动作在世界侧都有具名生产者（kb-* 的 KeyBinding·key === signal === 按钮 action）', () => {
    // DOM 按钮是 action 相位的**无坐标**事件（clickable 明言忽略 x===undefined）→ 必须由 keybind 接。
    // 少了这批实体，按钮点了会**静默**入队（信号没人认领，不报错）——正是点击门要抓的那个病。
    const bp = buildBlueprint();
    const kbIds = Object.keys(bp.entities).filter((k) => k.startsWith('kb-'));
    expect(kbIds.length).toBe(TOOLS.length + ACTIONS.length); // 一动作一实体（一实体一组件）
    const want = [...TOOLS.map((t) => t.pickSignal), ...ACTIONS.map((a) => a.signal)].sort();
    expect(kbIds.map((k) => (bp.entities[k]['KeyBinding'] as Record<string, unknown>)['key'] as string).sort()).toEqual(want);
    for (const k of kbIds) {
      const kb = bp.entities[k]['KeyBinding'] as Record<string, unknown>;
      expect(kb['signal']).toBe(kb['key']); // 键名即信号名（一处命名）
      expect(kb['source']).toBeUndefined(); // 这 6 个动作全是全局写，不按 source 寻址（填了反而指错主体）
      expect(kb['phase']).toBeUndefined(); // 缺省=任意相位（宿主侧只发 action，无坐标）
    }
    // 反过来：每个信号名都得**有人认领**（effect-apply 按名消费）——不然信号发得出去、世界一动不动。
    const consumed = new Set(Object.values(bp.entities)
      .map((e) => (e['Effect'] as Record<string, unknown> | undefined)?.['onSignal'])
      .filter((s): s is string => typeof s === 'string'));
    for (const key of want) expect(consumed.has(key), `${key} 没有消费者`).toBe(true);
  });

  it('DOM 路径行为：action 相位（无坐标）打进世界——选工具 / 睡觉 / 卖货与指针路径同一份效果', () => {
    const e = boot();
    tapAction(e, TOOLS[2].pickSignal); // 点 HUD 的「浇水」
    expect(res(e, 'toolbox', RES.tool)).toBe(2); // 工具下标是全局 Resource（两条路径写同一处）

    e.world.getComponent<Resource>('wallet', 'Resource')!.current = 3; // 先把体力花掉一半
    tapAction(e, SIGNALS.SLEEP);
    clearInput(e); e.world.tick(); // 睡觉天然跨两拍（生长相位收尾·同 sleepNight）
    expect(res(e, 'wallet', RES.energy)).toBe(BALANCE.energyRefill);
    expect(res(e, 'calendar', RES.day)).toBe(BALANCE.dayStart + 1);

    e.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 2;
    tapAction(e, SIGNALS.SELL);
    expect(res(e, 'purse', RES.gold)).toBe(2 * CROPS[0].price);
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(0); // 先结账后清零
  });

  it('HUD 高亮随选中变 ⇒ 点一下 DOM 真会变；读数跟世界走（readHudView 是唯一接口面）', () => {
    const till = buildHud(hudView({ tool: 0 }));
    const water = buildHud(hudView({ tool: 2 }));
    // 点击门的判据②靠这条：点工具 → 世界变 → 交树变（某元素的自身文本就变了）。
    expect(JSON.stringify(till)).not.toBe(JSON.stringify(water));
    // 选中态的**文字**那一半：S4 走查判「哪枚键选中」读的就是 `#g109-hud-btn-*` 子树里的 `▶ ` 前缀。
    // ⚠ ②b 起这串文本住在**子 Label**（`btnLabel`）上，不在按钮容器自身——读错节点会得到 'undefined'
    //   而不是报错（点击门的 SNAP 只取元素自身的直接文本，容器自己没文本，变化记在子节点名下）。
    const labelOf = (tree: LayoutNode, actionId: string): string =>
      String(propOf(nodeById(tree, HUD_ID.btnLabel(actionId)), 'text'));
    expect(labelOf(till, 'till')).toBe(`▶ ${TOOLS[0].name}`);
    expect(labelOf(till, 'water')).toBe(TOOLS[2].name);
    expect(labelOf(water, 'water')).toBe(`▶ ${TOOLS[2].name}`);
    expect(labelOf(water, 'till')).toBe(TOOLS[0].name);
    // 选中态的**视觉**那一半：`fx` 在 layout 上（不是 props），且**只有**选中那枚带 glow
    // （旧的 `kind:'primary'` 已随 Button 一起退役——6 枚同排全是主交互，不给两副长相·见 hud.ts）。
    const fxOf = (tree: LayoutNode, actionId: string) =>
      nodeById(tree, HUD_ID.btn(actionId)).layout?.fx ?? [];
    expect(fxOf(water, 'water').some((f) => f.kind === 'glow')).toBe(true);
    expect(fxOf(water, 'till').some((f) => f.kind === 'glow')).toBe(false);
    for (const id of ['till', 'water']) {
      expect(fxOf(water, id).some((f) => f.kind === 'sheen-hover'), `${id} 丢了悬停流光`).toBe(true);
    }
    // 读数（Label 的自身文本也是 SNAP 认的那一类）。
    const text = (tree: LayoutNode, id: string): string => String(propOf(nodeById(tree, id), 'text'));
    expect(text(till, HUD_ID.energy)).toBe(`体力 ${BALANCE.energyStart}/${BALANCE.energyMax}`);
    expect(text(till, HUD_ID.gold)).toBe(`金币 0 / ${BALANCE.goldTarget}`);
    expect(text(till, HUD_ID.day)).toBe(`第 ${BALANCE.dayStart} 天`);
    expect(text(water, HUD_ID.tool)).toBe(`当前工具：${TOOLS[2].name}`);
    // 背包读数（R-14）：②b 起是**网格三格**（每格一个 `名字 ×N`），不是一条长 Label。
    expect(text(till, HUD_ID.bagCap)).toBe('背包');
    expect(CROPS.map((c) => text(till, HUD_ID.bagTileLabel(c.id)))).toEqual(CROPS.map((c) => `${c.name} ×0`));

    // 只读投影：读的是**世界现态**（不是交树时的快照），且缺组件时回退数据表初值、绝不抛。
    const e = boot();
    expect(readHudView(e.world)).toEqual(hudView());
    pickTool(e, 2); // DOM 路径改世界 → 下一次交树就会带上新工具名
    expect(readHudView(e.world).tool).toBe(2);
    expect(readHudView(e.world).toolName).toBe(TOOLS[2].name);
  });

  // ── R-14 背包读数：**看得见自己的收成**（S4 对齐单的末条 ❌）────────────────────
  //  为什么不能只断「那个 id 在树上」：一个恒读 0 的读数也满足它。这条走**真收成 → 真卖货**，
  //  逐拍对读出树的文本（不是对 `readHudView` 的返回值——那中间还隔着 bagText 与交树两层）。
  it('背包读数：收获后读数涨、卖货后读数归零（R-14·读数真的跟着世界走）', () => {
    // ②b 起读数是**三格**（每格一个 `名字 ×N`）⇒ 这里逐格读、按 `CROPS` 顺序成组比对。
    const bagNow = (e: ReturnType<typeof boot>): string[] => {
      const t = buildHud(readHudView(e.world));
      return CROPS.map((c) => String(propOf(nodeById(t, HUD_ID.bagTileLabel(c.id)), 'text')));
    };
    const e = boot();
    const empty = CROPS.map((c) => `${c.name} ×0`);
    expect(bagNow(e), '开局背包就不是空的 ⇒ 下面「涨了」不算数').toEqual(empty);

    prepareWatered(e, 0, 0); // 胡萝卜格（CROPS[0]）：翻土→播种→浇水
    pickTool(e, 2); work(e, 0, 0);
    sleepNight(e);            // 睡一觉 → 熟
    pickTool(e, 3); work(e, 0, 0); // 收获 → 入胡萝卜账
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(1);
    expect(bagNow(e)).toEqual(CROPS.map((c, i) => `${c.name} ×${i === 0 ? 1 : 0}`)); // ← 读数跟着涨

    clickAction(e, 'sell'); e.world.tick();
    expect(res(e, 'barn-carrot', CROPS[0].invRes)).toBe(0);
    expect(bagNow(e)).toEqual(empty); // ← 读数跟着归零
  });

  // ── 终局出口（S4）：结算屏 + 重开键 ────────────────────────────────────────
  //  brief.md:34「开始→操作→推进→**可重开**」·:46「金币 ≥ 目标 → 通关结算屏」。
  //  屏上那颗「重开」是**本关唯一的宿主生命周期出口**（世界里没有它的消费者），故它也是
  //  self-check.md 要求「最高优先级被测对象」的那颗键：既要证它出现，也要证**点完世界真的变了**。
  it('结算屏交树：flow=won 才换屏（读数与 6 枚动作键整条收起），三件必写齐全', () => {
    // 两个 view 只差 flow 这一个字段 ⇒ 换屏是**这一个条件**的结果（不是碰巧画出了别的样子）。
    const playing = buildHud(hudView());
    const won = buildHud(hudView({ flow: FLOW.WON }));

    expect(idsOf(playing)).not.toContain(HUD_ID.result);
    expect(idsOf(won)).toContain(HUD_ID.result);
    // 庆祝粒子层：只在结算屏在场（对局屏不许常驻一层纸屑）。
    expect(idsOf(playing)).not.toContain(HUD_ID.fx);
    expect(idsOf(won)).toContain(HUD_ID.fx);
    for (const id of [HUD_ID.readouts, HUD_ID.actions]) expect(idsOf(won)).not.toContain(id);
    for (const id of [...TOOLS.map((t) => HUD_ID.btn(t.id)), ...ACTIONS.map((a) => HUD_ID.btn(a.id))]) {
      expect(idsOf(won), `通关屏不该再有对局键 ${id}`).not.toContain(id);
    }

    // 三件必写：**「通关」+ 用时天数 + 最终金币**（两者都跟着世界走，不是写死的字面量）。
    const text = (t: LayoutNode, id: string): string => String(propOf(nodeById(t, id), 'text'));
    expect(text(won, HUD_ID.resultTitle)).toContain('通关');
    const stats = text(won, HUD_ID.resultStats);
    expect(stats).toContain(`用时 ${BALANCE.dayStart} 天`);
    expect(stats).toContain(`最终金币 0 / ${BALANCE.goldTarget}`);
    const late = buildHud(hudView({ flow: FLOW.WON, day: 6, gold: BALANCE.goldTarget }));
    expect(text(late, HUD_ID.resultStats)).toContain('用时 6 天');
    expect(text(late, HUD_ID.resultStats)).toContain(`最终金币 ${BALANCE.goldTarget}`);

    // 庆祝粒子层：**必须带 width/height**——粒子 wrapper 是 `position:relative;overflow:hidden`
    // （render.ts:1142），碎片全是 `left:%/top:%` 的绝对定位子元素 ⇒ 不给尺寸就是 0×0：什么都看不见、
    // 且**不报错**（本关已经犯过一次这个错）。这条钉的就是它。
    const fx = nodeById(won, HUD_ID.fx);
    expect(fx.type).toBe('Particles');
    expect(propOf(fx, 'kind')).toBe('confetti');
    const fxLayout = (fx.layout ?? {}) as Record<string, unknown>;
    expect(fxLayout['width']).toBe(FIELD_W);
    expect(fxLayout['height']).toBe(HUD_H);

    // 唯一出口 = 「重开」：全屏（= 整棵交树）就这一枚 Button，它带本地动作名（不是信号名）。
    const btns = walkNodes(won).filter((n) => n.type === 'Button');
    expect(btns.length).toBe(1);
    expect(btns[0].id).toBe(HUD_ID.restart);
    expect(propOf(btns[0], 'action')).toBe(HUD_ACTION.restart);
    expect(propOf(btns[0], 'label')).toBe('重开');
    expect(new Set(idsOf(won)).size).toBe(idsOf(won).length); // 换屏后 id 仍不重（点击门按 id 认元素）
  });

  it('flow 相位：readHudView 读世界的 GameFlow（与 data.ts 的 FLOW 同词）；到线即换屏', () => {
    // ① 蓝图里的状态 id 就是 data.ts 的 FLOW —— 两处必须同词，否则 HUD 永远不换屏（且不报错）。
    const flow = buildBlueprint().entities['flow']['GameFlow'] as unknown as {
      current: string;
      states: Array<{ id: string; transitions: Array<{ to: string }> }>;
    };
    expect(flow.current).toBe(FLOW.PLAYING);
    expect(flow.states.map((s) => s.id)).toEqual([FLOW.PLAYING, FLOW.WON]);
    expect(flow.states[0].transitions[0].to).toBe(FLOW.WON);

    // ② 世界现态 → 交树：开局是对局屏，一动没动过。
    const e = boot();
    expect(flowOf(e)).toBe(FLOW.PLAYING);
    expect(readHudView(e.world).flow).toBe(FLOW.PLAYING);
    expect(idsOf(buildHud(readHudView(e.world)))).not.toContain(HUD_ID.result);

    // ③ 走到通关：读投影与交树**同时**翻面（把「通关」与「结算屏」两件事钉在一条链上）。
    e.world.getComponent<Resource>('purse', 'Resource')!.current = BALANCE.goldTarget - CROPS[0].price;
    e.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 1;
    clickAction(e, 'sell');
    e.world.tick();
    expect(flowOf(e)).toBe(FLOW.WON);
    const view = readHudView(e.world);
    expect(view.flow).toBe(FLOW.WON);
    expect(view.gold).toBe(BALANCE.goldTarget);
    expect(idsOf(buildHud(view))).toContain(HUD_ID.result);
    // 结算屏上的两个数就是这一局的数（天数不随通关变·金币停在到线值）。
    expect(String(propOf(nodeById(buildHud(view), HUD_ID.resultStats), 'text'))).toContain(`${BALANCE.goldTarget}`);
  });

  // ── 主菜单屏（S7 换屏·D-13：`capability-plan.md §4.6` 的 `buildStarterHome`）──────────────
  it('主菜单屏交树：`buildStarterHome` 的骨架原样在场 · 只有一枚「开始」（宿主动作·不是世界信号）', () => {
    const tree = buildHome();
    // 「逐字调用」的证据：根就是 builder 自己的 `Screen`（不是我们包了一层自建壳），四个 house id 一个不少。
    expect(tree.type).toBe('Screen');
    expect(tree.id).toBe('starter-home');
    expect(propOf(tree, 'center')).toBe(true);
    // `fill:true` 是关键：`renderScreen` 里 fill 走 `min-height:100%`（吃父定尺盒 720×910），
    //   不带 fill 就是 `100vh`（吃视口）——挂进 overlayHost 会算错高度（render.ts:550-551）。
    expect(propOf(tree, 'fill')).toBe(true);
    const ids = idsOf(tree);
    for (const id of ['starter-home-amb', 'starter-title-card', 'starter-title', 'starter-sub', 'starter-actions', 'starter-act-0']) {
      expect(ids, `builder 的骨架里缺 ${id}`).toContain(id);
    }
    // **只有一枚动作节点** ⇒ 不存在「没有消费者的键 = 死键」（buildHome 注里那条纪律的机器版）。
    const acts = walkNodes(tree).filter((n) => typeof propOf(n, 'action') === 'string');
    expect(acts.map((n) => propOf(n, 'action'))).toEqual([HUD_ACTION.start]);
    expect(propOf(nodeById(tree, 'starter-act-0'), 'label')).toBe('开始');
    // 标题 = owner 挂的占位名（`brief.md:3`「名字先挂暂名」）。**不许在这里自造名字**——
    // 定名后改的是这一个字符串，不是结构。
    expect(propOf(nodeById(tree, 'starter-title'), 'text')).toBe('暂名');
  });

  it('「重开」「开始」的消费者都是**宿主**：handler 表里只有它俩；另 6 枚键照旧走 ActionSink 队列（世界不认这两个名字）', () => {
    const { container, done } = mountInBody();
    const round = mountRound(container);
    try {
      // 两颗宿主动作：`restart`（局的生命周期）+ `start`（收起主菜单屏·S7 换屏）。
      // ⚠ 这条**恰好等于**是对「表里只有它俩」的断言——多一枚就得在这里说明它为什么没有世界消费者。
      expect(Object.keys(round.handlers)).toEqual([HUD_ACTION.restart, HUD_ACTION.start]);
      // 另 6 枚键查不到本地 handler ⇒ mountUI 走 enqueueAction 分支 → keybind → Effect（见上面 kb-* 那条断言）。
      for (const key of [...TOOLS.map((t) => t.pickSignal), ...ACTIONS.map((a) => a.signal)]) {
        expect(round.handlers[key], `${key} 不该挂本地 handler（它得走 ActionSink）`).toBeUndefined();
      }
      expect(typeof round.handlers[HUD_ACTION.restart]).toBe('function');
      expect(typeof round.handlers[HUD_ACTION.start]).toBe('function');
      // 为什么它俩必须挂本地：世界**都不认**这两个名字——蓝图里没有 kb-restart / kb-start，也没有 Effect 认领。
      // 若它们落进队列就是一条没人消费的信号：点了没反应、且不报错（self-check.md:28 记的正是这个病）。
      // 两颗各自跑同一条判据（不是对「重开」验一遍、对「开始」想当然）。
      const bp = buildBlueprint();
      const consumed = new Set(Object.values(bp.entities)
        .map((x) => (x['Effect'] as Record<string, unknown> | undefined)?.['onSignal'])
        .filter((s): s is string => typeof s === 'string'));
      for (const act of [HUD_ACTION.restart, HUD_ACTION.start]) {
        expect(Object.keys(bp.entities)).not.toContain(`kb-${act}`);
        expect(consumed.has(act), `世界里没有消费者认领 ${act}`).toBe(false);
      }
    } finally {
      round.dispose();
      done();
    }
  });

  it('终局出口·宿主生命周期：点结算屏的「重开」→ 新的一局回到开局态；旧引擎真停（旧世界留在通关态）', async () => {
    const { container, done } = mountInBody();
    const round = mountRound(container);
    try {
      const old = round.engine;

      // ① 推到通关：金币垫到离目标一步 + 一个胡萝卜，点 HUD 的「卖货」键。
      //    这颗键**不在** handler 表里 ⇒ 它走的是 ActionSink 队列 → keybind → Effect（活体路径，非夹具）。
      old.world.getComponent<Resource>('purse', 'Resource')!.current = BALANCE.goldTarget - CROPS[0].price;
      old.world.getComponent<Resource>('barn-carrot', 'Resource')!.current = 1;
      clickIn(container, HUD_ID.btn('sell'));
      expect(await waitFor(() => flowOf(old) === FLOW.WON), '点了卖货但世界没通关（引擎循环没在跑？）').toBe(true);

      // ② 世界到线 → 订阅的重画把 HUD 换屏（换屏走的也是 ui.update，不是重挂）。
      expect(await waitFor(() => container.querySelector(`#${HUD_ID.restart}`) !== null), '通关了但结算屏没出现在活体 DOM 里').toBe(true);
      const panel = container.textContent ?? '';
      expect(panel).toContain('通关');
      expect(panel).toContain(`${BALANCE.dayStart} 天`); // 用时天数
      expect(panel).toContain(String(BALANCE.goldTarget)); // 最终金币
      expect(container.querySelector(`#${HUD_ID.actions}`)).toBeNull(); // 对局键整条收起（屏上无死路操作）
      const oldCanvas = container.querySelector('canvas');
      expect(oldCanvas, '本局画布没挂进活体 DOM').not.toBeNull(); // 防空跑：下面那条要拿它当证物

      // ③ 点那颗唯一的出口。**点完必须断言世界真的变了**（self-check.md:38），不是只断言屏刷新了。
      clickIn(container, HUD_ID.restart);
      const fresh = round.engine;
      expect(fresh).not.toBe(old); // 新的一局 = 另起一台引擎
      expect(flowOf(fresh)).toBe(FLOW.PLAYING);
      expect(res(fresh, 'purse', RES.gold)).toBe(0);
      expect(res(fresh, 'wallet', RES.energy)).toBe(BALANCE.energyStart);
      expect(res(fresh, 'calendar', RES.day)).toBe(BALANCE.dayStart);
      expect(stateOf(fresh, tileId(0, 0))).toBe(TILE_STATE.WILD);
      expect(flagOf(fresh, tileId(0, 0), TILE_FLAG)).toBe(false);
      expect(res(fresh, tileId(0, 0), RES.stage)).toBe(0);
      // 旧世界没被就地改写 —— 是**另起一局**，不是世界侧复位（那条路刻意不走，见 game109.ts 文件头 (a)(b)(c)）。
      expect(flowOf(old)).toBe(FLOW.WON);

      // ④ HUD 回到对局屏；视觉面每局一副，容器里只该剩一套（旧渲染器的画布与骨架都已摘掉）。
      expect(container.querySelector(`#${HUD_ID.result}`)).toBeNull();
      expect(container.querySelector(`#${HUD_ID.restart}`)).toBeNull();
      expect(container.querySelector(`#${HUD_ID.btn('till')}`)).not.toBeNull();
      expect(container.querySelectorAll('canvas').length).toBe(1);
      expect(container.querySelectorAll('[data-scene-bg-skin]').length).toBe(1);
      // 旧画布是被 `renderer.destroy()` 摘的（`canvas.remove()`），不只是「随旧骨架一起被移走」——
      // 少了这一条，destroy() 漏调也看不出来（旧骨架整个被移走时画布会被顺带带走）。
      expect(oldCanvas?.parentNode ?? null, '旧渲染器的画布没被 destroy()').toBeNull();

      // ⑤ 旧引擎**真的停了**：重开后它一拍都不许再走（孤儿循环的判据）。
      //    反向对照：新引擎必须涨 —— 否则「旧引擎 0 拍」是空跑假绿（循环压根没跑起来）。
      const oldTicks = spyTicks(old);
      const freshTicks = spyTicks(fresh);
      expect(await waitFor(() => freshTicks() > 0), '重开后的引擎循环没跑起来（判据空跑）').toBe(true);
      expect(oldTicks(), '旧引擎还在空跑（孤儿循环）').toBe(0);

      // ⑥ 「可重开」是可重复的：再来一次仍成立（handler 表是局共享的，不该只有第一次好使）。
      round.restart();
      expect(round.engine).not.toBe(fresh);
      expect(flowOf(round.engine)).toBe(FLOW.PLAYING);
      expect(container.querySelectorAll('canvas').length).toBe(1); // 两轮重开后仍是「一局一副」
    } finally {
      round.dispose();
      done();
    }
  });

  it('宿主 cleanup 契约：mount 的返回值就是拆本局（拆干净·幂等·拆后不许再取 engine）', () => {
    const a = mountInBody();
    try {
      const cleanup = mount(a.container); // launcher 装载面（(el) => cleanup）
      expect(a.container.querySelectorAll('canvas').length).toBe(1);
      expect(a.container.querySelectorAll('*').length).toBeGreaterThan(0);
      cleanup();
      expect(a.container.querySelectorAll('*').length).toBe(0); // 骨架（含画布/HUD）全摘，不留孤儿 DOM
      expect(() => cleanup()).not.toThrow(); // 幂等（launcher 卸载 + 手动清理撞车时不许炸）
    } finally {
      a.done();
    }

    const b = mountInBody();
    try {
      const round = mountRound(b.container);
      expect(() => round.engine).not.toThrow();
      round.restart(); // 裸重开（不经 DOM）：也必须是「拆本局 + 照原路径重挂」
      expect(flowOf(round.engine)).toBe(FLOW.PLAYING);
      round.dispose();
      expect(() => round.engine).toThrow(); // 拆完就拿不到引擎了（防缓存旧引擎继续用）
      expect(() => round.dispose()).not.toThrow(); // 幂等
    } finally {
      b.done();
    }
  });
});
