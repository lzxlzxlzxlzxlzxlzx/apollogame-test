# game211《翻命扑克》· 游戏级工单池

> 游戏级工单随游戏走·**不占引擎 10 硬槽**（CLAUDE.md）。引擎级下沉一旦经 Lead 确认，升级进 `docs/workflow/requests.md`；3D 面走 `docs/workflow/requests-3d.md`。
> 状态：`open` / `in-review` / `done`（附 commit）/ `wontfix`（附理由）。
> **注**：本游戏其余设计文档现落在 `games/game211/design/`（`capability-plan.md`、`HANDOFF-duel-physics.md`），与全库 `docs/design/<game>/` 约定不一致。**未擅自搬迁**（会断已有引用）；如需归位另开工单。

---

## 待处理 / 进行中

### REQ-G211-HARDLINE · 硬红线红旗无基线条目（裸Math.random×8 · innerHTML×29 · createElement×34 · React屏×1）· [2026-08-10] · 承 `REQ-3D-G211-HARDLINE` 工单①建池 → **⚖ Lead 2026-08-18 裁 A 结案（全库 todo 总回顾）**：基线豁免入册（`scripts/audit-baseline.json` game211 条目·Lead 亲批·reason 按工单要求两段分写：31+29+8+1 继承 game-g fork 存量既往不咎口径一致；3 处 createElement 新写=duel-spike.ts:224/226/229 物理试验台脚手架与已批 game-z×4 同形同域）。createElement 写 **34** 如工单点名。game211=P3D 试验线非出口游戏；audit-ratchet 随之转绿。 · status: **done（裁 A 完毕）** · 类型: 治理缺口（红旗棘轮/硬红线）

> **本工单只登记事实，不代拍**（同 `REQ-G102-HARDLINE` 体例）。

**实测**（`node scripts/game-skill-audit.mjs game211`·2026-08-10 于 `0746cda2`·退出码 1）：

```
🔴 未覆盖红旗（判 FAIL·新游戏）: game211(裸Math.random×8, innerHTML×29, createElement×34, React屏×1)
AUDIT: FAIL   /   RATCHET: FAIL（新游戏红旗·无基线条目）
```

**归属逐条核过（与 game-g 非测试文件逐文件对数·game211 系 game-g fork）**：

| 指标 | game211 实测 | game-g 基线 | 差 | 结论 |
|---|---|---|---|---|
| 裸 Math.random | 8 | 8 | 0 | **全部继承**。分布：`game211.tsx` 166/179/188/358/536 · `game211-build.ts` 26 · `game211-save.ts` 56/58，逐行与 game-g 同名文件一致 |
| innerHTML | 29 | 29 | 0 | **全部继承** |
| React 屏 | 1 (`game211.tsx`) | 1 (`game-g.tsx`) | 0 | **全部继承** |
| document.createElement | **34** | **31** | **+3** | **31 继承（逐文件相等：clash-dice-3d 1 · coin-flip 2 · game211.tsx/game-g.tsx 24 · turn-battle-screen 4）；3 新增** |

**⚠ 那 3 处新增是本次物理原型写的**，不是存量：

```
games/game211/duel-spike.ts:224   const wrapper = document.createElement('div');
games/game211/duel-spike.ts:226   const stage   = document.createElement('div');
games/game211/duel-spike.ts:229   const uiHost  = document.createElement('div');
```

用途 = **3D 试验台的挂载脚手架**（wrapper 定位盒 / stage 收紧包 canvas / uiHost 贴角 HUD 宿主），非游戏 UI 屏。三行各自对应 `duel-spike.ts` 头注记录的一次实测事故（坑②③④：`Screen` 会盖黑 canvas · `stage` 用 `absolute;inset:0` 会塌成 0 高 · HUD 宿主铺满会吃掉点击）。

**先查结论（缺口裁决协议第①步·实查留痕）**：

* `docs/playbooks/ui.md` §禁 与 `casual-toolkit.md:62` 的 `createElement` 禁令，指向的是**游戏层手写 UI 屏**；play-field 走 render 组件 + 渲染器，**未覆盖「3D canvas 宿主怎么挂」**。
* **无基座件**：`src/ui/components` / `src/renderer` 下未检出 3D stage 挂载 helper。
* **既有先例同形**：P3D 域参考实现 `games/game-z/game-z.ts` 用的是同一模式（`document.createElement` ×4：wrapper 46 / stage 48 / hudHost 69 / menuHost 108），且**已持 Lead 批准的基线豁免**（`audit-baseline.json` → `game-z: createElement 4, approvedBy LEAD, reason 存量既往不咎·P3D 域`）。

**⚠ 对裁决的直接影响（此前口径有误·已更正）**：

交接单原写「DOM 红旗也全是 fork 来的存量」，**差 3 处**。因此「**给 game211 与 game-g 同等豁免**」若按 game-g 的字面计数写（createElement **31**），**门禁仍红**——game211 实测 34。裁 A 必须写 34，且这 3 处要单独具名批注，否则等于把 3 行新债静默混进「既往不咎」（`audit-baseline.json` `_doc` 点名过的历史事故正是此形：`PE-T 6142237d 自写 createElement:5`）。

**待裁（三选一·本工单不预设）**：

* **A｜补基线豁免**：给 game211 建条目 `nakedRandom 8 · innerHTML 29 · createElement 34 · reactScreen 1` + `approvedBy:"LEAD"` + `date` + `reason`；reason 须**两段分写**——「31 = game-g fork 存量既往不咎」+「3 = duel-spike 3D 台挂载脚手架·同 game-z 已批先例」。
* **B｜先还一部分债**：清掉 8 处裸 `Math.random` 走引擎种子 PRNG（机械活·全在局外元层：卦象/抽卡/生肖/战斗种子/UI 延时/增益洗牌/牌组 id/Boss 抽取）→ 条目降为 `nakedRandom 0`；DOM 侧仍须 A 式豁免。
* **C｜消解那 3 处**：把 3D 台挂载脚手架下沉成基座件（引擎面·会同时惠及 game-z 的 4 处），game211 DOM 计数即回落到与 game-g 完全相等。**代价**：属引擎级下沉，须升级进 `docs/workflow/requests.md` 占硬槽，且改动 P3D 域参考实现。

**红线**：`audit-baseline.json` 的豁免 **须 Lead 亲批·不得自写条目**（`_doc` 明文）。故 A/B/C 三条**都不能由施工方自行落地**。

**Lead 推荐（不下裁决）**：**A**，reason 两段分写。理由：3 处新增与 game-z 已批先例同形同域，C 的下沉代价（占引擎硬槽 + 动 P3D 参考实现）与收益（消 3 行）不成比例，属过度设计；B 可作为独立还债单择期做，不必阻塞当前门禁。

### REQ-G211-CROWDDEMO · 流场寻路 + 软分离 / ORCA 的真机 Demo 验证 · [2026-08-25] · **owner 直派**（原话「你可以先做完一个原型，然后我让 Game 211 去做一个 Demo 来验证一下我们这个事情」） · 施工主体 = **待认领（game211 线·开工第一动作把本行改成自己并推一次=锁）** · status: **open（引擎侧原型已交·等 Demo）** · P1 · 类型: 能力验证（消费引擎新能力·不写新 system）

**背景一句话**：引擎侧刚下沉了 `t2-flow-field`（流场寻路）+ 两层局部避让（软分离 / ORCA）。三档都跑通了、
测试和压测都绿，但**观感只有真机能判**——大军推进自不自然、到终点会不会摊开、有没有抖。owner 要的就是这个判断。

**你要消费的东西（全在引擎·一行 system 都不用写）**
- capability：`flowFieldCapability`（`@zerocraft/engine/skills/tier2/index.js` 导出 `t2-flow-field`）
- 组件：`FlowField`（摆一张场：`cellSize/originX/originY/cols/rows/goals[]`，可选 `blocked[]`/`cost[]` 行主序）
  + `FlowAgent`（每个单位：`fieldId/speed`，可选 `arriveRange`、`separation:{weight}`、`orca:{radius,timeHorizon?,maxNeighbors?}`）
- 定序：`flow-field` 已声明 `runsAfter:['steering','path-follow']`、`runsBefore:['motion-apply']`，你只管把 capability 装进 assembly。

**⚠ 一条必须知道的口径**：`FlowAgent` **绝对写** `Velocity`，同挂 `Steering` 时 steering 那一拍的输出（含它的 separation）
**会被整段覆盖**。所以 `rts-demo.ts` 现在那套「集结点 + `Steering{seek+separation}`」是**替换关系不是叠加关系**——
行军段换成 `FlowAgent`，别两个都挂着碰运气。索敌/接战那段仍可用 steering（不同实体或不同阶段）。

**三档配置（Demo 要能一键切·这就是验证的全部内容）**

| 档 | 怎么配 | 开销（引擎侧同机实测·ms/tick @1000/4000 单位） | 预期观感 |
|---|---|---|---|
| A 纯流场 | 只挂 `FlowAgent{fieldId,speed}` | 0.39 / 2.51 | 走位对、但会叠成一条线/一个点 |
| B ＋软分离 | 加 `separation:{weight:0.3}` | 1.01 / 4.08 | 队伍有厚度、终点摊开·允许瞬时重叠 |
| C ORCA | 把 `separation` **换成** `orca:{radius:0.5}` | 8.64 / **35.77** | 穿模压到最坏 ~10%（**不是 0**）·**4000 单位超一帧预算** |

**⚠ 「强承诺」到底强到哪（2026-08-25 再复查实测·别照旧口径宣传）**：ORCA **不是**「保证不碰」——
那句话的前提是线性规划有可行解，而迎面对撞时经常没有。同一个 5v5 对穿场景把整队起始位置扫一族：
**纯流场 0.047~0.100（直接对穿） · 软分离 0.061~0.128 · **ORCA 0.644~0.701****（半径和 0.70·中场对撞段）。
即 ORCA 把穿模从 ~90% 压到**最坏 8%**，而且最坏点在**中场对撞**、不是终点拥挤。
Demo 要的正是这个：8% 的瞬时穿模肉眼看得出来吗？看不出来 = 够用了。

**⚠ 顺便请你帮忙定一个旋钮**：`orca.timeHorizon`（缺省 8）**非单调**——同场景中场最差 H8 0.644 / H16 0.692（更好），
但终点段 H12 只有 0.318、H20 只有 0.169（H8/H16 都是 0.700）。**调它必须中场与终点一起看。**
你在真场景上试 8 和 16，把观感和 ms/tick 带回来，我按你的数定缺省。

**⚠ 四条配置坑（不看会踩·后两条是 2026-08-25 独立复查查出来的）**：① `separation` 与 `orca` **二选一**——同时填 ORCA 优先、另一个被忽略并留痕，
所以 C 档是**替换** B 档不是叠加。② **开 ORCA 就必须给 `arriveRange`**：一群单位走向同一个点时，
线性规划无可行解、只能落到「尽量少撞」的兜底，真的会压进去（引擎侧实测 5 个单位挤一点，最近两心距 0.198 而半径和 0.70）。
这不是避让算法的锅——一个点容不下五个人，得给它们一圈可以停的地方。
③ **软分离只在同一张场内生效**（按 `fieldId` 找邻居），两队各跟一张场时互相不推；ORCA 反过来是**按网格几何**
找邻居、跨场可见。要两支敌对部队互相让开 → 用 ORCA，或提工单把跨场软分离做成显式开关（别自己改引擎）。
④ **ORCA 对"没开 ORCA 的单位"没有下界**：那些单位没有半径可言（按 0 计）且不会回让，ORCA 单位只能绕它们的
**中心点**。1v1 慢速迎面实测 0.603（半径和 0.60）看着不错，但 **2v2 就 0.505、3v3 只有 0.187**，慢 ORCA 对快纯流场 0.165
——对方速度不受任何约束，谈不上保证（这句是 2026-08-25 再复查纠正的：我上一版把 1v1 那个数写成了下界）。
混装部队想要干净的不穿模 → **让双方都开 ORCA**。
所有降级都会写进 `DebugTrace`（挂上 `DebugTrace` 组件跑一遍就能看到「ORCA 降级：半径非法 N · 完全同位 N · 邻居不还礼 N」）。

**验收（owner 要看的四件·各附一张截图或一段录屏）**
1. **大军推进自不自然**——A/B 对照：B 应该看得出「队伍有宽度」而不是一条排队线。
2. **终点摊不摊开**——冲同一个 goal 的一大群，停下后是摊成一片还是叠成一个点（引擎侧已修「到点硬停」，
   到点后软分离仍在推，但真机是唯一判据）。
3. **抖不抖**——引擎侧栽过一次「被挤出到达线的单位满速冲回，队伍约 40 拍一个周期反复聚散」，已补 arrival 减速带；
   Demo 要盯的是**换成真实地形/真实单位数后还抖不抖**。
4. **凹形障碍不卡死**——摆一个开口背向目标的凹槽，单位应该绕出来（流场是 Dijkstra 铺满、没有局部极小）。

**顺带希望你带回来的数字**：你自己场景下的 ms/tick（A/B/C 三档 × 你的真实单位数），以及**你觉得手感对的
`separation.weight` 取值**。引擎侧留了两个旋钮等 Demo 反馈定档：`SEP_MAX_WEIGHT`（斥力天花板·现 0.6）
与 ORCA 的 `timeHorizon`（现 8）。**别自己去改引擎常数**——带数字回来，走引擎池 `REQ-FLOWFIELD`。

**已知未做（别当 bug 报）**：M2 视线直指（`los` 摆了不生效·会在 trace 留痕）· M3 分块增量重建（≥192×192 大图重建 13.1ms）
· M4 接 tilemap 地形代价（`cost[]` 得自己填）。硬不重叠仍归 `collision-resolve`（在 motion 之后介入）。

**背景全文**：`docs/design/game211/crowd-pathfinding-research.md`（§9 = SC2/OpenSteer 实查与我们的偏离，§10 = ORCA 落地实测与三档选型，
§10.5 = 独立复查打回的六条与修法）。复查报告 `docs/design/game211/orca-review-2026-08-25.md`。
引擎池工单 `docs/workflow/requests.md` → `REQ-FLOWFIELD`。压测可复跑：`games/game211/pathfind-scale.bench.test.ts`。

---

## 已完成

（暂无）
