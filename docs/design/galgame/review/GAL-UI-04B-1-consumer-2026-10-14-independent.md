# GAL-UI-04B-1 · GAL 宿主消费段独立复查（2026-10-14）

判词：**指定消费段局部 PASS**。复查人非施工者；不签完整 04B、S5/S6、终图或 Owner 人门。施工自证仅作导航，以下机器结果均独立取得。首次复查发现已挂载迟到旧 token 负例缺口；施工方补测后已由本复查人独立核绿、撤修验红，见末节。

## 代码实查

- `gal-ui-slice-host.ts` 的当前可见剧情在 `storyTypewriter()` 中保存原始 `PresentedStoryToken`，向 `Label` 只投影不可逆解析的字符串键；回调经 `gal.story.presented` 到 `completeStoryPresentation()`，同时核字符串、当前页、回想/历史/确认/CG 遮挡、卸载及 `presentationToken()` 对象身份，再调用 `PresentationReadGate.fullyPresented()`。PUI 没有获得 World/Profile 权限。
- `attach/redraw` 不再同步记已读；逐字完成或首次点击显全才尝试读门。`narrative.advance/choose` 在已挂载且文本未呈现时先令当前文本 0ms 显全并消费本次动作，下一次才推进；回滚不走该守卫。`PresentationReadGate` 再核 World/Source/Runtime/Projection 对象身份和 ref，拒绝旧投影。`pendingPresentation` 仅在当前 token 仍一致时重试，避免忙队列丢完成事件。
- 设置页文字速度从 `gal.settings.text-speed` 进入 `persistGalPlaybackPreferences`，值限定 0–500ms；成功后刷新 Profile，失败给反馈并保留旧 Profile。该偏好不写 World/手动槽；全局恢复默认仍禁用。
- 页面/遮挡失效在 `storyTypewriter()` 与 `dispatch()` 双层拦截；回想进入、历史/确认/CG 展开、读档重投影和卸载路径不把旧通知当当前句。上述为当前代码与测试范围的判定，不等于实际桌面宿主全链验收。

## 独立复跑与告警

| 命令 | 结果 |
|---|---|
| `npx vitest run src/services/gal-ui src/services/gal-profile src/ui/components/typewriter.test.ts` | 14 文件、145/145，退出 0；含已读延迟、StoryRef 更替、挂载动作、Profile 设置及读门测试 |
| `npx tsc --noEmit` | 退出 0 |
| `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slice-audit-fixture.ts` | 退出 0；重叠/硬对比/border-image 阻断及文字对比 WARN 均 0；**华丽件 0、无 house 主题**是非阻断提示，此 1060×760 结构夹具不能证明定稿 V2 视觉 |
| `node src/services/gal-ui/verify-gal-03e-action-live.mjs --transient-shots` | 退出 0；隔离短时 Edge 真点：台词首击不推进、二击到 choice；选项首击不选、二击选中；回滚后改选，继而进入读档和设置。脚本关闭临时浏览器/构建，不启动整套 ZeroCraft |
| `node scripts/docs-ref-guard.mjs` / `node scripts/context-budget-guard.mjs` | 均退出 0；需求池 10/10、24062/25000 字符 |

## 撤修验红与测试灵敏度

在仓库内隔离复制 `src/services/gal-ui`，不改 live 源。先核 live `const result = await this.fullyPresented(current.token);` 唯一锚点 1 次；复制件在该锚点前提前 `return`，且复制件变异标记唯一 1 次。对复制件执行 `npx vitest run src/services/.gal-ui-review-04b1/gal-ui-slice-host.test.ts -t 'marks a line read only after the PUI completion signal'`，退出 **1**，1 failed/34 skipped：预期 Profile 包含 `['a','intro']`，实际 `[]`（测试第 210 行）。live 基线 145/145 绿。临时复制目录已核对绝对路径并删除。

首次复查另尝试在隔离复制件移除宿主的 opaque 相等及 `presentationToken()` 对象检查，原有 `rejects a stale opaque completion after the StoryRef has changed` 测试仍绿：它**未挂载 UI**，故不能单独证明宿主两道守卫的灵敏度。施工方随后补了已挂载负例，下面补复查已消除这一覆盖缺口。

## 边界

本 PASS 仅表示 PUI 完成信号到 GAL 读门及文字速度偏好这段已能按测试运行。Profile 写失败的具体文字速度专例、确认/CG 遮挡下旧回调、读档后迟到回调及卸载后的宿主事件目前主要由通用分支和代码守卫覆盖，缺专属独立真浏览器负例；这些仍是更广场景的覆盖边界，不把本单局部 PASS 扩成完整 S5/S6。全库 `scoped-gate` 亦不在本局部判词内。

## 已挂载迟到旧 token 补复查（2026-10-14）

新增测试 `rejects a delayed old PUI token while mounted after the next StoryRef was rendered` 真正 `attach()`，在旧句回调入 Profile 后推进到 choice，核 DOM 的新 token 与旧 token 不同；迟到旧 token 不得把 choice 记已读，只有新 token 可提交。独立定向执行 1/1、生产文件整套 38/38，均退出 0，无测试告警。

在 `src/services/gal-ui` 隔离复制件内先单删 `opaque !== current.opaque`，锚点断言 live 命中 1、复制件命中 0。相同新增测试退出 **1**（1 failed / 37 skipped）：期望已读仅 intro，实际已提前含 choice，失败在测试第 282 行。再在同一复制件内删除 `this.presentationToken() !== current.token`，第二锚点亦为 live 1、复制件 0；相同测试仍退出 1。此实证说明新增测试对宿主的 opaque 守卫敏感；对象身份守卫与 opaque 守卫叠加，单独去掉后仍可能被另一层挡住，不把两者误称各自单删均可转红。复制目录经绝对路径核对后删除，随后生产测试 38/38 再绿。新增测试针对先前明确缺口，因此本单不再保留该项 CONCERNS。
