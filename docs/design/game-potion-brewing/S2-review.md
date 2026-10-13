# 《坩埚炼药》S2 独立复查（2026-10-12）

## 最终判词：PASS（S2 文档与裁决；能力实现未交付）

复查主体：`/root/s2_review`，与 S2 文档施工主体 `/root` 不同。范围为能力计划、缺口机读台账、DokiWorld 合同、游戏级工单与项目路线图；只读核对 registry、能力/输入源码、vendored SDK 和相关手册。首轮 `CONCERNS` 后施工主体修订，Owner 对新发现 G4 另答“A”，本记录在第二轮独立复核后升级为文档复查 `PASS`。未修改被审文件，未运行 Git/GitHub 命令或启动服务。**PASS 不等于 S2 Owner 人门通过，不等于 G1–G4 能力交付，更不授权越过机器缺口锁进入 S3。**

## 已核实并修正的问题

1. Owner 本会话只对 G1/G2/G3 答复“全部A”。`capability-gaps.json:3-27` 将三条记为 `P1 / engine / accepted`，而非 `delivered`；`requests.md:45-70` 明说待引擎施工和独立验证。`src/assembly/capability-registry.ts:106-118,119-140,174-195,236-245` 当前只登记所列现有能力，拟增 G1/G2/G3 不是已实现 API。此处未发现冒充交付。
2. 原计划“锅外释放忽略”缺少接线，现已在 `capability-plan.md:13-14,32` 和 `requests.md:67-68` 写明材料的 `Draggable.onlyFlag` 与 `Clickable.onlyFlag` 共指常 false 的固定 Flag，锅外保持权威 Transform，锅口投放仍可代点。这与 `src/skills/tier2/drag-place.ts:145-153`（投放区先于拖拽门、锅外才查门）、`:247-254`（代点发 `Clickable.action`，不查 Clickable 门）及 `src/skills/tier2/clickable.ts:92-96`（关门不参与单击命中）一致。S4 仍须真手势复验。
3. 现有 DropZone 信号只有 `name=Clickable.action`、`source=被拖实体`，没有材料 `arg`（`src/skills/tier2/drag-place.ts:221-254`）。现已在 `capability-plan.md:32,35` 和 `requests.md:50-51` 固定完整 `brew.add.<ingredientId>` 动作名，G1 按全名匹配，材料单击不得提交；不再依赖不存在的参数。
4. 合同已将开局前不可恢复错误的 `requestExit/cancelled` 与终局后 `complete` 被拒/超时的“保留同一结果、待确认”分开（`contract-v1.md:61-63`）；`contract-v1.md:7,40-47` 也补齐步骤对象键闭集、`kind=add|stir` 和 Unicode code point 计数口径。与 vendored `vendor/dokiworlds-app-sdk/src/index.d.ts` 的 `AppContract`、`complete(): accepted|rejected`、`requestExit()` 契约相容。
5. `docs/projects/game-potion-brewing/project-roadmap.json:14-15,104-108` 现已将 S1 Owner 人门描述与 `done/approved` 对齐；`requests.md:18` 亦已改为“已通过”。

## 首轮阻断：G4（已另获 Owner A 裁决）

定稿原型要求材料拖动中跟手、锅外释放后回弹（`requests.md:103-104,139,186`）；`capability-plan.md:32` 也承诺该效果。现有 `PointerInputSource` 虽可选 `move:true`，但材料 `drag` 在松手时才由起点/终点合成（`src/net/host/queued-input.ts:45-56,65-101`）；`t2-drag-place` 每拍只消费该终点动作（`src/skills/tier2/drag-place.ts:125-147`）。LayoutNode 的 `draggable/dropZone` 是另一套 HTML5 DnD 接线（`src/ui/components/types.ts:92-95`、`src/ui/components/server.ts:1000-1015`），不能直接充当 play-field 的鼠标/触控椭圆投放预览。固定 keyframe 表现也不解释实时跟手。

首轮 `requests.md:32-41` 留下 G4 的实查、A/B 代价与推荐；当时 Owner 的“全部A”仅覆盖先前提出的 G1/G2/G3，不能外推为 G4 裁决，因此 G4 曾以 `open / P1` 锁住 S2。Owner 后来单独回复“A”，以下第二轮以更新后的文件为准。

## 第二轮独立复核与最终裁定

1. Owner 裁决范围已区分：`requests.md:20-30` 的原批“全部A”只属 G1–G3；`requests.md:32-48` 独立列出 G4 A/B、Owner 单独选 A、通用预览施工规格与点名验收；`capability-plan.md:19-24,38-47,65-73,81-85` 将四条均列为 L2 通用能力待交付，B 类游戏代码例外均不批准。没有把 G4 悄悄归入原批裁决。
2. 我独立调用只读 `readCapabilityGaps` / `evalCapabilityGaps`：`errors=[]`，`open=0`、`accepted=4`、`delivered=0`，返回 `state:"ok"`；四条均为 `P1 / engine`、有工单指针、ID 唯一（`capability-gaps.json:1-38`）。G1/G2/G3 仍分别锁 S3/S4/S8；G4 锁 S4/S5/S8。依 `scripts/game-pipeline.mjs:170-220` 和 `docs/playbooks/game-production.md:45,53-64`，这是 **S2 缺口已裁决**，不是后续能力已交付。
3. G4 的首轮接缝疑点已写实：`requests.md:46-48` 明确现有 `PointerInputSource` 仅有 down/move/up，`pointercancel`、`lostpointercapture`、失焦清理和 `pointerId` 活跃指针守卫属于 A 路待补；这与 `src/net/host/queued-input.ts:65-107` 一致。预览将调用 G3 抽出的同一共享纯命中判定，权威提交仍只由 `drop-zone` Signal 产生，避免复制一套椭圆几何或让视觉层自行提交。预览不入 World 快照/hash 及宿主输出的要求和默认关闭零回归验收均在规格中，而非声称现状已有。
4. `contract-v1.md:7,36-49,53-63` 明确单配方严格输入、步骤闭集/引用/圈数/展示色、仅 `success|failure` 的业务输出、开局错误的取消与终局后 `complete` 拒绝/超时的未确认状态；与 vendored SDK `GUIDE.md`、`src/index.d.ts` 的 envelope、`whenReady`、`complete` 回执和 `requestExit` 边界相容。`capability-plan.md:49-59` 已填主体美术槽、house 主题、闭集 UI 富屏及透明背景验收，不把不适用的固定星级/分数 starter 结果屏硬套本局。S2 Owner 人门仍须确认 `contract-v1.md:65-68` 的建议上限与合同冻结。
5. `requests.md:52` 及 `project-roadmap.json:110-154` 已同步四条 `accepted`、能力未交付和 S2 Owner 门未通过；路线图中的首轮 CONCERNS 标签被标为历史、修订版待审，不再把 G4 写成“待裁”。引擎主池当前 11 个 `### REQ-` 占位，四票尚未冒充入池；排期和后续实现仍受清槽、归属、独立复查与门禁约束。

最终 **PASS 仅覆盖 S2 文档/裁决质量的独立复查**。未运行会写 `pipeline.json` 的 S2 gate，也未进行引擎实现的撤修验红；这些不构成本复查的既成事实。S2 项目控制台的人门仍由 Owner 本人操作；G1–G4 在 `accepted` 状态下仍锁各自后续阶段，任何实际能力验收须另由非施工者独立复跑。
