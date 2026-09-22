# ORCA 硬避让 独立复查报告（2026-08-25·判 FAIL 打回·零回归声明 + 判据层）

> 复查人 = Lead 派的独立复查 agent（复查人≠施工人成立·施工方 = 主程 session）。被审提交 `2e9ea915`。
> 四步铁律全走：① 独立复跑（退出码直取·不经管道）② 撤修验红（每刀带锚点命中断言·13 刀·其中 8 刀是我自己想的）
> ③ 实证复现（每条声称的数字自己跑一遍）④ 读告警（手工装配六种真实世界打执行序看 stderr）。
> 全部验证在主仓工作树内完成，每刀跑完立刻还原并 `git diff --quiet` 核对；本文件是唯一写入。

---

## 判词：FAIL（打回·零回归声明 + 三处承重逻辑零判据）

**算法本体我没打穿，而且是这轮唯一让我意外的好消息**：`linearProgram1/2/3` 与 ORCA 半平面构造我按
RVO2 `src/Agent.cc` 逐段核对，包括最容易翻车的三处——`invTimeHorizon` 只在「未碰撞」分支参与、
碰撞分支换 `invTimeStep`；左右侧腿方向的四个符号；LP3 的 `distance` 累进与「反向平行取中点 / 否则求交点」
两分支——**逐行对得上**。我拿两把针对性的刀验证这不是我读漏了：翻转右侧腿的一个符号（S9）、
把 `1/timeHorizon` 写成 `timeHorizon`（S10），**各恰红 2 条**。邻居选取那段虽然换了实现（网格环形搜索
替掉 kd-tree），但**结果**与暴力「最近 k 个」在 **130054 次**随机试验里**逐位一致、0 处不符**（含
「全挤在一格」和「散得极开」两种退化输入）。这部分是这次交付里最扎实的一段。

打回的理由全在算法之外，且**每一条都不是读代码读出来的、全是跑出来的**：

| 提交信息/代码注释原文 | 实测 |
|---|---|
| 「不设 = **一个字节不变**」 | ❌ **假**。同几何两张场 + 纯 `separation`（全程没碰 `orca`），父提交 `80bcb6af` 与本提交轨迹 hash **不同**（`2b3faf3e…` vs `f40ff7ee…`），末拍单位 x 从 **3.357** 变 **2.088** |
| 组件契约「`timeHorizon` … **缺省 2**」 | ❌ **假**。代码 `ORCA_TIME_HORIZON = 8`。作者读到的那行错了 4 倍 |
| 「强承诺：在 `timeHorizon` 拍内**保证互不碰撞**」 | ❌ **有洞**。两个**完全同位**的 ORCA 单位 60 拍两心距恒 **0.000000**，永不分开、零留痕 |
| 用例名「**挤死时不失去速度**（LP3 兜底）」+ 注释「否则挤爆时会直接失去速度」 | ❌ **说反了**。该用例自己的场景：**带 LP3 → (0, 0)**（速度全丢）；**撤掉 LP3 → (1, 0)**。且撤掉 LP3 全绿 |
| 「撤修验红四轮各恰中」 | ✔ **四轮全部复现**（数字也对上：按场分桶 0.0999、到点硬停 0.3318）。但四刀**红的是同一条用例**，且那条用例的阈值放水 20% |

外加三处**承重逻辑零判据**（撤掉后全仓判据面——53 点名测 + bench + declaration-audit——**一律绿灯 exit 0**）：
环形搜索的提前退出（撤掉后 3.2% 的查询拿到**错误的**邻居集）、`linearProgram3` 整段、
ORCA 三档开销（撤掉提前退出 1000 单位从 6.83 → **39.26 ms/tick**，5.75× 悬崖照样绿）。

**FAIL 不是「要重做」**——移植是对的，不用动。P0/P1 六条我估都在半小时量级，补完直接 PASS。
判 FAIL 而不是 CONCERNS 的理由只有一条：**「零回归」这四个字落在 lockstep 面上**，
而这单归主程的原因栏里写的就是 lockstep。存量内容（两阵营各跟一张场 = RTS 最常见的形状）
的轨迹被静默改了，录像/存档跨版本重放会分叉。

---

## 一、独立复跑（退出码直取·不经管道）

`node scripts/scoped-gate.mjs --run` 在净工作树上判 `scope=none`（基线 = `origin/claude/mainbranch`，
改动 0 文件），所以它**证明不了 full 绿**。我按 `scoped-gate.mjs:200` 的 full 计划手工把三道逐一跑了：

| 项 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| scoped-gate | `node scripts/scoped-gate.mjs --run` | **0** | `SCOPED-GATE: NONE`（净树·无判据价值，见上） |
| tsc | `npx tsc --noEmit` | **0** | — |
| 全量 vitest | `npx vitest run` | **0** | **505 文件 / 4811 测 passed** |
| build | `npm run build` | **0** | `✓ built in 11.29s` |
| 点名测试 | `npx vitest run src/skills/tier2/orca.test.ts src/skills/tier2/flow-field.test.ts` | **0** | **53 passed**（orca 9 + flow-field 44） |
| bench | `npx vitest run games/game211/pathfind-scale.bench.test.ts` | **0** | 4 passed |

**「门禁全绿」这条属实**，53 测的构成（+9 本体 +4 集成）也属实。下面所有问题都发生在门禁之外。

---

## 二、撤修验红（13 刀·锚点命中断言 + 恰红核对）

**锚点命中判据**：替换串必须在文件里**恰好出现 1 次**（`occ !== 1` 直接 exit 3，不写盘），
替换后 `git diff --numstat` 必须非空并打印出来；每刀跑完 `mv` 还原 + `git diff --quiet` 核对。
harness 见本报告末尾「复现步骤」。

### 2.1 被审方自陈的四刀（我全部复跑）

| 刀 | 撤了什么 | 我的预测锚点 | 实际转红 | 判 |
|---|---|---|---|---|
| **S1** | `point = self.v + 0.5*u` → `1.0*u`（撤互惠各让一半） | 「两队对穿全程不重叠」 | **恰 1 条**：两队对穿（`0.5513 > 0.56` 失败） | ✔ 命中 |
| **S2** | `win = ceil(range/cellSize)` → `win = 1`（退回固定 3×3） | 同上 | **恰 1 条**：两队对穿（`0.4792 > 0.56`） | ✔ 命中 |
| **S3** | 到点分支恢复「硬停 + continue」（不再走 ORCA） | 同上 | **恰 1 条**：两队对穿（`0.3318 > 0.56`） | ✔ 命中·数字与自陈「0.33」对上 |
| **S4** | `geoKey` → `f.id`（邻居桶按场 id 分） | 同上 | **恰 1 条**：两队对穿（`0.0999 > 0.56`） | ✔ 命中·数字与自陈「0.10」对上 |

**四刀全部复现，数字也对得上——但四刀红的是同一条用例。**「ORCA 落地」这件事的全部行为判据，
实际上压在 `flow-field.test.ts` 那一条 120 拍对穿用例上。它的阈值是 `2 * R * 0.8 = 0.56`，
而**出厂实测 worst = 0.7000412865158929**（真值半径和 = 0.70，ORCA 掐着边界成立，漂亮）。
也就是说这条承重用例**放了 20% 的水**：S1 只差 **1.6%** 就会漏（0.5513 vs 0.56）。
把阈值收成 `2 * R`（0.70），四刀照样全红，余量却从 1.6% 变成 21%。

### 2.2 我自己想的九刀

| 刀 | 撤了什么 | 我的预测锚点 | 实际 | 判 |
|---|---|---|---|---|
| **S5** | 提前退出的**距离校验**（凑够 k 个就 `break`，不比第 k 近与下一环最小距离） | 应有用例红（邻居集会错） | **exit 0·53 全绿**·bench + declaration-audit 也绿 | ❌ **零覆盖** |
| **S6** | `runsAfter: ['steering','path-follow']` | 成环告警那条红 | **恰 2 条**：「零成环告警…」+「id 与系统名正确·runsBefore」 | ✔ 命中 |
| **S7** | 末尾 `sort` 的 `idx` 次键 | 全序 tie-break 应有用例红 | **exit 0·全绿**（且我实测邻居集**没变**——环里还有一处 sort 带次键） | 见 S7b |
| **S7b** | **两处** `sort` 的 `idx` 次键全撤 | 同上 | **exit 0·53 全绿**，而邻居集在精确平局下**真的变了**：`[1]` → `[2]` | ❌ **零覆盖** |
| **S8** | `if (lineFail < lines.length) linearProgram3(...)` 整句 | 「挤死时不失去速度」应红 | **exit 0·53 全绿**·bench 也绿 | ❌ **零覆盖** |
| **S9** | 右侧腿方向 y 分量的一个符号（`-rp.x*cr` → `+rp.x*cr`） | 应有用例红（移植符号错的典型形状） | **恰 2 条**：「迎面对撞会侧让」（`0 > 0.01`）+ 两队对穿（`0.0979`） | ✔ 命中 |
| **S10** | `invTimeHorizon = 1/timeHorizon` → `= timeHorizon` | 同上 | **恰 2 条**：同 S9 两条（`0 > 0.01`、`0.0717`） | ✔ 命中 |
| **S11** | 空刀（`dv` 乘 1·语义不变） | 全绿（对照组） | **exit 0·全绿** | ✔ 对照成立 |
| **S12** | `linearProgram3` 入口直接 `throw` | 若 LP3 真被走到 → 红 | **4 条红**（含两队对穿、零回归、确定性三条） | ✔ **LP3 确实被走到**（见下） |
| **S13** | 提前退出**整段**撤掉（傻扫整窗） | 若有性能判据 → 红 | **点名测试 exit 0 全绿·bench exit 0 全绿**，而 1000 单位 **6.827 → 39.264 ms/tick** | ❌ **零覆盖** |

**S12 + S8 合起来是这轮最难看的一处**：S12 证明 LP3 在 4 条用例里**真的被执行到**；
S8 证明把它整段删掉**没有任何断言察觉**。也就是说，移植里最微妙的那 26 行（投影约束集 + 反向平行取中点 +
「理论上不会发生」的浮点兜底）**跑到了、但没人验它算出了什么**。

---

## 三、实证复现（构造出来的，不是读出来的）

### 3.1 零回归——**假**（P0）

复现（父提交 = `80bcb6af`，脚本 `.review-tmp/probe7.ts`，两次运行都是干净进程）：

```
=== HEAD（2e9ea915·ORCA 落地后）===
[P11] 同几何两张场·纯 separation  hash=f40ff7ee5cdc4975  末拍=17.598022311849473,10.211259726645059;2.088232584233237,11.4
[P12] 单场·纯 separation          hash=7dac6736ab0dda1a  末拍=14.187709759380059,14.610154906019350;15.735702946712735,13.
=== 父提交 80bcb6af（ORCA 落地前）===
[P11] 同几何两张场·纯 separation  hash=2b3faf3eb202535a  末拍=17.551668402690982,10.464363301915778;3.357309742838293,10.1
[P12] 单场·纯 separation          hash=7dac6736ab0dda1a  末拍=14.187709759380059,14.610154906019350;15.735702946712735,13.
```

场景里**没有任何单位设 `orca`**。单场对照组（P12）hash 逐位相同 ✔；
**同几何两张场（P11）hash 变了**，末拍某单位 x 从 3.357 挪到 2.088。

根因：软分离的邻居桶键从 `fieldId` 换成了 `geoKey(f)`（`flow-field.ts:88`）。
这对 ORCA 是必须的（S4 证明按场分桶会对穿），但它**顺手改了软分离的语义**——
以前「只跟同一张场的人互相让」，现在「同一片网格上的人都互相让」。跨阵营互推确实更合理，
但那是**行为变更**，不是零回归；而它落在 lockstep/存档面上。

现存点名用例「**不设 orca = 一个字节不变（零回归）**」（`flow-field.test.ts:604`）**按构造抓不到**：
它只造一张场，而这条只在 ≥2 张同几何场时才现形。

**修法**：二选一——① 承认这是有意的语义扩展，把提交信息/注释里的「一个字节不变」改成
「单场不变·多场同几何时软分离改为跨场生效（有意）」，并补一条**多场**的零回归用例钉死新语义；
② 或者把桶键拆成两把：软分离仍按 `fieldId`、ORCA 按 `geoKey`（同一份 items 建两份索引，或桶里带 fieldId 过滤）。

### 3.2 完全同位的两个 ORCA 单位永不分开（P0·强承诺静默失效）

```
[P4] 完全同位两单位（半径 0.35·半径和 0.70）：60 拍后 a=(18.2028,18.2028) b=(18.2028,18.2028)
     全程最近两心距 = 0.000000（ORCA「强承诺」要求 ≥ 0.70）
[P5] 相距 1e-9 两单位：全程最近两心距 = 7.0355e-1
```

只有**精确同位**才犯：`distSq = 0 ≤ combinedRadiusSq` 进碰撞分支 → `w = relVel - invTimeStep*0 = (0,0)`
→ `wLength = 0` → `unitW = NaN` → 整条 ORCA 线是 NaN。到 `linearProgram2` 里
`det(NaN…) > 0` 恒 false（NaN 比较永远假），于是**这条约束被静默跳过**，
输出是干净的 `(1, 0)`——不出 NaN，也不避让，还不留痕。

```
[P2] 完全同位同速 → out = (1, 0)  finite=true
```

原码有同样的洞，但 RVO2 的场景是代码生成坐标；本仓是**数据驱动**，作者手写两个一样的 `Transform.x/y`
是完全正常的事（`goals`、编队模板、复制粘贴的实体表）。**修法**：碰撞分支里
`wLength <= RVO_EPSILON` 时给一个确定性的脱离方向（原码风格：拿 `relativePosition` 兜底；
真同位则用 (自己在 agents 里的下标) 派生一个固定方向，**不许用随机**），并 `appendTrace(..., 'reject', ...)` 留痕。

### 3.3 混装单位类型时强承诺静默降级（P1）

同一片网格上，左队恒开 ORCA 往右，右队按三种配置往左，量 **A×B 跨队**最近两心距（半径和 0.70）：

```
[P8] 对面是 orca       → ORCA 队 × 对方队 全程最近两心距 = 0.7232（半径和 0.70）
[P8] 对面是 separation → ORCA 队 × 对方队 全程最近两心距 = 0.3155（半径和 0.70）
[P8] 对面是 plain      → ORCA 队 × 对方队 全程最近两心距 = 0.1000（半径和 0.70）
```

两条根因，都在 `flow-field.ts` 的分桶那一段：
- 只开 `separation` 的单位进了桶，但 `d.radius[i] = fa.orca?.radius ?? 0`（`:702`）
  ⇒ ORCA 把它们当**半径为 0 的点**；而且它们自己不跑 ORCA，**互惠的另一半没人还**（穿进去 55%）。
- 两个都没开的「纯流场单位」**根本不进桶**（`:672`）⇒ ORCA 看不见它们，**直接对穿**（0.1000）。

`0.1000` 这个数正好等于被审方在坑①里引用的、他们已经修掉的那个对穿数字——同一个失效形状换了个触发条件
（从「按场分桶」换成「按单位类型分桶」）还在。而组件注释写的是「与 `separation` **二选一**」，
读起来是「每个单位各选各的」，没有任何地方说「一场里混着用会让强承诺失效」。

**修法**：桶里带一个 `hasOrca` 标记；`orcaNeighbors` 收到非 ORCA 邻居时，
要么按「对方不会让」的口径构造约束（`u` 不打对折，取全量），要么整场降级并 `reject` 留痕。
最省事的一版：文档写死「同一片网格里要么全开 ORCA、要么全不开」+ 检测到混装就每次重铺时报一条 reject。

### 3.4 LP3 的行为与它的用例名相反（P1）

同一个「四面被围」的场景（就是 `orca.test.ts:79` 那条用例自己造的那个）：

```
=== 出厂 ===
[P10] 挤死场景 out = (0.000000000000, 0.000000000000)  |v|=0.000000000000
=== 撤掉 LP3（S8）===
[P10] 挤死场景 out = (1.000000000000, 0.000000000000)  |v|=1.000000000000
```

**带 LP3 才是「失去速度」**，撤掉反而保住 (1,0)。用例名「挤死时**不**失去速度」和
`orca.ts:131` 的「RTS 里这一段必须有，否则挤爆时会直接失去速度」**两句都说反了**。
（对称围困下 LP3 解出 (0,0) 很可能就是 RVO2 的正确行为——原码要 LP3 是因为
不加的话 `result` 会停在**违反约束**的那个值上，不是因为会掉速。）
用例的断言只有 `Number.isFinite` + `|v| ≤ maxSpeed`，两条在撤掉 LP3 后照样成立 ⇒ 零覆盖。

**修法**：把断言改成「结果对每条约束的违反量 ≤ LP2 落点的违反量」（LP3 的定义就是这个），
并把用例名与 `orca.ts:131` 的注释改成原码的真实理由。

### 3.5 组件契约的缺省值写错（P1）

```
src/engine/protocol/components/spatial.ts:277
    timeHorizon?: number;    // 前瞻多少拍内保证不撞（缺省 2·越大越早让、越礼貌）
src/skills/tier2/flow-field.ts:90
export const ORCA_TIME_HORIZON = 8;
```

差 4 倍。这行是「最弱 LLM」唯一会读到的口径，而 `timeHorizon` 同时决定邻域搜索半径
（`range = horizon * speed + radius`）⇒ 作者按「2」估算出来的开销会差好几倍。
`docs/design/game211/requests.md:99` 里写的是「ORCA 的 `timeHorizon`（现 8）」——说明 8 是真值，
组件注释是过期抄写。

### 3.6 邻域半径的推导没记为偏离，且注释说「照原码」（P2）

`flow-field.ts:798` 注释：「邻域半径**照原码**：timeHorizon×maxSpeed + 自身半径」。
RVO2 里这不是推导出来的——它是 `RVOSimulator::setAgentDefaults` 的一个**独立参数** `neighborDist`
（官方 Blocks 示例给 15，而 timeHorizon 给 10、maxSpeed 给 2，三者互不相关）。
更实质的是这个推导**够不着**：相对速度最大是双方速度之和，半径要算**双方**的。

```
[P3] range=8.35（代码算法）· 实距 9.0 · 前瞻内撞上时间 4.15 拍 < 8
     该邻居若算进来 → v=(0.994290, -0.075346)；不算 → v=(1, 0)
     ⇒ 该邻居确实产生约束？ true
     ⇒ orcaNeighbors 会不会收到它？ range(8.35) > 9.0 ? false
```

即：一个「4.15 拍后就会撞上」（< 前瞻 8 拍）且**确实会产生约束**的邻居，被邻域半径挡在门外。
每拍重算所以最终还是会让开，只是让得更晚更急——但「在 timeHorizon 拍内保证不撞」这句话
按当前 `range` **不成立**。**修法**：`range = horizon * (speed + maxNeighborSpeed) + 2*radius`（保守取
`horizon * 2 * speed + 2 * radius`），或干脆把 `neighborDist` 提成显式字段（同原码），
并把文件头的偏离清单补上这一条。

### 3.7 「执行序」用例读的是注册序（P2·上一轮复查的整改项打歪了）

`flow-field.test.ts:72` 用 `(w as unknown as { systems: … }).systems.map(…)` 取「执行序」。
但 `World.addSystem` 只 `this.systems.push`（`world.ts:122-125`），排序结果放在 `this.sorted`
（`world.ts:129`，公开读法是 `getSortedSystems()`）。所以 `:73` 的
`expect(order).toEqual(['steering','path-follow','flow-field','motion-apply'])`
断的是**这个用例自己刚刚 push 的顺序**——恒真。

我手工装了六种真实世界（含注册序完全颠倒），用 `getSortedSystems()` 打真实执行序 + 收 stderr：

```
### 装配 flow+motion                  注册序 = flow-field → motion-apply
                                      执行序 = flow-field → motion-apply
### 装配 steer+flow+motion            注册序 = steering → flow-field → motion-apply
                                      执行序 = steering → flow-field → motion-apply
### 装配 flow+steer+motion(注册序颠倒)  注册序 = flow-field → steering → motion-apply
                                      执行序 = steering → flow-field → motion-apply
### 装配 全装(steer,pf,flow,motion)    注册序 = steering → path-follow → flow-field → motion-apply
                                      执行序 = steering → path-follow → flow-field → motion-apply
### 装配 全装(注册序反过来)             注册序 = motion-apply → flow-field → path-follow → steering
                                      执行序 = steering → path-follow → flow-field → motion-apply
```

**实现是对的**：六种装配执行序恒定、与注册序无关，`runsAfter`/`runsBefore` 真的生效。
用例的**另一半**（`warns.filter(定序环)` 为空）也是真判据——S6 撤掉 `runsAfter` 恰红。
坏的只是「执行序」那半条。**修法**：`w.getSortedSystems().map(s => s.id)`，
并至少加一种注册序颠倒的装配（否则断言仍是同义反复）。

### 3.8 全序 tie-break 零覆盖（P2）

`flow-field.ts:97` 注释：「平局按单位下标，保证全序、与遍历顺序无关」。撤掉两处 `sort` 的次键（S7b）：

```
[P9] 两个等距对角邻居（d²全=2）· maxNeighbors=1 → 取到下标 [1]     ← 出厂
[P9] 两个等距对角邻居（d²全=2）· maxNeighbors=1 → 取到下标 [2]     ← S7b
```

邻居集**真的变了**（选中的是另一个单位），而 **53 测 exit 0 全绿**。
这不是学术情形：精确的 `d²` 平局在**网格编队**里遍地都是，bench 自己就是
`x: (i % side) + 0.5, y: floor(i/side) % side + 0.5`（`pathfind-scale.bench.test.ts:203`）——
整齐的方阵，每个单位的四个正交邻居距离完全相等。
（注：撤掉后当前仍逐位可复现，因为 V8 的 `sort` 是稳定的、环形扫描序也固定；
所以这是「红线声明没有机器判据」，不是「现在就分叉」。但它是**移植后新加的**那段代码里唯一的确定性论断。）

### 3.9 ORCA 三档开销零判据 + 5.75× 悬崖照绿（P1）

bench 里 `[pf/flow-orca]` 那 4 行**只有 `console.info`，一条断言都没有**
（`pathfind-scale.bench.test.ts:212` 之后的 `expect(bb).toBeLessThanOrEqual(a * 8)` 断的是
`tickRows`，即**纯流场**那两行，跟 ORCA 无关）。实测：

```
S13（提前退出整段撤掉·= 提交信息说的「傻扫整窗」那一版）
[pf/flow-orca] 1000 单位 / 前瞻 8 拍 · 最多 8 邻居 → 39.264ms/tick   （出厂 6.827）
               4000 单位 / 前瞻 8 拍 · 最多 8 邻居 → 179.840ms/tick  （出厂 32.700）
点名测试 exit=0（53 全绿）· bench exit=0
```

**5.75× 的性能悬崖穿过全部判据面，退出码一路 0。** 这与上一轮复查的 P1 是同一个形状，
换了个位置又长出来一次。**修法**：给 ORCA 那两行加形状判据——最省事的是量
「每单位摊到的**格访问次数**」（给 `orcaNeighbors` 加一个只测试可见的计数器，同 `flowFieldBakes()` 的档），
断言「前瞻 8 拍时每单位访问格数 ≤ 常数（比如 30）」；撤掉提前退出立刻变 361。

---

## 四、确定性 / lockstep 逐条（这单归主程的原因栏）

| 查项 | 结论 | 证据 |
|---|---|---|
| `Math.random` / 墙钟 | ✔ 零 | `grep -n "Math.random\|Date.now\|performance.now\|new Date" orca.ts flow-field.ts` 只命中注释行 `flow-field.ts:27`；`orca.test.ts:96` 有源码级点名测试 |
| 模块级可变状态 | ✔ `orca.ts` 零（只有 `RVO_EPSILON` 常量）；`flow-field.ts` 的 bake 缓存不是本单引入 | — |
| Map/Set 迭代序依赖 | ✔ 无。`agents` 按实体 id 排序（`:607`），`fields` 按实体 id 排序后收拢（`:616`），`geoField`/`counts`/`density` 的键是几何签名、代表张的选取不影响任何输出（键已含全部几何字段） | 读码 + 下面的逐位重跑 |
| 邻居 tie-break 全序 | ⚠ 写了 `(d², idx)` 二元组、**是**全序，但**零判据**（见 3.8） | S7b |
| 同输入两次逐位同输出 | ✔ | `[P7] 逐位重跑：h1===h2(不清缓存) true · h1===h3(清了缓存) true`（50 拍 × 8 单位 × 17 位小数） |
| 跨世界污染 | ✔ 未见。同进程连跑两个世界、不清缓存与清缓存 hash 相同；跨进程（父提交那一轮）单场对照组 hash 也逐位相同 | 同上 + `[P12]` |
| 自身速度 vs 邻居速度的时相 | ✔ 一致。邻居速度取 tick 开头的快照（`:700`），自身 `v.vx/vy` 在本 system 写它之前读 ⇒ 两边都是上一拍的值，与原码「先全算再全提交」同形 | 读码 + 逐位重跑佐证 |
| 浮点 tie-break | ✔ LP 里的比较全部照抄原码（`> 0`、`<= RVO_EPSILON`、`>= 0`），没有引入新的浮点判别 | 逐段核对 |
| **存量内容的轨迹** | ❌ **变了**（3.1） | P11 hash 分叉 |

---

## 五、移植保真度（逐段核对 `Agent.cc`）

对上的（我按原码逐段核，并用刀验证「不是我读漏了」）：

- `computeNewVelocity` 的智能体半段：`relativePosition`/`relativeVelocity` 的**方向**（前者 other−self、后者 self−other）✔
- 未碰撞分支：`w = relVel − invTimeHorizon·relPos`；截止圆判据 `dotProduct < 0 && dotProduct² > cr²·|w|²`；
  `direction = (unitW.y, −unitW.x)`；`u = (cr·invTimeHorizon − |w|)·unitW` ✔
- 侧腿分支：`leg = sqrt(distSq − cr²)`，左腿 `(rp.x·leg − rp.y·cr, rp.x·cr + rp.y·leg)/distSq`、
  右腿 `−(rp.x·leg + rp.y·cr, −rp.x·cr + rp.y·leg)/distSq`，`u = (relVel·dir)·dir − relVel` ✔（S9 恰红）
- 碰撞分支换 `invTimeStep`、其余同截止圆 ✔（S10 恰红，因为它把两个分支的时间尺度都改了）
- `line.point = velocity + 0.5·u` ✔（S1 恰红）
- `linearProgram1`：判别式、`tLeft/tRight` 夹逼、平行分支 `numerator < 0 → false`、
  `denominator >= 0 → tRight = min` / `else tLeft = max`、`directionOpt` 取端点 vs 取最近点 ✔
- `linearProgram2`：三分支起手（方向优化 / 超速归一 / 圆内原样）、`det(dir, point − result) > 0` 触发重解、
  失败时回滚 `tempResult` 并返回 `i` ✔
- `linearProgram3`：`distance` 累进、`projLines` 从 `numObstLines` 起、平行同向 `continue` /
  反向取中点、否则求交点、`direction = normalize(lines[j].dir − lines[i].dir)`、
  以 `(−dir.y, dir.x)` 作方向优化、`< projLines.size()` 时回滚 ✔（S12 证明它真被走到）
- `orcaVelocity` 尾部 `lineFail < lines.length → linearProgram3(lines, 0, lineFail, …)` ✔

文件头四条偏离**与实际代码一致**（①无障碍半平面：`numObstLines = 0` ✔；②无 kd-tree 用网格分桶
但保留「按 d² 升序取最近 k 个」语义 ✔ **且我用 130054 次暴力对照证明了它真等价**；
③ float32→float64 ✔；④ 类拆纯函数 ✔）。

**没记录的偏离两条**：
- `range`（邻域半径）由 `timeHorizon×speed + radius` 推导，原码是独立参数 `neighborDist`（见 3.6）。
- `timeStep` 硬写死 1（`flow-field.ts:806`）。代码行内有注释，但**没进文件头的偏离清单**——
  原码里它是 `sim_->timeStep_`，直接决定碰撞分支的脱离速度量级。

---

## 六、许可证 / 归属（P2·合规）

- ✔ 版权行、SPDX 标识、原作者、原始出处、Apache-2.0 §4(b) 要求的「本文件是修改过的版本」声明**齐全**，
  且有点名测试（`orca.test.ts:103`）守着这三个字符串。
- ❌ **Apache-2.0 §4(a)「必须把 License 的副本给到 Work / 衍生作品的接收者」没满足**：
  `grep -rln "SPDX-License-Identifier" src/ tools/ scripts/` 全仓**只有 `orca.ts` 与 `orca.test.ts` 两个文件**；
  仓里没有 Apache-2.0 的正文、没有 `NOTICE`、没有第三方代码台账（`assets/index.json` 那套 `license` 字段
  只覆盖美术资产，代码不在其中）。而本仓的产物是要经 `electron-builder` / `steam-publisher` 分发的。
- **修法**（十分钟）：加 `licenses/RVO2-Apache-2.0.txt`（原文全文）+ 一个 `THIRD-PARTY-NOTICES.md`
  列「RVO2 · Apache-2.0 · 用在 `src/skills/tier2/orca.ts`」，在 `orca.ts` 文件头指过去，
  并把它纳入打包产物；顺手把 `orca.test.ts` 那条用例扩成「许可证正文文件存在且非空」。

---

## 七、性能数字复现（同机·我自己跑的）

| 项 | 提交信息/调研 §10 | 我复跑 | 判 |
|---|---|---|---|
| 纯流场 1000 / 4000 | 0.51 / 2.04 ms | **0.892 / 3.277** | ⚠ 我这边慢 1.6~1.7×（机器噪声量级，但见下） |
| 软分离 1000 / 4000 | 1.41 / 5.54 | **1.551 / 6.842** | ✔ 同量级 |
| **ORCA**（前瞻 8·8 邻居）1000 / 4000 | **6.98 / 32.80** | **6.827 / 32.700** | ✔ **几乎逐位对上** |
| ORCA（前瞻 4·5 邻居）1000 / 4000 | 6.36 / 28.37 | 6.143 / 30.821 | ✔ 同量级 |
| 「傻扫整窗」1000 单位 | 36.8 ms | **39.264** | ✔ 复现 |
| 「傻扫整窗」4000 单位 | 189 ms | **179.840** | ✔ 复现 |
| 「提前退出快 5 倍」 | 36.8 → 7.0（5.3×） | 39.264 → 6.827（**5.75×**） | ✔ 复现（甚至更好） |
| 「降前瞻/邻居数只省一成」 | ~10% | 6.827→6.143（**10.0%**）、32.700→30.821（**5.7%**） | ✔ 1000 单位对上·4000 单位只省 5.7% |

**数字本身诚实，头号数字（ORCA 三档 + 5 倍提速）复现得非常准。**两条口径话：

- 「强承诺**约付 10 倍**」是拿 6.98/0.51 = 13.7 算的；按我复跑的同机数据是 6.827/0.892 = **7.7 倍**。
  比值取决于基线那一档的抖动（基线越快倍数越大），报「7~14 倍」比报「10 倍」诚实。
- 三档表被 `docs/design/game211/requests.md:82` 原样引给 game211 当选型依据。既然 ORCA 那档能复现到
  ±2%、基线那档能差 70%，**建议在表里注明「基线档抖动大·倍数仅供量级参考」**，别让下游按 13.7 倍去做预算。

---

## 八、读告警（绿灯 ≠ 没话说）

- 全量 4811 测的 stderr 里 `定序环` 出现 **0 次**（`grep -c '定序环' full.log` → `0`）；
  `topological-sort` 只在它自己的测试文件名里出现一次。
- 我**手工装配**六种真实世界（3.7 那张表）打执行序 + 收 stderr：**六种全部零告警**，
  执行序恒定且与注册序无关。**上一轮复查的 P1（新增定序环）确认已修好，`runsAfter` 真的在起作用**（S6 恰红）。
- 除此之外全量日志里没有其它被吞掉的 WARN（`grep -in warn` 只剩 vite 的 chunk 体积提示）。

**这一步这次是干净的。** 但 3.7 说明「有个用例守着」和「那个用例真的在守」是两回事——
守成环的那半条是真的，守执行序的那半条是同义反复。

---

## 九、问题清单

### P0（必修·lockstep / 强承诺红线）

1. **「不设 = 一个字节不变」为假** —— 邻居桶键从 `fieldId` 换成 `geoKey`（`flow-field.ts:88`）顺手改了
   **软分离**的语义。同几何两张场 + 纯 `separation` 的轨迹 hash 在父提交与本提交之间分叉
   （`2b3faf3e…` → `f40ff7ee…`，末拍 x 3.357 → 2.088）。存量录像/存档跨版本重放会分叉。
   现存「零回归」用例是单场，按构造抓不到。修法见 3.1，**并补一条多场用例**。
2. **完全同位的两个 ORCA 单位永不分开** —— 碰撞分支 `wLength = 0` ⇒ 整条 ORCA 线 NaN ⇒
   `det(NaN) > 0` 恒 false ⇒ 约束被静默丢弃。实测 60 拍两心距恒 `0.000000`，无 NaN、无留痕。
   数据驱动仓里「两个单位写同一个坐标」是日常输入。修法见 3.2（确定性脱离方向 + `reject` 留痕）。

### P1（必修）

3. **混装单位类型时强承诺静默失效** —— ORCA 队 × 纯 `separation` 队 = **0.3155**；
   × 纯流场队 = **0.1000**（半径和 0.70）。根因：非 ORCA 邻居的 `radius` 填 0（`:702`）且不还互惠，
   纯流场单位干脆不进桶（`:672`）。组件注释的「二选一」读起来像是每单位自由选。修法见 3.3。
4. **组件契约把 `timeHorizon` 缺省值写成 2，实际是 8**（`spatial.ts:277` vs `flow-field.ts:90`）。
   这行是作者唯一读得到的口径，且 `timeHorizon` 同时决定邻域半径 ⇒ 开销估算会差数倍。
5. **`linearProgram3` 零断言覆盖，且用例名与实测相反** —— S12 证明它被 4 条用例走到；
   S8 证明整段删掉全绿。实测该场景带 LP3 = `(0,0)`、撤掉 = `(1,0)`，
   而用例名叫「挤死时**不**失去速度」、`orca.ts:131` 注释同样说反。修法见 3.4。
6. **环形搜索提前退出的正确性零覆盖** —— S5（凑够 k 个就 break、不做距离校验）让
   **4221 / 130054 = 3.2%** 的查询拿到错误邻居集，而 53 测 + bench + declaration-audit **全绿 exit 0**。
   补一条「随机撒点 → 环形搜索结果 == 暴力最近 k 个」的对照用例（我的 probe 可以直接改成用例）。
7. **ORCA 三档开销零判据** —— bench 的 `[pf/flow-orca]` 四行只有 `console.info`，
   唯一的数值断言 `bb ≤ a*8` 断的是纯流场那两行。S13 造出 **5.75×** 悬崖（6.827 → 39.264 ms/tick）
   全绿穿过。修法见 3.9（量每单位格访问次数，别量墙钟）。

### P2（应修·可与上面同批）

8. **承重用例阈值放水 20%** —— `expect(worst).toBeGreaterThan(2 * R * 0.8)`（0.56），
   而出厂实测 `worst = 0.7000412865158929`（真值 0.70）。S1 只差 1.6% 就会漏。
   收成 `2 * R` 四刀照样全红、余量从 1.6% 变 21%。另外：ORCA 的全部行为判据都压在这**一条**用例上，
   建议至少把「两队对穿」「一队追一队」「密集方阵原地疏散」拆成三条。
9. **「执行序」用例读的是注册序** —— `flow-field.test.ts:72` 读 `w.systems`（`world.ts:122` 只 push），
   应读 `w.getSortedSystems()`（`world.ts:129/172`），并加一种注册序颠倒的装配。
   守成环的那半条是真判据（S6 恰红），只有这半条是同义反复。
10. **全序 tie-break 零覆盖** —— S7b 撤掉两处 `sort` 次键，邻居集在精确平局下真的变了（`[1]` → `[2]`），
    53 测全绿。网格编队（bench 自己就是方阵）天天出精确平局。要么补用例，要么在注释里写明「当前不承重」。
11. **两条未记录的偏离** —— ① 邻域半径由 `timeHorizon×speed + radius` 推导（原码是独立参数 `neighborDist`），
    注释却写「照原码」；且该推导**够不着**：实测距离 9.0、4.15 拍后必撞（< 前瞻 8）的邻居被排除在外，
    而它确实产生约束（`(1,0)` → `(0.994290, −0.075346)`）。② `timeStep` 硬写死 1，行内有注释但没进文件头偏离清单。
12. **Apache-2.0 §4(a) 未满足** —— 全仓无 License 正文、无 NOTICE、无第三方代码台账（见第六节）。
    产物走 Electron/Steam 分发。修法十分钟。
13. **`orca.radius` 无校验** —— 负数 / 0 都能一路走进 `sqrt(distSq − cr²)`。至少给一条 `reject` 留痕。

---

## 十、流程账

- **归属判对了**：新增跨系统共享面（邻居索引）+ 确定性 + lockstep + 定序，🔴 归主程无误。
  P0-1（零回归假）恰好就是「不在 spec、也不在 review 清单里，动手才撞出来」的那一类——
  它藏在一个**为了修 ORCA 而顺手改的软分离桶键**里。
- **被审方的四轮验红全部属实**，两个引用的数字（0.10 / 0.33）我复跑到小数点后两位对上。
  但**四刀红在同一条用例上**，且那条用例阈值放水 20% —— 四条独立的语义压在一条判据上，
  下次谁动了那条用例的阈值，四条一起失守。
- **上一轮复查的整改成效**：定序环真修好了（S6 恰红 + 六种手工装配零告警），
  trace 密度问题也修了（`los` 改成只在重铺那拍报）；但整改用例的「执行序」那半条打歪了（读错数组）。
  **整改要连着「整改本身的判据」一起复查**，这是这轮学到的新形状。
- **本轮 13 条问题里，门禁能发现的是 0 条。** 三处零覆盖（S5 / S8 / S13）我都把判据面拉到最宽
  （点名测试 + bench + declaration-audit）复跑确认全绿 exit 0。
- 本轮所有改动跑完立刻还原，每刀后 `git diff --quiet` 核对；主仓除本文件外零改动。

---

## 复现步骤（全部可重跑）

```sh
# ① 门禁（净树上 scoped-gate 判 none，所以按 full 计划手工跑三道）
node scripts/scoped-gate.mjs --run ; echo $?
npx tsc --noEmit ; echo $?
npx vitest run ; echo $?
npm run build ; echo $?
npx vitest run src/skills/tier2/orca.test.ts src/skills/tier2/flow-field.test.ts ; echo $?

# ② 撤修验红 harness（锚点命中断言：替换串必须恰好出现 1 次，否则 exit 3 不写盘）
#    .review-tmp/sabotage.mjs <刀号>  → 改文件并打印 numstat
#    .review-tmp/run-cut.sh   <刀号>  → 改 + 跑点名测试 + 还原 + git diff --quiet 核对
#    刀号 S1..S13 的定义见本报告 §2 表格（每刀的 from/to 串写死在 sabotage.mjs 里）

# ③ 实证复现（探针脚本，vite-node 直跑，不落进 src/）
npx vite-node .review-tmp/probe1.ts   # 环形搜索 vs 暴力最近k（130054 次）· 同位 NaN · 邻域半径够不够
npx vite-node .review-tmp/probe2.ts   # 完全同位 / 1e-9 同位 / 逐位重跑 / 跨世界污染
npx vite-node .review-tmp/probe3.ts   # 混装单位类型时的强承诺（orca / separation / plain 三档）
npx vite-node .review-tmp/probe4.ts   # 六种真实装配打执行序 + 收 stderr 成环告警
npx vite-node .review-tmp/probe6.ts   # 挤死场景 LP3 开/关的输出
npx vite-node .review-tmp/probe7.ts   # 零回归：与父提交 80bcb6af 对拍（同几何两张场 vs 单场）

# ④ 性能
npx vitest run games/game211/pathfind-scale.bench.test.ts

# ⑤ 读告警
grep -c '定序环' <全量 vitest 日志>    # → 0
```

> 探针脚本写在 `.review-tmp/`（未入库·复查完即删）。要重跑的话按上面各节贴出的场景描述重建即可——
> 每个探针的构造都在正文里写全了（坐标、半径、拍数、阈值），不依赖那几个文件。
