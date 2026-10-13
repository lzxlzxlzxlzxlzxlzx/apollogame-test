# GAL-ENG-06I 真实 IndexedDB 跨会话验收自证（2026-10-12）

**状态：施工方局部 PASS；独立复查与整个里程碑仍单独判断。施工者 Codex/root。**

- Owner 已修订 `AGENTS.md`：受控、隔离的本地数据库测试允许 agent 执行，远程数据库写入仍禁止。脚本只写任务级临时浏览器 profile 中的独立 `gal-preview-owner-audit-v1` IndexedDB；测试域名 `https://gal-preview.audit.invalid` 的全部请求由本地静态文件 fulfill，跨域和其他路径 abort。不启动前后端，不接真实 GAL 作品档、Profile 或远程库。
- 首次运行在 Vite 解析 `src/services/storage/indexeddb-kv.ts` 时遇 `EPERM realpath`，浏览器与数据库均未进入。审计 runner 改用已有 `esbuild` 仅打包相对引用的审计 fixture。普通沙箱内 Edge 创建临时 profile 时退出，Playwright 默认无头浏览器缺失；这两次同样未形成数据库结果。之后在普通本机进程权限下，原隔离 runner 实测退出 0。
- 成功运行输出：`GAL OWNER IDB AUDIT: PASS`；`initial` 与关闭浏览器后新会话的 `reopened` 均为 `ready / gal-preview-owner-audit / slot 2 / hash 12345678 / 8×8 image/png`；故意写坏 JSON 后为 `damaged`，删除后为 `missing`。脚本 `finally` 关闭浏览器，校验临时目录确在 OS tmp 且保留 `gal-preview-idb-owner-` 前缀，再递归删除；若删除失败会抛错而不会打印成功退出码。
- 本验收证明真实浏览器、隔离 profile 下的侧车 IndexedDB 跨会话读回与坏记录/删除降级；不证明正式 `GalSliceHost` 宿主已注入、不证明权威存档读写，也不证明跨标签页/进程原子定序。06H 静态作品整链与本票是互补证据，不能互相代替。
- 运行结论待非施工者独立复跑；整个 `replay-save-preview-auto` 继续 `active`，`selfCheck/review` 仍待整里程碑所有验收项，Owner 人门不得代签。
