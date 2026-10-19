# DokiWorld 文档摄入实验包独立复查（2026-10-14）

复查对象仅为新建的 `dokiworld/game-clue-investigation/**` 实验 App 与 `release/game-clue-investigation/game-clue-investigation-dokiworld.zip`。复查人 `/root/s3click_independent_review`，非本包施工者。**判词：PASS，仅限本地文档摄入实验包的身份、文档、构建与文件闭包；不是正式游戏支持、DokiWorld 平台联调或 S8 整关 PASS。** 未修改源码、游戏 pipeline、项目路线图或 Owner 人门；独立 build 只重生该 App 的本地 `dist/`。

## 独立证据

- 逐读 `manifest.json`、`docs/integration.zh-CN.md`、`src/main.ts`、`src/index.html`、`scripts/build.mjs` 与 `tests/manifest.test.mjs`。manifest 中英 locale、页面标题/正文与中文文档首段均显著标明“文档接收实验”，文档明确说不接正式现场数据、不加载 PNG、不创建游戏 World、不会返回结算结果。`src/main.ts` 仅 `createAppClient → connect → whenReady`；空 `data` 显示 preview 提示，错合同/非空 `data` 请求退出；源码中 `app.complete()` 0 次、`app.requestExit()` 3 处、`fetch()` 0 次。
- 独立 `node --test tests/*.test.mjs`：构建前和构建后均 **2/2 PASS，exit 0**。测试核 schema 3、协议 v2、包内中文文档，以及 dist 文档逐字节、`SHA256SUMS.txt` 全文件集合和每项 SHA-256。
- 独立 `node scripts/dokiworld-docs-guard.mjs game-clue-investigation`：构建前后均 **exit 0**，输出 `✓ DokiWorld App documentation closure: 1 current app(s)`。
- 在 App 目录独立 `npm run build`：**exit 0**，输出 `Built DokiWorld document-ingestion experiment to .../dokiworld/game-clue-investigation/dist`，未见 stderr warning。重建后源码与 dist 的 manifest、中文文档哈希分别相同。dist 包含 `index.html`、`manifest.json`、`docs/integration.zh-CN.md`、单个相对路径 bundle 及 `SHA256SUMS.txt`；bundle 为 7929 bytes，未见本机 `C:\Users\` 绝对路径或 `/public/` 开发前缀。
- 用只读 ZIP 检查 `release/game-clue-investigation/game-clue-investigation-dokiworld.zip`：根部恰有上述 **5** 个文件，无多包一层目录；ZIP 文件集合等于重建后的 dist 文件集合，逐项 ZIP 解压流 SHA-256 等于对应 dist 文件 SHA-256。`SHA256SUMS.txt` 列出除自身外 4 项，集合及哈希由独立测试复核。

## 不扩张的边界与关注

- manifest 仍声明目标正式 input/output 合同名称；文档多处明确这些仅为目标产品标识，本实验包不会产生 output。**不得**凭 manifest 的 `runtime.outputs` 宣称正式合同已实现。
- 现有 2 项自动测试只覆盖 manifest、文档和 SHA 闭包；没有假宿主对空 `data` preview、非空业务输入 `requestExit()`、错误合同、SDK 超时或 `complete()` 零调用的运行态测试。本次源码审阅与本地构建不等于已在 DokiWorld 平台验证文档实际显示，也不等于正式 game host/动态 PNG/结算/子路径运行通过。
- 本结论不改变此前 `S8-independent-2026-10-14.md` 的整关 **FAIL**：共享工作树非净树、全仓测试有红、无 blessed golden，以及正式 DokiWorld 游戏接入仍待独立验收。未执行 Git 远端写入、上传或 Owner 人门。
