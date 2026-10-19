# GCI-S7-HOST-SESSION-01 独立复查

日期：2026-10-14。复查：`/root/records_diagnosis`；施工：`/root`。本文件为共享宿主会话局部复查，不是游戏 S7/S8 或 Owner 人门。

## 首轮结论：FAIL（失败清理遗漏，待返修复跑）

实查 `src/studio/cart-run-core.ts`、`src/studio/cart-run-core.session.test.ts`、`src/assets/host-visual-bridge.ts`，不以施工自检代替证据。

### 独立复跑

`npx vitest run src/studio/cart-run-core.session.test.ts src/assets/host-visual-bridge.test.ts src/studio/data-cartridge-runner.test.tsx`

- exit 0；3 files / 18 tests PASS（session 3、bridge 10、旧 runner 5）。stderr 无产品告警。
- 沙箱内首次 exit 1 为 Vitest spy.js realpath EPERM，0 tests / 3 unhandled errors，未计通过；受控本地沙箱外重跑才得上述结果。
- 没有启动浏览器或测试服务，没有远程网络写入。

### 撤修验红

`npx vitest run src/studio/cart-run-core.session.test.ts --config docs/design/game-clue-investigation/review/host-session-revoke.config.ts`

Vite 内存变换匹配唯一锚点 `options.hostVisualSession?.bindWorld(engine.world)`，断言 hits=1 后仅替换为 undefined，不写共享生产源。stderr 明确 `REVOKE_ANCHOR hits=1`；exit 1，1 failed / 2 passed，绑定测试报 expected 2 calls / got 1。解除配置即恢复原始源码；不是未命中锚点的假验红。

### 补充实证

独立临时测试 `src/studio/gci-host-review.temp.test.ts`（测试结束删除，不作为生产文件）：

1. 真 `HostVisualSession.prepare` 注入离线 loader，验证 probe/formal 为不同 World，probe 已解绑、formal 可解析真实 catalog mask，stop 后 mask 不可解析且临时资产已注销：PASS。
2. terminal 白名单只输出 selected，排除 hidden；数组/元素均冻结；正式 World 变更不改变旧 snapshot，修改 snapshot 抛错：PASS。
3. `Controllable.playerId=p1` + terminal 初次 `onSnapshot` 抛 `terminal rejected`，要求注册的 keydown/keyup/blur 对应 handler 全部 remove：FAIL（expected false to be true）。复现后测试主动解除该三监听，未让验证本身泄漏。

原因：初始 terminal sync 于所有输入装配后执行（原 cart-run-core.ts:401–408），失败仅到外层 catch dispose 会话、清 DOM（原169–172），未运行返回清理函数（原412起），键盘监听残留。该项是本次新异常路径带来的可复现问题，不能以18条既有绿灯覆盖。已反馈施工方返修；未擅改生产代码。

首轮源 SHA256：runner `AC0ACC198E35355CD4F90E6F5012A2EC80D067DDF064249A1459B1190AC9F850`；bridge `E6C9675A44A1280B45E8F4D44EE9596D178B1FD48C994D93CA9773834306B4B5`。

## 第二轮：FAIL（terminal 异常已修，正式 bind 异常仍漏清理）

返修版 `teardown(false)` 在 terminal 初次回调异常时执行；独立复跑三组永久测试19/19，加首轮3项额外测试共22/22，exit0，stderr无产品告警。原失败回归已经真实转绿。

同一失败清理合同扩查：`Controllable p1` + session.bindWorld 第一次成功、第二次（正式 World）抛 `formal rejected`。结果 session.dispose 恰一次，但 `cartInputFor` 已安装的 keydown/keyup/blur 未成对 remove。额外4项测试1 failed / 3 passed，exit1。根因是 formal bind 仍在 engine.load 的 try 外，外层 catch 只 dispose 会话；原209行前已创建 io。建议将正式 bind/load 的异常清理统一覆盖 io，而非只保护 terminal 分支。

第二轮撤修仍 hits=1；session 1 failed / 3 passed，exit1，仍由绑定调用次数断言捕获。生产源未被修改，撤修仅内存。没有服务、浏览器或人门操作。

## 最终第三轮：PASS（仅本共享接缝范围）

施工方延迟 `cartInputFor` 到正式 bind + load 成功之后（当前 runner:212–219）；terminal 初始异常仍先 `teardown(false)`（405–437），外层唯一 dispose 会话。

- 独立再次执行三组永久测试 + 4项独立额外测试：4 files / 24 tests PASS，exit0（12:03:49运行）。原 terminal 监听清理与正式绑定失败两项均实际转绿，后者现在验证安装数0，而非要求先装后拆。
- 最终锚点撤修：hits=1；exit1；2 failed / 3 passed。旧绑定调用数断言及新增 formal bind 拒绝断言均转红。
- 去掉撤修配置后独立再跑三组：3 files / 20 tests PASS，exit0（12:04:49运行）；session5、bridge10、旧 runner5。stderr无新的产品告警；仅预期撤修输出与前述沙箱EPERM已单列。
- 四项额外实证覆盖真实 session 的双World catalog/stop解绑/资产注销、terminal完整冻结值拷贝与白名单、两个失败清理分支。旧无options路径由 data-cartridge-runner 五项独立复跑覆盖。
- `src/studio/gci-host-review.temp.test.ts` 已删除，未修改生产源或永久测试；撤修配置保留在本 review 目录作为可复跑证据。未启服务/浏览器，无遗留进程、远程Git/数据库或人门操作。

冻结 SHA256：

| 文件 | SHA256 |
|---|---|
| src/studio/cart-run-core.ts | `5C558DA4AB1E2B44EAD5B5CC5818C6E3EA7A3DF4E5E97F28F0A3B1C0CA3362A9` |
| src/studio/cart-run-core.session.test.ts | `9E0AD0F72D9B7A80CCF85B97C24E0A3EDBF1BA8EA0A6533591CB98CBEE8BD68D` |
| src/assets/host-visual-bridge.ts | `E6C9675A44A1280B45E8F4D44EE9596D178B1FD48C994D93CA9773834306B4B5` |

此 PASS 不扩张为真实 DokiWorld 宿主包验收、完整游戏 S7/S8、全库门禁或 Owner 审批；本轮未重跑全库。
