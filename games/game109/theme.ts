// ═══════════════════════════════════════════════════════════════════════════
//  game109 · 种田（暂名）—— 主题常量：Tag 位 / 定尺几何 / 颜色 / 皮肤槽（纯数据）
//
//  几何口径：定尺场景（mountHost 等比信箱缩放到设备），单位 = 逻辑像素。
//  皮肤口径（art-pipeline.md「编译期游戏线」）：theme 定 skin key → 蓝图视觉实体带
//  `Sprite:{textureKey,anchorX:0.5,anchorY:0.5,zOrder}`（**必与 Shape 并存**，未就绪回退 Shape=观感零变）。
//  本作皮肤槽清单 = 36 格地块（按各自作物一条 sheet）+ 4 工具 + 2 动作按钮 + 场景底（plan §54）。
//
//  ⚠ S7 ②b「合一套」起，动作条那 6 条槽（4 工具 + 2 动作）**换了消费者**：不再经蓝图世界实体，
//    改由 HUD 的 DOM 按钮吃（`Panel.skin`·hud.ts）——与 S6 把 `CropDef.skin` 从地块挪到作物子实体
//    是同一种改动（**同一批 key、换个消费者**，`ALL_SKIN_KEYS` 一行不改 ⇒ 不造孤儿行）。
//    两条通路吃的是**同一份** `art/index.json`（宿主用 `filledSrc` 解析同一个 key），故槽位口径不分叉。
// ═══════════════════════════════════════════════════════════════════════════

import { ACTIONS, CROPS, FARM, TOOLS } from './data.js';

// ── Tag 位（bit 0 是引擎 trigger-zone 的 ZONE_FLAG 保留位，本作不用但**必须让开**）──
//  ⚠ S7 ②b 之前这里还有一枚 `BUTTON_BIT`（1<<2）：动作条那 6 枚**世界实体**按钮需要一个非地块身份位，
//    免得 `tagMask=TILE_BIT` 的批量效果误伤它们。那 6 枚实体已随 ②b「合一套」下线（控件只剩 DOM 那套，
//    DOM 节点没有 Tag）⇒ 该位再无消费者，连同它的**唯一**消费场景一并退役（不留孤儿常量）。
//    这也是本条现在能这么短的原因：地块成了场里**唯一**带 Tag 的东西。
export const TILE_BIT = 1 << 1; // 地块（睡觉结算的 set-flag-tagged 按它批量清浇水标记）

// ── 定尺几何（由 FARM 推得·改布局只动 data.ts）────────────────────────────────
export const FIELD_W = FARM.pad * 2 + FARM.cols * FARM.cell; // 720
export const BAR_H = FARM.btnH;
/**
 * 场地下沿之下的**净预留**（供给侧口径·S7 起不再等于 HUD 条高）。
 *
 * 它进 `FIELD_H` 的唯一目的：让画布底部**留一条不与地块重叠的空带**，玩家看不见 DOM 条压在地块上。
 * ⚠ 别把它与 `HUD_H` 混为一谈（S7 之前两者是同一个数·84，正是那个耦合让「HUD 想变高」等于「画布得变矮」）：
 *   · `HUD_RESERVE` = **画布要留多少空** ⇒ 进 `FIELD_H`，改它 = 改画布定尺（撞 S4 走查的 720×910 锚点）。
 *   · `HUD_H`       = **DOM 条画多高**   ⇒ 只喂 `mountHost` 的 `bottomBarH`（overlay），与画布尺寸无关。
 */
export const HUD_RESERVE = 84;
/**
 * 底部 DOM HUD 条高（点击门的活体控件都住这里·S7 ②b 起是 **196**）。
 *
 * 为什么它不是「画在 canvas 上的东西」：点击门的判据查的是**活体 DOM**（`[data-action]` + 点后 DOM 变化），
 * canvas 里画得多好看都不算数（owner 2026-08-07 立的门：S3 问「信号打得穿吗」）。
 * 排布上把它**接在场地下沿之下**（mountHost 的 bottomHost·`bottomBarH: HUD_H`）。
 *
 * ── S7 ②b「合一套」：为什么是 196 = `BAR_H + pad + HUD_RESERVE` ────────────────────────
 * 那 6 枚世界实体按钮下线后，原按钮带（世界坐标 y 714..802）就空出来了；DOM 条**盖上去**接管这块地方
 * （控件的消费者从世界实体换成 DOM 节点，键位/观感/尺寸都在原地）——①不留白 ②不压地块 ③控件位置不动。
 * 要「正好盖住」就得让条顶缘落在**按钮带顶缘**上，故：
 *   `HUD_H = FIELD_H − (pad + rows·cell + barGap) = 910 − 714 = 196 = 88 + 24 + 84`（带高 + 底边距 + 净预留）。
 * 少一个像素就会在条顶露出一条 6px 的旧按钮带残影（按钮顶缘正落在 714）。
 *
 * ⚠ **这不改画布尺寸**：`mountHost`（mount-host.ts:110-119）的场景盒是 `fieldW×fieldH` 硬值，
 *   `bottomBarH` 只作 overlay 的 `height` 且**挂在场景盒内部**（`position:absolute;bottom:0`）⇒
 *   条高变化只让 overlay 向上长，画布仍 **720×910**、地块坐标一格不动（S4 走查那条硬编码几何锚点不破）。
 */
export const HUD_H = BAR_H + FARM.pad + HUD_RESERVE; // 196
export const FIELD_H = FARM.pad * 2 + FARM.rows * FARM.cell + FARM.barGap + BAR_H + HUD_RESERVE; // 910 = 826 场地 + 84 净预留
//  ⚠ 动作条那 6 枚的排布常量（`BTN_N` / `BTN_X0` / `BTN_DX` / `BTN_Y`）**已随 ②b 退役**：它们算的是
//    canvas 世界坐标（按钮实体的 Transform），而控件现在住在 DOM 条里，由 HUD 自己的 row/gap 排
//    （hud.ts 的 `HUD_BTN`）。DOM 侧**不复用**这些数：一套坐标只该有一个出处，留着会诱使下一个人
//    「按老坐标对齐 DOM」——两套坐标系的暗礁正是本关要拆的东西。

/** 地块中心（col/row 从 0 起）。 */
export const tileX = (col: number): number => FARM.pad + col * FARM.cell + FARM.cell / 2;
export const tileY = (row: number): number => FARM.pad + row * FARM.cell + FARM.cell / 2;

// ── 渲染层级（数值大的盖在上面）──────────────────────────────────────────────
//  crop=1：作物子实体（S6 新增）夹在土壤（地块本体·0）与生长条（2）之间 —— 苗从土里长出来、
//  条压在苗下沿之上，读起来才是「土 → 苗 → 条」三层。
export const Z = { tile: 0, crop: 1, plant: 2, button: 10 } as const;

// ── 生长条（owner 2026-09-19 裁「撤 Gauge·条走纯帧」）──────────────────────────────
//  每格一个**子实体**：`Frame` + `SpriteBinding{frames}` ⇒ 长势只由**帧**表达（4 档 = 0/33/66/100%
//  的填充比例画在帧里）。
//  为什么生长轴不挤进地块的 tint：tint 已被「生命周期×浇水」6 档占满，再乘生长阶就是 12~24 色，
//  人眼分不开。分成两个通道后各自可读：**地色说土壤、帧档说长势**。
//  定位：`Hierarchy{parentId: 地块}` ⇒ hierarchy-resolve 每拍把子实体世界位解成「父位 + 本地偏移」。
//  ⚠ 本槽**曾经**是 gauge 的宽度条（`Shape.width = 比例 × w`）。S6 上图后暴露：gauge 的
//    `localX = leftX + Shape.width/2` 让**原点随比例移动**（素坯期宽 0 故位移不可见），96 宽的贴图
//    按 `anchorX:0.5` 居中画在那个移动的原点上 ⇒ 整条左偏半宽、并随生长阶右移最多半宽。
//    撤 Gauge 后原点恒定格心 ⇒ 贴图恒定居中（owner 2026-09-19 实测报的「黑条比方块靠左」即此）。
//    代价经 owner 裁决：**素坯期不再有生长条**；土壤六档色与一切玩法不变。
export const PLANT = {
  /** 贴图帧宽（sheet 每格宽 96 = `FARM.cell - 16`）。**游戏层已无消费者**（撤 Gauge 后条宽不再
   *  由代码算）：留在 theme 是因为它是这条美术槽的**宽度契约单一出处**（art-gen 的 `BAR_W` 与台账
   *  spec 都按 96），而那个常量在 `scripts/**`（本关边界外·改不了）。 */
  w: FARM.cell - 16,
  h: 10,
  /** 相对地块中心的纵向偏移（贴在地块下半部）。 */
  dy: 38,
  /** 生长条自己的皮肤槽（**无图时这条槽什么都不画**·撤 Gauge 后没有回退条）。 */
  skin: '109/plant/bar',
} as const;

// ── 土壤皮肤槽（S6·**行序与 LIFE_TINTS 逐行对齐**·owner 2026-09-19 裁 C）────────────
//  上图通路 = 地块实体既有的 `SpriteBinding.skins`：**同一份下标**（行 = 状态 × 2 + 今日已浇）
//  既取 tints（素坯地色）又取 skins（真图）。有图时贴图盖过色块、无图/加载失败时自动回退
//  LIFE_TINTS ⇒ **美术是增量非依赖**（形态声明 #2），S4/S5 的观感与行为在无图时一个字节不变。
//  ⚠ 行 1（荒·湿）与行 3（翻·湿）**不可达**（浇水的前置是已播种）⇒ 与各自「干」档**共用同一张图**：
//     既不留空洞（读表不必记特例——同 LIFE_TINTS 的进制规则），也不造两张永远看不到的美术。
export const SOIL_SKINS: readonly string[] = [
  '109/soil/wild', // 行 0 荒·干
  '109/soil/wild', // 行 1 荒·湿〔不可达·共图〕
  '109/soil/tilled', // 行 2 翻·干
  '109/soil/tilled', // 行 3 翻·湿〔不可达·共图〕
  '109/soil/sown', // 行 4 播·干
  '109/soil/sown-wet', // 行 5 播·湿 ← 今晚会长的那格
];

/**
 * 生长条的四档帧映射（owner 2026-09-19 裁 **B「上图走帧·四档」**）。
 * 把 0..days 阶**均匀**映到 0..3 号帧，且**末位恒 = 3**（成熟必是满格，各作物一致）：
 * carrot(days=1)→[0,3]·wheat(2)→[0,2,3]·pumpkin(3)→[0,1,2,3]。
 * ⚠ 为什么四档而不是 days+1 档：一条条只有 4 种长相可读（0/33/66/100%），
 *   把 2~4 阶压到 4 帧上比「每阶一个只差 6px 的宽度」在人眼上分得开。
 */
export const barFrames = (days: number): number[] =>
  Array.from({ length: days + 1 }, (_, k) => Math.round((k * 3) / days));

// ── 颜色（素坯期：CanvasRenderer 无贴图时画 Shape+Color；贴图就绪自动盖过）──────
export const SCENE_BG = 'radial-gradient(120% 95% at 50% 28%, #6f8f4a 0%, #3c5a2c 58%, #22371f 100%)';
export const WRAPPER_BG = '#161d14';
/**
 * 动作条按钮底色（4 工具一色系、睡觉/卖货另一色系，便于素坯期辨认）。
 *
 * ⚠ S7 ②b 起消费者从「画布按钮实体的 `Shape.tint`」换成「**DOM 按钮的 `Panel.bg`**」——
 *   只在**无图回退**时露出来（有图时 `Panel.skin` 压过 bg·render.ts:455 的 chrome 分支）。
 *   这两个值不是随手挑的：`tool`/`action` 与两张按钮板**同一个色**（`tool-plow.svg` 的
 *   `fill="#8a6a45"`、`hud-coins.svg` 的 `#4a6b8a`——art-gen 的色板注释就写着「与 BTN_TINT 同族」）
 *   ⇒ 素坯期观感与撤掉的那 6 枚世界按钮**一模一样**，「控件搬家」在无图时也读得出来。
 * `toolActive`：画布那 6 枚当年的「选中变金」底色。DOM 侧**不用它**——DOM 按钮的选中态走
 *   `fx:[{kind:'glow',color:'gold'}]` + `▶ ` 文字前缀（`▶ ` 那半是 S4 走查判选中的**契约**：见 hud.ts），
 *   换底色在贴图皮上会被皮压掉（皮即整面），glow 才长得出来。留在表里是因为它是**这条槽的颜色口径**
 *   的单一出处（art-gen 的色板注释按它对齐）。
 */
export const BTN_TINT = { tool: 0x8a6a45, toolActive: 0xf2c21e, action: 0x4a6b8a } as const;
/** 数值读数色（canvas 侧读数用·S3 的数值读数住在 DOM HUD 里，走 Label 的闭集色令牌）。 */
export const READOUT_TINT = { energy: 0xf2c21e, gold: 0xf7c948, day: 0xbfe3ff } as const;

// ── 皮肤槽 ─────────────────────────────────────────────────────────────────
/** 场景底皮肤槽（mountHost 的 sceneBgSkin：有生成图叠图、无图纯回退程序化底=兜底永不丢）。 */
export const SCENE_SKIN = '109/scene/farm';

/**
 * 全皮肤槽清单（S6 台账登记 + 孤儿审计的目标名单·**S6 定稿形态**）。
 * 形状=「主体视觉实体各自一条槽」，与蓝图里被消费的 skinKey 一一对应（**去重后 15 条**）：
 *  · 土壤 = SOIL_SKINS（6 行 / **4 张图**·地块实体的 SpriteBinding.skins）
 *  · 作物 = 该作物一条横排 sheet（帧 = 生长阶 + 末位空帧·作物子实体的 Sprite + Frame）
 *  · 生长条 = PLANT.skin（4 帧 sheet·SPRITE 常量 + SpriteBinding.frames）
 *  · 工具 / 动作按钮 = 各自的图标（6 枚·S7 ②b 起消费者 = HUD 的 DOM 按钮 `Panel.skin`）
 *  · 场景底 = SCENE_SKIN（mountHost 背景皮肤槽）
 *
 *  ⚠ S6 两处**撤槽**（原样保留在 S3/S4 的记载里·此处是定稿口径）：
 *   ① `CropDef.skin` 从「地块的作物 sheet」改为「**作物子实体的 sheet**」——同一批 key、换了个消费者
 *      （地块改挂土壤），故 3 条槽仍在册、只是归属变了。
 *   ② `CropDef.stageSkins`（9 条「逐阶独立文件」）**整批退役**：逐阶换图改走**一条 sheet 的帧**
 *      （与生长条同一条通路·owner 2026-09-19 裁 B 的同一取向）。theme 旧注「两者择一」即此——
 *      选了 sheet 一侧，另一侧不再列进台账（**不留孤儿行**·art-pipeline.md:49）。
 *  ⚠ S7 ②b 一处**换消费者**（同样**不是**撤槽·故本表一行未动）：
 *   ③ 6 条动作条槽（`TOOLS[].skin` + `ACTIONS[].skin`）的消费者从「画布按钮世界实体的 SpriteBinding」
 *      换成「HUD DOM 按钮的 `Panel.skin`」。**能这么换的前提是消费者同时在场**：DOM 那 6 枚按钮
 *      S3 就在了（点击门要求的活体控件），②b 只是把那 6 条槽从世界实体转给它们——
 *      若两套消费者一起下线，这 6 条就成了孤儿行（撞 art-pipeline.md:49 的集合相等断言：台账 ≡ 本表）。
 *  ⚠ 推导脚本 `scripts/game109-art-requirements.mjs` 有一条**集合相等**断言：台账 skinKey 集合 ≡ 本表
 *    （少一条=漏登记·多一条=孤儿），故这张表是**机读真相**，改它必须同步重跑推导脚本。
 */
export const ALL_SKIN_KEYS: readonly string[] = [
  SCENE_SKIN,
  ...new Set(SOIL_SKINS),
  PLANT.skin,
  ...CROPS.map((c) => c.skin),
  ...TOOLS.map((t) => t.skin),
  ...ACTIONS.map((a) => a.skin),
];
