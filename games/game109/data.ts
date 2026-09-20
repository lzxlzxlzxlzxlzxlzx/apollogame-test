// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— 内容与平衡数据（**纯数据**：零函数、零随机、零运行时代码）
//
//  设计真相：docs/design/game109/brief.md（S1 卡）· capability-plan.md（S2 计划，已 owner PASS）。
//  引擎真相：games/game109/probe.test.ts（S2 接线探针 P1~P7·实查留原文）。
//  本文件只存**数字与标识**；一切行为由 blueprint.ts 装配成引擎数据（Effect / SelfRule / EventWhen / GameFlow）。
//
//  一字排布前提（S2 勘定·三处硬约束，改数据前必读）：
//   · 一格一个 `Flag`/`State`/`Resource` 槽（一实体一组件）→ Flag 只放「今日已浇」、State 放整条生命周期、
//     Resource 放生长阶。**生长阶不能塞进 State**（State.current 是字符串且由 set-state 写死值）。
//   · **没有写字符串的 Effect kind**（Effect 种类是闭集）→ 「当前选中的工具」只能是 Resource 的整数，
//     不能是 StringVar；反过来说，**地块种什么作物（StringVar.crop）只能在装配期定死**（P6-c 的形态）。
//   · 一切「干活 ∧ 全局体力够」的组合走 `when`（self 门）+ `whenGlobal`（全局门），门的落法见 blueprint.ts。
// ═══════════════════════════════════════════════════════════════════════════

// ── 地块生命周期（State.fsmId='tile' 的取值闭集）──────────────────────────────
//  brief.md:98 定案：Flag 放「今日已浇」、State 放整条生命周期、Resource 放生长阶。
export const TILE_FSM = 'tile';
export const TILE_FLAG = 'watered'; // Flag id：今日已浇（睡觉结算后全场清）
export const GROW_PHASE_FLAG = 'grow-phase'; // 全局 Flag：生长相位（睡觉置真 → 下一拍各格生长 → 清假）
// 全局 Flag：终局冻结（S4 自证 R-20 的裁定落法·owner 2026-09-18 裁「冻住」）。
// `flow` 转 won 时由 `GameFlow.states[won].onEnter` 置真（FlowAction 支持 set-flag ⇒ **纯数据·零引擎改动**）；
// 干活链的 5 条认领拍 + 睡觉 3 拍 + 卖货 6 拍的门都挂「未冻结」。
// 冻结的是**世界的推进**——DOM 侧本来就已换屏（结算面板顶掉动作条），canvas 侧那排按钮此前是活的
// （PE 实测：终局屏点它会 7 天→8 天）。冻住后 self-check.md:40「只有一个出口的屏」在两侧同时成立。
export const FROZEN_FLAG = 'frozen';

// ── 地块底色表（R-10/R-11 的可见化·owner 2026-09-18 裁「δ 全轴」）──────────────────
//  行号 = State 行 × 2 + (今日已浇 ? 1 : 0)（`SpriteBinding{states, flagId}` 的合成下标）。
//  「荒·湿」「翻·湿」两行**不可达**（浇水的前置是已播种）——留着是为了让「行=状态×2+湿」这条
//  进制规则自洽：表里不留空洞，读表的人不必记特例。色值与相邻的「干」档同族递进。
//  读法是一条**由浅到深的土色坡度**：草绿褐（未开垦）→ 黄褐（翻开的干土）→ 深褐（播过）→
//  近黑（湿土）。故「今晚会长的那格」在最暗一档，一眼可辨。
//  ⚠ 为什么**撤了**原来的棋盘隔格色（`crop.tintAlt`）：那条「便于数格」的辅助会与这条**有语义的
//  颜色坡度互相混**——暗格与浅格会被误读成状态差。格子间的 10px 间隙已足够分开 36 格（R-01 仍成立）。
export const LIFE_TINTS: readonly number[] = [
  0x82905a, // 荒·干〔行 0〕
  0x6f7c4b, // 荒·湿〔行 1·不可达〕
  0x9c7748, // 翻·干〔行 2〕
  0x825f38, // 翻·湿〔行 3·不可达〕
  0x6b563a, // 播·干〔行 4〕
  0x463524, // 播·湿〔行 5〕← 今晚会长的那格
];
export const TILE_STATE = {
  WILD: 'wild', // 荒地：未翻土
  TILLED: 'tilled', // 已翻土：可播种
  SOWN: 'sown', // 已播种：可浇水；成熟后可收获
  // ⚠ 临时态：只活在同一拍 Commit 内，是「本次点击已被认领」这个**瞬时事实**（S2 探针 P7 的三拍握手核心）。
  //   它不是游戏可见状态——拍末必被 settle 抹成 WILD/TILLED/SOWN，渲染读的是拍后状态。
  BUSY: 'busy',
} as const;

// ── 信号名（点击 → 信号 → Effect 三段式的中间那段）─────────────────────────────
export const SIGNALS = {
  WORK: 'work', // 点地块：干当前选中的那个活（工具门由 whenGlobal 判）
  SLEEP: 'sleep', // 点「睡觉」：推一天
  SELL: 'sell', // 点「卖货」：背包 → 金币
  DAY_END: 'day-end', // 内部信号：生长相位收尾（EventWhen 边沿发·清相位旗 + 清全场浇水标记）
} as const;

// ── 流程相位 id（`blueprint.ts` 的 `GameFlow.states[].id` 就是这两个字面量）────────
//  HUD 的结算面板据它切换（`readHudView` 读 `GameFlow.current`）：`won` = 金币到线的通关态。
//  两处必须同词——`game109.skeleton.test.ts` 有一条断言把蓝图里的状态 id 与这里对拍。
export const FLOW = {
  PLAYING: 'playing', // 对局中
  WON: 'won', // 通关（金币 ≥ goldTarget）→ 结算面板 + 重开键
} as const;

// ── 全局单例资源 id ────────────────────────────────────────────────────────
export const RES = {
  energy: 'energy', // 体力（wallet）
  gold: 'gold', // 金币（purse·通关判据读它）
  day: 'day', // 日期（calendar）
  tool: 'tool', // 当前选中的工具下标（0..TOOLS.length-1）
  stage: 'stage', // 生长阶（每格各一份·同名不同实体）
} as const;

// ── 作物表（brief.md:3 三种作物「生长天数与卖价各异」）──────────────────────────
export interface CropDef {
  readonly id: string;
  readonly name: string;
  /** 成熟所需天数 = 成熟时的 stage 值（睡一觉 = 长一阶）。 */
  readonly days: number;
  /** 售价（金币/个）。 */
  readonly price: number;
  /** 收获后入的背包资源 id（全局单例）。 */
  readonly invRes: string;
  /**
   * 皮肤槽（S6 台账目标·**作物子实体**的 sheet）：该作物**一条横排精灵表**，
   * 帧 0..days = 生长阶（末帧 = 成熟），**再补一格空帧**（下标 days+1）＝「这格没有苗」。
   * 空帧的用处：地块处于 wild/tilled 时（还没播种/没翻土）子实体定位到空帧 ⇒ 画面上不出现苗。
   * 帧数 = days + 2（carrot 3 · wheat 4 · pumpkin 5），列数 = 帧数（单行横排）。
   */
  readonly skin: string;
  /** 素坯主色（S3 没有贴图时 CanvasRenderer 画的方块色）。 */
  readonly tint: number;
  /** 棋盘隔格色（素坯下便于数格·纯观感）。 */
  readonly tintAlt: number;
  /** S6 换皮的源资产 id（assets/index.json 里的 gameicons 键）。 */
  readonly asset: string;
  /** 源资产许可（**CC BY 3.0 = 需要署名**·显示机制未立项 → 见 S3 报告「署名缺口」）。 */
  readonly license: string;
}

export const CROPS: readonly CropDef[] = [
  {
    id: 'carrot', name: '胡萝卜', days: 1, price: 12, invRes: 'inv-carrot',
    skin: '109/crop/carrot',
    tint: 0xd97a3a, tintAlt: 0xc06b31,
    asset: 'gameicons/delapouite/carrot', license: 'CC BY 3.0',
  },
  {
    id: 'wheat', name: '小麦', days: 2, price: 30, invRes: 'inv-wheat',
    skin: '109/crop/wheat',
    tint: 0xd8b44a, tintAlt: 0xbf9e3d,
    asset: 'gameicons/lorc/wheat', license: 'CC BY 3.0',
  },
  {
    id: 'pumpkin', name: '南瓜', days: 3, price: 75, invRes: 'inv-pumpkin',
    skin: '109/crop/pumpkin',
    tint: 0xc9622a, tintAlt: 0xaf5522,
    asset: 'gameicons/delapouite/pumpkin', license: 'CC BY 3.0',
  },
];

/** 按 id 取作物（装配期查表·纯数据）。 */
export const CROP_BY_ID: Readonly<Record<string, CropDef>> = {
  carrot: CROPS[0], wheat: CROPS[1], pumpkin: CROPS[2],
};

// ── 工具表（brief.md:2「4 个动作：锄地/播种/浇水/收获」）────────────────────────
export interface ToolDef {
  readonly id: string;
  /** 选中下标（写进 RES.tool·工具门用它比对）。 */
  readonly index: number;
  readonly name: string;
  readonly hint: string;
  /** 前置 State（self 门的 where·P6-a）——点不满足前置的格子 = 动作被拒且**不白扣体力**。 */
  readonly from: string;
  /** 落定后的 State（三拍握手的第三拍写的目标态）。 */
  readonly to: string;
  /** 体力消耗（brief.md:2「每次干活 = 1 体力」）。 */
  readonly cost: number;
  /** 工具栏按钮发出的信号名（点击 → 换工具）。 */
  readonly pickSignal: string;
  readonly skin: string;
  readonly asset: string;
  readonly license: string;
}

export const TOOLS: readonly ToolDef[] = [
  {
    id: 'till', index: 0, name: '锄地', hint: '荒地 → 已翻土',
    from: TILE_STATE.WILD, to: TILE_STATE.TILLED, cost: 1, pickSignal: 'pick-till',
    skin: '109/tool/plow', asset: 'gameicons/delapouite/plow', license: 'CC BY 3.0',
  },
  {
    id: 'sow', index: 1, name: '播种', hint: '已翻土 → 已播种',
    from: TILE_STATE.TILLED, to: TILE_STATE.SOWN, cost: 1, pickSignal: 'pick-sow',
    skin: '109/tool/plant-seed', asset: 'gameicons/delapouite/plant-seed', license: 'CC BY 3.0',
  },
  {
    // 浇水不换生命周期状态（还是 sown），只把「今日已浇」Flag 置真 → from/to 同为 SOWN。
    id: 'water', index: 2, name: '浇水', hint: '已播种 → 今日已浇',
    from: TILE_STATE.SOWN, to: TILE_STATE.SOWN, cost: 1, pickSignal: 'pick-water',
    skin: '109/tool/watering-can', asset: 'gameicons/delapouite/watering-can', license: 'CC BY 3.0',
  },
  {
    // 收获把地还原成「已翻土」（可接着播种）——故 to 是 TILLED 而不是 WILD。
    id: 'reap', index: 3, name: '收获', hint: '成熟 → 入背包',
    from: TILE_STATE.SOWN, to: TILE_STATE.TILLED, cost: 1, pickSignal: 'pick-reap',
    skin: '109/tool/scythe', asset: 'gameicons/lorc/scythe', license: 'CC BY 3.0',
  },
];

// ── 非工具动作（睡觉 / 卖货·brief.md:16「结束一天=玩家主动点睡觉」）───────────────
export const ACTIONS = [
  {
    id: 'sleep', name: '睡觉', signal: SIGNALS.SLEEP,
    skin: '109/hud/night-sleep', asset: 'gameicons/delapouite/night-sleep', license: 'CC BY 3.0',
  },
  {
    id: 'sell', name: '卖货', signal: SIGNALS.SELL,
    skin: '109/hud/coins', asset: 'gameicons/delapouite/coins', license: 'CC BY 3.0',
  },
] as const;

// ── 平衡数值（**owner 2026-09-18 终裁：就按这组数定稿**·见 requests.md §裁决行 A。
//    集中一处，改数不动装配）────────────────────────────────────────────────
//  ⚠ 打法受**布局**约束（2026-09-18 纠正一条错注释）：`cropByCol` 按列定死作物 ⇒
//    南瓜最多 2 列 × 6 行 = 12 格 = 900 金 < 通关线 1000 ——「全种南瓜」**打不通**。
//    （此处曾写「全种南瓜 6 天通关·实测打法」：那是 Lead 由算式推得、**从未跑过**的一行，
//      被误标成「实测」；PE 在自证走查中实测否证。留此为据，警示后人别把推算写成实测。）
//    实测最优 = **混种 7 天**：12 南瓜 + 6 小麦 + 5 胡萝卜 = 450+390+36+150 = 1026
//    （证据：docs/design/game109/self-check/S4-play.json · 174 条断言全绿）。
export const BALANCE = {
  energyStart: 20, // 起始体力
  energyRefill: 20, // 睡觉回满
  energyMax: 20, // 上限
  goldTarget: 1000, // 通关线（实测 ≈7 天·混种·见上）
  dayStart: 1,
  goldMax: 999999,
  invMax: 999,
  toolMax: TOOLS.length - 1, // 工具下标上界（= 3）
  actionCost: 1, // 每个动作 1 体力（TOOLS[].cost 是同一事实的逐工具副本）
} as const;

// ── 农场布局（6×6=36 格·brief.md:1「一块 6×6 的地」）─────────────────────────
export const FARM = {
  cols: 6,
  rows: 6,
  cell: 112, // 格边长（px·定尺场景逻辑像素）
  pad: 24, // 场地内边距
  barGap: 18, // 地块与动作条之间的空隙
  btnW: 96, // 动作条按钮（4 工具 + 睡觉 + 卖货）
  btnH: 88,
  btnGap: 16,
  // 每列一种作物（12/12/12）——写作「地块属性」而非玩家选择：
  // **没有写字符串的 Effect kind**，sow 无法把「选中的种子」写进地块的 StringVar，故作物在装配期定死（P6-c 的形态）。
  cropByCol: ['carrot', 'carrot', 'wheat', 'wheat', 'pumpkin', 'pumpkin'],
  // 确定性随机源种子（plan §5 建议带一枚 RandomSeed 单例占位·**本作零随机**；
  // 在场 = 将来接 w1-random 时不改动全局 hash 口径。seed 值本身无消费者·仅占位）。
  seed: 109,
} as const;
