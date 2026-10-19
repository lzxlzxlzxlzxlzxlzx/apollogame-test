# REQ-SIMLIFE-PUI-ICON-BUTTON-01 · 独立复查

复查主体：非施工者 `icon_button_review`。2026-10-16；判词：**PASS（仅本票 PUI 能力与活例；全库门禁仍红）**。本文件不签 Life Host、游戏阶段或 Owner 人门。

## 范围与实证

- 核对工单 `work-orders/REQ-SIMLIFE-PUI-ICON-BUTTON-01.md`：新增合同集中于 `src/ui/components/{types,catalog,validate,render,server,button-icon}.ts`，含点名测试、深浅审计与 `games/game-i` 活例。共享工作树有千余项并发改动，不能将整份 `git diff --stat` 归因于本施工者；未对域外文件作变更。
- `iconOnly:{size:24..64}` 保留原生 `button type="button"` 与非空 `aria-label`，图为 `alt=""/aria-hidden`；图 URL 只收本地路径或受限栅格 data URL。无图、拒收、加载失败、更新换图时文字可见；加载完成才隐藏。`mountUI` 在挂载/更新扫当前图，捕获 load/error，卸载撤监听。旧 Button 未填该字段仍走原分支。
- `npx vitest run src/ui/components/icon-only-button.test.ts`：退出码 0，4/4；终态 `npx vitest run src/ui/components games/game-i/game-i.test.ts`：退出码 0，78 文件 / 588 测试。前者覆盖校验拒收、XSS、图加载/失败/更新、禁用及双挂载；追加点名断言钉死 catalog 恰一条演示与 game-i 唯一真实图按钮。
- `node tools/ui-audit.mjs src/ui/components/icon-only-button.audit.ts --w 760 --h 360 --min-contrast 4.5` 与亮色 `icon-only-button-light.audit.ts`：各退出码 0，0 重叠、0 硬对比错误、0 对比警告、0 border-image 错误。施工方去掉夹具显式 `labelColor` 后，独立复跑确认默认亮色回退文字不再落入此前 3.97:1 警告。华丽件 0 / 非 house 为单控件夹具的非阻断提示，不能外推为正式游戏视觉验收。
- `node src/ui/components/verify-icon-only-button.mjs`：退出码 0，隔离 `file://` 临时 bundle、深浅两主题均通过原生 Tab/Enter/Space 各一次动作、可见焦点环、hover/pressed、disabled 不动作、缺图文字、48/32px 实测盒及卸载；每轮浏览器关闭、临时 bundle 删除。初次沙箱内 Edge 启动失败，改用短时隔离的非沙箱浏览器后审计/旅程通过；没有启动整套 ZeroCraft 或使用 Owner 日常配置。
- `SABOTAGE_ICON_ONLY=1` 运行相同浏览器脚本：临时页面唯一 CSS 锚点命中 **1**，删去加载后藏文字规则，点名断言 `dark loaded label remained visible` 实红，退出码 1；重新正常运行退出码 0。未破坏共享源码。
- `node scripts/ui-find.mjs --type Button` 退出码 0，目录能找到新闭集字段，且 icon-only 展台段只列一次。

## 发现与门禁

1. **展示台返修已独立复验**：初查 `games/game-i/gallery.ts` 两条同 ID 活例、后一条指向不存在的图，`src/ui/components/catalog.ts` 同一演示项重复；施工者保留唯一 `btn-icon-only` 与已存在的 `/games/game-i/art/emoji/1f392.png`，删去死图和重复目录项。`rg` 核每处恰 1、`Test-Path` 真、`ui-find` 仅一条，终态 588/588 通过。新增 game-i 断言首轮误把 `data-ui-id` 后缀当成第二个 `id` 而假红，改为完整 `<button type="button" id=` 锚点后独立复跑全绿；此轮假红非产品缺陷。
2. 全库 `node scripts/scoped-gate.mjs --run` 退出码 1，停于 depcruise：**33 errors / 0 warnings**，未进入后续 tsc/vitest/build。直接 `npx tsc --noEmit --pretty false` 与 `npm run build` 各退出码 1，唯一类型诊断为域外 `src/authoring/gal-character-library.ts:89 TS2345`。`node scripts/context-budget-guard.mjs` 退出码 1：`docs/playbooks/index.md` 4953>4900 字符、`docs/playbooks/game-production.md` 109>100 行；未把这些既存并发红灯冒充本单绿灯。

结论：本票 PUI 通用 icon-only Button 及 game-i 活例按固定合同局部 **PASS**，独立真浏览器、深浅审计、唯一锚点撤修与新增防复发断言均有实证。全库门禁红仍阻止“可推送/全库全绿”结论；路线图 `demon-castle-ui-runtime-01` 仍为 active、review pending，本复查不升级整单。
