# UI 实操手册 · ZeroCraft 数据驱动 UI 建库准则（LLM 必读）

> **定位**：你（LLM·尤其是弱模型）要用 ZeroCraft Kit（`src/ui/components` 的 `LayoutNode`）做一套 UI / HUD / 菜单 / 面板时，**按本手册做就不会出大纰漏**。强模型也照此对齐，省得各凭直觉跑偏。
>
> **本手册在「约束式数据合成」机器里的位置**：`catalog.ts`（喂你 schema + sample）+ `validate.ts`（挡掉非法数据）+ `sample`（game-i 给活范例）这台机器只能挡**schema 级**错误（未知组件 / 缺必填 / 错枚举）。本手册管**机器挡不住、但仍然是「坏 UI」的合理性**——**重叠、颜色/对比、透明度、布局卫生**。这些靠纪律 + 自检，不靠等用户指出。
>
> **最高纲领仍是** `data-driven-manifesto.md`：UI 也是数据；控件是闭集词汇；写世界靠 `action` 信号，handler 里绝不塞自由逻辑/自由 CSS/DOM。本手册是它在 UI 域的操作化。

---

## 0. 黄金流程（做任何一套 UI，按顺序走）

> **⭐ 起手第一动作 · 华丽度=第一要素（owner 2026-07 拍板）**：**别从空白搭朴素屏、别从零调色写 UITheme**——新游戏 UI「起手默认华丽」，三步立起富底子，再往上按游戏改：
> 1. **传 house 主题**：`mountUI` 缺省 `SHELL`（引擎清冷 chrome）=朴素。起手显式传一个 **house 主题**——`STARTER_THEME`（`@ui/starters`·=apollo-toon 水墨玩趣·亮宣纸糖果厚唇钮·程序化零资产）/ apollo-kit `apolloOnyx`(暗金属)·`apolloBrocade`(暖锦缎)。**只有明确美术方向时才自写 UITheme**（记债·经审）。
> 2. **常见屏 import 起手包**：主菜单/结算这类屏**直接 `@ui/starters`**（`buildStarterHome`/`buildStarterResult`——糖果皮钮 + 星级 Rating + 庆祝粒子 + 悬停流光 + 数字格式化已接线·传标题/按钮/分数即得一屏富 UI），再改数据/加件。
> 3. **逛橱窗挑成熟件**：按你游戏「有什么」照**下方「橱窗货架」表**挑对应成熟件（卡牌→`faceArt`/翻面 · 选关→`LevelPath` · 庆祝→`Particles` · 主行动键→`Panel.skin`+`sheen-hover` · 数值→`Label.format` · 异形→`shape` · 立体→3D UI…），活范例=game-i 展示台逐特性段。
>
> 起手富了，下面黄金流程在此之上走（自检/校验一样不少）。

**橱窗货架**（你游戏「有 X」→ 拿这件·别自己搓朴素版·活范例=game-i 展示台对应段）：

| 你游戏有… | 就用这件 | game-i 段 |
|---|---|---|
| 卡牌/牌面 | `PlayingCard.faceArt`(整面插画) + `flipped`/`flipOnHover`(翻面) | 🧊 3D UI · `t-tapflip` |
| 选关地图 | `LevelPath`(蛇形路径 + 状态节点 + 星标) | `t-levelpath` |
| 通关/领奖/连击 | `Particles`(confetti/coins/stars/sparkle) + `Float`(飘分) + `anim:floatUp/popOut` | 🎉 Juice |
| 金币/伤害粒子**飞向目标**·拖尾 | `Particles` 物理弹道(REQ-UIFX·`shape:'cone'+gravity+flyTo:AnchorRef+trail`·色/径分档·对位 Vfx3D) | `t-3dui-pfly` |
| 注水/蓄力液面杯 | `ProgressBar.shape:'liquid'`(radius/fillColor/wave/bubbles·游戏只给标量 value) | `t-3dui-liquid` |
| 主行动键/大 CTA | `Button.kind:'hero'`(金糖) + `fx:[{kind:'sheen-hover'}]`(悬停流光) + `Panel.skin`(复合贴图键) | `t-skin` |
| 得分/货币/时间数字 | `Label.format`(compact 12.3K / time mm:ss / percent) + `tween`(滚动) | `t-format` |
| 异形按钮/菜单/容器 | `Button.shape`/`Panel.shape`(六边/盾/菱…8 形·闭集) | `t-shape` |
| 环形进度/血蓝耐力 | `ProgressBar.shape:'ring'` + `bind`(绑世界资源) | `t-ring` |
| 头顶名牌/血条/伤害数 | `Float`/`Connector`(锚活动目标·render-only) | `t-anchor` |
| 立体感/3D 展示 | 3D UI(`layout.rotateX/Y/z/tilt3d/press3d`) · 世界空间面板 `WorldUI3D` | 🧊 3D UI |
| 高级质感底/换皮 | `UITheme.texture/wash/panelTexture`(house 底纹) + `Panel.glass`(磨砂) | 换皮下拉 |

### 0.1 game-i 展台导览（怎么逛·哪个模块演什么·怎么照抄）

> **⚡ 别再靠翻：`node scripts/ui-find.mjs <大白话>`**（`血条`/`货币`/`选关`/`右键菜单`/`立绘`…）——
> 一条命令给出「用哪个控件 + 全部 prop + 去展台哪一段看活的 + 照抄哪个文件」，**不必先知道控件叫什么**。
> 起因：89 段活范例散在 6 个 tab、一件的演示常**跨 tab**（Label 基础在 `tab-display`、艺术字/大字在 `tab-new`），
> 翻是翻不全的。索引真相 = `catalog.ts` 的 `demo[]`/`tags[]`（段 id 由 `ui-find.test.mjs` 守着·死链当场红）。
> 下面这份导览仍有用——**知道自己要「哪一类」时按类定位；只知道「要个血条」时用 ui-find。**

**做任何 UI 前 + 卡壳时都开 `?game=game-i` 对照**——它是本手册的「活参照」，35 个模块逐能力隔离演示。按你要做的**类型**定位：

- **① 抄一整屏结构**（不只单控件·先看这类）——顶栏进「组合」模块，照抄整屏骨架改数据：
  - 🗡 **组合·MMO HUD**（`mmo-hud.ts`）= 纯数据复现最复杂 HUD（血蓝条/技能格/小地图/buff 行）——**信息密集屏**照它。
  - 🍬 **组合·超休闲对局**（`casual-hud.ts`）= 消除对局屏（顶栏 + 目标 + 糖果棋盘 + 道具 + juice）——**休闲/关卡对局屏**照它。
  - 💬 **剧情·VN 对话三件**（`dialogue-demo.ts`·真跑）= 台词框+选项+立绘（bind 投影·信号推进）——**剧情/约会屏**照它（或直接 `@ui/starters` `buildStoryStarter`）。
  - 🫂 **剧情·伴侣在场件**（`presence-demo.ts`）= 非剧情小对局叠伴侣反应（反应表 + 立绘换脸）。
- **② 找单控件写法**——🎛 **UI 控件** 模块（8 子 tab：`容器与布局`/`数据展示`/`输入与交互`/`🧊 3D UI`/`🎨 emoji 美术`/`🆕 新控件/特性`/`🧩 商店`/`🎴 选牌`）。上方**橱窗货架表**的「game-i 段」列直接指到具体子 tab/段（如 `t-shape`/`t-ring`/`t-anchor`）。
- **③ 逐能力隔离台**（想学「怎么单独驱动 X」看这里最清）——🔊声音 · 🎮输入底座 · ✨精灵动画 · 🧠游戏 AI · 🟢运动碰撞 · ⚔️战斗结算 · 🎆生成寿命 · 💥战场特效 · 🔀状态机 · 🎬爱诗工作室；**3D** 走 🧊 3D hub（18 块：光照/景深泛光/AO/PBR 材质/寻路/碰撞/粒子/toon/路径/弹簧/glTF…·逐块对应 `three3d.ts` 蓝图函数）。
- **④ 怎么照抄**：模块/子 tab 定位 → 去 `games/game-i/<对应 file>.ts`（组合屏）或 `gallery.ts` 搜那段 `id`（单控件·如 `t-shape`）→ **照抄写法、只改数据**。成熟起手屏（主菜单/结算/剧情屏）直接 import `@ui/starters`（`buildStarterHome`/`buildStarterResult`/`buildStoryStarter`）。

1. **选控件**：只从闭集 `ComponentType` 选 → 先读 `src/ui/components/catalog.ts`（每个控件的 `whenToUse` + 字段 schema + canonical sample）。**别凭记忆瞎猜 prop**。
2. **抄范例**：去 sample `games/game-i/`（展示台）找最接近的写法照抄改数据。`gallery.ts` 的「🆕 新控件/特性」tab + `mmo-hud.ts`（最复杂组合）是活模板；**成熟起手屏抄 `@ui/starters`**。
3. **组合，别逃生**：能用现成控件重组表达就重组；表达不了 → 写 `docs/workflow/requests.md` 让主程扩**一个闭集 kind/控件**。**永远不手写 React 屏 / 自由 CSS·DOM**（UI 铁律）。
4. **过四关自检**（下面 §1–§4，这是本手册的核心）：闭集校验 → 防重叠 → 颜色/对比/透明度 → 布局卫生。
5. **跑校验器**：`validateLayoutNode(tree)`（`validate.ts`）必须**零 issue** 才算合法数据。
6. **渲染实测**：mountUI 渲一帧，**跑 overlap 审计**（§1 工具），人眼 + 程序双确认。绿了才交。
7. **华丽度对账**（第三步的产物·交付判据）：`tools/ui-audit.mjs` 每次跑都报一行 **`[华丽度] N 处华丽件命中（skin/shape/fx/glass/juice/particles…）· house 主题：是/否`**——这就是「逛橱窗挑成熟件」这一步的**产物**（把「逛没逛」从看不见的心理活动变成可 review 的数字 + 自动逐类对账）。**零命中 = 疑似通体朴素默认屏（SHELL 灰皮）**，审计当场警告、PUI 复查重点核：对着上方橱窗货架**逐类**要么挑了件、要么写明「本作确无此类」。**别把「屏幕能渲染、门禁全绿」当成第三步做完了**——正确 ≠ 华丽，这一行数字才是第三步的判据。

> 复诵：**起手传 house 主题 + 起手包/橱窗挑成熟件（华丽第一）→ 选 catalog → 抄 sample → 组合不逃生 → 四关自检 → validate 零 issue → 渲染审计 + 华丽度对账（零命中=第三步没做）**。
>
> **为什么单给第三步造产物**：①传 house 主题、②import `@ui/starters` 都是**二值、有代码痕迹**的（漏了屏幕就露馅/写的时候就撞到）；唯独③「逛橱窗挑成熟件」是**开放式浏览 + 判断**，**没完成判据、没产物**——一块通体朴素但完全正确的屏能一路门禁全绿走到交付，唯一拦截是事后人审。且**读了手册照抄一个能跑的结构，会产生「我照手册做了」的合规感，恰好盖掉还没做的第三步**（比没读还容易漏）。所以这里不加「请自检」（验记忆·同样会被漏），而是给它一个**机器产物**（华丽度命中数）——能被漏掉的步骤，都是没产物的步骤。

---

## 1. 准则 · 防重叠（OVERLAP）★最高优先

**铁律：组件不得互相重叠——除非玩家主动要求叠层（如「血条上叠连击点」「弹窗盖住主界面」这类显式叠加）。**

为什么单列第一：绝对定位（`layout.x/y`）+ 手填坐标是**最易出重叠**的写法。本仓库的 MMO HUD 初版就有 **9 处重叠**，全是「按错误的尺寸估算去摆坐标」造成的。

### 1.1 重叠从哪来（三个真实坑）
- **面板比你声明的宽/高**：`padding` 会把盒子撑大（box-sizing）。声明 `width:256` 的单位框实测 **274px**（+18 padding+border）；声明高度也一样 +14 左右。**按实测尺寸排坐标，不按脑补尺寸。**
- **内容驱动的高度**：带 `showValue` 的 `ProgressBar` 会在条上方多一行数字；带 `label` 的多一行字。一个单位框实测 **90px** 高，不是你以为的 ~68。**先渲一次量真实高度，再摆下一个。**
- **`fx` 与绝对定位互斥**：同一节点 `x/y` + `fx:[{kind:'sheen'}]` → sheen 的 ::after 强制 `position:relative`，**覆盖掉 x/y 的 absolute**，元素跑位（见 `requests.md · REQ-UI-BUG-fx与绝对定位不兼容`）。**绕法**：定位壳裹特效内卡 —— `{Panel x/y bare}>{Panel fx ...内容}`。

### 1.2 怎么避免（优先级从高到低）
1. **能用流式就别用绝对**：`direction:'row'|'column'|'grid'` 的正常流**天然不重叠**（盒子依次排）。HUD 这种叠层 overlay 才用 `x/y`。
2. **绝对定位用「区块锚位」**：把界面分几个 dock（左上/右上/左下/右下/底中），每个 dock 内部用流式排，dock 之间留间距。坐标用实测尺寸算「上一块结束 + 间距」。
3. **`bare` 分组、别叠框**：纯 row/column 分组用 `Panel{bare:true}`（不画边框/底）。边框只留给「真该是一个框的东西」（外框/卡/侧栏）。千层嵌套框既丑又容易算错边界。

### 1.3 自检（必跑·程序化，不靠肉眼）
**跑常驻审计工具**——它量真实包围盒、报重叠，归零才合格：

```bash
node tools/ui-audit.mjs tools/audits/<你的页面>.audit.ts    # 退出码 0=过 / 1=有重叠或硬性低对比
```

写法见 `tools/README.md`（照 `tools/audits/mmo-hud.audit.ts`：import 你的 `buildXxx()` → mount 到 `#root`）。**容差外有相交 = 不合格，回去调坐标直到归零。**

> **允许的重叠**（须是设计意图）：弹窗/抽屉遮罩盖主界面、血条上叠连击点、tooltip 气泡浮在元素上。审计自动排除「无 id 装饰层（vignette/pattern/sheen）」+「祖孙嵌套」；真要叠的两个 id 框会被标出 → 人工确认是意图叠层即可（或让其中一个不带 id）。**非意图的相交一律视为 bug，归零。**

---

## 2. 准则 · 颜色 / 对比度 / 可读性（自动查·别等用户说看不清）

**铁律：文字必须在其背景上可读（足够对比度）；颜色走语义令牌，不写自由 hex 文字色。**

### 2.1 用令牌，不用自由色
- 文字色只用语义档：`Label.color ∈ {text, sub, dim, jade, gold, ok, warn, danger}`（→ 主题令牌·换皮自动适配）。**别给文字塞 raw hex**——换皮就废、对比无保证。
- `Badge.tone / Tag.tone / ProgressBar.tone` 同理走闭集语义档。
- 自定义底 `Panel.bg` 可以填渐变/令牌，但**填了深底就别再放 `dim` 灰字**（dim 是给默认深底调的，叠深底会糊）。

### 2.2 对比度下限（WCAG 量级）
- 正文文字 / 背景对比度 **≥ 4.5:1**；大字（≥18px 粗体）**≥ 3:1**。
- 经验法则：**深底配 text/sub/亮语义色（jade/gold/ok）**；**亮底（如 daylight 主题、felt 绿呢、白扑克 light）配深字**——别在亮底上用 `dim`/浅灰。
- **每套主题都要过一遍**：换皮后最容易出「某主题下某处文字糊掉」。daylight（亮主题）是照妖镜，做完在它下面看一眼。

### 2.3 自检（同一个工具一起量）
`tools/ui-audit.mjs` 在查重叠的同时量每个文字节点的 computed 对比度（前景 vs 逐层向上第一个不透明背景）：
- **硬失败 `<3.0`**（真读不清·深底深字/字≈底）→ 阻断、必修。
- **警告 `3.0–4.5`**（多为 `dim` 次级文字）→ 复核：若是正文就提亮，若确是次级标签可接受。

**至少跑深主题 + 亮主题（daylight）两遍**——亮主题最容易暴露「亮底深字糊掉」。背景半透明时工具会解析到实底再算（别拿透明值骗自己·见 §3）。

---

## 3. 准则 · 透明度（别透穿·别用透明骗对比）

**铁律：浮层 / 弹窗 / 气泡的内容区必须有不透明实底——不能让背后的东西透出来重叠干扰。**

- 弹窗/抽屉/tooltip 气泡：背景叠一层不透明兜底（本仓库做法 `linear-gradient(bg,bg),bg0`），**别用半透明主题底**（如 `var(--panel)` 在战斗皮肤下可能半透）→ 否则内容糊在背景上。遮罩 scrim 够深（≥0.85）让弹层与背后强分离。
- **透明不能用来「制造对比」**：一段灰字看着「还行」可能只是因为背后恰好是深的；换个背景就废。对比度要按**解析到的实底**算（§2.3）。
- 纯表现的半透明叠层（vignette 暗角 / pattern 纹理 / sheen 流光）OK——它们是**装饰**不是**内容载体**，不承载需读的文字。

### 3.1 反向 · 透明 art 贴图（cutout PNG「放对层就透，放错层不是 bug」）
> owner 2026-07-24 复核：「透明贴图放进去不太对」——实测**格式全支持**，症结只在放哪层 / 源图真假。守卫 `src/ui/components/alpha-texture.test.ts`。
- **`Image` / `Panel.skin(cover)` / bare `Panel.bgTexture`**：渲染层零强塞底 → 真 alpha 原生透出父层（页面/牌桌/面板）。放这些层，透明就是透明。
- **假透明**（源图烤了棋盘格/白底·非真 RGBA）是**抠图没真做**——走 `/api/assets/matte`（rembg·`docs/playbooks/assets.md`）真去背，别怪渲染。判真假：`spec.transparent` + studio「· 透明」标。
- **`PlayingCard.faceArt`**：cutout 叠在**卡面不透明底**之上——透出的是卡面色、非桌面（卡有卡面·设计如此）。要贴图浮在 play-field 上无卡背 → 用 `Image`/render `Sprite`，别用 faceArt。

---

## 4. 准则 · 布局卫生（杂项·一眼能查）

- **别千层框**：分组用 `Panel{bare:true}`；框只给该成框的东西。
- **绝对定位先量后摆**（§1.1）：padding 撑宽、内容撑高，按实测排。
- **`fx` 别直接挂绝对定位节点**（§1.1 第三坑）：用定位壳裹特效内卡。
- **每个节点必须有唯一 `id`**：mountUI 的增量 diff、引导锚点都靠 id；漏 id 校验器会报。
- **写世界只经 `action` 信号**：控件的 `action`/`actionArg` 发信号名，handler 在外面接；**handler 里绝不写自由业务逻辑**（那是把代码偷渡进数据层）。
- **emoji 当头像/图标注意**：多码点 emoji（🧙）传给 `Avatar.name` 会被首字符截断成「?」；要么用单字（汉字/单 BMP 字符），要么用 `src`（SVG data-URI）。
- **响应式整页 chrome 用 `maxWidth`**：窄屏铺满、宽屏封顶居中，填一个数即得。

---

## 5. 去哪找（WHERE-TO-LOOK 速查表）

| 你要做的事 | 去哪 |
|---|---|
| 有哪些控件、每个 prop 怎么填、闭集枚举值 | `src/ui/components/catalog.ts`（自描述目录·含 sample）+ `types.ts`（TS 形状） |
| 校验我的 LayoutNode 树合不合法 | `src/ui/components/validate.ts` → `validateLayoutNode(tree)` |
| 控件长啥样、复杂组合怎么写 | sample：`games/game-i/`（`gallery.ts` 全控件 + `mmo-hud.ts` 最复杂 HUD） |
| 控件渲染成什么 HTML（debug 样式/定位） | `src/ui/components/render.ts` |
| 视觉特效（pulse/glow/sheen/flash…）怎么用、两库怎么分 | `docs/design/effects-architecture.md` + `layout.fx`（types.ts `VisualEffect`） |
| 主题令牌有哪些、换皮怎么做 | `src/ui/components/types.ts` `UITheme` + `wiki/skills/ui-theming.md` |
| 最高纲领 / 该不该下沉成能力 | `docs/design/data-driven-manifesto.md` |
| UI 必须用 LayoutNode 的铁律 / 边界 | `CLAUDE.md`「UI 铁律」+ `apollo-ui-contract.md`（归档层已删·查 git 历史） |
| **防重叠 / 颜色 / 透明度 / 布局卫生准则** | **本手册** |

---

## 6. 反面清单（ANTI-PATTERNS·出现即回炉）

| ❌ 反面 | ✅ 正解 |
|---|---|
| 手写 `<div>`/React 屏/自由 CSS 拼 UI | 全用 `LayoutNode` 数据；缺控件 → 提 requests |
| 绝对定位坐标凭脑补尺寸瞎填 | 渲一次量实测包围盒，按真实尺寸排，跑 overlap 审计归零 |
| 组件叠在一起（非玩家要的叠层） | §1 审计归零；叠层须标 intentional |
| 文字塞 raw hex 色 | 用语义档 `color: text/sub/jade/...` |
| 亮底上放 `dim` 浅灰字 / 深底糊深字 | 按 §2.2 配色，过 daylight 主题验对比 |
| 弹窗半透明底、背后透出来 | 不透明实底兜底 + 深 scrim（§3） |
| 拿「看着还行」当对比合格 | 程序量 computed 对比度 ≥4.5（§2.3） |
| `fx:sheen` 直接挂 `x/y` 节点 | 定位壳裹特效内卡 |
| 节点漏 `id` | 每节点唯一 id |
| handler 里写业务逻辑 | handler 只转发 `action` 信号 |
| 千层嵌套带边框 Panel | 分组用 `bare:true` |

---

## 7. sample 即标尺：game-i 已照本手册落地

`games/game-i` 是本手册的**活参照**，做新 UI 时照它对齐。跑 `node tools/ui-audit.mjs tools/audits/mmo-hud.audit.ts` 看实测：
- **闭集**：全程仅用 `ComponentType` 闭集控件，零手写 React（`mmo-hud.test.ts` 有「仅闭集控件」断言）。
- **防重叠**：MMO HUD 经 overlap 审计 **0 重叠**（从初版 9 处修到 0）；`mmo-hud.ts` 注释标了定位壳绕 fx 坑。
- **组合优先**：用现成控件拼出 WoW 级 HUD，**零新控件、零逃生**——证明闭集词汇够表达最复杂界面。
- **缺口上报**：建库中发现的引擎缺口（`fontPixel` 令牌 / `style` 引号截断 / `fx×绝对定位`）全部写进 `requests.md` 交主程，没有一处手写绕过。
- **审计当场抓 bug（工具的价值演示）**：当前 `ui-audit` 对 MMO HUD 报 **3 处硬失败**——聊天页签「综合/战斗/交易」黑字 ratio≈1.09。**这不是数据错，是 `renderTabs` 撞上 `style 引号截断` 引擎 bug**（color 排在 font-family 后被吞→回退黑色·已报 `requests.md`·波及所有 Tabs）。肉眼以为「页签偏暗」，工具量出「纯黑不可读」——**这正说明对比度要程序量、不能靠看**。主程修序列化后即转绿。

> 一句话给 LLM：**做 UI 前读 catalog + 抄 game-i；做完跑 `validate` + `tools/ui-audit.mjs`；重叠和糊字是你自己的责任，靠工具量、不是等用户来挑。**
