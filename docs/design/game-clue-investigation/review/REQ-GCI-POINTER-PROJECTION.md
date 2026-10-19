# REQ-GCI-POINTER-PROJECTION · 共享指针能力复查导航

范围：Clickable 消费与 hover/press 表现共用实形命中；只读 opt-in 表现不写入 World/hash。本单不代签游戏 GCI S4、Owner 人门或全库门禁。

## 施工自证（2026-10-13）

- `npx vitest run src/assembly/cart-presentation.test.ts src/engine/protocol/clickable-hit-test.test.ts src/renderer/canvas-renderer.viewport.test.ts src/skills/tier2/clickable.test.ts src/cartridge-inline-run.test.ts`：47/47 PASS。定向 ESLint、`npx tsc --noEmit --pretty false`、浏览器脚本语法检查 PASS。
- `node scripts/cart-presentation-browser.mjs` 连续 10 轮，每轮 7 个真浏览器旅程 PASS：4 视口、透明 alpha 拒收/不透明 hover 与 pressed、Modal 遮罩和真实 GCI Canvas→键盘链、teardown。短时 Vite、浏览器、端口 5716–5719 均已关闭。
- 首次真实 GCI teardown 曾复现 React `removeChild` pageerror。根因是旧探针在 `/?game=lib:...` 页面用 `page.route('**/src/launcher.tsx')` 拦 launcher 不稳定，React 与手动探针共管 `#app`。改由探针在 `/__cart_presentation_probe__` 提供独立空文档，并断言 launcher root 不存在。未把此 harness 错误归因于产品 runner。
- `node scripts/scoped-gate.mjs --run` exit 1：全库另有 33 条 depcruise 违规；`game-skill-audit` 本游戏 0 红、S6 美术台账黄项。不得把本单写作全库门禁绿。

## 非施工者独立复查（`/root/pointer_final_review`）

判词 **PASS，仅共享 REQ-GCI-POINTER-PROJECTION 范围**。复查人独立复跑定向测试 42/42、真浏览器连续 5 轮各 7 项均 PASS；另用真实 `touchscreen.tap` 验证不透明 mask→pressed，清理后 Canvas 与 focus 均无，pageerror 0。旧 exact `/` route 在 `/?game=lib:game-clue-investigation` 命中 0 且 `__zcLauncherRoot=true`，实证 React ownership；新独立探针文档 5 轮无 `removeChild`。

锚点撤修验红：`clickable-hit-test.ts` 透明像素判定锚点唯一命中；隔离内存态改为恒命中后透明像素测试由 `transparent` 转为误命中并转红，没有改写工作树。源码核查确认 cover/contain、zOrder/id、onlyFlag、phase 与 invalid mask fail-closed；`presentation?.pointerFeedback` 保持 opt-in。读告警：默认沙箱 Vitest realpath EPERM 时未收集测试，提升后 42/42 真实通过；`git diff --check` 的 LF→CRLF 为换行提示，非语义失败。临时端口 5716–5719、5720、5722 无 LISTEN。

公共需求池状态维持 blocked：全库 scoped-gate 仍因其它项目违规 exit 1。独立能力 PASS 不等于 GCI S4 或项目路线图里程碑完成。

## Owner 需求池结案裁决（2026-10-16）

Owner 选择按单项能力复查结案，允许将域外全库 depcruise 红项与本能力完成状态分开记账。公共需求 `REQ-GCI-POINTER-PROJECTION` 已从活动池释放；本结案不表示全库 gate、GCI S4 或任何 Owner 人门通过。
