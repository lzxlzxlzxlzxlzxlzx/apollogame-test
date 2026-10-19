# `game-card-reveal`《星辉启封》能力总览

> S1-P 冻结基准：`prototype.dc.html` + `prototype-notes.md`。逻辑画布固定 `1440×900`。
> 本文只定义正式实现的能力边界；禁止复制原型中的自由 DOM / Canvas / JavaScript。

> 2026-10-16 特定补充：Owner 对 `SETTLEMENT-PARITY-01` 明确选择 B。仅 DokiWorlds App 的 render-only 边界可用专属离屏 Canvas 将当前结算卡包/卡牌合成为 Sprite 纹理；不改变 sim、引擎渲染器或演出解释器。该局部例外不推翻本计划其他禁止自由 Canvas 的规则，也不等于 owner 已验收视觉 1:1。

## 1. 游戏一句话

DokiWorld 把已经抽出的 `1–5` 张有序卡牌和卡面图片交给本 App；App 不参与随机、扣费或发奖，只以冻结的 P2→P5 时序播放卡包聚焦、快速撕顶、逐张揭示和结果陈列，并在自然播完或玩家跳过到终态后仅回报一次“已观看”。

## 2. 消费的引擎能力（registry 实名）

| capability（注册名） | 用来做什么 | 状态 |
|---|---|---|
| `a-transform` | 卡包、撕片、包体和卡牌的二维位置、旋转与缩放 | ✅ 现有 |
| `a-visibility` | 未参与当前数量/阶段的实体显隐 | ✅ 现有 |
| `l1-sprite` | 包装、撕片、包体、卡面和回退图的贴图槽 | ✅ 现有 |
| `l2-color` | 透明度与颜色投影 | ✅ 现有 |
| `l3-frame` | 统一包装 atlas 的正/反面帧；不承载运行时任意曲线裁切 | ✅ 现有 |
| `t1-tween` | 简单单段位置、旋转、缩放和透明度缓动；只作为新能力的底层语义参照，不冒充多段编排器 | ✅ 现有但不足以独立闭环 |
| `t3-timeline` | 固定 tick 的阶段 cue、跳过补发和完成信号；只管“何时” | ✅ 现有 |
| `t2-clickable` | 跳过演出、结果页确认/关闭等具名 Signal | ✅ 现有 |
| `t2-keybind` | `Space/Enter` 跳过、`Escape` 请求退出的受控键位 | ✅ 现有 |
| `t2-effect-apply` | 完成 flag、阶段 flag 等信号后的闭集写入 | ✅ 现有 |
| `t2-presentation-track` | 信号触发的多实体、多段 keyframe 演出；并行通道、稳定层级、暂停/恢复、跳过落终态 | ✅ 已交付并于 2026-10-10 独立复查 PASS |

不消费：卡牌牌堆、抽卡随机、概率、库存、战斗、存档、数据库、AI。宿主已决定卡牌内容与顺序，App 内不得重新洗牌或改序。

## 3. 摆成数据的规则面

### 3.1 DokiWorld 输入合同 v1

- contract：`doki.game.card-reveal-input`
- version：`1`
- `presentationId`：非空稳定字符串，最大 128 字符；只用于幂等回报关联。
- `cards`：有序数组，长度闭集 `1..5`；数组顺序就是揭示顺序和最终排列顺序。
- 每张卡只接受：
  - `id`：非空稳定字符串，最大 128 字符；同一输入内唯一。
  - `faceImageUrl`：HTTPS URL；开发预览可由显式 preview fixture 使用包内相对路径，不把该例外带入正式宿主输入。
  - `alt`：可选纯文本，最大 80 字符，仅作无障碍/失败回退，不进入规则。
- 顶层和卡牌对象均采用闭集字段，未知字段拒收；总输入继续受 SDK `64 KiB` 上限约束。
- 不接收 `seed`、概率、稀有度、首次获得、卡包皮肤、动画时长或任意脚本。当前冻结原型没有这些可见语义，避免提前加宽合同。

### 3.2 DokiWorld 输出合同 v1

- contract：`doki.game.card-reveal-result`
- version：`1`
- data：`{ presentationId, outcome: 'viewed', completion: 'natural' | 'skipped' }`
- 自然播放到 P5 稳定终帧，或玩家主动跳过并先落到同一 P5 终态后，才允许 `complete()`；每个会话至多一次。
- `Escape`、宿主卸载、初始化失败、非法输入、卡面预载失败或普通失焦均不得伪造 `viewed`。这些路径只请求退出、停留回退态或等待玩家处理。
- `data: {}` 的 standalone / preview 模式使用内部 1–5 张 fixture，不调用 `complete()`。

### 3.3 数据表及解释器

| 数据表 | 内容 | 谁解释它 |
|---|---|---|
| `CARD_REVEAL_CONTRACT_V1` | 输入/输出闭集、数量、长度、URL 安全和幂等边界 | DokiWorld SDK 接线层 + 本 App 纯校验函数 |
| `PACK_ATLAS` | 统一 AI 包装原图中的 front/back source rect | `AssetManager` atlas + `l1-sprite` / `l3-frame` |
| `PACK_TEAR_ASSETS` | 由同一冻结包装离线导出的互补 `top/body` 透明 PNG | `AssetManager` texture + `l1-sprite`；不是运行时撕裂算法 |
| `PRESENTATION_TRACKS` | P2–P5 的实体 keyframe、阶段并行关系、时长、easing 与最终 pose | 路线 A 时由 `t2-presentation-track`；路线 B 时为受控游戏层例外 |
| `CARD_COUNT_LAYOUTS` | `1..5` 五种最终阵列和对应活动实体数量 | 启动时的纯数据选择；由上述演出解释器消费 |
| `REDUCED_MOTION_TRACKS` | 冻结语义不变的短时、低位移轨道 | 同一演出解释器；不另写第二套运行器 |
| `HOST_TEXTURE_BINDINGS` | `host-card:0..4` 稳定 key 到已校验 URL 的映射 | 现有 `AssetManager.register()` + `ImageAssetLoader` |

### 3.4 冻结的首版时序

- P2：`2000ms`，八包建立 → 顺时针旋转 → `#3` 减速锁定 → 聚焦英雄位。
- P3：`1050ms`，完整顶片沿浅弧互补断口快速分离并飞走；余包下坠；真实叠放卡组上升。
- P4：每张卡使用同一实例执行“完整展示 → 克制轻摇 → 向右飞入画外队列”；下一张仅因遮挡解除自然显现。
- P5：同一批实例从右侧队列召回，按 `1..5` 对应布局排列；不得销毁重建。
- 标准完整时长：N=1/3/5 分别约 `5200/7340/9480ms`；reduced-motion 为 `2140/2880/3620ms`。
- 失焦/隐藏时暂停且不累计墙钟；恢复后保持暂停或从冻结进度继续，绝不跳阶段。

## 4. 申请的游戏层代码例外

| 例外 | 为什么现有能力表达不了 | 预计行数 | Lead 裁决 | 偿还计划 |
|---|---|---:|---|---|
| DokiWorld 合同适配与会话幂等壳 | 每个 App 都需要自己的闭集 contract 和输出类型；只做校验、映射与 SDK 生命周期，不解释演出 | 120–180 | ✅ 接受 | 无；合同本来就属于 App 边界 |
| `1..5` 输入到实体/轨道数据的纯装配 | 数量由宿主数组决定；装配只选择预定义布局和复制 key，不逐帧写 Transform | 60–100 | ✅ 接受 | 若后续出现第二个同构列表演出，再评估通用模板装配器 |
| P2–P5 专属演出控制器 | 现有 timeline+tween 无法多段重放、并行和统一跳过终态 | 250–400 | ❌ owner 已选 A，禁止 | 不产生此债；统一下沉 `t2-presentation-track` |

裸 DOM/Canvas、游戏专属渲染器、运行时图片裁切器、远程纹理加载器、`Math.random` 均不接受例外。

## 4.5 美术接入

- 主体皮肤槽：`pack.front`、`pack.back`、`pack.tearTop`、`pack.tearBody`、`card.face[0..4]`、`card.fallback`；所有主体均有 `Sprite.textureKey`。
- 包装源：`ui-refs/pack-unified-ai-v1.png` 只作为 S1-P 参考；S5 必须导入游戏本地资产目录并登记 `assets/index.json`。top/body 是从该同一源图离线派生的确定性透明资产，不算第二套包装。
- 卡面源：宿主 URL 只在运行时资产层注册为 `host-card:<index>`；sim/蓝图只见稳定 key。加载失败显示包内 fallback，不把 URL 写进 ECS、快照或输出。
- 台账：编译期游戏须提供 `game-card-reveal.asset-slots.json`（或按现有样板的推导脚本）并通过孤儿槽/消费槽审计。
- 资产闭包：包装、撕片、fallback、图标、字体/音效必须随 dist；宿主卡面是合同声明的 runtime external，不纳入包内闭包，但须在调用说明列明来源、CORS 与失败降级。

## 4.6 UI 呈现与华丽起手

- 主舞台是透明 play-field，不使用 LayoutNode 重画卡包和卡牌。
- LayoutNode 仅负责跳过、暂停/继续（若保留为玩家控件）、加载失败说明与结果确认；使用 `apolloOnyx`，主 CTA 用成熟 `sheen-hover`/高对比按钮状态。
- 不直接 import starter home；本 App 无主菜单，宿主进入即播。结果陈列本身替代通用结果面板，这是已冻结原型的明确产品方向，不构成朴素屏例外。
- 成熟件：`Particles` 只在后续 comet/庆祝能力获准时使用；当前 P2–P5 不凭空添加原型外粒子。

## 4.65 对手/敌人 AI

无对手、敌人或 NPC 决策，不适用。

## 4.7 代码准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 输入/输出合同、1–5 数量、完成语义 | L0/L1 | 闭集数据 + SDK 生命周期 |
| 包装正反面、撕片、卡面 key | L0/L1 | 资产描述符 + Sprite |
| 固定时序 cue 与跳过完成信号 | L1 | `t3-timeline` |
| P2–P5 多段运动 | L2 capgap | `GAP-CARD-REVEAL-01`，待 owner 裁决 |
| 游戏层自由逐帧 Canvas/DOM | L4 | 禁止 |

## 4.8 缺口裁决：`GAP-CARD-REVEAL-01`

### 先查证据

1. `Sprite` 只有 `textureKey/anchorX/anchorY/zOrder`；CanvasRenderer 只按已解析 source rect 整帧绘制，未提供任意曲线 mask。
2. `t1-tween` 的目标闭集只有 `Transform.x/y/rotation/scaleX/scaleY` 与 `Color.alpha`，同一实体只有一个 `Tween` 组件；无法同时跑 x+y+scale+alpha，也无法串接多段或被 Signal 通用重播。
3. `t3-timeline` cue 只允许 signal/flag/resource/spawn；它能安排“何时”，不能声明“实体沿哪条曲线怎么动”。
4. `Anim3D/Path3D` 是壁钟驱动的 3D 表现件；`Billboard3D` 始终朝镜头且不消费 rotZ/多段 opacity，不能 1:1 表达冻结的二维轻摇、同一实例多段进出和统一跳过终态。
5. `PACK_TEAR_ASSETS` 可通过离线派生解决，因此任意曲线 mask 不列为缺口；远程卡面可用现有 AssetManager 注册，也不列缺口。

### A：补通用 `t2-presentation-track`（Lead 推荐）

- 新增一个通用、render-only、信号触发的二维 keyframe 轨道能力。
- 闭集目标：`Transform.x/y/rotation/scaleX/scaleY`、`Color.alpha`，可选 `Sprite.zOrder`/`Visibility.visible` 仅允许在离散 keyframe 切换。
- 每实体允许多个并行 channel；keyframe 只接受 `at/value/easing`，稳定同刻顺序；支持 `playOnSignal`、`pause/resume`、`skipOnSignal`、`resetOnSignal` 与明确 `finalPose`。
- 演出状态只服务表现，不被玩法 Condition 读取；跳过必须原子落到与自然播放一致的终态并发一次 done Signal。
- 代价：新增共享组件、system、注册表、trace/测试与渲染定序复查，属于引擎共享面和定序面，必须由主程施工、另一人独立复查。
- 影响面：后续抽牌、发牌、开箱、结算飞入、角色进退场均可复用；能消除多个游戏已有的专属 presentation controller。
- 选错代价：如果只为本作过度设计，会扩大引擎面；因此 v1 严格限制为二维表现字段与信号闭集，不做任意回调、脚本、贝塞尔编辑器或资源加载。

### B：允许 `game-card-reveal` 专属 presentation controller

- 在游戏目录实现固定 P2–P5 状态机，逐帧写 Transform/Color/Visibility；输入只选择 N=1..5 的预定义数据。
- 代价：开发快、影响面小，但形成 250–400 行游戏专属解释器，其他抽牌/开箱演出不能复用；跳过、失焦、快速重播和 reduced-motion 都需本作自行维护。
- 选错代价：以后第二个同构演出出现时必须偿还为通用能力，并重写本作；也更容易让正式实现偏离原型时序。

### Lead 推荐

推荐 **A**。这里缺的不是“星辉启封专属规则”，而是多款游戏都会用到的信号触发多段表现轨道；现有 rhetoric-duel 已出现专属 presentation controller，已具备第二个消费方证据。

**Owner 裁决（2026-10-09）：选择 A。** `t2-presentation-track` 必须先按共享引擎能力施工、撤修验红并由非施工人独立复查；交付前 `GAP-CARD-REVEAL-01` 保持 `accepted/in-progress` 并锁住 S3+。不得退回 B 或在游戏目录先写控制器占位。

## 5. 确定性声明

- 本 App 无随机源；固定选中包 `#3` 只是演出构图，不代表抽取结果。
- 卡牌顺序完全继承宿主输入；同一合法输入和同一 reduced-motion 设置得到同一阶段、实例顺序与终态。
- 规则层使用 SDK 会话幂等；表现层时间不进入奖励判定。失焦暂停、资源加载完成时刻与 reduced-motion 属 render-only，不进入输出内容，除非玩家明确执行 skip（只改变 `completion` 枚举）。
- 不需要多人 lockstep；仍要求时间线和跳过具备可测试的确定终态。

## 6. 评审记录

- 提交人 / 日期：策划 Lead / 2026-10-09
- Lead 裁决：🔶 有条件接受；合同、资产路线和除多段演出外的能力重组成立。
- Owner 裁决：2026-10-09 选择 A；`GAP-CARD-REVEAL-01` 已转 `accepted`。
- 唯一前置已完成：`t2-presentation-track` 于 2026-10-10 通过非施工人独立复查，缺口已转为 `delivered`，S3 已解锁。
- S1-P owner 判词：FINAL 原型冻结，可进入 S2。
