# S7 本机 loopback 图片调试自检（2026-10-14）

## 范围与结论

按 Owner 要求，为 DokiWorld 本机调试增加 loopback HTTP PNG 输入支持。App 版本更新至 0.2.1；正式环境 HTTPS 规则保持不变。例外仅在 App 页面本身来自 `http://127.0.0.1` 时允许图片来自 `http://127.0.0.1:<port>/*.png`。其它主机、凭据、fragment、非 PNG 及重定向离开 loopback 均拒绝。没有修改共享引擎、DokiWorld 部署目录或 S8 人门。

## 自检证据

- `node --test tests/contracts.test.mjs tests/scene-data.test.mjs tests/manifest.test.mjs`：13/13 PASS；含本机 loopback 合法输入、非 loopback/非 PNG/凭据/fragment 拒绝，且 HTTPS 既有路径仍通过。
- `npm run test:runtime`：1 文件 / 5 项 PASS；含 loopback 主机边界、HTTPS 内部别名映射、本地 CORS fetch 参数与跨域重定向拒绝。
- `node ../../scripts/dokiworld-docs-guard.mjs game-clue-investigation`：PASS。
- `npm run build`：PASS，生成 0.2.1 dist 和 SHA-256 清单。仍报告既有 capability chunk 动静态导入重叠与主 chunk 超 500 kB 警告。
- 本地 ZIP `release/game-clue-investigation/game-clue-investigation-dokiworld.zip`：通过 zip 测试；159 项，文件集合与 dist 完全相等，根目录直接包含 `index.html` 与 `manifest.json`。未上传或安装到 DokiWorld。

## 仍待验证

- 非施工者尚未对 v0.2.1 独立复查；v0.2.0 既有 Review 不覆盖本次差异。
- 未运行真实 DokiWorld 浏览器旅程。图片静态服务器必须对 `http://127.0.0.1:5173` 开启 CORS；Owner 需在本机完成导入和带真实本机 URL 的调用验证。
- 当前环境无法连接 Owner 的 `127.0.0.1:5173` 项目路线图保存 API，故没有更新控制台路线图；没有尝试启动 ZeroCraft。
- 全游戏 S8 终检仍为 FAIL，Owner S8 人门仍待处理。
