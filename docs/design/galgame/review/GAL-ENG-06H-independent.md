# GAL-ENG-06H 非施工者独立复查（2026-10-12）

**复查者：独立 agent `/root/review_gal_06h`。判词：局部 PASS；不代表 `replay-save-preview-auto` 里程碑、正式作品宿主或 Owner 人门通过。**

## 范围与阅读闸

已完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、适用的 `project-roadmap`/`module-save`/`module-ui` skill，以及当前项目路线图和 06H 自证。审查限于 `src/services/gal-ui/gal-save-preview-live.audit.ts` 与 `verify-gal-save-preview-live.mjs` 的静态浏览器验收，不接触真实/伪造 IndexedDB 或业务持久化。

## ① 独立复跑与 ③ 实证复现

- 不带 `--screenshot`，在 `UI_AUDIT_CHROMIUM=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` 下独立执行 `node src/services/gal-ui/verify-gal-save-preview-live.mjs`，退出码 0。首轮沙箱构建在 `src/services/save/memory-save-port.ts` 的 `realpath EPERM` 退出 1；隔离权限重跑才计为成功。真实 `file:` 静态页面 1440×900、短命 Edge，不启动前后端服务。
- runner 从登记索引按 `type=texture/status=filled` 和 demo 子目录边界解析两张图（`verify-gal-save-preview-live.mjs:16-28`），fixture 将 assetKey→URL 显式交给 `GalSliceHost`，端口均为内存实现（`gal-save-preview-live.audit.ts:35-52`）。没有把 URL 或图片写进剧情 World。
- 真 DOM 按钮链为主页开始→故事→存档槽 2→确认→槽卡就绪→回故事→读槽 2→确认→回故事（runner `:45-75`）。输出：`withPreview.slotPreview=ready`、卡图 `data:image/webp;base64,`、`width=320,height=180`、`previewHash=authorityHash=3165e9f3`。读档后故事引用仍为 `["a","intro"]`。截图 `gal-eng-06h-live-preview.png` 目视见槽 2 中月夜背景+立绘的场景缩略图，不含整屏对话 UI。
- 第二张全新内存页明确不注入预览端口（runner `:78-80`），同一真按钮存读链结束后 `slotPreview=no-preview` 且权威 hash 为 `3165e9f3`、故事引用复原（runner `:84-108`）。这证明可选侧车降级不阻断权威存读，并非跨会话真实存储证据。
- 独立 `npx vitest run src/services/gal-save src/services/gal-ui` 在隔离权限下 10 文件、101/101 PASS。初轮沙箱对 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 报 10 个 unhandled errors、无测试执行，不计 PASS。没有运行真实或 fake IndexedDB 测试。

## ② 隔离唯一锚点撤修验红

用任务级系统临时构建和 Vite pre-transform，仅在内存中对 fixture 源码的唯一锚点 `previewCapture: new BrowserGalPreviewCapturePort()`（`gal-save-preview-live.audit.ts:52`）断言**恰好命中 1 次**，替为 `previewCapture: undefined`；未改共享代码、测试、截图或控制台。相同登记 demo 资产和真 DOM 保存链后，槽卡从基线的 `ready` 退为 `no-preview`，权威 hash 仍为 `3165e9f3`：有图路径的 `ready` 断言如预期转红。输出 `anchorHits=1,status=no-preview`。浏览器在 `finally` 关闭，两个审计前缀的临时目录复查后均无残留。

## ④ 告警、边界与结论

- 独立 `npx tsc --noEmit --pretty false` 退出 1：诊断仅位于 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 和 `src/launcher/game-runner.tsx`；没有 GAL 路径诊断。全库三绿不能据此宣称通过，须由各归属方处理。
- 06H 证明的是**静态 fixture + 内存端口 + 显式内容 URL**的浏览器整链。它没有正式作品入口、真实/跨会话 IndexedDB、跨标签页原子事务、整屏截图、S5/S6 与 V2 的视觉/时序 1:1，也不能替 Owner 批准里程碑。脚本无截图模式没有覆写施工截图；访问的 `file:` URL 为任务临时目录，runner `finally` 关闭 Edge 并删除临时构建（`:110-113`），实际两个 `gal-preview-live-*` / `gal-06h-review-sabotage-*` 目录检查均为空。

**局部 PASS**：06H 的现有端口可在真浏览器经玩家按钮链合成、显示并读回非权威槽图；无端口时权威存读仍通。上述缺口保留在里程碑层，不用局部 PASS 代签。
