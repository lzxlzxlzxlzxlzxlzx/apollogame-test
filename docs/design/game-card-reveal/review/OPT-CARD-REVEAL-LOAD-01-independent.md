# OPT-CARD-REVEAL-LOAD-01 · 独立复查

结论：**PASS**。复查人未参与本单施工；复查日期：2026-10-13。

## 独立核证

- 共享资产测试：`asset-manager.test.ts`、`game-art-load.test.ts`，31/31 PASS。
- App 测试：68/68 PASS；根 TypeScript、App typecheck、build、`verify:dist` PASS。
- 文档闭包、`game-skill-audit game-card-reveal`、红旗棘轮、上下文预算均 PASS。
- 真 dist 隔离浏览器：浏览器实收 `assets/index-CrZ1PFOe.js`，SHA-256 为 `EE0974E7162CA64B62FD2F08C74FDAE3BE1FE0C315D7091866EC5D360C0C1FB5`，与当前 dist 一致。两张宿主慢图仍 pending 时 P2 已启动；P3 首帧前完成冻结；P5 后放行迟到图，canvas 字节不变；skip 只完成一次；pagehide 后迟到图不复活。正式模式未请求 `pack.back` 或 preview 卡图。临时服务与无头浏览器均已关闭。
- 撤修验红：在隔离副本以锚点注释禁用 `AssetManager.adoptLoaded`，22 项测试中原子转移、迟到加载防覆盖、clear 后防复活三项准确转红；正式源码未被修改，隔离副本已删除。

## 复查退回与闭环

首次直接运行正式浏览器探针时等待 canvas 超时。实查发现探针读取的是可能过期的 `witness-static`，而非刚构建的 dist；手动刷新见证目录后通过。该夹具缺陷已退回施工人修复：探针现在先验证 dist、直接从 dist 提供 App，并硬校验浏览器实收 bundle 的 URL、状态和字节哈希。修正后由复查人再次直接运行，退出码 0。

## 告警

- Vite 仍报告单 chunk 大于 500 kB。它不影响本单正确性，但本单不能据此宣称包体积优化已经完成。
- 本机隔离宿主的毫秒数只证明定序与不阻塞，不代表 DokiWorld 线上冷启动分布。
- 未运行全库 scoped gate：共享工作树包含大量跨项目在途改动，且本地缺少其期望的基线引用；本结论只覆盖本单点名范围。

未推送、未部署、未启动整套 ZeroCraft，也未修改远程状态。
