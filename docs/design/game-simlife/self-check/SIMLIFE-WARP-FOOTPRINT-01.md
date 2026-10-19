# SIMLIFE-WARP-FOOTPRINT-01 施工自检

日期：2026-10-13  
施工主体：BDM程序  
结论：**完成；施工自检 PASS，非施工人独立复查 PASS。**

## 架构结论

按 Owner 已裁 A，将多格建筑入口交互下沉为共享 Life 数据合同：authoring warp 以可选 `interactionPlacementId` 显式引用同场景 placement；compiler 把该 placement 的 `x/y/width/height` 固化为 runtime footprint；activity 与 navigation 只消费这份 runtime 数据。`landmarkPlacementId` 仍只承担渲染与视觉审阅，不能成为模拟权威。未声明新字段的 legacy warp 继续是 `at` 上的精确 `1×1`。

## 实现核对

1. authoring、runtime component 与 tier-3 schema 已加入闭集字段；严格校验拒绝空 id、未知 placement、跨场景引用和 `at` 不在 footprint 内，且没有 fallback。
2. compiler 对显式引用投影 placement footprint；legacy 路径投影 `{x: at.x, y: at.y, width: 1, height: 1}`。
3. activity 的附近提示和 navigation 的 `LifeWarpRequest` 位置校验共用 footprint containment；仍必须显式 E/action 才传送。
4. 严格世界视觉语义门要求多格 `kind=building` 地标绑定同一个 `interactionPlacementId`；素材 brief/display footprint 按 placement 的精确宽高生成。
5. 魔王城森林拱门、地下入口及两个返程入口均显式绑定对应 placement；森林入口 `at` 已修正到 2×2 footprint 内。
6. 生成 prompt/schema、Life authoring 文档、Generation Workflow 与 Asset Slot Brief 已同步该合同；未调用图像模型或批准新素材。

## 机器实证

- 定向回归：`8 files / 84 tests` 全绿，覆盖 package validator/compiler、activity、navigation、world visual semantics、Generation Bundle、Demon Castle contract 与 renderer。
- TypeScript：`npm.cmd exec tsc -- --noEmit`，exit 0。
- 相关 ESLint：exit 0，零 warning。
- Build：`npm.cmd run build`，PASS；仅既有 chunk-size warning。
- `node scripts/context-budget-guard.mjs`：PASS。
- `scoped-gate --run`：因共享脏工作树被判 FULL，并在 33 条既有/并行 depcruise 跨层违规处停止；本单新增文件未形成新的点名违规。该结果不冒充全库门禁已绿，定向 tests/tsc/eslint/build/context 均已分别实跑。

## 撤修验红

临时把 `life-activity.ts` 的 footprint containment 撤回为 `warp.at` 单点判断后，锚点用例 `projects the same explicit warp affordance on all 2x2 footprint cells...` 精确转红：位置 `2,1` 期望 `['gate']`，实际 `[]`。恢复实现后该文件全绿，探针未残留。

## 受控正式物化

先执行零写入 `--plan-update`，确认 `conflicts:[]`、目标仅为魔王城四个正式工程文件，再使用工具给出的 current/confirmation hash 执行 `--update`。写入后重跑 plan，确认 canonical files hash 完全一致：

- 更新前 files hash：`sha256:4d08c133...`
- confirmation hash：`sha256:fa2566aa...`
- 更新后 files hash：`sha256:b60b324d...`
- 正式 `life.json`：`sha256:52516081...`，14116 bytes
- 正式 `asset-slots.json`：`sha256:b09670b0...`，30130 bytes
- `life-host.json`：`sha256:ac336d84...`，708 bytes
- `life-launcher.json`：`sha256:b16d7551...`，376 bytes

最终 `--plan-update` 返回 `currentFilesHash == filesHash` 且 `conflicts:[]`；正式落盘后的 84-test 回归、tsc、eslint、build 均通过。

## 独立复查要求

复查人必须独立读取合同与正式文件，复跑定向测试，完成一次带锚点命中断言的 activity 点判定撤修验红，并核对：四格内提示/执行、外部格拒绝、legacy 1×1、四类精确 validator 错误、`landmarkPlacementId` 非权威、魔王城 candidate/正式四文件一致以及完整 warning 输出。

