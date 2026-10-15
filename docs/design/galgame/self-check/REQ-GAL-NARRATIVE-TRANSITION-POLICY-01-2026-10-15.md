# REQ-GAL-NARRATIVE-TRANSITION-POLICY-01 施工自证（2026-10-15）

施工主体：Codex/root。范围只限共享叙事表现投影。GAL 设置页「转场演出」仍禁用，未改 `src/ui/**`、Profile、V2 原型、资产或 Owner 人门。

## 合同

`NarrativeTransitionPolicy` 接收已提交的包/章/节点 ref、闭集 `cut|fade|wipe|dissolve`，以及 `{enabled, reducedMotion}`。宿主自己调用 `advance` / `skip`。关闭优先于减少动态，两者都收成 `cut` 的同一终态。每次 `project` 作废旧 token；回滚、读档、回想、卸载和失败先清掉旧投影。服务不保存 GalPackage、Profile，不用墙钟，不写 World。拒收和相位变化只在调用方传入且已挂 `DebugTrace` 时记录。

## 复跑

`npx vitest run src/services/presentation/narrative-transition-policy.test.ts src/services/presentation/committed-transition.test.ts`

撤修前为 2 文件、10/10。撤修锚点是 `narrative-transition-policy.ts` 中 `effective !== declared` 的 decision 记录：改成恒不记录后，点名「collapses disabled and reduced-motion」1 失败、5 跳过，断言期望三组 `['decision','wipe']`，实际 `[]`。恢复该判断后重跑仍是 2 文件、10/10，退出码 0。

## 不签

不签独立复查、设置页启用、S5/S6 或 `ui-settings-confirmations` 人门。
