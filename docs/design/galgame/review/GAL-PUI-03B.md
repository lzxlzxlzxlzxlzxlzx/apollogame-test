# GAL-PUI-03B · Panel.wheel → ActionSink 独立复查

> 非施工者复查，2026-10-10。未执行 Git/GitHub、数据库写入或应用服务启动。浏览器验证仅用临时 headless Edge 打开本地静态产物；每次完成后浏览器与临时目录均已关闭／清理。

## 结论：能力局部 PASS；全套 game-i 回归 CONCERNS

`Panel.wheel` 的闭集合同、真实 `WheelEvent` 路径和 ActionSink-only 派发均通过独立验证。`src/ui/components/server.ts` 仅在 `wheelAction` 中调用 `input.enqueueAction(action)`；没有引入 GAL／Director／World 依赖或游戏层 DOM 监听。滚动子区、Modal 背景阻断和 teardown 的行为均有真实浏览器实证。

| 复查项目 | 独立结果 |
|---|---|
| `npx vitest run src/ui/components/wheel-action.test.ts src/ui/components/catalog-validate.test.ts games/game-i` | 25 files / 133 tests passed；`games/game-i/dialogue-world.test.ts` 1 failed：期望亲和度 14，实际 8（非 Wheel 断言） |
| `node tools/wheel-action-browser-test.mjs` | exit 0；真实上／下各一次得到 `wheel.up,wheel.down`，内层 scroll 不泄漏，Modal 阻断背景，teardown 后无残留监听 |
| `node tools/ui-audit.mjs tools/audits/wheel-action.audit.ts --w 1440 --h 900`（`UI_AUDIT_CHROMIUM`=临时 headless Edge） | exit 0；0 overlap、0 hard contrast、0 border-image prerequisite；两条 Panel 标题对比 3.5 为非阻断警告，审计入口的 0 华丽度亦为隔离能力样例的非阻断警告 |
| 隔离撤修验红 | 临时包装 `mountUI`，仅抑制命名监听 `server.wheelAction`；定向 probe 精确得到 **1 failed / exit 1**，`calls=[]` 而断言要求 `['narrative.advance']`。probe 删除后原 `wheel-action.test.ts` 4/4 通过。 |

## 合同复核

- `Panel.wheel` 只有 `{upAction?, downAction?}` 具名字符串；catalog/validator 均拒绝空绑定，渲染为 `data-wheel-region` 和方向属性。
- 每个有效 WheelEvent 根据正负 `deltaY` 至多入队一个方向；小 trackpad delta 在 48px 阈值累积，零 delta 不派发。
- 内层 `Panel.scroll`／VirtualList 优先；打开 Modal 时背景 region 不接收 wheel；监听附到 host 且 teardown 明确移除。
- 旧调用在 wheel 未声明时不新增映射；Modal／ActionSink 行为仍由各自既有测试覆盖。

## CONCERNS

`games/game-i/dialogue-world.test.ts` 的失败不是 Wheel 合同、ActionSink、Modal 或本审查范围内 wheel 路径的断言，且本次没有修改或归因该测试；但它使被要求的完整 `games/game-i` 命令不全绿。需由其归属方复现／定性后，才能宣称 game-i 全量回归绿。本单同样不改变全库 `tsc` 已知的 game-card-reveal、game-dice、game-simlife、game-theft、launcher 红项；它们继续单列 CONCERNS。

## 滚动祖先边界复审（2026-10-10）— PASS（局部）

施工者将 wheel 守卫收紧为：命中任意 `[data-wheel-scroll]`／`[data-vlist]` 祖先即不派发 Panel.wheel。复查人以当前共享工作树独立验证，而非采信施工者结果：

- `npx vitest run src/ui/components/wheel-action.test.ts src/ui/components/catalog-validate.test.ts`：2 files / 15 tests passed；新增“wheel region 嵌在 scroll ancestor”锚点通过。
- `node tools/wheel-action-browser-test.mjs`：exit 0；真实 WheelEvent 上／下、scroll 优先、Modal 阻断、teardown 仍通过。
- 1440×900 `ui-audit`：0 overlap、0 hard contrast、0 border-image prerequisite；仅保留此前两条 3.5 对比与零华丽度的非阻断隔离样例警告。
- 隔离撤修验红：临时包装 `mountUI`，只用修复前的 descendant-only 条件替换 `wheelAction`；`wheel region` 在滚动祖先中立刻错误派发 `narrative.advance`，probe 得到 **1 failed / exit 1**，锚点断言期望空队列。probe 已删除，生产 `wheel-action.test.ts` 5/5 恢复通过。

因此滚动祖先收紧正确，未破坏已验的 Wheel 合同。前节列出的完整 `games/game-i` 非 Wheel 失败与全库 tsc 红项仍维持 **CONCERNS**；本复审不改变其归属或把本票扩大为整体交付。
