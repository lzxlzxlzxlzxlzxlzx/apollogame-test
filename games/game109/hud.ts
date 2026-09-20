// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— 最小 HUD（S3 点击门要求：活体 DOM 里必须有可驱动控件）
//
//  形态：**纯 LayoutNode 数据**（UI 铁律：禁手写 React / 自由 DOM；本文件零 DOM API、零 CSS）。
//  宿主只做两件事：`readHudView(world)` 读世界（只读投影）+ `buildHud(view)` 交树，然后 `ui.update(...)` 重画。
//
//  为什么 S3 就得有 HUD（**修正我上一版留档里的错误推断**）：
//    我曾写「plan §4.6 定了 LayoutNode HUD——那是 S4/S5 的事」。Lead 复核：§4.6 原文只说
//    「主 CTA → sheen-hover + Panel.skin」，**没写阶段**；而四个「受检」先例
//    （game108 / game-105 / game211 / game-mcfight）**全都挂 DOM UI**。gate 是终判 ⇒ 补最小 HUD。
//    本节只做**最小件**（读数 + 4 工具 + 睡觉 + 卖货）；§4.6 的美化（sheen-hover / Panel.skin）留给 S4/S5。
//
//  选中高亮为什么改**标签文字**而不是换底色：S3 点击门的判据只认「元素自身的直接文本 / 内联宽 / 禁用态」
//  （`scripts/click-probe.mjs` 的 SNAP：`childNodes` 里 nodeType===3 的拼接）。换底色它看不见，
//  而高亮本身又必须肉眼可见 ⇒ 文字前缀是既实在又过门的落法。
//  ⚠ S7 ②b 起这枚 `▶ ` 前缀**还多担了一条契约**：S4 走查判「哪枚键选中」读的就是它
//    （`scripts/game109-playthrough.mjs:78`：`label.startsWith('▶ ')`，label 取 `#g109-hud-btn-*` 的
//    `textContent`）。按钮改成 `Panel` + 子 `Label` 之后前缀仍在**同一个 id 的子树里** ⇒ 契约不变；
//    但它从「按钮自身的文本」变成了「子 Label 的文本」，改文案时**别把它挪出那棵树**。
//
//  ── S7 ②b「合一套」：动作条 6 枚从世界实体搬进 DOM（本文件是它们的新家）────────────────────
//  改前形态：同一批动作有**两个入口**——canvas 里 6 枚可点实体（指针路径）+ 本文件的 6 枚 DOM Button
//  （点击门要求的活体控件）。改后：canvas 那 6 枚整批撤出（`blueprint.ts`「动作条按钮」节留档），
//  **控件只剩这里这一套**。三件东西跟着搬：
//   ① **尺寸**：DOM 按钮沿用画布那 6 枚的定尺 `FARM.btnW×btnH`（96×88）与 `FARM.btnGap` ⇒
//      「控件搬家」是字面意义的搬家（同一排、同一格、同一个位置：HUD 条现在正好盖在旧按钮带上）。
//   ② **美术**：那 6 条皮肤槽（`TOOLS[].skin` / `ACTIONS[].skin`）的消费者从世界实体的 `SpriteBinding`
//      换成这里的 `Panel.skin`（**同一批 key、换个消费者**·见 `theme.ts` 的 `ALL_SKIN_KEYS` 注）。
//      皮是 96×88 的**整块按钮板**（底+字形），DOM 按钮与它 **1:1 同尺寸** ⇒ cover 不缩放不裁切。
//   ③ **名字**：画布按钮只画字形不写字，DOM 按钮要可读 ⇒ 名字走**子 Label**压在板的空白下沿
//      （`direction:'column'` + `justify:'end'`）；这是`body` 层实拍比过的接法，详见
//      `docs/design/game109/S7-hud-design.md` §二-①（含三张对照截图）。
//  ⚠ 为什么不是 `Button.skin`（同样是「贴图皮按钮」）：`Button` 的文字**恒居中**（render.ts:318-319
//    的 `base` 无 flex 口子），压上去正好盖住板中央的字形；`Panel.skin` 的 children 是**照常叠在皮上**
//    的独立布局节点（types.ts:264-266），才排得出「图标在上、名字在下」。
//
//  写路径红线（UI 只发信号·逻辑在 sim 能力层）：
//    对局中的 6 枚动作按钮只带 `action`（信号名），**不挂本地 handler** —— 宿主把 QueuedInputSource 当
//    ActionSink 交给 mountUI ⇒ `enqueueAction(信号)` → InputQueue{key,phase:'action'} → keybind 产 Signal →
//    蓝图里的 Effect 按名消费（同一份数据同时服务指针路径与 DOM 路径，逻辑一处）。宿主**不**直接改世界。
//
//  ── 结算面板（S4「终局出口」·brief.md:46「金币 ≥ 目标 → 通关结算屏」）──────────────
//    `flow` 实体的 `GameFlow.current` 到 `won` ⇒ 交树**换屏**：读数与 6 枚动作键整条收起，
//    只留一块结算面板（对局已结束，屏上无死路操作——同 game108 终局屏先例）。面板上唯一的出口是
//    「重开」键，它是**本文件里唯一挂本地 handler 的动作**（消费者是宿主的局生命周期，不是 sim 能力）：
//    `data-action` 与信号名同域但不同源，见 `HUD_ACTION` 的注。
// ═══════════════════════════════════════════════════════════════════════════

import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { GameFlow, Resource } from '@zerocraft/engine/engine/protocol/components.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
// 主菜单屏（S7 换屏·D-13）：**逐字调用** house 起手包的 builder（`§4.6`「用 `@ui/starters`…不自建朴素屏」）。
// 同一个口子 game109.ts 已经在取 `STARTER_THEME`，此处只是把同一模块的另一个导出取进来。
import { buildStarterHome } from '@zerocraft/engine/ui/starters/index.js';
import { ACTIONS, BALANCE, CROPS, FARM, FLOW, RES, TOOLS, type CropDef } from './data.js';
import { BTN_TINT, FIELD_W, HUD_H } from './theme.js';

/** HUD 元素 id（点击门的控件 id 必须非空且唯一；读数与按钮分别命名，便于 S4/S5 接手）。 */
export const HUD_ID = {
  root: 'g109-hud',
  readouts: 'g109-hud-readouts',
  actions: 'g109-hud-actions',
  energy: 'g109-hud-energy',
  gold: 'g109-hud-gold',
  day: 'g109-hud-day',
  tool: 'g109-hud-tool',
  /** 背包读数（R-14）：三种作物各几个。收获进账、卖货清零——玩家看不见背包 = 看不见自己的收成。 */
  bag: 'g109-hud-bag',
  /** 背包的**网格容器**（D-14 第 3 项：三格作物走 `direction:'grid'`，不手搓等宽排布）。 */
  bagGrid: 'g109-hud-bag-grid',
  /** 背包那行的**标题**（「背包」二字·不进网格：它是行标题、不是一个格子）。 */
  bagCap: 'g109-hud-bag-cap',
  /** 背包一格的三个 id：格子容器 / 作物标识色块 / 「名字 ×N」文本。
   *  ②b 把背包从一条长 Label 改成网格后，`HUD_ID.bag`（S3 起在册）只剩「这一行的容器」这一层含义，
   *  读数本身落在 `bagTileLabel` 上——测试按 id 读文本，故这三个 id 必须有单一出处（不许在别处抄串）。 */
  bagTile: (cropId: string): string => `g109-hud-bag-${cropId}`,
  bagTileSwatch: (cropId: string): string => `g109-hud-bag-${cropId}-c`,
  bagTileLabel: (cropId: string): string => `g109-hud-bag-${cropId}-n`,
  /** 动作按钮 id：`id` 是动作名（pick-till / sleep / sell…·与信号同名，账好对）。
   *  ⚠ S7 ②b 起这个 id 挂在**容器**（`Panel`）上，不是按钮叶子：走查读它的 `textContent`
   *  （含后代）与 `data-action`（挂容器·`PanelProps.action`），两条都还在。 */
  btn: (actionId: string): string => `g109-hud-btn-${actionId}`,
  /** 按钮上那行名字（`btn` 的**子** Label）。单独给 id 是为了让人能直接断言「名字写在哪儿」——
   *  点击门的 SNAP 只取**元素自身**的直接文本，容器自己没文本，变化是记在这个子节点名下的。 */
  btnLabel: (actionId: string): string => `g109-hud-btn-${actionId}-lb`,
  /** 结算面板（通关屏）：只在 `flow.current === 'won'` 时进交树。 */
  result: 'g109-hud-result',
  resultTitle: 'g109-hud-result-title',
  resultStats: 'g109-hud-result-stats',
  /** 重开键（结算面板上唯一的出口·`data-action` = `HUD_ACTION.restart`）。 */
  restart: 'g109-hud-restart',
  /** 通关庆祝粒子层（只在结算屏在场·纯表现·动画本身不进断言，但**存在与尺寸**被骨架测试钉着）。 */
  fx: 'g109-hud-fx',
} as const;

/**
 * **本地动作名**（`data-action` 的那串字符）。
 *
 * 与信号名（`data.ts` 的 `SIGNALS` / `TOOLS[].pickSignal`）是**两个域**，别混：
 *   · 信号名 → 进世界：`mountUI` 无本地 handler ⇒ `enqueueAction` → keybind → Effect 按名消费。
 *   · 本地动作名 → 进宿主：`mountUI` 查得到本地 handler ⇒ **就地调用、不入队**（`server.ts` 的 dispatch 路由）。
 * 「重开」是**局的生命周期**（拆本局引擎 + 照原路径重挂），不是世界里的一次状态跳转——
 * 引擎没有「重置实体」通用件，世界侧复位要么数据爆炸要么新增引擎件，故它只能走宿主这条路。
 * 往世界里发一个名叫 restart 的信号 = 屏上那颗键**点了没反应且不报错**（self-check.md:28 记的正是这个病）。
 * 名字在这里与 `blueprint.ts` 无耦合：蓝图里**没有** `kb-restart`，世界不认这个名字。
 */
export const HUD_ACTION = {
  restart: 'restart',
  /**
   * 主菜单屏的「开始」（S7 换屏 · D-13）。与 `restart` **同一条判据**：
   * 它是**局的生命周期**动作（收起主菜单屏 = 宿主的事），世界里没有「开始」的消费者
   * ——`blueprint.ts` 里**没有** `kb-start`。发进世界 = 点了没反应且不报错（`self-check.md:28`）。
   */
  start: 'start',
} as const;

/**
 * 主菜单屏 —— `capability-plan.md §4.6`「**用** `@ui/starters`——`buildStarterHome`（主菜单）…不自建朴素屏」。
 *
 * **逐字调用 house builder**（不 fork、不改它的实现、不覆写它的子树）：本函数只喂那三个数据入参。
 *
 * 三处取值都有出处，**没有一处是自造**：
 *  · `title` = 「暂名」——`brief.md:1` 的题头就是 `game109 《暂名》`，`:3` owner 2026-09-17 定「**名字先挂暂名**」
 *    ⇒ 屏上就写这个占位名。**等 owner 定名再改这一处**（改的是字符串，不动结构）。
 *  · `subtitle` = 「种 · 长 · 收 · 卖 · 睡」——`brief.md:12` 的核心循环原文 `种—长—收—卖—睡`，只换分隔符。
 *  · `actions` = **只一枚**「开始」。为什么不摆「设置/继续/退出」：`buildStarterHome` 的 actions 是**数据**，
 *    多挂一枚就得有消费者，没有消费者的键 = **死键**（`self-check.md:28`）。本关没有存档/设置/退出 ⇒ 不摆。
 *
 * ⚠ **它必须挂 `overlayHost`，不能挂 `bottomHost`**：`buildStarterHome` 产出的是 `Screen`（`fill:true` ⇒ 吃满父盒），
 *   而 `bottomHost` 只有 196px 高 —— 塞进去就是个 196px 高的「菜单」。全屏屏的落点是 `overlayHost`（`inset:0`·z20），
 *   先例五处（game-a/b/c/103/105）见 `S7-screen-swap-design.md` §一-5。
 */
export function buildHome(): LayoutNode {
  return buildStarterHome({
    title: '暂名',
    subtitle: '种 · 长 · 收 · 卖 · 睡',
    actions: [{ label: '开始', action: HUD_ACTION.start, kind: 'hero' }],
  });
}

/** HUD 要的 5 个标量 + 背包 + 流程相位（世界 → 显示的唯一接口面；宿主不读别的）。 */
export interface HudView {
  readonly energy: number;
  readonly energyMax: number;
  readonly gold: number;
  readonly goldTarget: number;
  readonly day: number;
  /** 当前工具下标（RES.tool）。 */
  readonly tool: number;
  readonly toolName: string;
  /**
   * 背包存量（**按 `CROPS` 顺序**逐个作物的个数·R-14）。
   * 为什么是「按作物表的下标」而不是 `Record<id, count>`：平行数组是本仓 `defineCapability`
   * 字段闭集（无嵌套对象）一路带下来的同一口径，且读数与 `CROPS` 一一对齐、加作物只需加一格。
   */
  readonly bag: readonly number[];
  /** 流程相位（`flow` 实体的 `GameFlow.current`）：`FLOW.WON` 时交树出结算面板。 */
  readonly flow: string;
}

/**
 * 只读投影：按 `Resource.id` 找全局单例（先例：game108 的 UIDataSource.resource）。
 * 缺组件一律回退**数据表初值**——HUD 是显示层，绝不因为世界还没装好就抛（点击门判据里有「零 console error」）。
 */
export function readHudView(world: IWorld): HudView {
  const res = (id: string): Resource | undefined => {
    for (const [eid] of world.query('Resource')) {
      const r = world.getComponent<Resource>(eid, 'Resource');
      if (r && r.id === id) return r;
    }
    return undefined;
  };
  const energy = res(RES.energy);
  const tool = res(RES.tool)?.current ?? 0;
  // 流程相位：`GameFlow` 挂全局单例 `flow`（blueprint.ts:163）。同样**绝不抛**——缺组件回退开局态
  //（「世界还没装好时 HUD 也得画得出来」是点击门的判据之一：零 console error）。
  const flow = ((): string => {
    for (const [eid] of world.query('GameFlow')) {
      const f = world.getComponent<GameFlow>(eid, 'GameFlow');
      if (f && typeof f.current === 'string') return f.current;
    }
    return FLOW.PLAYING;
  })();
  return {
    energy: energy?.current ?? BALANCE.energyStart,
    energyMax: energy?.max ?? BALANCE.energyMax,
    gold: res(RES.gold)?.current ?? 0,
    goldTarget: BALANCE.goldTarget,
    day: res(RES.day)?.current ?? BALANCE.dayStart,
    tool,
    toolName: TOOLS[tool]?.name ?? TOOLS[0].name,
    // 背包：三种作物各自那条全局单例资源（`CropDef.invRes`）——**与卖货/收获读的是同一批 id**，
    // 故 HUD 上看到的数就是账上的数（不另存一份计数，杜绝两本账对不上）。
    bag: CROPS.map((c) => res(c.invRes)?.current ?? 0),
    flow,
  };
}

/**
 * 皮肤解析结果（skinKey → **已解析图 URL**）。**宿主**在 `art/index.json` 到手后用 `filledSrc`
 * 逐条解析好再交树（hud.ts 不做 IO、不认 key 之外的任何东西）。
 *
 * 缺 key / 值 `undefined` = 该槽无图（没生成、图挂了、index 还没到）⇒ 交树时落素坯回退。
 * 默认空表：`buildHud(view)` 在单测里就是这个形态（树结构与有图时**完全一致**，只是不吃皮）。
 */
export type HudArt = Readonly<Record<string, string | undefined>>;

/** 0xRRGGBB → `#rrggbb`（素坯底色回退用·`data.ts` 的 tint 是数字）。 */
const hexColor = (tint: number): string => `#${tint.toString(16).padStart(6, '0')}`;

/**
 * 动作按钮（工具 4 枚 + 睡觉/卖货）——`action` = 信号名，等 keybind/clickable 消费。
 *
 * ── 悬停流光（S5 观感精修·落 `capability-plan.md §4.6`「主 CTA → `sheen-hover`」）────────
 * `layout.fx:[{ kind:'sheen-hover' }]` = 悬停扫一道光的**质感叠层**（`server.ts:223-225` 注入
 * `[data-fx~="sheen-hover"]::after` + `:hover` 关键帧；**非常驻**，移开再移入才重扫 = 天然冷却）。
 *
 * **几何零变**（这是它能落在 S5 的前提）：实测 `layoutStyle`（render.ts:132-134）**只对显式给出**的键
 * 发 CSS（每键一个 `!== undefined` 卫）；`{ fx:[…] }` 里一个几何键都没有 ⇒ 只多出 `data-fx` 属性
 * 与 `[data-fx~="sheen-hover"]{position:relative}`（`relative` 不带偏移 = 不参与布局）。
 * `fx` 本身走 `fxToCss` 那条独立通路（render.ts:1271-1282），不经 `ls`。
 *
 * **为什么 6 枚都给**（§4.6 的字面是「主 CTA（开始/睡觉/卖货）」）：本作 HUD 上这 6 枚**全是主交互**
 * （没有次级入口、没有导航），只给其中 2 枚会让**悬停语汇不一致**——同一排里两枚亮、四枚不亮，
 * 玩家会读成「这两枚更特殊」，而它们并不更特殊。故按「这一排全是主交互」统一给。
 * 这属**观感取值**（reviewer 若判该按字面只给 2 枚：把 `layout` 挪到 `...ACTIONS.map` 那两枚单独给即可）。
 *
 * ✅ §4.6 同条并列的 `Panel.skin` **S7 ②b 做了**（记的那条债「无图可挂」已消）：S5 时正处 `§4.5` 的
 *   **程序化回退**期，皮肤槽齐、图未就绪 ⇒ 无 URL 可挂；S6 出图（台账 15 行 owner 已 approved）之后，
 *   `109/tool/*` 与 `109/hud/*` 这 6 条槽有了**已解析 URL**，宿主用解析好的值喂 `props.skin` 即成
 *   「art 即框」的复合按钮。`Button` 换成 `Panel` 的**唯一**理由见文件头 ②（Button 的文字恒居中）。
 */
function actionButton(
  id: string,
  name: string,
  signal: string,
  selected: boolean,
  skinKey: string,
  fallbackTint: number,
  art: HudArt,
): LayoutNode {
  return {
    type: 'Panel',
    id: HUD_ID.btn(id),
    props: {
      // `PanelProps.action`（types.ts:280「REQ-UI-容器可点」）：渲 `data-action` + cursor:pointer，
      // 点击经 mountUI 委托**同 Button** 那条路（`enqueueAction` → keybind → Effect）——写路径没变。
      action: signal,
      // 贴图皮（已解析 URL）。`undefined` = 这槽没图/图挂了 ⇒ 不吃皮，落回下面的 `bg`（素坯底色）。
      //  皮在场时它**压过 bg 与边框**（render.ts:455 的 chrome 分支）⇒ 两个都给是对的：
      //  有图看图、无图看色，且**几何与节点结构一模一样**（美术是增量非依赖·形态声明 #2）。
      skin: art[skinKey],
      bg: { custom: hexColor(fallbackTint) },
    },
    layout: {
      direction: 'column', align: 'center', justify: 'end',
      // 与撒掉的那 6 枚世界按钮**同尺寸同间距**（theme.ts 的 BTN_* 已退役，DOM 侧直接读 FARM 定尺）。
      width: FARM.btnW, height: FARM.btnH,
      padding: 6, // 名字离板下沿 6px（板底那圈阴影里，浮空感不被压掉）
      radius: 14, // 与板的 rx=14 对齐（不改形，只免得方角把板的圆角切掉）
      fx: selected
        ? [{ kind: 'sheen-hover' }, { kind: 'glow', color: 'gold' }]
        : [{ kind: 'sheen-hover' }],
    },
    children: [
      {
        type: 'Label', id: HUD_ID.btnLabel(id),
        // 白字 + 描边：板底是暖褐/冷蓝两条实心板（`BTN_TINT` 同色系），白字在两者上都够亮
        //（实测见 S7-hud-design.md §二-①）；描边（`LabelProps.stroke`·comic outline）是板面
        // 有渐变与字形时的兜底，免得名字压在字形边缘上糊成一团。
        props: { text: (selected ? '▶ ' : '') + name, size: 'sm', bold: selected, color: { custom: '#fff' }, stroke: true },
      },
    ],
  };
}

/**
 * 结算面板（通关屏·brief.md:46）。**纯 LayoutNode**：无 DOM API、无 CSS。
 *
 * 三件必写：**「通关」+ 用时天数 + 最终金币**（后者带上目标值，玩家一眼看出「到线了」）。
 * 唯一的出口是「重开」键——`data-action` = `HUD_ACTION.restart`，由**宿主**消费（见 game109.ts）；
 * 对局键整条收起（game108 终局屏先例：此屏无死路操作，全屏只有这一个出口 = 最高优先级被测对象）。
 */
function resultPanel(v: HudView): LayoutNode {
  return {
    type: 'Panel',
    id: HUD_ID.result,
    props: { bg: 'raised', accent: true },
    layout: { direction: 'row', gap: 20, align: 'center', justify: 'between', padding: 12, flex: 1, anim: 'pop', animMs: 400 },
    children: [
      // 艺术字（S5 观感精修·`docs/playbooks/ui.md:21` 分关律把**艺术字**点名划给 S5）：
      // `font:'cnround'` = 站酷快乐体·中文卡通粗圆黑，与 `apolloToon` 的温暖卡通同调（§4.6 的题材同调要求）。
      // 为什么它不会静默回落：`@font-face` 由 `mountUI` **无条件**注入（`server.ts:303`
      // `st.textContent = ART_FONT_CSS + ART_FONT_CJK_CSS`，不经 `theme.webfonts` 开关），
      // 且字体文件在仓内 —— `public/ui-fonts/cjk/cnround.woff2`（325KB，2026-09-04）。
      // **几何**：这是**终局屏**（`flex:1` + `justify:'between'` 的整宽面板，三个孩子），
      // 字体只改字形宽度、不改节点树与排版取值 ⇒ 在 S5 形态声明 #3「只许改观感取值」内。
      // 顺带交代对比度：`xl`(22px) + `bold` ⇒ 属 WCAG **大字**（≥18.66px 粗体），门槛 3.0；
      // apolloToon 的 `gold` 在 `raised`(bg2 `#F8F2E4`) 上 = 3.87 ≥ 3.0 ✓（同令牌在 13px 读数上不够
      // 4.5 的事见 requests.md D-17——那是令牌自身的属性，与本行无关）。
      { type: 'Label', id: HUD_ID.resultTitle, props: { text: '通关！', size: 'xl', bold: true, color: 'gold', font: 'cnround' } },
      {
        type: 'Label', id: HUD_ID.resultStats,
        props: { text: `用时 ${v.day} 天 · 最终金币 ${v.gold} / ${v.goldTarget}`, size: 'md', color: 'jade' },
      },
      { type: 'Button', id: HUD_ID.restart, props: { label: '重开', action: HUD_ACTION.restart, kind: 'primary' } },
    ],
  };
}

/**
 * 交树：读数行（体力/金币/日期/当前工具）+ 背包行 + 动作条（4 工具带选中标记 + 睡觉 + 卖货）。
 * 纯函数（同一个 view + 同一份 art 进 → 同一棵树出），可在单测里直接断言。
 *
 * `art` = 皮肤解析结果（`HudArt`·宿主用 `filledSrc` 解析 index.json 得来）。**可选**：
 *   · 不传（单测、无美术环境）= 每枚按钮落素坯底色（`BTN_TINT`）——**节点树与传了的时候一模一样**，
 *     变的只是 `props.skin` 有没有值（美术是增量非依赖）。
 *   · 传了 = 按钮吃那 6 条槽的贴图皮（`109/tool/*` · `109/hud/*`）。
 *
 * `flow === 'won'` ⇒ **换屏**：结算面板 + 庆祝粒子顶掉读数与动作条（见文件头「结算面板」）。换屏不改根 id，
 * 故 `ui.update` 走按 id 键控的子节点增删（`server.ts` 的 reconcile），不是整根重挂。
 */
export function buildHud(v: HudView, art: HudArt = {}): LayoutNode {
  return {
    type: 'Panel',
    id: HUD_ID.root,
    // ⚠ **这里不是 `bare`**（曾如此·S5 条件②a 换皮时改）——四关机械门禁实测抓到的：
    //   `apolloToon` 是**浅色纸纹主题**（bg0–bg3 全羊皮纸浅底；text/sub/dim/jade/gold 全是深墨/深青/深琥珀），
    //   深色字**必须有纸底才读得出**。而 `bare: true` 是「连底都不画」（render.ts:438 「非 bare 才画底/边框/圆角」）
    //   ⇒ 四条读数直接压在宿主 wrapper 的近黑底（theme.ts `WRAPPER_BG` = `#161d14`；mount-host.ts:118 的
    //   bottomHost 不设背景，所以 wrapper 就是真底）上。实测对比度：
    //     体力 1.45 · 第 N 天 2.65 · 背包 2.77 · 当前工具 2.77（四关硬地板 = 3.0，低于即阻断）。
    //   **对照臂已排除「这屏本来就红」**：同一份 view 换回旧主题 `SHELL` 跑，全绿 0 条硬失败
    //   （public/games/game109/self-check/audit-hud-shell.audit.ts）⇒ 红是这次换皮带进来的。
    //   补上主题自己的面：`'panel'` → 该主题的 `bg1`（apolloToon 下 = `#F1E9D7` 纸底），
    //   非 bare 还自动吃主题的 `panelTexture` 纸纹（换皮自适应，不写死任何颜色）。深墨字于是回到
    //   它被设计时假设的那个底上。
    //   层级：条 = `panel`(bg1)、其上的结算卡 = `raised`(bg2，见 resultPanel) ⇒ 抬升关系天然成立。
    props: { bg: 'panel' },
    layout: {
      direction: 'column', gap: 12, align: 'center', justify: 'center', padding: 10,
      // ── `height: HUD_H`（S7 ②b 新增）──────────────────────────────────────────────────
      // 底栏 host（mount-host.ts:118）是 `position:absolute;bottom:0;height:196px` 的**空盒子**，
      // 本面板是它唯一的子节点——不显式给高，面板就只有内容高（实测 106px）⇒ 条的下沿会**漏出画布**
      // （量到 90px 的缝·旧版 HUD_H=84 时同病，只是缝更窄）。给满 196 才是「DOM 条盖住旧按钮带」
      // 这句话的字面成立条件。`box-sizing` 实测是 `border-box` ⇒ 196 含 padding 10 ✓ 不会溢出。
      height: HUD_H,
    },
    // 通关屏多挂一层粒子（纯表现·绝对定位不占流）；对局屏三行（见 playHud 的注）。
    children: v.flow === FLOW.WON ? [resultFx(), resultPanel(v)] : playHud(v, art),
  };
}

/**
 * 通关庆祝粒子（D-14 第 4 项「结算屏接成熟件」）。**照 `buildStarterResult` 的原型接**
 * （`src/ui/starters/starter-kit.ts:91`：`Particles{kind:'confetti', count:34, loop:false}` 挂在
 *  结算容器的孩子里）——本作只是多给了一步定位，因为这里的容器是**条**而不是整屏。
 *
 * ⚠ 必须给 `width/height`：粒子层自己是 `position:relative;overflow:hidden`（render.ts:1142），
 *   不给尺寸就是 0×0（碎片全是 `left:%/top:%` 的绝对定位子元素 ⇒ 百分比全落回 0）。
 *   这里铺满整条（`x/y:0` 同时让它绝对定位·`layoutStyle:135`）⇒ 纸屑从条顶落到底。
 * `allowOverlap`：它是**意图叠层**（压在结算卡之上/之下都可），显式登记免得撞重叠审计（同 `buildItemSlot`
 *   的冷却遮罩先例·`tiles.ts:41`）。
 */
function resultFx(): LayoutNode {
  return {
    type: 'Particles',
    id: HUD_ID.fx,
    props: { kind: 'confetti', count: 34, loop: false },
    layout: { x: 0, y: 0, width: FIELD_W, height: HUD_H, allowOverlap: true },
  };
}

/**
 * 背包一格（**D-14 第 3 项**：别再手搓等宽排布，一格格交给网格容器）。
 *
 * 三件：作物标识色小方块（`CropDef.tint`·数据表本来就有的那个色）+ 名字 + `×N`。
 * **不放作物的图**：`CropDef.skin` 是**横排 sheet**（一条 sheet 里 3~5 帧），当 64px 图标用会被压扁成
 * 一条 —— 与其拿错的图冒充图标，不如用色块 + 名字 + 数（诚实，且色块是表里现成的标识色）。
 *
 * 顺序恒等于 `CROPS` 的顺序（数据表改序 = 读数改序，一处在管）。
 */
function bagTile(c: CropDef, n: number): LayoutNode {
  return {
    type: 'Panel',
    id: HUD_ID.bagTile(c.id),
    props: { bare: true },
    layout: { direction: 'row', gap: 6, align: 'center' },
    children: [
      // 色块：非 bare（bare 不吃 bg·render.ts:457）⇒ 拿到 bg + 细边，成为一块可认的标识色。
      { type: 'Panel', id: HUD_ID.bagTileSwatch(c.id), props: { bg: { custom: hexColor(c.tint) } }, layout: { width: 12, height: 12, radius: 3 } },
      { type: 'Label', id: HUD_ID.bagTileLabel(c.id), props: { text: `${c.name} ×${n}`, size: 'sm', color: 'sub' } },
    ],
  };
}

/**
 * 背包一行（R-14）。为什么不写成「共 N 件」：玩家下一步要决定「卖不卖得动」——卖价按作物分档
 * （12/30/75），只看总数看不出这一趟能换多少钱。
 *
 * 结构：`#g109-hud-bag`（行·带「背包」二字）+ 里面的 `#g109-hud-bag-grid`（网格·D-14 第 3 项）。
 * 外层留 id 是因为 S3 起 `HUD_ID.bag` 就在册（读数 id 是给测试与 S4 对齐单看的），
 * 而「背包」二字不进网格（它是这一行的标题、不是一个格子）。
 */
function bagRow(bag: readonly number[]): LayoutNode {
  return {
    type: 'Panel',
    id: HUD_ID.bag,
    props: { bare: true },
    layout: { direction: 'row', gap: 12, align: 'center' },
    children: [
      { type: 'Label', id: HUD_ID.bagCap, props: { text: '背包', size: 'sm', color: 'sub' } },
      {
        type: 'Panel',
        id: HUD_ID.bagGrid,
        props: { bare: true },
        // 网格容器（既有能力·types.ts:30-33）。**必须给固定列数 `cols`，不能用 `minCol` 自适应**：
        // `minCol` 渲成 `repeat(auto-fill,minmax(Npx,1fr))`（render.ts:434），而 auto-fill 的重复次数
        // 取决于**可用宽度**——本行是「shrink-to-fit 的 flex 子项」，宽度不定 ⇒ 按规范塌成 **1 列**：
        // 实测三格**竖排成三行**（行高 122 逻辑px），整条内容变成 276 > 196 ⇒ 列方向 `justify:'center'`
        // 让溢出的两端同时被裁（读数行被推出条顶、六枚按钮只剩上半截·`shots/S7/after-hud-bar.png` 目击）。
        // 固定列数 = 格子数（`CROPS.length`）既确定性又随数据表走（加作物自动加列）。
        layout: { direction: 'grid', cols: CROPS.length, gap: 10, align: 'center' },
        children: CROPS.map((c, i) => bagTile(c, bag[i] ?? 0)),
      },
    ],
  };
}

/**
 * 对局中的交树：**三行**（读数行 / 背包行 / 动作条）——读数管「我现在怎样」、动作条管「我能干嘛」。
 *
 * ── 为什么是**三行**而不是原来的一行（D-9 的病根）────────────────────────────────────────
 * S3 那版把「读数 5 条 + 按钮 6 枚」塞进**同一行**（`justify:'between'`）。6 枚按钮先吃掉约 450px，
 * 读数组只剩 ~250px ⇒ 逐字换行（实测：「第 1 天」「当前工具：锄地」各折成 **3 行**、金币/背包各 2 行，
 * 见 `self-check/shots/S7/before-hud-bar.png`）。**根因是行结构不是字号**：读数不该与按钮抢同一条轴。
 * 拆成三行之后每行只装一类东西，各自都有整幅宽（720−20）可用，换行自然消失。
 * ⚠ 读数行用 `justify:'start'`（缺省）+ 固定 `gap`，**不用 `between`**——`between` 在行变宽时会把
 *   读数拉开到彼此不相干的位置，读数是一组、该连在一起读。
 *
 * ⚠ **不能给读数上 `Label.format`**（D-14 第 2 项的边界）：S4 走查按**正则**读这四串
 *   （`体力 (\d+)/(\d+)` · `金币 (\d+) / (\d+)` · `第 (\d+) 天` · `当前工具：(.+)$`），
 *   格式一变走查当场红。`format` 只用在本关**新增**的读数上（本屏暂时没有这样的读数）。
 */
function playHud(v: HudView, art: HudArt): LayoutNode[] {
  return [
    {
      type: 'Panel',
      id: HUD_ID.readouts,
      props: { bare: true },
      layout: { direction: 'row', gap: 16, align: 'center' },
      children: [
        {
          type: 'Label', id: HUD_ID.energy,
          // 体力见底变红：素坯期唯一的「状态色」用法（S4/S5 可换成进度条）。
          props: { text: `体力 ${v.energy}/${v.energyMax}`, size: 'md', bold: true, color: v.energy > 0 ? 'text' : 'danger' },
        },
        { type: 'Label', id: HUD_ID.gold, props: { text: `金币 ${v.gold} / ${v.goldTarget}`, size: 'md', bold: true, color: 'gold' } },
        { type: 'Label', id: HUD_ID.day, props: { text: `第 ${v.day} 天`, size: 'md', color: 'jade' } },
        // 当前工具：与画布那 6 枚按钮的选中态是**同一条事实**的两种表达（文字读数 + 键上 `▶ `）。
        { type: 'Label', id: HUD_ID.tool, props: { text: `当前工具：${v.toolName}`, size: 'sm', color: 'sub' } },
      ],
    },
    // 背包换到自己的行（原来它是读数行里的第 4 条 Label，改格子后一行放不下也不该放）。
    bagRow(v.bag),
    {
      type: 'Panel',
      id: HUD_ID.actions,
      props: { bare: true },
      // `gap: FARM.btnGap` = 与撤掉的那排**同间距**（theme.ts 的 `BTN_DX = btnW + btnGap` 就是这么推的）。
      // 6×96 + 5×16 = 656 ≤ 720−20 ⇒ 整排放得下，**不换行**（这也是它敢用 `justify:'center'` 的前提）。
      layout: { direction: 'row', gap: FARM.btnGap, align: 'center', justify: 'center' },
      children: [
        ...TOOLS.map((t) => actionButton(t.id, t.name, t.pickSignal, v.tool === t.index, t.skin, BTN_TINT.tool, art)),
        ...ACTIONS.map((a) => actionButton(a.id, a.name, a.signal, false, a.skin, BTN_TINT.action, art)),
      ],
    },
  ];
}
