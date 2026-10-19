# 资产库阅读入口（兼容旧角色引用）

> 2026-10-13 补齐失效导航。旧同名文件在当前工作树不存在；本页不是旧稿恢复，不定义新 schema、审批豁免或资产能力。

资产角色引用本路径时，应完整阅读以下现行规范，而非根据旧文档名称推断行为：

- [资产生产线手册](../playbooks/assets.md)：AssetIndex、导入、元数据、命中遮罩与统一装载路径。
- [美术生产线手册](../playbooks/art-pipeline.md)：游戏本地库、设计稿切图、消费槽、来源及人审边界。
- [当前美术管线](art-pipeline-asbuilt-2026-08.md)：现状权威；历史设计草案不替代它。
- [替换工作流](art-replacement-workflow.md)：台账与替换流程。

共享货架只作为资源来源，游戏消费自己的本地 AssetIndex。卡带的物理目录由 `scripts/art-paths.mjs::artRoot` 决定；URL 仍沿用 `/games/<slug>/art/`。登记字段以 `src/assets/asset-index.ts` 及其校验器为准。

本页不放宽 Owner 人门：不得伪造来源、许可、生成参数或 approved 状态。原型资产接入依照已批准的具体素材和设计稿交接路径办理；真正生成与共享货架入库仍守各自审核要求。
