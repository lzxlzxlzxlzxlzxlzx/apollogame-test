# 3D 渲染线 · 需求 / 工单池（owner 2026-06-28 立独立池）

> **这是什么**：ZeroCraft「3D 盒庭」渲染线 + Game Z 的**需求 / 工单单一真相**（从主 `requests.md` 分出·避免 3D 条目淹没在通用 UI/游戏需求里）。
> **归属**：3D 渲染线由 **P3D** 主管（代码边界契约见 `docs/workflow/finish/P3D-game-z-handoff.md §0.1`）。本池由 owner/主程 派单、P3D 执行、Lead 评审标状态。
> **新 3D 需求都进这里**（不进 `requests.md`）；通用 UI 库 / 其它游戏需求仍进 `requests.md`。

---

## REQ-3D-POLY-DIE · 通用多面骰（d4 / d6 / d8 / d20）几何、面标签与目标面落定 · [2026-09-21] · owner 选择路线 A · **施工主体 = P3D（待认领）** · status: accepted · P1 · 类型: 3D render-only 能力

**问题**：`Mesh3D.shape` 当前只含 box/plane/sphere/cylinder/cone/capsule/torus。`RigidBody3D{shape:'convex', hull}` 已可模拟凸包碰撞，却没有与之对应的可渲染多面几何、各面标签或「把确定结果展示为朝上面」的闭集数据接口。游戏层手写 Three.js 或从物理姿态反推点数均违反 3D/确定性边界。

**裁决（owner A）**：下沉 `PolyDie3D{kind:'d4'|'d6'|'d8'|'d20', faces?, targetValue?, skin?, settle?}`。它只属 render-only：`targetValue` 决定结尾可见的朝上面，物理只负责中段演出，不回流 sim。与 `RigidBody3D{shape:'convex',hull}` 和 `Impulse3D` 组合；默认几何与凸包、每个合法面的默认标签、目标面朝上旋转全部在渲染器固定解释。d6 必须兼容既有 `Mesh3D.dieFaces`；透明 canvas 和无 WebGL 回退同现有 3D 口径。

**验收**：① d4/d6/d8/d20 均能渲染、可落地且目标面读数正确；② 相同 targetValue 在不同帧率下视觉最终面一致；③ 模拟物理结果不会改写权威骰值；④ 无 WebGL 降级为可访问的 2D 标签，仍能完成会话；⑤ `game-dice` 与另一消费样例共享该能力。

**影响**：阻塞 game-dice S2-S6；不改游戏层 ThreeRenderer。

## REQ-3D-TESTGAPS · P3D 测试面五项（测试大扫除 F 路评审转单） · [2026-08-22] · Lead 立 → **P3D** · status: open · 优先级: P2 · 类型: 测试护栏/治理
> ① **dispose 面零覆盖**：移除测试只验场景图摘除，无一 spy geometry/material/texture.dispose()——trail:54、billboard:53、uv-anim:52、reflector:68（还持 render target）；vfx.test 无任何清理用例（vfx.ts 5 处 dispose）；models.test 仅 2 例、ModelPool 全无。长局泄漏面与 RENDERHYG 同族。② **melee 物理写回闸口无 hash 流断言**：game211 melee-demo.ts:279「读牌面→判生死→写回战役状态」是 cannon-es 非确定面进 sim 的唯一闸口，补「三跑逐拍 hash 相同」隔离（先例 game108.test.ts:1405）。③ slg-scale.bench.test.ts 墙钟绝对阈值跑在常规 vitest——CI 负载波动假红，隔离 bench 档或去绝对阈值。④ turn-combat.test.ts:66「swapsUsed 重置」断言套在 if 内可静默跳过——前置断真后无条件 expect。⑤ **game211↔game-g fork 重复面登记**：22/40 测试文件与 game-g 逐字节同（其中 clash-resolve/disha/level/sfx 连源文件也同）——双份漂移风险；game-g 战斗线已废（owner 2026-08-22），P3D 裁哪份是权威、另份清或登记 fork 基线。

## REQ-3D-RB-MATERIAL · `RigidBody3D.restitution` / `.friction` 声明了但 `spawn()` 从不读 —— 全库游戏的每张「弹性/摩擦」旋钮都是死的 · [2026-08-10] · PE-211 提（game211 大样本物理验证时撞出）→ **P3D** · status: open · 优先级: **P2（不吃表现·但会持续制造错误归因·见下方实测）** · 类型: 3D 线契约缺口（契约声明 ≠ 实现）

> **实证（实查·非印象）**：
> - `src/engine/protocol/components/render.ts:221-222` 明文声明并写了缺省值：`restitution?: number; // 弹性 0..1·缺省 0.3` / `friction?: number; // 摩擦·缺省 0.4`。
> - `src/renderer/three/physics.ts` 的 `spawn()`（194-227 行）读了 `shape/heights/elementSize/hull/mass/vx..vz/avx..avz/angularFactor`，**唯独没有 `rb.restitution` / `rb.friction`**。全库 `grep -rn restitution src/` 只有 182-183 行的 `cw.defaultContactMaterial`（世界级·来自 `PhysicsWorld3D`）。**没有任何 per-body `CANNON.Material` / `ContactMaterial` 通路。**
> - 后果：游戏在牌/骰/筹码上写的每一个 `restitution`/`friction` 都是**静默 no-op**——不报错、不告警、TS 还照收（契约里有）。这正是 CLAUDE.md 日志基准守则点名的「什么都没发生」那类分支形状。
>
> **实测这个缺口目前吃掉了多少表现**（`scripts/game211-throw-lab.mjs --per-body`·8000 张牌对照）：把 game211 牌上声明的 `0.34/0.45` 真接成 cannon `ContactMaterial` 后 —— 正面率 50.63% vs 50.50%、未躺平 0.95% vs 0.92%（z=1.3·**p≈0.19 不显著**）。**即：现在补上不会改变已有表现**，所以这是契约/可信度缺陷，不是性能事故，不必急着热修。
>
> **但它已经在造成实害**：`games/game211/design/HANDOFF-duel-physics.md` §5 曾把两条「实测调参结论」（`restitution 0.5+ → 弹回原处`、`friction 0.72 → 未躺平 3/40→8/40`）归因到这两个死旋钮上。旋钮根本没接线，那些观察只能是小样本噪声。**旋钮是死的，但基于它写下的经验会被后人当真去遵守。** 已在该文档标红更正。
>
> **两条路（Lead 给推荐·不下裁决·owner/P3D 判）**：
> - **A｜接线**：`spawn()` 里按 `(restitution, friction)` 做 `CANNON.Material` 缓存池 + 惰性 `addContactMaterial`（键 = 数对，避免 N² 组合爆炸）。代价：P3D 域改动，需回归掷骰/叠叠乐/筹码三处已调好的手感（世界级值不变 ⇒ 未声明 per-body 的实体行为逐位不变，回归面可控）。收益：契约兑现，游戏侧调参从此可信。
> - **B｜删字段**：从 `RigidBody3D` 契约里删掉这两个字段，游戏一律走 `PhysicsWorld3D` 世界级档。代价：game211 等已写了这两个字段的游戏要清（TS 会报错，找得全）；失去 per-body 差异化能力（同场「弹的骰子 + 不弹的牌」表达不了）。收益：契约与实现一致，零歧义。
>
> **Lead 推荐 A**——已经有 `angularFactor` 这种 per-body 物理旋钮的先例，且「同场不同材质」是真实需求（牌不弹 / 骰子弹）；B 会把能力削掉去迁就实现。但**不阻塞**：实测证明现状不吃表现，可排期做。
>
> **同族**：`REQ-3D-CARD-FACE-AXIS` 的「顺手记的 3 处口径」里已有一条同形的 —— `spawn()` 不读 `Transform3D.quat`。建议一并处理（都是 spawn() 漏读契约字段）。

---

## REQ-3D-LOCAL-SHADOW · 局部光阴影（point/spot 投影·castShadow 现支持局部光）· [2026-08-10] · owner 从现代渲染路线图圈定「做局部光阴影」→ P3D · status: **✅ done（P3D 2026-08-10·已推·见回执）** · 优先级: P2（owner 明示·局部光落地质感） · 类型: 渲染能力补全（局部光阴影·render-only）
> **★ P3D 回执（2026-08-10·point/spot castShadow·复用现有阴影门）**：`Light3D.castShadow` 原只作用主平行光（point/spot 注明「v1 不投影」）→ 现让 **point/spot 也投影**（three PointLight=立方 6 面阴影·SpotLight=单张透视阴影）。`LightRig` 点光分支：`castShadow` 且**投影预算内**（`MAX_SHADOW_LOCAL=2`·point 立方 6× 贵故单列限量）→ 开 `l.castShadow` + 配阴影相机（near 0.5·far=range·bias -0.0006·mapSize 1024）；掉出预算/关 castShadow → `killLocalShadow` 回收 cube/spot 阴影贴图（防显存泄漏·RENDERHYG 纪律）。**动态局部光预算 `MAX_DYNAMIC` 2→4**（随投影上线放宽·现代 GPU 无压力）。**脏帧复用现成阴影门**：局部光位姿本就在 `lightSig` → 灯/投影体移动 → `shadowSig` 变 → `shadowMap.needsUpdate`（W1-C·相机/云飘不触发）。投影贴图边长 1024（比主平行光 2048 小·省 cube 6 面）。测试 `lights.test` +2 例（spot castShadow 开→灯投影·shadow 远面=range·关→回收；投影预算 3 盏只前 2 投影）+ 更新 cap 测试（2→4）。真浏览器目击 game-z Platform Two `p2-spot`（聚光灯从上照三彩柱 → 地面亮池 + 柱影·`local-shadow.png`·render-probe 零 console error）。tsc0/vitest/build0/manifest（Light3D 无新字段·castShadow 已有）。**路线图后手待拉动**：体积雾 + 神光。

## REQ-3D-PLANAR-REFLECT · 平面反射镜面（Reflector3D·镜面地板/水面/冰面）· [2026-08-10] · owner 从现代渲染路线图圈定「做平面反射」→ P3D · status: **✅ done（P3D 2026-08-10·已推·见回执）** · 优先级: P2（owner 明示·华丽反射·casino 镜面大堂/水面） · 类型: 渲染能力补全（平面反射·render-only·新组件）
> **★ P3D 回执（2026-08-10·three.Reflector RTT·比 SSR 干净）**：新增 **`Reflector3D`** 组件（render-only·NON_DETERMINISTIC·进 component-map 蓝图闭集·manifest 144→145）——挂 `Reflector3D{width,height,color?,opacity?,orientation?,quality?}` + `Transform3D` 即成镜面平面（不需 Mesh3D）。渲染器 `ReflectorSystem`（`three/reflector.ts`·同 Vfx/Dissolve 等 render 子系统先例）每帧建/更新/移除 three.Reflector：每帧把场景从**镜像相机**渲进一张 RTT → 平面照出**真倒影**（无 SSR 屏幕空间噪声/掠射漏光）。`floor`=水平镜（缺省·翻 -90°X·法线+Y）·`wall`=竖直镜。**`opacity<1`**：patch three.Reflector 片元把硬 alpha=1 换成 `uReflOpacity` uniform → 倒影混下方底色＝半反射湿地板。脏帧：镜面不自播（反射随场景/相机变→那些变化本就脏 renderSig）·`contentSig` 让加/删/移/改参数也脏帧。RTT 随实体删除 `dispose`（防显存泄漏·RENDERHYG 纪律）。测试 `reflector.test` 7 例（建/摆位·floor/wall 朝向·color uniform·opacity 片元 patch·纯镜不 patch·删除移除·contentSig）。真浏览器目击 game-z Platform Three `p3-refl`（镜面地板 + 上方红清漆球/青自发光珠/金环三物 → 镜中真倒影·`planar-reflect.png`·render-probe 零 console error=RTT+shader 编译无误）。tsc0/vitest/build0/manifest（+1 组件·已 --update）。**路线图后手待拉动**：局部光阴影、体积雾 + 神光。
> **★ 增补（2026-09-14·运行效率评审·owner 令修）**：three.Reflector 不自剔除 RTT——只要主场景渲染就触发 onBeforeRender 把**整场景**渲进 RTT，故常驻蓝图的镜面即使**看不见也每个非跳渲帧白付一次全场景渲染**（game-z 竞技场每帧 2× 场景渲染为一块 Platform Three 看不见的镜子）。修：`ReflectorSystem.cull(camera)`（相机定位后·主渲染前调）按**视锥相交**（PlaneGeometry 包围球·保守留边）gate `mesh.visible`——不在视锥 → `visible=false` → onBeforeRender 不触发 → **零 RTT 成本**。真机目击：竞技场（镜在 −190 看不见）render-probe 零 error·剔除生效；Platform Three（镜在视锥）倒影照常显（`refl-cull.png`·未误剔）。测试 `reflector.test` +2 例（视锥内可见/相机后方剔除·空集早退）。tsc0/vitest/build0。

## REQ-3D-PBR-LOBES · 进阶物理材质波瓣（clearcoat/sheen/iridescence/anisotropy）· [2026-08-09] · owner 从 P3D「现代渲染路线图」圈定「先做 PBR·成本极低」→ P3D · status: **✅ done（P3D 2026-08-09·已推·见回执）** · 优先级: P2（owner 明示·华丽材质·casino 系受益） · 类型: 渲染能力补全（PBR 波瓣·render-only）
> **★ P3D 回执（2026-08-09·three-native 波瓣·纯数据 plumb）**：`Material3D` + PBR 预设加四组进阶波瓣——**clearcoat**(车漆/糖衣/上釉·清漆镜面层) + **sheen**(天鹅绒/绸缎·边缘绒光) + **iridescence**(肥皂泡/珠光/油膜·薄膜干涉随视角变彩) + **anisotropy**(拉丝金属/唱片·高光拉长)。全 three 原生：任一波瓣在场 → `buildPbrMaterial` 从 MeshStandard 升 **MeshPhysicalMaterial**（`hasPbrLobes` 判）并把参数落到对应通道（iridescence 厚度映射 `[100,厚度nm]`）。数据两层：**PBR 预设**加现成 `carpaint/pearl/soap/velvet/brushed`（华丽起手直接选）+ **Material3D per-object 覆盖**（同 color/roughness 覆盖语义·`resolvePbr` 合并·覆盖赢预设）。`pbrSig` 纳入波瓣（变则重建·不同波瓣不误并批）；**不透明波瓣仍可实例化**（只透射/软混合走单 mesh·soap 带透射除外）。需 `Sky3D.env` IBL 环境才显反射/彩虹。测试 `material.test` +4 例（升 MeshPhysical·参数落位·预设带出·覆盖赢+sig）。真浏览器目击 game-z 材质陈列台（车漆/珠光/肥皂泡/天鹅绒/拉丝五球·`pbr-lobes.png`·IBL 下渲染正确零 console error）。tsc0/vitest/build0/manifest（Material3D 加可选字段·无新组件）。**后续路线图待拉动**：平面反射 + 局部光阴影、体积雾 + 神光（owner 排后手）。

---

## REQ-3D-CARD-FACE-AXIS · 薄牌类刚体：正反分色的面与可靠碰撞体**轴向不兼容**（现二者不可兼得）· [2026-08-07] · PE-211 提（game211 物理对决试验台·owner 判「补引擎缺口」）→ P3D · status: **✅ done（P3D 2026-08-09 取 A=`Mesh3D.faceAxis`；PE-211 2026-08-09 消费验收通过 → 见下方验收回执）；顺手记的 3 处口径仍 open** · 优先级: **P2（game211 表现竖切阻塞：牌落地恒倾斜 ~55°、正反读不准；游戏侧已穷举参数无解）** · 类型: 3D 线能力缺口（网格面色轴向 / 刚体形状轴向）
> **★ P3D 回执（2026-08-09·取 A=`Mesh3D.faceAxis`·纯 render 改·不碰物理/确定性）**：诊断确认（复跑 PE-211 实证）——`box` 正反色恒作用 ±Z、`cylinder` 刚体轴恒 Y·差 90°，且薄凸包必 ~55° 恒斜（cannon 接触伪影）。**A 解**：`Mesh3D.faceAxis?:'x'|'y'|'z'`（缺省 'z'=零回归）让 `frontTint/backTint` 落**指定轴两面**、`edgeTint` 落其余四面 → 牌**沿 Y 薄**（`faceAxis:'y'`·顶=正/底=反色）天然躺平·碰撞体用**引擎原生 `cylinder`**（轴 Y 圆盘·已验证可靠·零 55° 伪影）。实现：`geometry.ts faceAxisSlots`（**单一真相**·面序 [+x,-x,+y,-y,+z,-z]）+ 派生 `faceAxisOrder`，两条 box 上色路（`buildMesh3D` 材质数组 + `buildInstancedMesh3DGeometry` 逐面色烤入）+ `paintMesh3D`（每帧材质设色）**全用同一 slots**（防三处映射漂移）。测试 `face-axis.test` 6 例（slots/order 映射·烤入色落对面·材质槽落对实例）。真浏览器目击 game-z Platform Four `p4-card-*`（三张薄牌抛落**恒躺平**·`card-face-axis.png`：轻旋→正面红朝上·翻滚→反面灰朝上·顶底分色清晰）。tsc0/vitest/build0/manifest（Mesh3D 加可选字段·无新组件）。**通用**：卡牌/瓷砖/硬币/招牌薄片类共用。
> **顺手记的 3 处 P3D 侧口径（不阻塞 game211·A 解已绕开·仍 open 待拉动）**：① `RigidBody3D` spawn 不读 `Transform3D.quat`（只 set position）② `Pivot3D` 父变换只读 Euler 不读物理 quat ③ `PhysicsWorld3D` 未进 `component-map.ts` 蓝图闭集（蓝图写不了·只能命令式 addComponent·与手册口径不符）。三条各有游戏侧绕法·有真需求再排。
> **验收口径（game211 侧量）**：`games/game211/duel-spike.ts` 的「未躺平 N/M」(`|upY|<0.7`)·目标连抛恒 0——牌改 `Mesh3D{faceAxis:'y'}` 薄 Y + `RigidBody3D{shape:'cylinder'}` 即可消费。

> **★ PE-211 消费验收回执（2026-08-09·通过）**：game211 `duel-spike` 已接 A 解——牌改 `Mesh3D{shape:'box', width:牌宽, height:牌厚, depth:牌高, faceAxis:'y'}`（正/反色落顶/底、edgeTint 落四侧），碰撞体换回**引擎原生 `cylinder`**（渲染器由 width/2、height 推出与牌面同轴的薄圆盘）。`upYOf` 同步改口径（法线 +Z→+Y：`2(yz−xw)` → `1−2(x²+z²)`），收尖圆盘凸包 `bevelDiscHull` 及其测试随之删除（死代码）。**验收数据：未躺平 0/2，连测三轮全 0**（修前恒 ~55° 倾斜、upY −0.53/+0.47）。附带解掉「牌出生就立着」——沿 Y 薄的牌识别姿态即平躺。测试 26→21 例（删凸包 5 例·upYOf 块改 +Y 口径）。tsc0/vitest/build0/门禁 scope=game:game211 全绿。

**需求一句话**：一张**扑克牌**（薄矩形、正反异色）被抛出、翻滚、落地，要求 ①**永远躺平**（不许立在边上/斜着停）②**正反面能分色**（正面=阵营色=活、反面=统一灰=死）。现在这两条**同时满足不了**。

**为什么不可兼得（实查·非印象）**
- `Mesh3D{shape:'box'}` 的正反分色**只作用在 ±Z 两面**（`frontTint`=+z / `backTint`=−z / 其余四面共用 `edgeTint`·`protocol/components/render.ts:57-59`）→ 牌必须**沿 Z 薄**，法线朝 Z。
- `RigidBody3D{shape:'cylinder'}` 建的是 `new Cylinder(r,r,h)`，**轴向恒为 Y**（`three/physics.ts:217`），且 `r=Mesh3D.width/2`、`h=Mesh3D.height` → 圆盘只能躺在 XZ 平面、法线朝 Y。
- 两者**差 90°**：要正反分色就不能用 cylinder 刚体；要 cylinder 刚体就分不了正反色。

**已排除的替代（都实测过·别走回头路）**
| 试过什么 | 结果 |
|---|---|
| `shape:'box'` 薄盒 | 方边是**稳定**平衡，抛多了必然立住（owner 目击）。调薄只降概率。 |
| `shape:'convex'` 收尖棱矩形凸包 | 仍有牌不躺平 |
| `shape:'convex'` **收尖圆盘**凸包（16 段·中腰全径、两面收窄） | **恒定倾斜 ~55°**：upY 三连测 −0.53/+0.47、−0.58/+0.58、−0.58/+0.52，重复性极高 → 规律性排除「随机叠压」，指向 **cannon-es 对极薄凸多面体（厚 0.085 / 半径 1.12·长径比 26:1）的接触求解伪影** |
| 调弹性 / 偏心比例 / 道距 / 场地尺寸 / Z 向分离速度 | 数值几乎不动；弹性调高反而恶化（未躺平 1/2 → 2/2） |
| `angularFactor:[0,1,0]`（REQ-3D-RB-ANGFACTOR 的解） | **不适用**：锁转轴后牌永不翻面 → 正反面这个玩法本体就没了。game-c 筹码不需要翻面，本例需要。 |
| `shape:'cylinder'` + `Mesh3D{shape:'cylinder'}`（旧版圆盘） | **物理完全可靠**（upY 恒 ±1.00·零立牌），但圆柱图元是**单材质**、外形也成了圆牌 → owner 明确否决「不是让它变成圆牌，还是跟扑克牌一样」 |

**两条候选（P3D 择一即可解锁·Lead 不下裁决）**
- **A · `Mesh3D` 指定正反面轴向**：加 `faceAxis?: 'x'|'y'|'z'`（缺省 'z'=现行·零回归），让 `frontTint`/`backTint` 作用在指定轴的两面。→ 牌改沿 Y 薄（识别时天然躺平·顺带修「初始朝向很怪」），碰撞体直接用**引擎原生 cylinder**（已验证可靠）。代价小、面窄。
- **B · `RigidBody3D.cylinder` 轴向可选**：加 `axis?: 'x'|'y'|'z'`（缺省 'y'=现行），建体时按轴旋转 shape 偏移。→ 牌保持沿 Z 薄、分色不动，碰撞体换成沿 Z 的圆盘。代价同样小，但**只修物理侧**、修不了「盒牌初始朝向是立着的」。

> **Lead 倾向 A**（顺带解掉初始朝向问题·且 `faceAxis` 对所有薄片类物件通用：卡牌/瓷砖/硬币/招牌），但两条都能解锁 game211，请 P3D 按 3D 线内部代价判。

**同轮撞到的另外三处 P3D 侧口径问题（都有游戏侧绕法·不阻塞·顺手记档）**
1. `RigidBody3D` spawn **不读 `Transform3D.quat`**（`three/physics.ts` 只 `body.position.set`）→ 刚体无法以指定朝向出生，只能靠初始角速度凑。
2. `Pivot3D` 的父变换**只读 Euler `rotX/rotY/rotZ`**（`three/pivot.ts` 的 `PivotXform`）→ 跟不了物理写回的 `quat`，父体是刚体时子实体完全不转（实测：判定为反面、画面仍是正面色）。游戏侧只能逐帧手抄位姿。
3. `PhysicsWorld3D` **未登记进 `src/assembly/component-map.ts` 蓝图组件闭集** → 蓝图里写不了（tsc 直接拒），只能命令式 `addComponent`。与 `playbooks/3d.md`「场景级单例·挂任一实体即生效」的文档口径不一致。

**验收口径（game211 侧已备好，改完直接量）**：`games/game211/duel-spike.ts` 的 HUD 与日志有「未躺平 N/M」计数（`upright()`·`|upY| < 0.7` 即没躺平）。**目标：连抛多轮恒为 0。**

## REQ-3D-DISSOLVE · 溶解消散材质效果（Material3D.dissolve·shader 溶解 + voronoi 光点前沿）· [2026-08-06] · owner 提（移植 mp.weixin 文章技术）→ P3D · status: **🚧 增量①✅ + 增量②✅（纹理化碎片溶解·textureGrad）done（P3D 2026-08-06/07·已推·见回执）；增量③（顶点外扩+彩色软混合）待拉动** · 优先级: P2（owner 提·通用材质效果） · 类型: 渲染能力补全（材质 shader·render-only）
> **★ P3D 增量② 回执（2026-08-07·纹理化碎片溶解·文章后半「羽毛/SampleGrad」移植）**：文章后半用**碎片贴图**代替纯阈值——每个 Voronoi 格摆一枚剪影图（羽毛/花瓣/星屑），随进度**缩小飘散**。下沉为 `dissolve.tex?`（碎片图 key·灰度当 alpha）+ `spread?`（错峰 0..1·缺省 0.35·前沿推进感）+ `cutoff?`（碎片 alpha 剪裁·缺省 0.4）。GLSL 走**独立 field 函数**（`dissolveGLSL(d,hasTex)` 分支·tex 模式才声明 `sampler2D uDisTex`·避免未绑定采样器）：3×3 邻格 loop 取碎片·每格错峰进度 `cp=clamp((progress-r3·spread)/(1-spread),0,1)`·`sc=1/(1-cp)` 缩小·`dRot(r2·2π)` 按种子旋转·`textureGrad(uDisTex, local, gx·sc, gy·sc).r` 修 mip（**文章 SampleGrad/DDX-DDY 对应**）·9-tap `max` 防碎片跨格切边·`best=maxα·(1-cp)`（越散越淡）。片元 `field<cutoff→discard`（硬边剪影）+ 裁剪前沿发光。`dissolveTex` 走 `resolvePbrMaps`（sRGB·AssetReadyTracker 异步就绪重建·mode 加 'D'）·`dissolveSig` tex 在场进纹理化分支（重建材质）。测试 `dissolve.test` +4 例（sig tex 分支·无 tex 不声明采样器·tex uniform 上挂钳位·缺省值）。真浏览器目击 game-z `p3-dissolve-tex`（紫钢球·符文碎片飘散·render-probe 零 console error=shader 编译无误）。tsc0/vitest/build0/manifest（Material3D 加字段·无新组件）。**增量③（记档待拉动）**：顶点着色器按 progress 外扩打破 mesh 轮廓 + 彩色纹理重叠软混合。有真需求再排。
> **★ P3D 移植回执（2026-08-06·CORE RULE=真缺口→下沉引擎 capability·自由 GLSL 只写一次·游戏摆数据）**：文章是 Unity HLSL 的溶解 shader（阈值溶解 + Voronoi 光点消散 + 距离场变形 + 边缘发光·shader 算代替真粒子省性能）。我们无 dissolve → **下沉成 `Material3D.dissolve`**（render-only·闭集数据），渲染器给材质注入 GLSL（`onBeforeCompile`·**同 outline 先例**·`dissolve.ts injectDissolve`），`DissolveSystem` 每帧推进 progress/time uniform（**同 UvAnimSystem 时间驱动先例**·live>0 持续重渲）。**增量①（本轮·核心）**：`dissolve{progress|trigger+dur+direction, pattern:'noise'|'voronoi', shape:'euclid'|'manhattan'|'chebyshev'|'star', scale, speed, edge, edgeColor, glow}`——**屏幕空间**算距离场（形状/图案 build 期烤进 GLSL·避免运行时分支）·按 progress 阈值 discard·溶解前沿加性**发光条带**；voronoi=动画种子点「光点消散」（星形/闵可夫斯基/切比雪夫多样形状）；`trigger` bump 引擎自播 0→1（out）/1→0（in·direction）·同 flash 先例。dissolve 材质走单 mesh（不实例化·DissolveSystem 驱动 uniform）·`pbrSig` 纳入 `dissolveSig`（pattern/shape 变则重建）。测试 `dissolve.test` 6 例（注入 uniform·钳位·sig·显式 progress·trigger 自播 out/in·live 计数）。真浏览器目击 game-z Platform Three `p3-dissolve`（蓝钢球半溶解 + 橙色光点前沿·shader 编译无误）。tsc0/vitest/build0/manifest（Material3D 加字段·无新组件）。**增量②③（记档待拉动·文章后半·复杂度高）**：② 羽毛/纹理化溶解（局部坐标系采样贴图 + SampleGrad/textureGrad 修 mip + 9-tap/六边形网格叠加）；③ 顶点着色器按 progress 外扩打破 mesh 轮廓 + 彩色纹理重叠软混合。有真需求再排。

## REQ-3D-RENDERHYG · 渲染卫生批：贴图泄漏 + 脏标失效 + 后处理漏 dispose · [2026-08-05] · Lead 提（引擎全量评审 §6 工单⑧·owner 2026-08-05 令派 P3D）→ P3D · status: **✅ done（P3D 2026-08-05·fix①②④+全尾·已推·见回执；fix③睡眠随 SETTLE-SIGNAL 同做）** · 优先级: P2（**全为 render-only·不阻塞玩法**·但长局面越跑越卡/显存越吃越多） · 类型: 渲染健壮 + 性能
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-TOWER-STACK · 物理世界参数按游戏可配（现全局硬编码 · 重力 -42 使多层堆叠不可能）· [2026-08-04] · GD-105 提（叠叠乐塔立不住）→ P3D · status: **✅ done（P3D 2026-08-05·已推·见回执）** · 优先级: **P1（game-105 S3 骨架关硬阻塞·塔立不住则全部规则无从谈起）** · 类型: 3D 线能力缺口（物理世界配置）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-SETTLE-SIGNAL · 刚体落定 / 失稳 → 信号出口（物理结果通向 sim 的唯一缺口）· [2026-08-04] · GD-105 提（叠叠乐判负）→ P3D · status: **✅ done（P3D 2026-08-05·含 RENDERHYG fix③·已推·见回执）** · 优先级: P2（game-105 核心判负条件阻塞·game-d 已在游戏层手搓同件） · 类型: 3D 线能力缺口（物理事件 → 信号）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-PBR-INSTANCING · Material3D/PBR 网格按材质签名归批实例化（同材质 → 1 InstancedMesh）· [2026-07-27] · owner 拍板（game102 每色真材质立方）→ P3D · status: **✅ done（P3D 2026-08-05·已推·见回执）** · 优先级: P1（owner 明示·game102 真材质立方阻塞·现被迫限尺寸 N≤6） · 类型: 渲染性能（PBR 实例化·render-only·承 REQ-3D-RENDER-EFFICIENCY / W1-A 未覆盖面）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-OCCLUSION-CULL · 被遮挡实体/体素的遮挡剔除（interior/背面不进 draw）· [2026-07-27] · owner 提（game102 大立方）→ P3D · status: **wontfix / 低优（P3D 评判 2026-08-05·本条即「先评判该不该做」·下方裁词；有实证卡顿再开）** · 优先级: P3 · 类型: 渲染性能（遮挡剔除·render-only）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-RENDER-EFFICIENCY · 渲染效率提高（大规模同屏实体·批绘/实例化）· [2026-07-24] · **owner 拍板「先把渲染效率提高」** → P3D · status: **🚧 增量①✅（2D canvas 去每实体 save/restore）+ 3D-半✅（voxelTex 体素实例化）+ 增量②✅ 原型（WebGL2 实例化批渲·owner 2026-08-07 拉动）done（P3D·已推）；剩：真图集打包 + 文本/瓦片支持 = 后续增量** · 优先级: **P1（owner 明示先做·game-103 百敌卡顿实证）** · 类型: 渲染性能（2D 批绘 + 3D 实例化·render-only）
> **★ P3D 增量② 回执（2026-08-07·WebGL2 实例化批渲·owner「加强型做一个原型」拉动）**：canvas2D 增量①已压掉每实体常数开销，但仍是**每实体一次 drawImage/fillRect 的 CPU 提交**——上千实体时提交本身成瓶颈。增量②＝WebGL2 `drawArraysInstanced`：相邻同纹理实体并成一批，N 实体 → 少数几 draw。**分层**：算法核 `src/renderer/webgl/sprite-batch.ts`（**纯函数·node 可单测**）把 `collectRenderables` 规划成实例化批（烤进仿射 + UV + 颜色 + 模式·**按游程归批保画家序**·绝不全局按纹理分组打乱 z 序）；GL 胶水 `webgl-renderer.ts`（`RendererBackend` 同契约·消费同一份 Renderable·**零数据改动**）编译实例化四边形着色器 + 每批 upload+draw + 方/圆片元遮罩·`readStats()` 出 draw/实例数。**opt-in**：`?renderer=webgl2`（manifest-game 动态 import·GL 码不进缺省 canvas 包）。**真浏览器目击**（`scripts/webgl-proto-shot.mjs` + `webgl-proto.html` dev 页·不进生产构建）：540 方/圆彩虹网格旋转脉动 → **draw=1**（1 次调用画全部 540）·PIXELQA 非黑 0.998/对比度 206/活动 25·零 console error。**量化台账** `scripts/webgl-batch-bench.mjs`：1000 同纹理精灵→1 draw（1000×）·2000 圆→1 draw·交错 4 纹理→500 draw（1×·诚实最坏游程）·连片 4 纹理→4 draw（125×）。测试 `sprite-batch.test` 10 例（并批/游程 z 序/烤仿射对拍 entityMatrix/跳过记数/颜色解包）。**原型边界（诚实记档）**：只批精灵+实心方/圆；**文本/多边形/瓦片/未就绪精灵不画**（planner 记 `skipped`·非静默吞）——原型证的是上千同类 play-field 实体的批渲吞吐，非全功能替换。**后续**：真图集打包（跨纹理并批）+ 文本/瓦片路。tsc0/vitest/build0。
> **★ 追加·3D 场景内表达（2026-08-07·owner「批渲原型在 3D 场景里做个专门场景表达」）**：2D WebGL 批渲后端不能渲进 Three.js 3D 世界（不同后端/投影），但**同一批渲思想在 3D 有原生表达 = ThreeRenderer 的 InstancedMesh 归批（W1-A）**。给 game-z 加 **Platform Five · 批渲/实例化展台**（`diorama.ts platformFive`·`?game=game-z` 传送循环 A→…→Five）：384 个同款方块军团（径向涟漪 + 各色带旋转）按视觉签名归批成 **6 个 InstancedMesh**（每色 1 批）→ 全场 219 draw 里这 384 方块只吃 6。开 P 剖析看 `batch/inst` 对比。真浏览器目击 `public/games/game-z/platform-five-batch.png`（传送 4× 到 Five·彩虹方块波·渲染正确）。纯数据·零专属 system·game-z 测试 13 例零回归·tsc0/build0。
> **★ P3D 3D-半 回执（2026-07-26·voxelTex 体素实例化·owner「大立方上实例化才能又大又细」）**：诊断=game102 中央大立方每体素 = `Mesh3D{voxelTex}`（提速块贴图）→ three-renderer 走**单 mesh**（line 332 `ensureVoxelMesh3D`）→ 488 体素壳 = **488 draw call**·卡且做不大。修法=把不透明 voxelTex 体素**归批实例化**（按 `voxelMode` 签名分组→ 同款体素共享一个 `InstancedMesh`·六面贴图材质数组·per-instance 只上 instanceMatrix）：抽 `buildVoxelGeoMats`（单 mesh 与批共用几何+材质）·`InstancedBatches.ensure` 支持 voxelTex 批（材质数组）·three-renderer voxelTex 分支不透明→ instGroups(`voxelMode` key)。**488 体素 → 每款颜色/地形层 1 批 = ~4-8 draw call**（真浏览器截图自证 game102 4 色贴图立方渲染正确·纹理零丢失·旋转/Pivot3D 正常）。测试 `batches.test` 3 例（平色盒批 + 300 voxelTex→1 批 + 异签名分批）。透明 voxelTex 仍单 mesh（排序）。tsc0/vitest3639/build0。**又大又细达成**：立方可加体素数/细分而 draw call 只随「不同款式数」增长。
> **★ P3D 增量① 回执（2026-07-26·canvas2D 热路径·不上 WebGL2）**：诊断=`canvas-renderer` 实体循环对**每个**实体 `save/translate/rotate/scale/restore` + 独立 drawImage → 百级敌=百次状态栈压弹 + 百次冗余变换调用。修法=把 **DPR×相机×实体** 三层变换在 JS 合成一个 6 元仿射（新纯模块 `canvas-transform.ts`·`rot=0` 跳 trig 热路径），每实体一次 `ctx.setTransform` → **免每实体 save/restore**；相机也从 `ctx.save/translate/scale` 改成 base 仿射（瓦片同基变换按世界坐标画）；`globalAlpha/fillStyle` 冗余状态消除（无 save/restore 复位后仅变化才写）。DPR/相机零丢失（都折进矩阵）·headless dpr=1 无相机逐位等价旧行为。**保 FaceDir**（`resolveRotation2D` 喂 entityMatrix）。测试 `canvas-transform.test` 5 例（base/实体矩阵/三层合成等价）。**跨游戏真浏览器目击零回归**：game-103（tilemap+相机+精灵+shape+HUD 文本）、game-q NEON SIEGE（标题/HUD/折线路径/六边精灵/动作栏）。tsc0/vitest3606/build0。**增量②（WebGL2 批渲/离屏 atlas）**：只在 canvas2D 优化后实测仍到不了 60fps 或需上千实体时再上（大改·单开）——现按「数百」目标先交增量①。rigorous 前后 FPS bench 待真浏览器 100+ 敌场景实测补。
> **owner 指令（2026-07-24）**：**先把渲染的效率提高**。承 `REQ-SURVIVOR群体`（引擎池）② 半场——该条 ①群体分离仍归主程引擎（steering），**②渲染半场移入本单归 P3D 主理**。
> **缺口（实证）**：① 2D `CanvasRenderer` 逐实体 `ctx.drawImage`（`src/renderer/canvas-renderer.ts:153`）**无批处理**——game-103 幸存者百级同屏敌=百 draw call → overdraw 卡顿（owner 试玩 v1 BUG-05）；② 高效实例化绘制现**只在 3D `three-renderer`**，2D / 大规模实体场景无高效路径。
> **要什么（P3D 主理·框方向·技术路 P3D 定）**：给「大量同纹理实体」一条高效渲染路——**2D**=同 atlas 合批（减 draw call + 减状态切换）或大规模场景走 WebGL2 批渲/实例化；**3D**=复核 `three-renderer` 现有实例化绘制覆盖度（若某游戏走 3D 盒庭则直接用）。owner 指名参考「**Instanced Draw**」思路。**注（Lead）**：2D canvas 无 GPU instancing 语义——真解=合批 drawImage / 离屏 atlas / 转 WebGL 批渲，框定准确、别照搬 3D instancing 名词当 2D 用。
> **性能目标**：数百同屏实体流畅（60fps 目标·退档 30）；配对象池 + 同屏 cap（`spawn-director` 已界上限=缓解非根治）。验收=真浏览器目击百敌流畅 + `ZeroCraftBench` 帧时对比（前后 delta）。
> **边界**：`src/renderer/**`（`canvas-renderer.ts`/`three-renderer.ts` + `three-projection.ts`）= **P3D 独占域**；Lead 评审标状态。**render-only 旁路·不进 sim/hash**（批绘不改玩法确定性/回放/balance-sim）。撞墙实证=`docs/design/game-103/requests.md BUG-05` + `REQ-SURVIVOR群体`②。

## REQ-3D-G102-DEBRIS · game102 消除→真3D 物理碎片 + 平台落地 · [2026-07-24] · GD-game102 提 → **P3D（Lead 裁架构）** · status: open · 优先级: P2（签名视觉·非玩法阻塞） · 类型: 3D 表现（物理碎片 + 舞台）
> **spec**：`docs/design/game102/fx-3d-debris.md`（owner 2026-07-24 拍板 B·真3D + 平台真物理·雕刻碎片落地感）。
> **要什么**：每消一像素 → 炸成同色小方块（`Mesh3D` box + `Material3D` toon/flat+surface 雕刻质感）+ `RigidBody3D`(cannon-es·mass/restitution) + `Impulse3D` 迸溅 → **真物理落到下方平台**（`Mesh3D`+静态 `RigidBody3D`/heightfield）弹跳/堆叠 → 落定超时 despawn。打击 = `Camera3D.shake`。**全 render-only**（不进 sim/hash·不影响玩法确定性/验收/balance-sim）。先例=game-d `throw3d.ts` / game-c `chip3d.ts`（cannon-es 已用）。
> **⚖ 请 Lead + P3D 裁的关键架构（spec §2）**：3D 碎片与当前 2D 棋盘怎么合成——**A** 2D 棋盘 + 3D 叠层（正交相机对齐像素格·screenToWorld 定位·改动小）；**B** 全 3D 盒庭棋盘（像素=薄 Mesh3D 瓦片·消除原地炸碎片落平台·物理最自洽+签名差异化·但棋盘渲染 2D→3D 迁移大）。**GD 倾向 B**（真物理落台需同一 3D 空间才自洽·且 3D 做卖点），最终 Lead/P3D 裁（涉棋盘渲染归属 + 性能）。
> **性能预算（P3D 主理·spec §3）**：并发刚体上限 ≤120·落定/超时 despawn（sleep 后 1.5-2.5s 回收）·对象池·连锁/激光碎片洪峰需节流（超上限退轻量 Vfx3D 替真刚体）·画质档可降 dpr/阴影/AO。
> **边界**：3D 渲染线 = P3D 独占·GD 只出 spec·PE 不碰 3D 线。验收走 `visual-scorecard.md`（真浏览器目击碎片落台弹跳堆叠）。
> **依赖/顺序**：非玩法阻塞（sim 层碎片=纯表现）——可待 PE 的 S3/S4 玩法核（2D 判定）落地后并行；若裁 B，需与 PE 协调棋盘渲染迁移排期。

## REQ-3D-RB-ANGFACTOR · RigidBody3D 角约束（angularFactor·锁转轴防圆盘立边）· [2026-07-23] · PE-C 提（game-c 筹码 bug）→ P3D · status: **✅ done（P3D 2026-07-26·已推·见回执）** · 优先级: P2（owner 报的可见 bug·game-c 已上游戏侧缓解·根治缺此能力）· 类型: 3D 线能力缺口（物理角约束）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-DECAL-TEX · 可换真图的「平贴 + alpha + 自定义贴图」贴花（Decal3D 无贴图槽）· [2026-07-22] · PE-C 提（game-c 下注线 REQ-C-113）→ P3D · status: **✅ done（P3D 2026-07-22·取方案①·已推·见回执）** · 优先级: P3 · 类型: 3D 线能力缺口（贴花贴图）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-MAT-ALPHA · Material3D.map 透明贴图路（transparent/alphaTest opt-in）· [2026-07-22] · PE-C 提（game-c 顶视牌桌）→ P3D · status: **✅ done（P3D 2026-07-26·已推·见回执）** · 优先级: **P2（现在阻塞 game-c 顶视重构主桌面视觉）** · 类型: 3D 线能力缺口（材质 alpha）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-资产就绪自动重渲 · 静态场景 × 异步贴图迟到 = 脏帧跳渲吞掉换图帧 · [2026-07-17] · PE-B 提 → P3D · status: **✅ done（P3D 2026-07-24·渲染器自愈 AssetReadyTracker·已推 c55a71aa；2026-07-26 被 game-103 提交 d47ee942 误删→重新落地）** · 类型: 渲染健壮（W1-C 脏帧跳渲的盲区）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-程序化动画方法集 · Anim3D 扩为底层可组合运动原语（osc/noise/ease）· [2026-07-06] · owner → P3D · status: **✅ done（P3D 2026-07-06·已推·见回执）** · 类型: 渲染能力补全（程序化动画底座）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-货架接入 · game-z/game-d 3D 素材改从公用货架 vendor（停直引全局散落）· [2026-07-04] · PA → P3D · status: **✅ game-z 贴图收口（2026-07-04·P3D·见回执）；models 共享暂留 + gen-shelf 耦合转回 PA** · 类型: vendoring 收口（REQ-PA-3D公用货架 ④b）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-卡通描边（toon outline）·暂缓 + Godot 调研文 · [2026-06-30] · owner → P3D · status: **⏸ outline 暂缓（深度边缘不可靠·待法线缓冲版）；Godot 对比文 ✅ 已出** · 类型: 渲染能力（NPR）+ 调研

> **owner 要「描边的卡通着色」**。P3D 试了**全屏深度边缘描边**（Post3D.outline·读深度纹理做二阶差分 Laplacian）：
> - **暂缓原因（诚实记录）**：深度-only 边缘在**透视斜面**上二阶差分非零（斜地面被误判成边）→ 整片压暗；调阈值压不住，且 SwiftShader 无头环境深度纹理采样行为不稳（疑 NaN→边=1 全黑）。**已全部回退**（无残留·树净）。
> - **正确做法（待做）**：要稳的卡通描边需**法线缓冲 + 深度**双判（法线折缝 + 深度轮廓），或逐物件反向壳（inverted hull·骨骼体麻烦）。需专门一轮 + 真 GPU 验证（非 SwiftShader）。**故暂缓·不硬推黑屏货。**
> - **toon ramp（MeshToonMaterial）** 单独可做但**与刚夸的 PBR/IBL 冲突**（toon 去掉金属反射）——需设计「全局 toon vs 保 PBR + 仅描边」取舍，一并待定。
>
> **✅ Godot 对比调研文（owner 授权调研·开 agent 调研）**：`docs/design/godot-vs-apollo.md`。结论：Godot 是好**设计参考**但代码/运行时与我们两条铁律（数据驱动 + lockstep）不同源 → 借**概念**非搬码。**最该借鉴**：① AnimationTree/状态机/BlendSpace 做成数据（接刚落地的骨骼动画·下一步）；② prefab 蓝图子树（接关卡加载线）；③ 资产 import 管线样板（接真实贴图）。**别借**：Godot 联机（权威+复制·非 lockstep）、非确定性物理、GDScript 运行时。owner 裁决。

---

## REQ-3D-骨骼动画（glTF skeletal animation） · [2026-06-30] · owner（渲染缺口评估→选做） → P3D · status: **✅ done（P3D 2026-06-30·已推）** · 类型: 渲染能力补全（最大缺口·角色动起来）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-程序化 normal/roughness 贴图 · [2026-06-30] · owner（选「程序化生成」） → P3D（TA Phase 5） · status: **✅ done（P3D 2026-06-30·已推）** · 类型: 渲染能力补全（PBR 表面细节·零美术文件）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-真物理模拟（色子/表现物理·cannon-es） · [2026-06-30] · owner → P3D · status: **✅ done（P3D 2026-06-30·cannon-es·已推）** · 类型: render-only 表现能力（刚体物理）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-关卡重构「永远追逐」+ 杂项（去腐/大字/Toggle 绕过） · [2026-06-30] · owner → P3D（Game Z 域） · status: **✅ v1 done（P3D 2026-06-30·已推）** · 类型: 关卡数据重构 + 体验修
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-材质测试台（IBL 环境光 + 材质陈列板·「我怎么测材质」） · [2026-06-30] · owner → P3D（3D 渲染线·TA Phase 5） · status: **✅ done（P3D 2026-06-30·IBL + 11 预设陈列台·截图验证·已推）** · 类型: 渲染能力补全（金属反射缺 IBL）+ 测试台数据
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-BUG-后处理黑屏（AO/分级脏数值） · [2026-06-30] · owner 报 → P3D（3D 渲染线·后处理域） · status: **✅ fixed（P3D 2026-06-30·根因定位 + 渲染器 finite 兜底 + 面板域修正 + 回归测试·已推）** · 类型: 渲染健壮性 bug（脏数值喂 shader → 整片黑屏）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-Nav 导航网格自动烘焙（寻路数据 + 寻路碰撞·game-z 验证） · [2026-06-28] · owner → P3D（owner 授权跨界·**复用主程 pathfind**） · status: **✅ done（P3D 2026-06-28·自动生成·复用主程 NavGraph·端到端验证·已推）** · 类型: 真能力缺口（碰撞几何→可走拓扑**自动生成**）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-Collision 3D 逻辑碰撞（触发/重叠·升维 2D） · [2026-06-28] · owner+P3D → 主程（sim/能力域评审） · status: **🚧 P1 + debug 线框/可点击菜单 + P2(精简 hull·凸多面体 SAT) 已落（owner 2026-06-28 授权 P3D 跨界落·知会主程评审）；P3 物理表现轨待（YAGNI）** · 类型: 真能力缺口（3D 逻辑碰撞·升维复用）

> **⚠️ 知会主程（owner 授权 P3D 跨界落 sim·同资产层先例）**：本 REQ 的 sim 半边落在你的域（`engine/spatial` + `skills/atoms` + sim 组件 `spatial.ts`）——**owner 2026-06-28 当面授权 P3D 实现 P1**。改动**严格镜像 2D 碰撞**（同确定性纪律：只用 +−×÷/sqrt/min/max·无 sin/cos/hypot），**进 hash·rollback 安全**，不碰 2D 碰撞代码。请评审；如与并行改动撞 rebase 喊我。
>
> **✅ P1 已落（P3D 2026-06-28·已推）**：
> - **数据**：`Collider3D`（sphere/box/capsule·进 hash·`spatial.ts`）+ `Overlap3D`（重叠事件）。确定性位置模型：**planar 取 2D `Transform`(进 hash·x→X、y→Z)，垂直/形状取 `Collider3D`(进 hash)——不碰 render-only `Transform3D`**。胶囊限竖直(Y 轴·角色标准)→ 各测试退化「XZ 距离 + Y 区间」全解析。
> - **窄相位**：`engine/spatial/contact3d.ts`（纯函数·镜像 2D `contact.ts`·确定性）——球/盒(AABB)/竖直胶囊两两接触 + 法线/深度。
> - **能力**：`skills/atoms/overlap-detect-3d`——每帧重建（按 id 升序）+ **暴力 N² AABB 宽相位**（轻量盒庭够·升维树是 scale 路）+ 窄相位 → 产 `Overlap3D`。
> - **demo**：game-z 加 `overlapDetect3dCapability` + hero `Collider3D` 胶囊 + 触发区 zone（半透明绿垫 Mesh3D[render] + `Collider3D` box trigger[sim]·同 2D Transform 驱动渲染+碰撞）；HUD 读 `Overlap3D` 亮「🔔 触发区」。截图验证。
> - 测试：`contact3d.test`(7·含 **Y 分离不重叠** 真 3D + 确定性逐位) + `overlap-detect-3d.test`(3·含 **Collider3D 进 hash** 验证 + 触发进出) + diorama 碰撞。tsc+vitest(1886)+build+截图全绿。
> - **✅ debug 线框可视化（P3D 渲染线域·提案 §边界「P3D 天然拥有的那块 ①」已落）**：`renderer/three/collider-debug.ts`（新·`ColliderDebug` 类·render-only·池管理·只读 world 不写 sim）——读 sim `Collider3D`+2D `Transform` 画线框（box→Box·sphere→Sphere·竖直 capsule→Capsule·**位置映射严格同 `contact3d`**：planar 取 Transform、垂直取 Collider3D `baseY/height`）；trigger=绿、实心=黄；`MeshBasicMaterial wireframe`。接入 `three-renderer` `sync`（`setDebugColliders(on)` 开关 + renderSig 失效重渲）。**可点击菜单**（owner 2026-06-28 加需求）：game-z 左下 `pointer-events:auto` 独立宿主 + `LayoutNode` `Button`（action `toggleDebug` 经 mountUI handler 入队·**UI 铁律**·无自由 DOM/CSS 逻辑）+ `C` 键快捷。截图验证（hero 胶囊线框 + zone 盒线框 + 按钮 ON）。
>
> **✅ P2 已落（P3D 2026-06-28·owner 批「现在落精简 hull+3D SAT」·已推）—— 评审后大幅重定范围，回驳原 P2 三件中的两件半**：
> - **架构评审先行（CLAUDE.md 核心规则 #2）**：读 2D `contact.ts` 发现本引擎**从不在运行时旋转碰撞体**（`contact.ts:7`「无旋转」）——2D 表达「转过的盒」是用 `polygon` + **预烘焙顶点**（world 顶点 = 局部顶点 + 平移·不乘旋转矩阵），数据层就解了 sin/cos 确定性难题。据此回驳：
>   - **OBB（按角度）→ 回驳**：算朝向基底需 sin/cos → 破坏跨机逐位确定（2D 正为此绕开）；「转过的盒」功能上 = 凸包顶点 / 或 AABB 拆分（manifesto C-档），可重组。
>   - **cylinder → 回驳**：角色 XZ 阻挡上圆柱≈胶囊（只差平顶/圆顶）→ 功能等价 capsule·YAGNI。
>   - **GJK+EPA → 回驳为当前形态**：对「渲染轻引擎」过度复杂（owner：不要过度复杂·不能特别费）；SAT 对有界顶点凸包直接给穿透深度·复用 2D `satPolyPoly`/`satPolyCircle` 心智模型即可。GJK 是规模路·真撑爆顶点数再说。
> - **落地（唯一站得住的精简形态）**：新碰撞体档 `hull` = **预烘焙局部顶点 + 面法线轴**（`Collider3D.verts`/`axes`·照搬 2D `polygon` 套路·运行时只平移不旋转·无 sin/cos）。一举吃掉「OBB」的**正确**表达（转过的盒 = 8 顶点 hull）+ 任意凸关卡块/斜坡/斜墙。
>   - **窄相位**：`engine/spatial/sat3d.ts`（新·确定性 3D SAT）——`satPolyPoly3`（A 面法线 ∪ B 面法线 ∪ **边×边叉积轴** → 盒/OBB 精确 15 轴）+ `satPolySphere3`（面法线 ∪ 最近顶点→球心·镜像 2D `satPolyCircle`）。只用 +−×÷/sqrt + 叉积·**无三角函数**。
>   - **接入** `contact3d.ts`：hull 介入 → SAT 路；其余保持 P1 解析（**逐位不变**）。胶囊 vs hull = 段上取离 hull 心最近 Y 的单球（轻量·保守·够角色站台/撞墙）。
>   - **debug 线框**：`collider-debug.ts` 加 hull（`ConvexGeometry` 从顶点重建·render-only）。
>   - **demo**：game-z 加 `angle-wall`（绕 Y 转 30° 石板·Transform3D.rotY render + hull collision·**顶点由轴+半尺寸只用 ×/+ 生成→跨机确定**）。开菜单见斜置 hull 线框（黄）——证明 SAT 按真朝向判定·非轴对齐 AABB。
>   - **测试**：`contact3d.test` +5（轴对齐 hull·**转 45° 真旋转：球落 AABB 内但盒外→SAT 判分离**·hull-hull 15 轴·hull-胶囊·确定性）。tsc+vitest+build+截图全绿。
> - **✅ 3D 碰撞响应（owner 2026-06-28「鸭子穿墙·只检测没碰撞」→ 补响应）**：`skills/atoms/collision-resolve-3d`（镜像 2D `collision-resolve`·确定性 sim·进 hash·Resolve 阶段）——读 `Overlap3D` → 顺序冲量(速度) + NGS(位置)把动态体推出静态墙。**XZ 地面解算**（取接触法线水平分量·实体竖直锁 baseY·纯竖直接触跳过）；逆质量：无 Velocity=静态、有=动态；trigger 不解算（触发区可穿入）。game-z 接入 → 小黄鸭撞墙被挡、贴墙滑。测试 4（推出/速度清/trigger 跳过/两世界 hash 一致）。
> - **⬜ 待续**：动态-动态堆叠/质量分摊已支持(同 2D 核)·更复杂刚体走 P3 物理表现轨（纯表现·Rapier·YAGNI）。
> **架构守则（贯穿·下同）不变。**

> **owner 2026-06-28 拍板的架构分界（最关键·两套碰撞泾渭分明）**：
> - **逻辑碰撞（触发/重叠）= 确定性 sim**：「进区域 / 撞到 / 命中」喂玩法的事实 → 进权威主机/lockstep 状态 → **进 hash、必须确定性**。**本 REQ 只做这个。**
> - **物理模拟（刚体/弹飞/堆叠/布娃娃）= 纯表现**：**绝不喂逻辑、不进 lockstep/hash**。哪天做可随便用非确定性物理库（Cannon/Rapier 当特效）——**YAGNI·不在本 REQ**。
> 这一刀绕开 3D 物理最难的坑（跨端浮点确定性）：逻辑碰撞只做廉价解析重叠测试（**同 2D 先例·确定性边界不变**）。
>
> **结论：升维复用现成 2D 碰撞能力到 3D**（P3D + owner 评估·主程定夺）。2D 已有成熟确定性分层可直接镜像：
> | 2D 现成（主程域） | 3D 升维 |
> |---|---|
> | `Shape`(box/circle/polygon·进 hash) | `Collider3D`(sphere/AABB/capsule·进 hash·**数据组件**) |
> | `engine/spatial/aabb-tree.ts`(`DynamicAabbTree`·每帧重建·rollback 安全) | 升成 **3D AABB**（同结构·同确定性） |
> | `engine/spatial/contact.ts`(`contactBetween`/`aabbOf`) | 3D 解析窄相位（sphere/AABB/capsule 重叠 + 法线/深度） |
> | `overlap-detect`(atom·产 `Overlap`) | `overlap-detect-3d` 产 `Overlap3D`（法线+深度·或纯触发布尔） |
> | `collision-resolve`(tier2·推开) | 3D 推开（按需·触发区只需重叠事件不需推开） |
>
> **空间分割裁决**：用**升维的动态 AABB 树（BVH）**——不是四叉/八叉树（轻量盒庭几十~低百物体·现成树确定性+rollback 已验证）；物体特别少时暴力 N² AABB 亦可。八叉/网格 YAGNI。
> **碰撞体分档（封顶复杂度·owner「不能特别费」）**：A 解析图元 sphere/AABB/**OBB**/capsule/cylinder（覆盖 90%·角色 capsule + 关卡 box）；B 凸包 multi-convex（GJK·**封顶顶点/块数**）；C 任意三角网格**不做**（静态关卡拆凸块/AABB）。**先做 A 档的 sphere/AABB/capsule + 触发/重叠事件**。
>
> **分期**：
> - **P1（覆盖 90%·先做）**：`Collider3D` 数据(sphere/AABB/capsule) + 3D 动态 AABB 树宽相位 + 解析窄相位 + `Overlap3D` 触发/重叠事件 + （按需）3D 推开。够角色撞墙/落地/触发区。
> - **P2**：OBB + cylinder + 凸包(GJK·有界)。
> - **P3（仅当真要刚体·另起「物理表现轨」）**：堆叠/推/关节 = **纯表现**层·评估 Rapier·不进 hash。
>
> **数据驱动尺子**：`Collider3D` 弱模型填得了 `kind:'capsule', radius:2, height:7, offset:{...}`，**填不了物理引擎不透明 body 句柄**——过尺。碰撞=确定性解释器（能力）。
>
> **边界 / 分工**：碰撞 sim 全在 `engine/spatial` + `skills` + sim 组件 = **🔒 主程域**（§0.1）。**请主程评审本提案并定落点**（主程实现 / 或 owner 像授权资产层那样授权 P3D 跨界落）。**P3D 天然拥有的那块**：① 碰撞体 **debug 线框可视化**（render-only·新 3D render 组件或复用 Mesh3D wireframe·我的渲染线域）；② game-z 接碰撞能力做触发区 demo（小黄鸭进区域亮灯等）。
> **验收**：角色 capsule vs 关卡 AABB 触发/重叠事件确定性（进 hash·rollback 安全·node 单测同 2D `overlap-detect.test` 先例）；debug 线框渲出；tsc+vitest+build 全绿。
>
> **Lead 裁决（2026-07-04）：✅ 准 P1 范围**——提案质量高：数据组件过尺（弱模型填得了 Collider3D、填不了物理句柄）、镜像 2D 确定性分层（DynamicAabbTree 先例）、YAGNI 刀干净（八叉树不做/三角网格不做/刚体=表现轨另议均照准）。**落点**：碰撞 sim（engine/spatial+skills+组件）=主程域不外放——**Lead 已收编提案 P1 节为 spec → 指派：Opus（xhigh·正确性关键）施工引擎半**；**P3D 并行做自己那半**（debug 线框 render-only + game-z 触发区 demo），组件契约（`Collider3D{kind:'sphere'|'aabb'|'capsule',...}` / `Overlap3D`）以引擎半落地时的 component-map 为准、字段名先按提案冻结。开工时点=owner 排期（说一声即发工）。P2（OBB/cylinder/凸包）待 P1 消费方真出现再议。
> **Lead 顺手注（2026-07-04）**：上文 game-z「Toggle 绕过」注记已过期——根治已落 `src/ui/components/server.ts:64-68`（焦点保护只认文本控件·checkbox/radio 放行重建·2026-07-01），P3D 可撤 `blur()` 绕过并删该注。

---

## REQ-3D-W1高效引擎 · [2026-06-28] · owner → P3D（3D 渲染线）· status: **🚧 进行中（W1-A + W1-B + W1-C + W1-D ✅ 已落 + profiler + 模块化拆分；W1-E 健壮 ⬜ 下一增量）** · 类型: 设计纲领 + 真能力（实例化绘制）

> **进度（P3D 2026-06-28·已推）**：
> - **W1-A 实例化** ✅：同视觉签名(`mesh3dBatchKey`=shape+尺寸+逐面色)的 Mesh3D → 一个 `InstancedMesh`（1 draw call）。逐面色**烤进 `vertexColors`**（多色盒也能批·非仅单色）；复用单 dummy `Object3D` 合 instanceMatrix；超容量 ×2 扩容；空批移除；整体投/受软影；`frustumCulled=false` 防散布整批误剔；透明盒(alpha<1)走单 mesh fallback。验收：game-z 20 盒 → **11 批**（金阶梯 2→1·蘑菇茎 2→1·8 鹅卵石 8→1）。**Model3D 多 mesh 实例化 = W1-A 第二步（待）**。
> - **W1-B 零浪费** ✅：去每帧 `material.needsUpdate`（颜色/alpha 是 uniform）；仅贴图引用变才 needsUpdate；不透明走 opaque 管线。
> - **W1-C 低开销基线** ✅：① 静态帧**脏标跳渲**（渲染签名=位姿hash+相机+灯+后处理+云飘帧·不变则跳 instanceMatrix 上传+阴影+render）；② **阴影按需重算**（`shadowMap.autoUpdate=false`·仅投影体/灯变才 needsUpdate·相机转/云飘不触发阴影重算）；③ near/far 从 0.1–10000 收紧到 ~1–(dist+天空半径)。
> - **W1-D 快赢** ✅：`ACESFilmicToneMapping`+曝光（天空盒 `toneMapped:false` 保色）+ `setPixelRatio(min(dpr,2))`。
> - **profiler（owner「做个 profile state·像虚幻」）** ✅：`renderer.readStats()` 暴露 fps/cpuMs/drawCalls/triangles/programs/geo/tex/batches/instances/models/rendered；game-z LayoutNode HUD 显示（P 键开关·UI 铁律）。
> - **模块化拆分（owner「别全写一个文件·每文件<400 行」）** ✅：`three-renderer.ts` 832→392 行；拆 `renderer/three/{geometry,stats,lights,post,models,batches}.ts`（各 ≤146 行·按子系统分）。
> - **⬜ 待续**：W1-E（resize/模型自动贴地/.glb-only）；W1-A 第二步（Model3D 多 mesh 实例化）。
> - 测试：`mesh3dBatchKey` + `hashPoses/camSig/postSig`（脏标）纯函数单测；tsc+vitest+build+无头截图全绿。零数据改动（绝不加 instanced 旗标）。

> **设计纲领（owner 2026-06-28 拍板）**：要的是**高效率、低开销**的 3D 引擎——**性能是一等设计约束、写进架构，不靠后期优化补**（owner 明言「后期不会做什么优化」）。所以下面不是「以后再说的优化」，是**现在就该达到的基线**。**instanced draw（实例化绘制）是硬要求。**
> **数据驱动铁律不变**：W1 全是**渲染器内部**的事，**零数据 / 零组件 / 零接口改动**——游戏照旧摆 N 个 `Mesh3D`/`Model3D` 实体（纯数据），渲染器自己批。**绝不往数据里加 `instanced:true` 之类渲染旗标**（那是把渲染关切泄进数据，违 manifesto）。

## 已归档条目索引（已结条目全文查 git 历史·归档层随 owner 2026-08-03 拍板删除）

### W1-A · 实例化绘制（headline · 必做）
目标：同一几何的多个实体 → **1 个 draw call**（`THREE.InstancedMesh`），对数据透明。
- **自动分批（batch key 从现有组件派生·不加字段）**：Mesh3D → key=`shape+尺寸(w/h/d)`（同几何）；Model3D → key=`modelKey`（同 glTF）。同 key 进同一 InstancedMesh，每实体一个 `instanceMatrix`（位姿合成 Matrix4）。
- **每帧**：每批只更新 `instanceMatrix`（一次 buffer 上传·`instanceMatrix.needsUpdate=true`）——**廉价 buffer 上传、非 shader 重编**（对照 W1-B#1）。复用单个 `Matrix4`/`Quaternion` 临时对象，**别每帧每实体 new**。
- **动态数量**：实体增减 → 预分配容量 + 设 `mesh.count=活跃数`；超容量再扩容重建；空批移出场景。
- **阴影**：InstancedMesh 整体 `castShadow/receiveShadow`（实例阴影 three 原生支持）。
- **⚠️ 逐面色的坑（务必处理对）**：InstancedMesh 共享**一个**材质，`instanceColor` 只给**每实例一个色**——表达不了 Mesh3D 的 front/back/edge 逐面分色。三选一：① **同色盒批**（front=back=edge 同色的盒子进实例批·`instanceColor` 上色——积木/体素世界大多如此·最划算）；② **逐面色烤进 `vertexColors`**（同图案盒可实例化）；③ **逐面异色盒不实例化**（少量走老单 Mesh 路·保留 `paintMesh3D` 作 fallback）。**建议默认 ①+③ fallback**。
- **Model3D 实例化（分期）**：glTF 是多 mesh 树。现 `clone(true)` 已**共享几何**（几何只传一次 GPU）→ 现状=「N draw call、几何不重传」；实例化要收的是那 **N 个 draw call**。**先把 Mesh3D 实例化做扎实**；多 mesh 模型实例化（每子几何一个 InstancedMesh：`instanceMatrix=实体世界矩阵×子mesh局部矩阵`，或本 three 版的 `BatchedMesh`）作 W1-A 第二步。
- **验收**：N 个同款盒/鸭 → `renderer.info.render.calls` ≈ 批数（非 N）·断言（无头截图脚本可读 `renderer.info`）；batch key 归并 + 矩阵合成抽 `three-projection` 纯函数单测。

### W1-B · 每帧零浪费（review 的性能项 · 现在是必做基线）
1. **去掉每帧 `material.needsUpdate=true`**（`paintMesh3D`/`paint`）——颜色/alpha 是 uniform、每帧本就重传，不需 needsUpdate；只在贴图引用变 / transparent 翻转时设。**这是「低开销」的地板，与实例化同等重要。**
2. **`transparent` 只在 `alpha<1` 时开**（`buildMesh3D` 现恒 true → 按 alpha）——不透明物体走 opaque 管线（early-z + 不排序）。
3. **sync 里别每帧每实体 new 临时对象**（Matrix4/Vector3/Euler 复用单例）。

### W1-C · 低开销基线（写进设计·非后补）
- **静态帧跳渲**：盒庭基本静态 → 维护 dirty 标志（world 版本变 / 相机动 / 云飘 / 有动画）；**没变就不 `gl.render`**。这是「低开销」最大单点（静态盒庭可从满载降到近 0）。云飘/角色走动时记得置 dirty。
- **阴影不动不重渲**：`key.shadow.autoUpdate=false` + 仅 dirty 时 `shadow.needsUpdate=true`。
- **相机 near/far 收紧**（现 0.1–10000=1e5 比·深度精度差）：near~1、far 从天空盒半径派生（顺带减 z-fighting）。

### W1-D · 观感快赢（owner 已「可以」）
- `gl.toneMapping=ACESFilmic`（或本版 AgX）+ `toneMappingExposure≈1.05`——PBR 不削顶、通透。
- `gl.setPixelRatio(Math.min(devicePixelRatio,2))`——retina 不糊。

### W1-E · 健壮（中·进清单）
- `ResizeObserver` → `setSize` + `camera.aspect`（容器变尺寸）。
- 模型自动贴地：`Box3.setFromObject` 算底面 minY、缓存偏移、抬到坐地（消「模型原点须在脚底」踩坑）。
- 文档写明 glTF **.glb / 内嵌资源 only**（`parse(bytes,'')` 不解外部 .bin/贴图）。

### 贯穿 W1 的数据驱动守则
- 实例化 / 批 / 跳渲 / tonemap 全是**渲染器内部**，**零数据改动**——游戏只摆实体数据，渲染器自动高效。
- 别为实例化让数据「迁就渲染器」（如强制同色）——**同色批是渲染器的选择**，数据照常可填逐面色，渲染器决定谁进批、谁走单 mesh fallback。
- 光照/曝光数据化（`Light3D`+曝光字段）**P3D 已超额做出**（见路线图记录）；W1 先把 tonemap 作渲染器默认值即可。

> **优先级**：W1-A 实例化 + W1-B 零浪费 = 第一梯队（效率纲领核心）；W1-C 静态跳渲 = 第二（最大低开销单点）；W1-D 快赢顺手；W1-E 中期。全程 tsc+vitest+build 全绿才推，跨出 3D 渲染线先报主程。

---

## REQ-3D-Camera相机参数补全 · [2026-06-28] · owner → P3D（3D 渲染线）· status: **✅ done（P3D 2026-06-28·三层落地·正交/跟随截图验证）** · 类型: 真能力扩增（3D 线·过四条尺子）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-Model导入 · [2026-06-28] · P3D（3D 渲染线）→ 主程（资产层域）· status: **✅ done（端到端打通·owner 2026-06-28 当面授权 P3D 跨界把资产半边也落）** · 类型: 真能力缺口（box 原语表达不了圆润模型）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## 路线图记录（已做 / 待长）

- ✅ **数据组件基座**：`Mesh3D`/`Transform3D`/`Camera3D`/`Sky3D`（主程）+ `Model3D`（P3D·glTF 导入）+ `Light3D`（数据化光照·sun/ambient）+ `Post3D`（移轴/泛光后处理）——**P3D 已把光照 + 后处理数据化超额做出**。
- ⏳ **W1 高效低开销**（实例化 + 零浪费 + 静态跳渲）= 当前主线（见上）。
- 🔭 **待长**：可旋转交互（输入→`Camera3D.yaw/pitch`·render-only）；玩法（owner 解冻后）；UI↔世界锚（把世界特效锚到 UI 元素屏幕位·需要时一个通用 seam·别每游戏手写）。

## REQ-3D-PBR-IBL PBR 金属需环境贴图（无 IBL 纯金属发黑） · [2026-06-29] · PI → P3D（3D 渲染线·材质域） · status: **✅ done（P3D 2026-06-30·TA Phase5 IBL·Sky3D.env）** · 类型: 渲染正确性（PBR 金属可读性）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-骰盅 · 对决 3D 骰子（各自掷战力骰·两骰在牌下旋转） · [2026-07-02] · game-g（主程/Lead session）→ P3D（3D 渲染线） · status: **✅ P3D 评审收编（2026-07-04·裁决见下）** · 类型: 表现增强（owner 点名要 3D）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-Vfx3D 点吸引力场（粒子跟随鼠标聚集·加减速自然） · [2026-07-03] · game-d（我·P3D 转呈）→ P3D（3D 渲染线·粒子域） · status: **✅ done（2026-07-03·已推）** · 类型: render-only 粒子能力补全（点吸引子）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-交互与材质补全批 · 对象拾取/图元/BlendSpace/贴图槽/HDRI 五件 + Tier3 不做清单固化 · [2026-07-03] · owner 提需 → 主程逐条裁决 → P3D · status: **①②④⑤ ✅ Lead 验收通过（2026-07-04·判决见下·偏离全裁）；③ 待拉动（角色步态成熟时开工）** · 类型: 3D 线能力补全（Lead 图纸）

> **P3D 完工回执（2026-07-04·请 Lead review）**——逐件全绿（tsc+vitest+build）、同提交回填 `docs/playbooks/3d.md`：
> - **①拾取**（`d33ad0b4`）：`Pickable3D` + `ThreeRenderer.pick(x,y)` + 纯函数 `rayAabbT`（6 无头测试）+ game-z 点选 HUD 自证。**两处偏离图纸请裁**：(a) 组件字段用 `signal`/`hover`（非图纸 `pickSignal`/`hoverSignal`·也未加 `enabled?`/`layer?`——无消费者·YAGNI）；(b) 射线对**世界 AABB 包围盒**求交（非逐三角 Mesh3D 几何）——换来**纯函数可无头测**且不依赖网格几何/WebGL，遮挡取最近盒。要精确到网格或改字段名我照办。hover 字段留了、发射待游戏在 pointermove 调 pick（demo 只做 click）。真浏览器点选自证待截图环境恢复。
> - **②图元**（`c77bbc08`）：`Mesh3D.shape` +cylinder/cone/capsule/torus（+torus `tube`）·单一 `roundGeo()` 工厂三路共用·批签名/深度扩档（球保持 height 无关）·碰撞体未动（遵裁决）·game-z 南侧四图元展示·纯函数测。
> - **④贴图槽**（`1c70a299`）：`Material3D`+`MaterialSpec` 加 `metalnessMap/emissiveMap/ormMap`+`tiling{repeat,offset}`；ORM 挂三槽·emissiveMap 置白基·tiling 进纹理+缓存键·pbrSig 纳入·跨界 asset-index（请一并 review）·game-z plank tiling 自证。**metal/emissive/orm 真图 demo 待 ORM 贴图资产**（槽已通·sig/catalog 已测）。
> - **⑤HDRI**（`fc2b56f4`）：`Sky3D.envMap`（图纸说「env 接 assetKey」→ 我判 env 保持强度语义·**新加 envMap 字段**接 .hdr key·更兼容·请认可）；HDRLoader.parse→PMREM→environment·缺省/未就绪/失败回退程序化影室·容错不崩。**渲染 WebGL 无法无头测**·真 HDRI 视觉 demo 待 ≤2k .hdr 资产（导入线 .hdr 识别=asset-manager 侧后续）。
> - **③BlendSpace**：按裁决「有真角色步态需求拉动时」开工·当前未拉动 → 未做（game-z 角色/追兵骨骼线成熟后接）。

> **Lead review 判决（2026-07-04·对抗性复核 4 个 diff + 独立复跑门禁全绿·偏差按三分法裁）**：**REVIEW: PASS**
> - **①(a) 字段名 signal/hover·省 enabled/layer** → INTENTIONAL·**接受**（组件命名空间内短名更干净；enabled/layer 无消费者=YAGNI，闭集加档随真需求）。
> - **①(b) AABB 求交（非逐三角）** → INTENTIONAL·**接受**（纯函数无头可测 > 精确度·盒庭图元场景够用）。边界记录：旋转体的世界 AABB 过覆盖（可点中「空角」）；精确网格拾取=将来真需求再开单。
> - **① determinism.ts 登记行** → 合规（handoff §0.1:37/76 明文授权 NON_DETERMINISTIC 加行·非越域）。
> - **④ asset-index 跨界** → **接受**（闭集 schema 扩展照图纸三槽·跟 roughnessMap/aoMap 先例同款·有测试·自曝请审姿势正确）。
> - **⑤ envMap 新字段（非复用 env）** → **图纸错误·P3D 修正正确**（`env` 既有语义=IBL 强度数字，图纸「env 接 assetKey」会砸兼容——记 spec 方失误，OUT-OF-SCOPE 类偏差回改图纸认定）。
> - **残项（不阻塞·MANUAL CHECK 池）**：ⅰ 真浏览器点选自证（P3D 待截图环境）；ⅱ hover 发射待 pointermove 消费者；ⅲ 真 ORM/emissive/HDRI 视觉 demo 待资产（asset-manager 线·.hdr 导入识别一并）；ⅳ pick→`enqueueAction`→sim 全链路尚无游戏 exercise（手册铁路径已写死·首个消费游戏接线时验）。

> owner 2026-07-03 提三档清单，主程逐条裁决如下（查重已做：接池内既有 seam/裁决，不重造）。
>
> **Tier1-① 对象拾取 Pickable3D（P0·最优先）**：✅ 接受。
> - 架构裁决：**照 2D `t2-clickable` 先例做 3D 对等件**——拾取属**输入层**（与鼠标点击同类外源输入，本地 raycast 合法，不碰 sim 确定性）；命中结果走既有 Signal 机制（`pickSignal`/`hoverSignal` 带实体 id arg）入队，sim 逻辑照常消费信号。
> - 实现：**扩展既有 seam `ThreeRenderer.screenToWorld`**（本池 UI↔世界锚条目已建 Raycaster 平面版）→ 对象级：射线对全部 `Pickable3D` 实体的 Mesh3D 求交，**最近命中优先**（遮挡序确定）。新组件 `Pickable3D{enabled?, layer?, pickSignal?, hoverSignal?}` 入闭集 component-map；describe/examples 达 registry 水准。hover 节流（每帧一次求交，命中变化才发信号）。
> **Tier1-② 渲染图元补全（P0·小活）**：✅ 接受。`Mesh3D.shape` 枚举加 cylinder/cone/capsule/torus（three 内建 Geometry 直映射，`geometry.ts` 加档；参数可选字段+合理默认）。**边界注意**：这是 render-only 视觉图元；**碰撞体维持池内既有裁决**（A 档 sphere/AABB/capsule·cylinder 碰撞≈capsule 等价已回驳），勿为新图元开碰撞档。
> **Tier2-③ 动画状态机/BlendSpace（P1）**：✅ 接受=**路线图"待续①"转正**（Godot AnimationTree 思路做成数据）。`AnimState3D{states:{名:{clip,speed?}}, blendParam:'speed'等, transitions}`——纯数据，混合权重由参数驱动。**开工时机：有真角色步态需求拉动时**（game-z 角色/追兵骨骼线成熟后），排 Tier1 之后。
> **Tier2-④ 材质贴图槽补齐（P1）**：✅ 接受。`Material3D` 加 `metalnessMap/emissiveMap(+emissiveIntensity)/ormMap`（ORM 打包图一图三通道 R=AO/G=Roughness/B=Metalness，three 三槽共享同图）+ `tiling{repeat,offset}`。资产侧配合：ORM/法线类 colorSpace=linear（asset-index spec 元数据字段已有，asset-manager 线知会）。
> **Tier2-⑤ 真环境贴图导入（P1·小活）**：✅ 接受=**REQ-3D-PBR-IBL（已✅）的资产入口扩展**：`Sky3D.env` 接受 assetKey（equirect .hdr/.exr 经 RGBELoader+PMREM）；资产导入线支持 .hdr（**包体预算：≤2k 分辨率提示**，掌机 cartridge 顾虑）；程序化天空盒保留为无资产 fallback。
> **Tier3 不做清单（owner 2026-07-03 YAGNI 判决·固化防自作主张）**：⛔ 视锥/遮挡剔除+LOD（场景规模未到·W1-E 域）、point/spot 阴影、真 DoF/vignette/SSR、NPR 描边（本池已有 ⏸ 条目·待法线缓冲版）。需求变化时 owner 重开，任何 session 勿擅启。
>
> 通用要求：逐件独立提交全绿（tsc+vitest+build）；新组件入闭集+registry describe；**每件落地同提交回填 `docs/playbooks/3d.md`**（手册铁律）；拾取件加无头测试（ray 求交纯函数部分）+ 真浏览器点选自证。完工逐件标 ✅。

## REQ-3D-世界空间 UI 表达 · WorldUI3D 超越飘字（owner 2026-07-07「3D UI 表达·两者都要」） · [2026-07-14] · 提出：UI/game-i session → P3D · status: **✅ #1#2 done（P3D 2026-07-14）；#3 diegetic ✅ done（P3D 2026-07-15·消费方=展示台·CSS3D 路线）** · 优先级: P2 · 类型: 3D UI 能力
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-震屏首见基线 · CameraShake 装载首帧白震一次 · [2026-07-15] · Lead 验收超休闲六连批时发现 → **指派：P3D** · status: **✅ done（P3D 2026-07-15）·连带修 flash/impulse 同类·Lead 复核 ✅（a2e161fe 修法/测试对版）** · 优先级: P2 · 类型: 小修（camera-rig.ts + 一条测试）
> 回执/裁词全文见 git 历史（`git log -p -- docs/workflow/requests-3d.md`）——池只留活跃（context-budget 铁律）。

## REQ-3D-G211-HARDLINE · game211 三项硬红线违规无跟踪 + 无工单池文件 · [2026-08-10] · 引擎深审轨 C 发现（Lead 坐实） → **status: ✅ done（①建池已落·② Lead 2026-08-18 裁 A 结案——基线豁免入册 audit-baseline.json·详见 docs/design/game211/requests.md REQ-G211-HARDLINE 裁决全文）** · 优先级: P1 · 类型: 治理缺口（红旗棘轮/硬红线）
> **实证**（`node scripts/game-skill-audit.mjs` 全扫·深车道 `audit-ratchet.test.mjs` 因此常红）：game211 裸 Math.random×8 + innerHTML×29 + createElement×34，**无基线条目**；且 `docs/design/game211/` 目录不存在——该游戏连工单池文件都没有（3D 池里仅 REQ-3D-CARD-FACE-AXIS 一条物理面单，与本条无关）。
> **请 P3D**：① 建 `docs/design/game211/requests.md`（工单随游戏走）；② 按 REQ-G102-HARDLINE 同款路径裁「补基线豁免（带理由·可见名单）」或「重构走引擎种子 PRNG / LayoutNode」——裁前这 3 项在深车道红着，别静默。
> **① ✅ done（2026-08-10·复查 session 抢锁做的·只取①·② 仍 open 待裁）**：池已建 = `docs/design/game211/requests.md`，条目 `REQ-G211-HARDLINE`（含逐条归属核算 + 先查留痕 + A/B/C 三条路 + Lead 推荐）。
> **⚠ ② 裁决前必读这条更正**：逐文件对 game-g 核过——裸随机 8/innerHTML 29/React屏 1 **全部继承**（计数与 game-g 逐文件相等），但 **createElement 34 ≠ game-g 31，多出的 3 处是新写的**：`games/game211/duel-spike.ts:224/226/229`（3D 试验台 wrapper/stage/uiHost 挂载脚手架·与已获 Lead 批准的 `game-z` createElement×4 同形同域）。**故「照 game-g 同等豁免」= 写 31 = 门禁仍红**；裁 A 须写 **34** 且对这 3 处单独具名批注，否则等于把新债混入「既往不咎」（正是 `audit-baseline.json` `_doc` 点名的历史事故形状）。
