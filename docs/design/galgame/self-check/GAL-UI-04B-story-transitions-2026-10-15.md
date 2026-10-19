# GAL-UI-04B 转场消费自证（2026-10-15）

施工自证，不是独立复查，不关 `ui-settings-confirmations`，不代签 Owner 人门。

- 共享合同 `NarrativeTransitionPolicy` 已有非施工者局部 PASS。本批只做 GAL 消费：Profile V8 增加 `storyTransitions`，默认 true；V7 只读迁移补 true。
- 画面页「转场演出」改为真实 Toggle，动作 `gal.settings.story-transitions`。关闭或减少动态时，已声明的转场收成硬切。
- 宿主用既有 `GalPlaybackClock` 按 280ms 推进遮罩。没有时钟时直接跳到结束，避免遮罩卡住。当前 7 句 demo 与冻结原型都没有声明转场，所以这局画面不变。
- 高对比、界面缩放、窗口/全屏、恢复默认仍禁用。未改 `src/ui/**` 与 `gal-ui-complete-v2.dc.html`。

定向结果：`npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-story-transition.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-audio-host.test.ts` 退出 0，4 文件 / 70 测试。未跑全库门禁，未做本消费的独立撤修复查。
