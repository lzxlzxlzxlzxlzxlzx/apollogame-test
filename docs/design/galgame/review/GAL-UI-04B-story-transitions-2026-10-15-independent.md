# GAL-UI-04B 转场演出 Profile/UI 消费独立复查（2026-10-15）

判词：**本消费局部 PASS**。复查人不是施工者，未采信施工自证绿灯。本单只核 GAL Profile V8 与画面页「转场演出」到剧情遮罩的这一段消费。不启用高对比、界面缩放、全屏或恢复默认；不把 `ui-settings-confirmations` 标 done；不代签 Owner 人门、完整设置、04B、S5/S6 或全库门禁。当前 demo 无剧本转场。未改生产代码、`src/ui/**`、冻结原型 `docs/design/galgame/gal-ui-complete-v2.dc.html`、路线图 status，未提交、未推送。

## 读代码

- `GAL_PROFILE_SCHEMA` 为 8。新建档 `storyTransitions: true`。V7 封套经 `openEnvelope` 只读迁移补 `storyTransitions: true`，并保留原 `reducedMotion`。`loadGalProfile` 只读槽位后解析，迁移本身不写盘；V7 用例在读取后仍要求封套字节与写入前相同。V1–V6 仍走同一条迁移链。schema 9 的封套在拆封时因高于当前 schema 被拒绝，`parseGalProfile` 对内部 `schemaVersion: 9` 同样拒绝。
- 画面页「转场演出」是真实 Toggle：`id` 为 `gal-setting-transitions-control`，`action` 为 `gal.settings.story-transitions`，`checked` 绑 `storyTransitions`。高对比走禁用的「待接入」Toggle；缩放与全屏是禁用按钮；恢复默认无 action 且 `disabled: true`，文案仍是「恢复默认（待完整设置接入）」。
- 没有 `transition` 的句子不交给策略，遮罩保持空。剧本 `fade` 在宿主时钟上按 280ms 从 `fade-out` / 0.86 到 `fade-in` / 0.34，再推进到结束并撤下遮罩。偏好关闭或 `reducedMotion` 时，剧本 `wipe` 被策略收成 cut，遮罩为空。没有时钟时对未结束的转场调用 `skip` 并把遮罩置空，不会停在遮罩上。
- 宿主只在 story 页、且没有历史、确认、展开 CG、已卸载时 `sync`；其余情况 `stop`。遮罩只在 `veil` 非空时进入树。`attach` 的卸载回调调用 `transitions.stop()`。转场偏好写入 Profile 端口，不改 World。
- 当前 demo 包没有 `presentation.transition`：`gal-ui-slice-host.test.ts` 的月影书简节点、`gal-ui-live-wheel.audit.ts` 与 `gal-audio-test-fixture.ts` 均未写该字段。投影初始场景也没有 `transition`，因此这条 demo 路径不出遮罩。

## 独立复跑

工作目录：`C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch`。非沙箱执行：

`npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-story-transition.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-audio-host.test.ts`

结果：4 文件 **70/70** 通过，退出码 **0**。其中 profile 22、转场消费 3、切片宿主 39、音频宿主 6。

## 撤修验红

改前 `src/services/gal-ui/gal-story-transition.ts` 的 SHA256 为 `94BF72E74C0C60E597659B3F75D28AC2623F33340569236742C129C83D86DD51`。

唯一破坏：把「没有 transition 就省略该字段」改成 `transition: source.transition ?? 'fade'`，使没写转场的句子也投影出 fade-out。同一条 vitest 退出码 **1**（2 failed / 68 passed）。命中的断言原文：

```text
FAIL  src/services/gal-ui/gal-story-transition.test.ts > GAL story transition consumer > keeps an unscripted demo line cut even when the preference is on
AssertionError: expected { phase: 'fade-out', opacity: 0.86 } to be null
 ❯ src/services/gal-ui/gal-story-transition.test.ts:19:28
     19|     expect(presenter.veil).toBeNull();
```

同一处破坏还连带打红 `gal-ui-slice-host.test.ts:641` 的 `expect(late.cancelled).toBe(true)`：demo 句被错误地挂上转场时钟后，与播放时钟共用的晚到任务不再按原断言取消。这是撤修的副作用，不是留下的产品缺陷。

随后把该文件恢复到同一 SHA256 `94BF72E74C0C60E597659B3F75D28AC2623F33340569236742C129C83D86DD51`。`git diff` 对该文件无输出。同一条 vitest 再次 **70/70**，退出码 **0**。撤修没有留在树上。未 commit、未 stash、未 push。

## 未签范围

- 不启用高对比、界面缩放、全屏、恢复默认。
- 不把 `ui-settings-confirmations` 标 done。
- 不代签 Owner 人门。
- 当前 demo 无剧本转场。本复查没有发现需判 CONCERNS 或 FAIL 的未修复缺陷。
