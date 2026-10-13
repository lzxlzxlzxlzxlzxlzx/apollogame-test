# SIMLIFE-ENG-21 Review 单｜通用 2D 相机安全区跟随 + 地图边界钳制

## 1. 状态与边界

状态：**✅ 已由非施工人独立验收（2026-10-10）**。

- 施工主体：BDM程序（锁）。
- owner 裁决：A——扩写共享 `t2-camera-follow` 的闭集安全区数据能力，不新增 system/phase，不写 Little Valley/renderer/host 私补丁。
- 允许：`Camera` 数据合同/原子定义、共享 camera-follow、Life package schema/compiler、Little Valley JSON、对应手册/capability plan、点名测试与本设计目录自证/Review。
- 禁止：`src/ui/**`、资产、数据库、服务、Git/GitHub；renderer-private responsive cover 不得写回 World/Camera。

## 2. 待复查清单

1. `followDeadZone` 四边闭集、必填、有限且为 `[0,0.5)`；Life unknown/range/type/missing fail-closed，省略时 compiler 与旧相机行为保持兼容。
2. 现有 AABB 中点 + followOffset 仍是唯一焦点；fit zoom 先算，安全区使用 zoom 后可视世界尺寸；多目标与缩放不退。
3. 区内相机逐轴保持，四边越界恰落对应安全边，对角线独立修两轴；Bounds 最后钳制，小地图继续居中，目标 Transform 从不被写回。
4. Little Valley 真实连续输入覆盖 hold→scroll→地图边缘，四边 0.3 authoring 被严格编译为 `Camera.followDeadZone`。
5. responsive cover、Canvas/格高亮/WorldUI2D 共用投影，snapshot/hash/save/warp/zoom/host 回归不退；DebugTrace opt-in/no-op/密度与 hash 边界成立。
6. 独立复跑、带精确锚点的撤修验红、实证复现并阅读所有 warning；复查人不得采信本单自陈。

## 3. 施工实证（仅作导航，不构成 Review 结论）

- 共享实现：`l5-camera@1.1.0` + `t2-camera-follow@1.1.0`；安全区逐轴修正后再执行原 Bounds 分支，省略字段仍走原居中路径。
- Life：严格 `camera.follow.deadZone` authoring 合同，compiler 仅在声明时隔离复制成 `Camera.followDeadZone`；Little Valley 四边均为 0.3。
- 施工方回归：**19 files / 202 tests passed**；涉及 TS ESLint 零 warning；Vite build 754 modules；`DOCS-REF`、`SYSTEM-GRAPH`、audit ratchet PASS。
- 全库 tsc 仍只报既有 `game-dice`、`game-theft`、`src/launcher/game-runner.tsx`，未命中本单文件。
- 施工方撤修：唯一读取锚点临时改为 `undefined` 后点名精确 **1 failed / 18 skipped**，恢复后点名转绿；review 指出的 trace 心跳、跨多相机去重与无 trace 热路径分配已返修，save 回归的旧移动 tick 路径也已同步到当前 0.3 速度，最终复跑 202 测全绿。
- 自证全文：`../self-check/eng21.md`。

## 4. 独立复查结论

结论：**PASS，建议策划验收**。最终遗留 **blocker 0 / major 0 / minor 0**。

- 独立代码与行为核验确认：`Camera.followDeadZone` 与 Life `camera.follow.deadZone` 的四边闭集、必填/类型/有限值及 `[0,0.5)` 范围成立；Life unknown 字段 fail-closed，省略字段时 compiler 输出形状与旧逐帧居中语义保持兼容。
- `camera-follow` 继续以多目标 AABB 中点加 `followOffset` 为唯一焦点，先计算 fit zoom，再按 zoom 后世界可视尺寸逐轴判定安全区，最后执行 Bounds；四边、对角、小地图和地图边界用例证明不会写回目标 Transform。Little Valley 的 0.3 四边配置经真实连续输入走通 hold→scroll→右侧边界。
- 首轮独立复查实证发现并促成修正三处：静止 hold 每 tick DebugTrace 心跳、双 Camera 交替导致去重失效、无 trace 热路径创建专用闭包；最终实现改为顶层 helper、按 Camera subject 独立去重，连续静止和正中心无新增事件，实际变化才 decision/commit。另发现并促成 `save.test.ts` 将 ENG-20 前的旧移动 tick 路径同步为当前 0.3 速度路线；市长 flag、矿门 warp、save→restore 再次走通。
- 独立最终扩展回归命令覆盖 schema/manifest、Camera 原子与 follower、Life validate/compile/raw JSON、Little Valley、responsive Canvas、Life scene/highlight、WorldUI2D、host/save/warp/navigation 与 determinism，共 **20 files / 208 tests passed**，无 Vitest warning。涉及的 **13 个 TypeScript 文件** ESLint exit 0、零 warning。
- `component-manifest-guard`：当前/基线均 **205**，`COMPONENT-MANIFEST: PASS`；`docs-ref-guard`：**46 Markdown / 390 paths**，`DOCS-REF: PASS`；system graph：全局 **119 systems / 216 explicit edges**，点名 3 capability 子集 **5 systems** 无环，`SYSTEM-GRAPH: PASS`。
- `game-skill-audit game-simlife`：未覆盖红旗 0、`RATCHET: PASS`；唯一输出为既有薄宿主静态扫描黄项“零能力接入”，与 raw package 经共享 compiler/registry 装配的实况不冲突，已阅读且不构成本单回归。
- 独立撤修验红：锚点 `const deadZone = cam.followDeadZone;` 精确命中 **1**；临时改成 `undefined` 后点名用例精确 **1 failed / 20 skipped**，区内相机错误从 `(0,0)` 跳到 `(20,-10)`；精确恢复后同用例 **1 passed / 20 skipped**，随后 208 测全绿。
- 残留检查：恢复锚点 **1**、sabotage/诊断 marker **0**；误留的 `.review-04a-probe` 已在确认绝对路径位于当前工作区后定点删除，最终不存在。未执行 Git/GitHub、数据库或服务操作，未修改 `src/ui/**`。
