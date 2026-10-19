# S8 DokiWorld 文档接收实验包自检（2026-10-14）

## 范围与结论

产物 `release/game-clue-investigation/game-clue-investigation-dokiworld.zip`，App 版本 `0.1.0`。这是**文档接收实验包**，仅验证平台是否读取 schema 3 Manifest 与随包中文调用说明；不是正式搜查游戏接入，不接收正式输入，不加载背景/物件 PNG，不产生结果，不调用 `complete()`。

## 本地证据

- `node --test dokiworld/game-clue-investigation/tests/*.test.mjs`：2/2 PASS。包含 manifest/文档一致性和构建后 dist 文档字节及 SHA-256 闭包核验。
- `node scripts/dokiworld-docs-guard.mjs game-clue-investigation`：PASS，当前 app 文档闭包有效。
- `node dokiworld/game-clue-investigation/scripts/build.mjs`：PASS，构建到 `dokiworld/game-clue-investigation/dist`。受控本地构建首次在沙箱下因 Vite 解析 vendored SDK `realpath` 返回 EPERM；授权后的同一纯本地构建成功。
- ZIP 解压核验：根目录直接包含 `index.html`、`manifest.json`、`docs/integration.zh-CN.md`、`assets/index-DHdEzrQo.js` 与 `SHA256SUMS.txt`；4 个受校验文件均与清单匹配，文件集合精确，无额外包裹目录。
- `manifest.json` 声明 `dokiworld.app/2`、schema 3、App ID `game-clue-investigation`；文档路径 `docs/integration.zh-CN.md` 已随包携带。
- 非施工者窄范围独立复查 PASS，仅覆盖本地实验包身份、文档、build/dist 与 ZIP 闭包；测试 2/2、docs guard、重建均通过。复查人未改源码/流程板/人门，详情见 `review/S8-doc-ingestion-package-independent-2026-10-14.md`。

## 明确未验证/未完成

- 未上传至 DokiWorld，平台能否接收仍需 Owner 上传后确认。
- 没有正式宿主搜查 adapter、动态背景/物件/alpha hit-mask、完成结果、业务调用文档、正式 dist 子路径测试；该包不能用于这些验证。
- S8 终检独立复查仍为 FAIL，见 `review/S8-independent-2026-10-14.md`；本包的局部 PASS 不覆盖该 FAIL，也不代替 Owner S8 人门。
