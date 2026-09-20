# S7 品质关 · D-13「换屏结构」设计稿（owner 裁 **A**）

> **依据**：owner 2026-09-20 裁 **A**（`requests.md` §0.(q)）＝授权按「新屏 → 新选择器」随动
> `scripts/game109-playthrough.mjs`（**断言强度一条不降**）＋派独立复查人专核这次改门；
> 规格出处 `capability-plan.md §4.6`：「**用** `@ui/starters`——`buildStarterHome`（主菜单）+ `buildStarterResult`（通关结算屏）。**不自建朴素屏**。」
> **形态声明 #2**：改版前先出设计稿 + 渲染目击截图（本节 §一 即目击）。
> **本稿只写已读码/已目击的事实**，未跑到的读数一律标注来源。

---

## 一、改前实况（已目击 + 已读码）

| # | 事实 | 出处 |
|---|---|---|
| 1 | 装载 `?game=game109` **直接进对局**，没有主菜单屏 | 目击 `self-check/shots/S7/before-whole.png`（首屏 = 对局屏） |
| 2 | 终局是**自建** `resultPanel`（`#g109-hud-result` / `-title` / `-stats` / `#g109-hud-restart`） | 目击 `self-check/shots/S4-play-6-terminal.png`·读码 `hud.ts:251-276` |
| 3 | HUD 挂在 `bottomHost`（**高 196**·底栏 overlay） | 读码 `game109.ts:83-90`·`mount-host.ts:118-119` |
| 4 | **`mountHost` 另给一个 `overlayHost`**：`position:absolute;inset:0;z-index:20;pointer-events:none` | 读码 `mount-host.ts:120-121`·`HostSkeleton` 接口 `:73-75` |
| 5 | **全屏屏的标准落点就是 `overlayHost`**，先例五处：`game-a.ts:44-45,232` · `game-b.ts:70-89` · `game-c.ts:50-51,245` · `game-103.ts:26,89-90` · `game-105.ts:207` | 全仓 grep |
| 6 | `renderScreen` 无 `bg` 时回落 `theme.pageBg`（**不透明**）⇒ 主菜单屏会整幅盖住农场 | 读码 `render.ts:543` |
| 7 | `Screen` / `Rating` / `Particles` **三个组件引擎侧都支持** | 读码 `render.ts:1303,1320,1326`·`catalog.ts:38,128,265` |
| 8 | **全仓没有任何游戏用过 `buildStarterHome`/`buildStarterResult`** ⇒ 本关是**首例**，无同源样板可抄 | 全仓 grep |

⚠ **结构性结论（这条决定了整个设计）**：主菜单/结算这类**全屏屏不能塞进 `bottomHost`**——那是 196px 高的底栏，
`Screen` 的 `fill:100%` 会变成「196px 高的菜单」。⇒ 两个新屏一律挂 **`overlayHost`**（§一-4/5），
并照先例 `overlayHost.style.pointerEvents = 'auto'` 放行点击。

---

## 二、设计

### ① 主菜单屏（`buildStarterHome`）—— ✅ 本批施工

```
overlayHost (inset:0 · z20 · pointer-events:auto)
  └─ Screen#starter-home (buildStarterHome·整幅不透明底 t.pageBg)
       ├─ Particles#starter-home-amb   (sparkle·环境微光·render-only)
       ├─ Panel#starter-title-card
       │    ├─ Label#starter-title   「暂名」    (serif·xxxl·bold·gold)
       │    └─ Label#starter-sub     「种 · 长 · 收 · 卖 · 睡」
       └─ Panel#starter-actions
            └─ Button#starter-act-0  「开始」   (kind:'hero'·action:'start')
```

- **标题取「暂名」不是自造**：`brief.md:3` owner 2026-09-17 定「**名字先挂暂名**」，`brief.md:1` 的题头就是 `game109 《暂名》`。
  副标取 `brief.md:12`「参照物」段的循环名 `种—长—收—卖—睡`（只改分隔符，不改字）。
- **只挂一枚动作**（「开始」）：`buildStarterHome` 的 actions 是**数据**，多挂一枚就得有消费者——**没消费者的键 = 死键**
  （`self-check.md:28` 记的正是这个病）。本关没有设置/存档/退出，故不摆。
- **「开始」= 宿主局部 handler**（与 `restart` 同一条先例·`game109.ts:29-31`）：世界里没有「开始」的消费者
  ⇒ 若落进 ActionSink 就成了没人认领的信号（点了没反应、且不报错）。⇒ 进 `handlers` 表。
- **覆盖期间画布不可点**：`overlayHost` 放行点击后，它整幅盖在 canvas 之上 ⇒ 菜单期点不到地。
  这是**要的语义**（菜单就是菜单），也是走查必须改入口的原因（见 ③）。
- **`restart` 不回首屏**：`重开` = **再开一局**（局的生命周期），不是「退出到菜单」。
  ⇒ `start()` 加一个 `menu` 开关，`restart()` 传 `false`。若回首屏，走查那条「重开后 6 枚键全回来」会当场红。
- **世界在菜单期不特殊**：开局态（day 1 / energy 20 / gold 0）**本身就是菜单态** ⇒ 「开始」只收屏、**不改世界一个字节**
  （形态声明 #3）。这也是它不需要新 flow 状态、不需要动 `blueprint.ts` 的原因。

### ② 结算屏（`buildStarterResult`）—— ⏳ **owner 2026-09-20 裁 A：不换·记债为「可判定的边界事实」**

`buildStarterResult` 的签名是 `{title?, stars, score, hasNext?, retryAction?, nextAction?}`（`starter-kit.ts:64-67`）。
本关的水土不服有两条，**都不是口味问题**：

| 硬墙 | 事实（已读码） | 为什么不能自行绕过 |
|---|---|---|
| **① `score` 破坏精确金币** | `score` 渲在 **硬编码 `format:'compact'`** 的 Label 上（`starter-kit.ts:76`）；`formatNumber(1026,'compact')` = **`1K`**（`render.ts:39-45` 实测口径·`juice-fx.test.ts:84` 钉着） | 走查的跨线卖货那条**必须读精确金币**：`sell()` 在换屏后用 `最终金币 (\d+) / \d+` 兜底（`game109-playthrough.mjs:90`），终局那条断言是 `g7 === 1026`（`:372`）。换 builder ⇒ 只剩 `1K` ⇒ **断言强度下降**——而 owner 授权的前提正是「一条不降」 |
| **② `stars` 无源** | builder **强制** `stars`（`:65`）并 clamp 到 0..3（`:73`） | 本关**没有「分数」这个量**：通关是**二值**判据（`gold >= goldTarget`）⇒ 任何 0..3 的档位都得**新编一条规则**（如「几天内通关算几星」）＝撞形态声明 #3「玩法数值/规则一个字节不改」。`BALANCE` 里也没有可复用的档位量（`data.ts:196-206` 只有 goldTarget/energy/actionCost…） |

**owner 裁定（2026-09-20「继续A」）= A：结算屏不换，把这半笔债写成可判定的边界事实。**
⇒ D-13 的两个半笔现在**逐半可判**：
- **`buildStarterHome` 那半 ✅ 已清**——是**字面调用**（`hud.ts:1` import + `buildHome()` 全文），不是「向它看齐」。
- **`buildStarterResult` 那半 ⏳ 记债**——判据**不是**「没做 / 没时间」，而是**「在本关现有两条明文红线内不可满足」**，
  两条红线与各自的具体缺件已逐条钉在上表 ①/②（**可被独立复查人逐条复核真假**）。**解锁条件写在债表 D-13 行**：
  要么 owner 松绑「断言强度一条不降」（接受金币读数降级成 `1K`），要么松绑「玩法数值/规则一个字节不改」（为 0..3 星新编一条规则并重跑玩法验证）。
- **本批一个字节未动**结算屏：`resultPanel`（`hud.ts`）原样保留。

**三案原文**（Lead 只推荐·不自裁·存档备查）：见 `requests.md` §0.(r)。

### ③ 走查随动（`scripts/game109-playthrough.mjs`·owner 已授权）—— ✅ 本批施工

**入口**（`:256-273`）：装载后不再直接等 `#g109-hud-energy`，改为两级等待——
```
goto → until(#starter-home 就位) → click #starter-act-0 → until(#g109-hud-energy 且 canvas 就位 且 home 已消失)
```
`READ` 探针加 `home: !!document.getElementById('starter-home')` + `homeStart`（那枚键的 action/label）。

**为什么非改不可（不是顺手改）**：`overlayHost` 放行点击后，它的 z20 整幅盖在 canvas(z0) 与底栏(z10) 之上；
Playwright 的 `page.click` 会做 actionability 检查（含「事件真落到该元素」）⇒ **不改入口，第一条 `pickTool` 就会超时红**。
⇒ 这个改动是**新屏的结构后果**，不是可选优化。

**断言强度**：六键、四串读数正则、终局三件套、重开、`canvas×1·HUD×1`、零 console error **一条不删**；
只改「从哪块屏进入」+ 选择器指向新屏。**新增**一条「主菜单屏就位（首屏 ≠ 对局屏）」的断言（**只增不减**）。

**实测（本回合实跑）**：`174 → 176` 条（+3 新增 −1 并入「HUD 与画布都在」那条：它拆成「首屏是菜单」+「点开始后 `canvas×1·HUD×1`」两截，
覆盖率不降反升）· **176/176 全绿**· 真退出码 **0**。三条新断言的首跑读数：
`home=true · canvas×1` / `start「开始」` / `home=false · canvas×1 · HUD×1`。

**⚠ 施工中撞的一个真坑（留档）**：`READ` 探针是**模板字面量**——我在它的注释里写了反引号（`` `buildStarterHome` ``）⇒
字符串当场被截断 ⇒ 整个 `.mjs` `SyntaxError: Unexpected identifier`（不是断言红，是**脚本都加载不起来**）。
已在该处留一行警示注释。**教训**：往模板字面量里塞注释，只能写不带反引号的话。

**走查未覆盖、但已被本批其它证据补上的一条**：`overlayHost` 收起后 `pointer-events` 是否真的复位。
走查是**间接**证到的（108 次 `page.mouse.click` 点地块全部扣到体力——若那层还 `auto`，事件目标会是它、canvas 的监听器收不到）；
另有一条**直接**读数：真机探针量到 z20 绝对定位层的 `pointer-events = "none"`（见 §四-4）。

---

## 三、明确不做（防扩散）

- **不动** `src/**`：两个 builder 逐字调用，**不 fork、不改它们的实现**（含那条 `format:'compact'`）。
- **不动** `blueprint.ts`：不为主菜单新增 flow 状态（世界在菜单期就是开局态·见 §二-①）。
- **不动**玩法数值与规则：`BALANCE` / `CROPS` / `TOOLS` / `FARM.cropByCol` 一个数不改。
- **不动**走查按正则读的四串文案格式与既有 6 个 id。
- **不跑** `game109-art-requirements.mjs`（会把人门 15 行打回未审）。
- ⏳ **结算屏**：不动——owner 2026-09-20 裁 **A**（不换·记债为可判定边界事实·§二-②），**本批零字节改动**。

**边界唯一一处跨界（owner 明许·逐条可核）**：本批**动了 `scripts/game109-playthrough.mjs`**——它在 S7 领工声明 §(n) 的
「明确不碰：其它 `scripts/**`」栏内。**动它的依据是 owner 2026-09-20 裁 A 的原文授权**（`requests.md` §0.(q)：授权按
「新屏 → 新选择器」随动、断言强度一条不降、另派独立复查人专核这次改门）。改动**只有入口与探针**两处（§二-③），
**没有碰任何一条既有断言**。**只有复查门能核这条**——所以第 5 项（派独立复查人）不是收尾客套，是本批的前置条件之一。

## 四、验证计划与结果

1. `npx tsc --noEmit` + `npx vitest run games/game109/`（含新增的主菜单屏树测试）。
2. `node scripts/game109-playthrough.mjs`（**只读跑**·已授权·入口随动）：期望**全绿且条数只增不减**。
3. `tools/ui-audit.mjs` ×3（主菜单屏是新屏面·须过阻断项 0）。
4. 渲染目击：装载首屏 = 主菜单屏（`shots/S7/after-home.png`）＋ 点「开始」后 = 对局屏。
5. 独立复查人**专核这次改门**（owner 授权条款）。

### 结果（本回合实跑·逐条可复跑）

| # | 判据 | 读数 |
|---|---|---|
| 1a | `npx tsc --noEmit -p .` | **`games/game109/**` 与 `scripts/**` 错误 0 条**。全仓 24 条错**全部**在 `src/skills/tier2/**`（13+9+1）与 `games/game-mcfight/**`（1）——**边界外·既有**（本轮零 `src/**` 写入） |
| 1b | `npx vitest run games/game109/` | **2 文件 52/52 通过**（51 → +1 = 新增的主菜单屏交树测试）· 真退出码 0 |
| 2 | `node scripts/game109-playthrough.mjs` | **176/176 全绿**·真退出码 **0**·零 console error（见 §二-③ 的 +3/−1 说明） |
| 3 | `tools/ui-audit.mjs` ×**4** | **阻断项 0 · 真退出码 0×4**。⚠ **臂数 3 → 4**：主菜单屏是新屏面，既有三臂一个都量不到它 ⇒ 新增 `public/games/game109/self-check/audit-home.audit.ts`（`--w 720 --h 910` = 它在 `scale=1` 时占的那个盒）。四臂读数：`home` 重叠0/硬对比0/警告0/华丽度 3（skin1 shape1 fx1）·**house 主题：是**；`hud` 0/0/**1**（既有 D-17 金币 3.57）/6；`shell` 0/0/0/6；`result` 0/0/0/1 |
| 4 | 渲染目击 | `shots/S7/after-home.png`（**首屏 = 主菜单屏**：标题卡「暂名」+ 副标 + 金色 hero「开始」键，整幅盖住场景）· `after-home-entered.png`（点「开始」后 = 对局屏：36 格 + 196px HUD 条 + 六枚贴图皮按钮） |
| 4b | 真机几何（一次性探针·不进仓） | `starter-home` 盒 = **760×960**（= 720×910 × k，k=960/910=1.0549）**正好等于场景盒** ⇒ `overlayHost` 的 `inset:0` 语义落实。收起后 z20 层 `pointer-events = "none"`（**直接读到复位**）。六键各 **101×93**·底缘 **943 < 960**（未被视口裁）·`hud` 条 753..960 = 207px（=196×k ✓）。DOM 顺序 `…reap→sleep→sell` 与 `data.ts` 的 `ACTIONS` 一致 |
| 5 | 独立复查人专核这次改门 | ⏳ **待派**（owner 授权条款·与 §二-② 的报裁一起走） |

⚠ **一处我自己的误读，照实记**：目击时我把 `after-home-entered.png` 里第 5/6 枚按钮的小字读成了「卖货/睡觉」（与 19:47 那张 `after-hud-bar.png` 相反），
一度以为按钮顺序变了。取 DOM 真值后确认**是我读错**：`…reap→sleep→sell`，与 `ACTIONS` 及旧图一致。**没有这个缺陷**——
写在这里是因为「拿小字截图当证据」本身就是个假阳来源，下次该直接读 DOM。
