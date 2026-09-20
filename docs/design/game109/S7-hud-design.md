# S7 品质关 · ②b「真 HUD」设计稿

> **依据**：S7 领工声明 [`requests.md`](requests.md) §(n) 的形态声明 #1（②b 是本关正题）/#2（改版先出设计稿 + 目击）/#3（玩法数值一字节不改）；
> 债表 **D-13 / D-9 / D-14**；S3 复查建议①（走私守卫盲区）；**R-17 / D-19**（被拒零反馈）。
> **先看后设计**：改前目击 = `self-check/shots/S7/before-{whole,canvas,canvas-bar,hud-bar}.png`
> （2026-09-20 实拍·真开发服 `:5173`·Chromium·1100×1000 视口·console 仅既有 `[topological-sort]` 告警、零 error）。
> **本稿只描述已读码/已目击的事实**，未跑到的读数一律标注来源。

---

## 一、改前实况（从图上读出来的四件事）

### 1. 重复的控制面 —— 但债文那句已经过期

| | 位置 | 长相 | 消费者 |
|---|---|---|---|
| 甲 | canvas 内（世界实体 `btn-*`） | 棕/蓝方钮·**已有 S6 真图标**（锄/种/壶/镰/月/币） | 指针路径（`Clickable`）＋ S2 探针 |
| 乙 | DOM HUD（`g109-hud-btn-*`） | 绿糖果皮·**纯文字**（`hasIcon:false`） | 点击门（owner 2026-08-07 立的**活体 DOM** 判据） |

⚠ **D-13 债文里「画布那 6 枚无字色块与地块近同色」这句已不成立**：S6 之后它们有图了（`109/tool/*` · `109/hud/*` 六条槽已就位）。
债的**实质**是「两批控件并存、同一批动作两个入口」——这条仍然成立，且从图上一眼可见（上下两排说的是一件事）。

### 2. D-9 折行实测（`before-hud-bar.png`）

| 读数 | 实测折行 |
|---|---|
| `第 1 天` | **3 行**（第／1／天 竖排） |
| `当前工具：锄地` | **3 行** |
| `金币 0 / 1000` · `背包 胡萝卜 0 · 小麦 0 · 南瓜 0` | 各 **2 行** |

**根因是行结构，不是字号**：HUD 根是**一行**（读数组 + 动作条组同排，`justify:'between'`），
6 枚按钮吃掉约 450px 后，读数组被压到 ~250px，逐字换行（`hud.ts:216`）。

### 3. 几何账（读码所得）

```
场景 720×910  =  地块区 720  +  动作条带 106（barGap 18 + btnH 88）  +  HUD 预留 84
```

⚠ **关键发现**：`bottomHost` 是 **overlay**——`mount-host.ts:118-119`
`position:absolute;left:0;right:0;bottom:0;height:${bottomBarH}px;z-index:10`，且它**装在 `fieldW×fieldH` 的场景盒内部**。
⇒ **HUD 条高与画布尺寸解耦**：抬高 HUD 不改画布尺寸、不动地块坐标。
⇒ 而 `scripts/game109-playthrough.mjs:41` 把 `720×910` 写死成走查锚点（「画布尺寸对不上→第一条断言当场红」）
⇒ **只要画布仍是 720×910，那条锚点就不破**。

### 4. 于是：空出来的 106px 有解，且不必扩界

撤掉画布那 6 枚之后，原按钮带会露出场景底图的下沿（`109/scene/farm` 的「下沿木条」）。
不把画面留在那儿——**让 HUD 条盖上去**（见 §二-②）。

---

## 二、设计

### ① 合一套：撤画布 6 枚，DOM 侧吃贴图皮

- **撤**：`blueprint.ts` 不再生成 `btn-*` 世界实体（`buttonEntity()` 随之下线）；`theme.ts` 的 `BTN_*` 布局常量随之退役。
- **留**：DOM 6 枚（它是**唯一过得了点击门**的一套）。
- **补**：DOM 按钮接 `Panel.skin`（`types.ts:280`「REQ-UI-容器可点」）= 那 6 条槽的 `filledSrc` 解析值。
  ⇒ **皮肤槽零孤儿**：`ALL_SKIN_KEYS` 一行不改，六条槽换了消费者（canvas 实体 → DOM 按钮贴图皮）。
  ⚠ 这条是硬要求：台账 15 行是**人门件**（owner 已 `approved`），而台账 ≡ `ALL_SKIN_KEYS` 是**集合相等**断言（推导脚本·本关禁跑）——
  撤消费者而不换消费者 = 造孤儿行 = 撞 `art-pipeline.md:49`。
- **增量口径**：index 没到/图挂了 ⇒ `art[skinKey]` 无值 ⇒ `skin: undefined` ⇒ 不吃皮、落回 `Panel.bg`（`BTN_TINT` 素坯底色·与撤掉的世界按钮**同色同尺寸**），
  与「美术是增量非依赖」同口径。

> **⚠ 施工后修正（2026-09-20·实拍为准）**：本稿原写「接 `ButtonProps.icon`」，**落地改成了 `Panel.skin` + 压底 Label**。
> 原因（原稿没预见的）：`Button.icon` 是「键首内联图标·1em 随字号」——图标与**文字并排**，而本关那 6 张板
> （`109/tool/plow.svg` 等）是 **96×88 的整面板**（不是键首小图标），当 1em 内联图用会被压成字形高的一小条。
> 三种接法的**实拍对照**留档在 [`self-check/shots/S7/art-plates-6.png`](self-check/shots/S7/art-plates-6.png)（六板连排·96×88 原尺寸目击）。
> 换成可点 `Panel` 后：写路径不变（`PanelProps.action` → `data-action` → mountUI 委托 → `enqueueAction` → keybind → Effect，**与 Button 同路**）、
> 名字改放子 `Label`（`Panel` 无 `kind`/`label` prop）、选中态由「底色变金」改走 `fx:[{sheen-hover},{glow,gold}]` + `▶ ` 前缀
> （`▶ ` 那半是走查判选中的契约，一字未动）。
> **代价（如实记）**：`flair.skin` 一项 12 → 6。审计入口刻意不喂 art（喂了会让文字穿透纸底=造图底假阳），
> 而 `flair.skin` 数的是**主题皮**（`[data-apollo-skin]`/border-image）——`Button` 素坯形态吃 house 的 buttonSkins、
> `Panel` 不吃。这是**控制面形态变化**的已知代价，非缺陷；三张 ui-audit 仍**阻断项 0**。

### ② HUD 条 84 → **196**（overlay·**不喂 FIELD_H**）

```
FIELD_H = pad*2 + rows*cell + barGap + BAR_H + HUD_RESERVE   ← 910 不变（走查锚点）
HUD_H   = FIELD_H − (pad + rows*cell + barGap) = 910 − 714 = 196
        = pad + BAR_H + HUD_RESERVE = 24 + 88 + 84 = 196     ← 覆盖原按钮带
```

⚠ **本稿原写 190 = `HUD_RESERVE + barGap + BAR_H`（84+18+88），是错的——错在用 `barGap`(18) 而不是 `pad`(24)**：
按钮带顶缘 = `pad + rows·cell + barGap` = **714**，要「正好盖住」就得让条顶落在 714，故条高 = 910 − 714 = 196。
按 190 施工的话条顶落在 **720**，正好在 714..720 露出**一条 6px 的旧按钮带残影**（= 24−18，两个常量之差）。
这条已写进 `theme.ts:HUD_H` 的注里（「少一个像素就会在条顶露出一条 6px 的旧按钮带残影」）。

⇒ 画布仍 **720×910** ✓ · 地块坐标一格不动 ✓ · 走查锚点 ✓ · 原按钮带被盖住 ✓ · 底部不留白 ✓
（可见地块区下沿 696 → 按钮带顶 714 → HUD 顶 714，中间正是那 18px `barGap`。）

**根布局随之改**：原稿只写「条变高」，实测不够——底栏 host 是 `position:absolute;bottom:0;height:196px` 的**空盒子**，
面板不显式给高就只有**内容高**（实测 106px）⇒ 条下沿漏出画布（量到 90px 的缝）。故根布局 = `direction:'column'` + **`height: HUD_H`**
（`box-sizing` 实测 `border-box` ⇒ 196 含 padding 10，不溢出）。`FIELD_H` 的算式**改用 `HUD_RESERVE`**（不是 `HUD_H`）后，「HUD 想变高」与「画布得变矮」彻底解耦。

### ③ 三行结构（读数 / 背包网格 / 动作条）

```
┌─ #g109-hud (Panel · column · gap 12 · padding 10 · height 196) ── 720×196 ─┐
│  #g109-hud-readouts   (row · gap 16 · align center)                       │  行 1
│    体力 20/20 · 金币 0/1000 · 第 1 天 · 当前工具：锄地                      │
│  #g109-hud-bag-grid   (direction:'grid' · cols: CROPS.length)             │  行 2
│    ┌ 胡萝卜 ×0 ┐ ┌ 小麦 ×0 ┐ ┌ 南瓜 ×0 ┐          ← 网格容器（D-14 第 3 项）│
│  #g109-hud-actions    (row · gap 8)                                        │  行 3
│    [🖼锄地] [🖼播种] [🖼浇水] [🖼收获] [🖼睡觉] [🖼卖货]   ← 6 枚带图标        │
└──────────────────────────────────────────────────────────────────────────┘
```

- **D-9 的修法**：读数不再与按钮**抢同一行** ⇒ 不再被压缩 ⇒ 不换行。读数行用 `justify:'start'` + 固定 `gap`（不用 `between`）。
- **D-14 第 3 项「网格容器」**：背包读数（`hud.ts:226` 的 `bagText`）从一个长 Label 改成
  `Panel{layout:{direction:'grid', **cols: CROPS.length**}}` 里的 3 个格子，每格 = 该作物的**色块** + 名 + `×N`
  （`CropDef.tint`·数据表里本来就有的标识色）。**不自画、不加控件类型**（`types.ts:30-33` 的 grid 档是既有能力）。
  ⚠ **不能用 `minCol: 96` 自适应——这是本关踩到的第二个真坑（已实红并修复）**：
  `minCol` 渲成 `repeat(auto-fill,minmax(Npx,1fr))`（`render.ts:434`），而 **auto-fill 的重复次数取决于「可用宽度」**；
  本行是 shrink-to-fit 的 flex 子项，宽度不定 ⇒ 按规范**塌成 1 列** ⇒ 三格竖排成三行（行高 122 逻辑px），
  整条内容 276 > 196 ⇒ 列方向 `justify:'center'` 把溢出两端同时裁掉：**读数行被推出条顶、六枚按钮只剩上半截**
  （坏版目击 = `self-check/shots/S7/after-hud-bar.png` 的上一版；修后实测 `grid.cols = "89.47px 89.47px 89.47px"` 三列并排、
  `bagRow h 37.4px`、`contentH 194 ≤ 215.4` 不再溢出）。
  固定列数 = 格子数（`CROPS.length`）既**确定性**又随数据表走（加作物自动加列）。
  ⚠ 作物皮肤是**横排 sheet**，当 64px 图标用会被压扁 ⇒ 格子里**不放图**，用色块 + 名 + 数（诚实：不用错的图冒充图标）。
- **D-14 第 2 项 `Label.format`**：用在**新增**的读数上（金币走 `format:'int'` 便于千分位）。
  ⚠ **不能**用在 `体力/金币/第 N 天` 这三个上：走查脚本按正则读它们（`体力 (\d+)/(\d+)` · `金币 (\d+) / (\d+)` · `第 (\d+) 天`）
  ⇒ 格式一变走查当场红。**这是一条硬边界，不是口味。**
- 按钮**保持** `[data-action]` = 信号名、选中态**保持** `▶ ` 文字前缀（走查用 `label.startsWith('▶ ')` 判选中）。

### ④ 结算屏接成熟件（D-14 第 4 项 + 第 2 项）

对局结束仍走既有的换屏路径（`buildHud` 里 `flow === won` 分支），**元素 id 与文案契约一格不改**（走查按 id + 正则断言），
但内容接上成熟件：`Particles{kind:'confetti'}`（通关庆祝·`kind` 闭集内的既有件）+ 艺术字（`font:'cnround'`·S5 已在）。
⇒ 观感向 `@ui/starters` 的 `buildStarterResult` 看齐，**而 `scripts/**` 一行不用改**。

⚠ **两处施工后删减（原稿写了、落地没做·如实记）**：
- **`Rating`（星级）——去掉了**。本关没有「分数」这个量：结算面板只有「用时天数 + 最终金币」，星级得从这两个数编一个映射出来
  ⇒ 那是**新增玩法规则**，撞形态声明 #3「玩法数值/规则一个字节不改」。宁缺勿造。
- **`Label.format`（千分位）——这一行也不能用**：走查读 `resultStats` 的正则是 `最终金币 (\d+) / \d+`
  （`game109-playthrough.mjs:90` 的 `resultGold`），插进千分位逗号当场红。与 §二-③ 那条「四串读数不许动格式」是**同一条硬边界**。
  ⇒ 本关**没有任何**一个数字读数用得上 `Label.format`（能用的地方全被走查契约钉住了）——这一项**不是没做，是做不了**。

### ⑤ 反馈通道（R-17 / D-19：被拒零反馈）—— ⏳ **本批未施工·仍是设计**

- **检测**：宿主（`game109.ts`）在 `pointerdown` 后等一拍，**「点了地块但体力未变 ⇒ 这一下被前置门拒了」**。
  依据是一条**既有的数据事实**：`BALANCE.actionCost = 1`，任何成功的干活都必然扣 1 ⇒ 「没扣」⟺「被拒」。
  ⚠ 这**不是**把前置门重写一遍（那会造出游戏层解释器·撞 §4.7 阶梯）；它只判「这一下有没有落地」。
- **呈现**：`Toast`（`types.ts:513-515` 既有件·tone 着色小药丸）挂在 HUD 树里，定时自消。
- **文案**：取 `TOOLS[].hint`（数据表既有字段，如「荒地 → 已翻土」）——**不给数据表加规则**，只把既有字段显示出来。
- **边界**：只加**呈现节点**，不碰世界；`flow=won` 时不出现（冻结期）。

### ⑥ 深走守卫（S3 复查建议①）—— ✅ **已施工**

S3 复查实测：往 wallet 实体塞函数，**预告该红、实测 49/49 全绿**（`JSON.stringify` 静默丢函数）⇒ 建议补
「实体树零 function 值」深走测试。**在 `games/game109/**` 边界内** ⇒ 并入本批（新增守卫测试）。

### ⑦ ⚠ 需要 owner 点头的一条：换屏结构（D-13 的**字面**落地）—— ⏳ **A/B 已报裁·未获批前一个字不动**

D-13 原文要求：**用** `@ui/starters` 的 `buildStarterHome`（主菜单屏）+ `buildStarterResult`（结算屏）替掉自建面板。
本设计**只做了「向它看齐」（§二-④）**，没做**字面调用**，原因是撞在一条边界外的硬契约上：

| 撞点 | 事实 |
|---|---|
| 结算屏 id | `buildStarterResult` 产出的 id 是 `starter-res-*`；走查按 `g109-hud-result` / `-result-title` / `-result-stats` / `#g109-hud-restart` 读（`game109-playthrough.mjs:86-91`）⇒ 换 builder 即全空 ⇒ **走查红** |
| 主菜单屏 | 走查装载后只等 `#g109-hud-energy`（`:252`）就开打 ⇒ 首屏若是主菜单，`until` 12s 超时 ⇒ **全线红** |
| 改它的代价 | `scripts/game109-playthrough.mjs` 属**边界外**（§(n)「明确不碰：其它 `scripts/**`」），且它是 **S4 门的牙齿** ⇒ 改门 = 需 owner 裁 |

⇒ 两案（**Lead 只推荐，不自裁**）：见会话——**A** 授权我按「新屏 → 新选择器」随动该脚本（断言强度**一条不降**）+ 独立复查人专核；
**B** 不做字面换屏，D-13 如实记债（欠「主菜单屏」与「builder 字面调用」两件）。

---

## 三、明确不做（防扩散）

- **不动** `src/**`（引擎面零改动；本设计全程只用既有件：`Panel.skin` / `Panel grid` / `Label` / `Particles` / `Toast` / `fx`）。
- **不动** 任何 `scripts/**`；**不跑** `game109-art-requirements.mjs`（会把人门 15 行打回未审）。
- **不动** 玩法数值与规则：`BALANCE` / `CROPS` / `TOOLS` / `FARM.cropByCol` 一个数不改（形态声明 #3）。
- **不动** 走查/探针按正则读的四串文案格式（体力 · 金币 · 第 N 天 · 当前工具：X）与 6 个 id。

## 四、验证计划（施工后照此跑）

1. `npx tsc --noEmit` + `npx vitest run games/game109/`（**含**被本设计改动的骨架测试与新守卫）。
2. 渲染目击：改后同机位截图（`shots/S7/after-*`）＋ 人眼比对改前（本稿 §一）。
3. `node scripts/game109-playthrough.mjs`（**只读跑、不改**）：画布 720×910 锚点、六键、终局 id 与文案全部仍在。
4. golden：观感改动 ⇒ 基准必然红 ⇒ 走**换代三步**（`capture --state s7-boot` → owner `bless` → 旧行 `retired`），与 `s5→s6` 同法。
5. 清闸（owner 裁 A「先施工、冻结点一次清」）：S4/S5 机器门 + 独立复查 → `scorecard`。

### 验证结果（2026-09-20 施工后回填·全部为实测读数）

| # | 判据 | 实测 | 判定 |
|---|---|---|---|
| 1a | `npx tsc --noEmit`（`games/game109`） | 错误 **0 条** | ✅ |
| 1b | `npx vitest run games/game109/` | **2 文件 51/51 通过** | ✅ |
| 2 | 改后同机位目击 `shots/S7/after-{whole,canvas,canvas-bar,hud-bar}.png` | 三格并排 · 读数行完整 · 六枚按钮整高不被裁 | ✅ |
| 3 | `node scripts/game109-playthrough.mjs`（只读） | **174/174 全绿**（`canvas×1 · HUD×1` · 零 console error） | ✅ |
| 4 | 三张 `ui-audit`（`audit-hud` / `-shell` / `-result`） | **阻断项 0**（唯一警告 = 既有 D-17 金币 3.57） | ✅ |
| 5 | golden 换代 | **未做**（等本稿获批后走 `capture → owner bless → retired` 三步） | ⏳ |
| 6 | 清闸 | **未做**（S3/S4/S5 因施工过期 = 预期·owner 裁 A 一次清） | ⏳ |

**真机几何读数**（`g109-s7-after.mjs`·Chromium/`:5173`）：`canvasLogical [720,910]` ✓ 定尺未破 ·
`hud h 215.4px`（= 196 × 1.0989 缩放）· `gapCanvasToHud −215.4`（底对齐 ⇒ 条顶缘正落 714） ·
`bagRow grid.cols "89.47px ×3"` · `contentH 194`（不溢出）· `console error 0`。

⚠ **一处代价如实报**：`flair.skin` 12 → 6（`Button`→`Panel` 后素坯形态不再吃 house buttonSkins；审计入口刻意不喂 art）。三张审计仍**阻断项 0**。

## 五、边界自查（§(n) 逐条对）

- 可碰面内：`games/game109/**` ✓ · `docs/design/game109/**` ✓（本条设计稿落此处）
- 需 owner 点头：**无**（本稿全部改动都在可碰面内）；⚠ §二-⑦ 的 A/B 是**新**的一次边界请求，未获批前不动那个脚本。
- 明确不碰：`src/**` ✓ · 其它 `games/**` ✓ · 其它 `scripts/**` ✓ · 六份 `S2_REVIEW_INPUTS` ✓ · `art-ledger.json` ✓ · `s6-boot.png` ✓
