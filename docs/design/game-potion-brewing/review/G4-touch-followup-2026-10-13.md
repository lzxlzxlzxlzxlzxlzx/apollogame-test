# G4 真触屏补丁独立复查（2026-10-13）

复查主体：独立代理 `g4_touch_review`；施工主体：主会话。范围仅 `src/net/host/queued-input.ts`、其点名测试与 `games/game-potion-brewing/s4-browser-probe.mjs` 的真触屏路径。结论：**局部 PASS**；不代表 S4 整关通过，材料份数缺口仍待 Owner A/B。

## 范围与实查

- `git diff -- src/net/host/queued-input.ts src/net/host/queued-input.test.ts games/game-potion-brewing/s4-browser-probe.mjs`：输入源码增量只在连续采样 opt-in 中设置 `touchAction='none'` 并在 dispose 恢复（`queued-input.ts:137-155`），旧 click-only 路径没有写样式；点名测试见 `queued-input.test.ts:49-63`。浏览器探针真实触屏经 CDP `Input.dispatchTouchEvent`，不是鼠标事件冒充（`s4-browser-probe.mjs:112-164`）。探针本身为未跟踪新文件，故 `git diff` 不显示其正文，已单独全文检查。
- 没有修改上述生产代码，也没有修改/覆盖原探针截图。没有触及并行项目、远程仓库、远程数据库或整套工作台。

## review 四步

1. **独立复跑**：`npx vitest run src/net/host/queued-input.test.ts`，沙箱内 Vite 解析 `node_modules/vitest/dist/spy.js` 报 `EPERM realpath`、退出 1、没有测试执行；同命令受控本地重跑退出 **0**，**8/8 PASS**，无测试告警。不能将首次 EPERM 算作测试失败或成功。
2. **撤修验红（隔离）**：在内存中读取 `queued-input.ts`，用唯一锚点正则匹配 `canvas.style.touchAction = 'none';`，断言命中数为 **1**；只在内存副本把赋值替换成自赋值，再经 TypeScript `transpileModule` 执行同一 `PointerInputSource` 构造/卸载断言。原件 `touchAction: pan-y → none → pan-y` 绿；撤修件“构造后必须 none”**按预期红**、卸载仍恢复 pan-y；命令退出 **0**，表示预设绿/红均成立。共享文件未动。
3. **实证复现**：独立启动仅局部 Vite `localhost:5701` 与隔离无头浏览器 `hasTouch:true`，通过 CDP 发 `touchStart → 12×touchMove → touchEnd`，而非调用游戏内部动作。观测 `pointerdown, 12×pointermove, pointerup`，**0×pointercancel**；canvas 内联 `touchAction=none`，真引擎 `OrderedActionSession.stepIndex=1`，页面错误 **0**，命令退出 **0**。浏览器和局部服务在 `finally` 关闭；复查后端口 5701 无监听。
4. **读告警**：Vitest 受控复跑与真浏览器没有运行时 WARN/ERROR。`git diff` 有 LF→CRLF 工作树换行提示，仅 Git 文本提示，不是玩法或触控告警。唯一环境问题是上述沙箱 `EPERM`，已独立重跑排除。

## 边界

本结论只证明 `PointerInputSource` 连续手势 opt-in 的滚动接管、dispose 恢复、旧点击路径不改样式，以及真实触摸投料链在独立浏览器可工作。未给 S4 机器门、S4 整体复查或 Owner 人门签核；材料剩余份数待裁决。
