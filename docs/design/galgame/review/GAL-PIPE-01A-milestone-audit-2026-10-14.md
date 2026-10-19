# GAL-PIPE-01A / draft-review-contract 门证审计

> 2026-10-14；非施工复查。复核后的判词：`GAL-PIPE-01A` 纯 P0–P4 合同局部 **PASS**；路线图验收口径已修正，原文字矛盾的 **CONCERNS 已关闭**。控制台门禁仍为 `selfCheck/review=pending`、`owner=required`，本报告不代签。

## 新旧证据核对

- 已有非施工者报告 [`GAL-PIPE-01A.md`](GAL-PIPE-01A.md) 记录当时本票 12/12、作者目录 64/64、稀疏数组实复现及 `basedOn` 内容指纹的唯一锚点内存撤修验红。当前 `src/authoring/gal-draft-{types,validate,review}.ts` 和本票测试相对 HEAD 无在途改动；本轮没有在共享工作树破坏实现或重复签署旧票。
- 本轮独立复跑 `npx vitest run src/authoring/gal-draft-review.test.ts --reporter=verbose`：隔离沙箱先因 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 退出 1、0 用例；在获准的非沙箱只读测试环境重跑退出 0、12/12。成功输出无 WARN 或 unhandled error。未启动应用/数据库/浏览器；无临时服务需清理。`src/authoring` 现有 Life 文件在途变化，故不拿当年 64/64 冒充当前目录全绿，也不重复跑与本票无关的 135 用例。
- 既有报告的隔离撤修因本票实现未变仍可作本票证据，**不能**推导出里程碑新范围已验。报告所述当时控制台 `planned` 是历史事实；当前路线图读取为 `review`，`selfCheck/review=pending`、`owner=required`。

## 路线图口径与时序

1. 本报告初读时，路线图 `acceptance[1]` 写“拒稿和上游修改使受影响下游失效”，与规格 §4 和测试 `src/authoring/gal-draft-review.test.ts:90-106` 冲突。GAL 程序随后通过合法保存入口改为“拒绝新候选保留旧批准链；仅上游新版批准或当前批准版撤销使受影响下游 stale/blocked”。本轮重读确认已修正；**该 CONCERNS 不再是现行缺陷**。
2. 初读时 `acceptance[2]` 的“未获批准草稿不能装配”易被误读为正式装配门已存在；现已改成“P0–P4 草稿一律 not_ready，不能直接装配正式 GalPackage；P5–P8 另行审核/组装”。这与 `src/authoring/gal-draft-review.ts:203-204` 及点名测试一致。真实 P8 装配/批准态过滤、`WritingEnginePort`、可信事件存储、审核人权限/并发、P5–P9 均明确不属当前纯合同范围；**不再拿后继工程缺件打回本里程碑**。
3. 最新验收三项与既有独立报告及本轮 12/12 定向复跑对应；就**纯 P0–P4 合同的局部技术范围**，没有发现新的验收缺证。控制台仍是 `status=review`、`selfCheck/review=pending`、`owner=required`；这表示门证尚未由合法入口确认，不能宣称里程碑已批准或完整产线可用。是否将现有 builder 自证和非施工者复查写入门禁由控制台合法流程处理，Owner 人门仍只由 Owner 本人裁决。

本报告只补里程碑证据审计，不改实现、不修改项目控制台、不代签任何门。全库类型/依赖门未在本轮复跑，不能报全绿。
