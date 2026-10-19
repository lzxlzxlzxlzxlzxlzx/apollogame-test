# GCI-S7-HOST-SESSION-01 施工自检

日期：2026-10-14。施工：Codex/root。范围仅为共享卡带运行核的动态宿主视觉会话与值拷贝终局观察口；未改本游戏 manifest、玩法解释器、`src/ui/**`、DokiWorld SDK 适配或人门。

## 实现

- `runBlueprintInto` 新增可选 `CartRunOptions`：`hostVisualSession` 在 load probe 和正式 Engine World 的首次命中前绑定；probe 完成即解绑，正式 World 在 stop 时解绑。DOM 输入源仅在正式 bind 与 load 成功后创建；终局端口的首次同步若拒绝，先释放 renderer、输入/键盘监听、UI、World 绑定及容器，再由外层 fail-closed 单次 dispose 会话。
- `CartTerminalPort` 只允许声明 `GameFlow`、`Resource`、`Flag` 的 id 白名单，输出冻结的值拷贝；不暴露 World、组件引用、URL、mask 行或任意玩法回调。未声明任何 id 直接拒绝。
- 既有本地 AssetIndex 路径与无 options 的在线/内联卡带调用不变；动态 mask 仍只由 `HostVisualSession` catalog 供给，不进入 World/hash。

## 自证

- `npx vitest run src/studio/cart-run-core.session.test.ts src/assets/host-visual-bridge.test.ts src/studio/data-cartridge-runner.test.tsx`：3 files / 20 tests PASS（新增 terminal 首次回调拒绝时的 keydown/keyup/blur 成对移除，以及正式 bind 拒绝时不安装输入监听的回归）。
- `npx eslint src/studio/cart-run-core.ts src/studio/cart-run-core.session.test.ts`、`npx tsc --noEmit --pretty false`、`npm run build`：PASS；build 仅有既有 chunk-size warning。
- 撤修验红：唯一锚点 `options.hostVisualSession?.bindWorld(engine.world)` 临时移除后，定向测试 2 failed / 3 passed，精确报正式 World 的绑定调用数不足及 formal bind 拒绝分支未触发；恢复后上述 20 tests、ESLint、TypeScript 与 build PASS。
- 运行 Vitest 需在本机受限目录外执行；沙箱内 Vite 对 `node_modules/vitest/dist/spy.js` 的 `realpath` 报 EPERM。受控本地测试无服务、无远程写入，完成后无浏览器或测试服务残留。

## 待独立复查

非施工者已独立复跑三组定向测试、读取 stderr、以同一唯一锚点执行撤修验红，并验证旧无 options 路径与两条异常清理路径，结论 PASS：`review/GCI-S7-HOST-SESSION-01-independent.md`。这不是完整 GCI-S7、S7/S8 或 Owner 人门通过。
