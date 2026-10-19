# GAL-UI-04B-1 · GAL 文字完成信号消费验收约定（2026-10-14）

状态：**PUI 通用接口已非施工者局部 PASS；GAL 消费施工自证通过，待 GAL 非施工者独立复查。**Owner 已授权策划派 PUI 施工 04B-1；闭集为 `Label/Dialog` 可选 `typewriterSignal: { token, action }` 配 `typewriter: 0..1000` 毫秒/字。0ms/空句同步显全，自然显示末字或首次点击显全只回传一次 opaque `arg=token`；首次点击不得透传推进。PUI PASS 与 GAL 自证均不等于完整 04B、S5/S6 或 Owner 人门。

## 当前实查与不变量

- `gal-ui-structure.ts` 的 `gal-story-text` 当前是完整文本 `Label`，外层 `gal-story-dialogue` 在非选择节点直接发 `narrative.advance`；独立推进按钮和滚轮也会推进。`gal-ui-slice-host.ts` 在 `attach/redraw` 后调用 `completeVisibleText()`，因 S4 同步全文显示而立即调用 `fullyPresented`。接打字机后必须撤除这一同步已读捷径，否则未显示完就会写已读。
- `PresentationReadGate.begin(world, entity)` 按 source/runtime/projection **对象身份**复用 `PresentedStoryToken`，投影变化才生成新 `generation`；`fullyPresented` 要求传回**同一个对象**，并重验当前 World/StoryRef/队列，不能由字符串反序列化一个新对象代替。既有读门已区分 `queued/pending/ignored`，阻止陈旧回调和重复 `read-complete`。GAL 负责把 PUI 不可信的 opaque 字符串令牌映射回当前 token 对象，并再次核对当前屏幕/投影，而非让 PUI 直接写 World。
- `startNew()` 恢复初始 World；读档替换 World 投影并刷新 Profile；前进/回滚/选项、回想、离开剧情、确认弹窗、卸载均会改变可见性或代际。只有**当前正常剧情台词**的显示完成能调用读门；回想隔离重播、历史、CG/弹窗遮挡的隐藏文本不能触发已读。
- `playbackFrame().fullyPresented` 目前依赖 `presentedToken === presentationToken()`。自动播放须等最终字可见且读门确实接受/已排队后才推进；快进/跳过未读按现有策略，不得靠伪造文字完成来跨过未读门。
- Profile V6 已有 `textSpeedMsPerChar`，但设置页文字速度滑杆仍 disabled。必须在真实消费者与失败恢复均验证后才启用，0 值代表立即显全并恰好通知一次；不得仅改控件 enabled 或新增独立本地存储。

## GAL 消费实现门

1. 只在非回想、非历史、无遮挡的当前剧情 `Label` 注入 `typewriter` 毫秒数与 `typewriterSignal`；token 用宿主生成、只对当前渲染世代有效的 opaque 键，不能直接以 `refKey` 充当世代（同 StoryRef 可能经回滚/读档/新局重现）。在宿主保存该键到**原始** `PresentedStoryToken` 的映射；每次变更可见投影、回想、读档、新局、卸载时旧键失效。字符串只给 UI 层作回传，不进入存档、World、Profile、包或 hash。
2. 具名动作（建议 `gal.story.presented`）必须检查当前 page、遮挡、非回想、键相等和当前 `presentationToken()` 的对象身份，然后才调用 `fullyPresented(originalToken)`。过期/重复动作无害且不能补记另一句。`pending` 不等于已读；输入队列忙时要有受控重试或明确恢复路径，不能丢掉唯一完成信号后永久卡住自动播放，也不能绕读门重复入队。
3. 首次点击未显全文本只显全并发完成信号，**消费这次点击**；下一次才走 `narrative.advance`。外层 Panel、推进按钮、滚轮、键盘如能绕过这一规则，须统一接同一消费策略，或明确记录 PUI 接口无法表达并走缺口裁决，不能在 GAL 里写自由 DOM 监听器。选择节点只显全/选择，不得因一次显全意外选中选项。
4. 设置滑杆变更按既有同包 Profile 串行持久化流程：成功才更新可见值和下一句打字速度，失败保留旧值并反馈；当前句如何响应热更新需稳定、可测试（保持本句速度或安全重启均可，但不得重复已读/推进）。声音、确认、已读、手动槽不受影响。恢复默认仍须等待全部设置消费者齐备，不随 04B-1 单独启用。

## 非施工独立验收矩阵

| 情境 | 必须可观察的结果 |
| --- | --- |
| 自然显示末字；0ms/空句；首次点击显全 | 当前 StoryRef 恰好一次完成通知和一次读门请求；首次点击不推进，后续点击可推进。 |
| 中途前进/回滚/读档/新局/跨分支后旧 timer 回调；同 ref 再进入 | 旧键不能标新句已读；新投影有新可见世代；读门仍验原始对象。 |
| 历史、确认、CG、回想、离开故事、卸载时旧回调 | 不能写 World/Profile/已读，不能自动推进；重新可见时处理与当前 token 一致。 |
| 自动播放、已读快进、跳过未读、选择后续播 | 自动模式待本句完成；快进政策与选择门维持原有权限和停机反馈。 |
| Profile 速度更新成功/拒绝/读档/跨包 | 可见值与实际下一句速度一致；失败旧值保留；存档剧情不携带设备/作品偏好。 |
| PUI 信号缺省及其他游戏 | 无新行为；真浏览器点击/键盘/滚轮可达，PUI 与 GAL 均需定点测试、独立复跑、锚点撤修验红。 |

当前判定：**接受 Owner 已裁的通用信号路线，拒绝在 PUI 局部自测或类型字段刚出现时直接把 GAL 已读逻辑切过去**。待 PUI 独立 PASS 之后，GAL 主程按本单接消费者；若发现首次点击/外层推进无法闭集表达，应实查后按 A/B 缺口协议报 Owner，而非手写 DOM 逃生。
