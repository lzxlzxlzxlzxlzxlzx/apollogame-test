# GAL-UI-04B-1 · PUI 逐字完成信号施工自证（2026-10-14）

状态：PUI 通用接口已施工并自测；等待非施工者独立复查。此文件不宣称 GAL 消费、文字速度设置、S5/S6 或 Owner 人门通过。

## 边界与接口

- 只扩 `Label` / `dialog` 可选 `typewriterSignal:{token,action}`。必须同时填 `typewriter:0..1000`；0ms 或空句立即完整显示并通知，正数逐 Unicode 码点显示。旧树未填信号字段保持原有外观和派发行为。
- PUI 将 token 视作宿主给出的不透明当前剧情引用+世代键；自然末字或首次点击显全仅经 HandlerMap 或 ActionSink 发送一次 `action(arg=token)`，首击不会再透传外层 `advance`。同节点再次点击仍正常推进。
- `mountUI.update()` 换掉文本/节点/token 时取消旧计时器；卸载清计时器。PUI 不解析 StoryRef、不写 World/已读/Profile、不判断历史/回想/弹窗遮挡；这些由 GAL 宿主在收到 token 后重验。GAL 消费合同见 `../gal-ui-04b-1-consumer-contract-2026-10-14.md`。
- 施工文件：`src/ui/components/{types,render,server,catalog,validate,typewriter.test}.ts`、`games/game-i/gallery.ts`、`docs/playbooks/ui.md`、当前需求单。未触碰 GAL 消费、Profile、资产、原型、远端或 Owner 人门。

## 机器结果

- `npx vitest run src/ui/components games/game-i/game-i.test.ts scripts/ui-find.test.mjs`：76 文件、581 测试 PASS。点名 `typewriter.test.ts` 7/7，覆盖自然完成、首击显全/次击推进、换行/回滚/读档代际、0ms/空句、卸载、ActionSink 与非法闭集值。
- `npx tsc --noEmit`：退出 0。
- `node scripts/context-budget-guard.mjs`：最终复跑 PASS（引擎池 10/10、24982/25000 字符；UI 手册仍在 100 行/22000 字符内）。过程中共享池曾短时达到 25034/25000，由对应票占用者压缩其自身条目后恢复；PUI 未改他域需求池。
- `node tools/ui-audit.mjs tools/audits/dialogue-demo.audit.ts`：退出 0，重叠/硬对比/border-image 阻断均 0；已有两个非阻断次级文字对比警告 3.21:1、3.57:1，不由本接口引入，也不据此宣称 V2 视觉完成。审计的临时浏览器已关闭；未启动整套 ZeroCraft。

## 撤修验红（施工者自证；复查人仍须独立重做）

唯一锚点 `src/ui/components/server.ts` 的 `if (i >= glyphs.length) { clearInterval(iv); if (state) finishTyper(el, state); }` 在测试前实查命中。仅在本地暂时去掉 `finishTyper(el,state)` 后运行 `npx vitest run src/ui/components/typewriter.test.ts -t '自然结束后仅发一次'`，退出非零，恰好 1 failed / 5 skipped，断言从预期 `['ch1:n2:rev2']` 变为 `[]`；随后立即恢复原行，完整套件和类型检查转绿。未重置或覆盖他人的在途文件。

## 独立复查导航

请非施工者：独立重跑 7 条点名测试、PUI 全套、类型/预算；在隔离副本做带唯一锚点命中断言的撤修验红；实证点击显全不推进、自然完成一次、0ms/空句、ActionSink、同 StoryRef 不同世代与卸载旧回调；读完 UI audit 的两条 WARN。只对本 PUI 接口给局部判词，GAL 消费另审。
