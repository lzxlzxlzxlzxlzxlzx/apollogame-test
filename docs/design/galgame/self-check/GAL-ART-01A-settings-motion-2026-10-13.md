# GAL-ART-01A · 设置与入场时序局部自证（2026-10-13）

施工者自证，**不等于独立复查或 S5/S6 完成**。基准是 Owner 定稿的 `gal-ui-complete-v2.dc.html`（1440×900）；只改 GAL LayoutNode 数据消费，通用 Toggle 控件由 PUI 单独施工与复查。

| 项 | 证据与结论 |
| --- | --- |
| 设置四页 | `review/gal-art-01a-settings-{text,audio,display,confirm}-{dark,light}-toggle-v2c.png` 八张真浏览器图；V2 开关为 75×31、22px 滑块，GAL 仅有 V2 frame 时填 `Toggle.visual`，并设 `showLabel:false`，外侧行名保留，原生 checkbox 的可访问名仍由 `label` 提供。行分隔、56px 内容行、深靛卡、金色卡标题及按钮锚点已消费；禁用能力继续显式禁用，未伪装可用。 |
| 确认弹窗 | `review/gal-art-01a-confirm-{new-game,return-title}-{dark,light}-toggle-v2c.png`；五类确认由同一闭集 Modal/ActionSink 接线，标题和确认按钮按语义区分，按钮居中 124×44，X 移除，遮罩/Escape 仍发取消。内框高度及标题字号与 V2 明显不符，见 `gal-art-01a-modal-gap-2026-10-13.md`，不签 1:1。 |
| S6 现有时序 | `gal-story-text` 通过 `layout.anim:'flyIn'`/bottom/7px/240ms；两项选项 250ms，第二项 `animDelay:90`。`verify-gal-art-live.mjs` 在暗/亮真浏览器读取 `animationName/Duration/Delay` 并断言，四态均通过，浏览器已关闭。通用 pulse 与 V2 提示符的透明度相位相反且无位移，错误近似已撤、提示符仍静态；完整 S6 未签。 |
| 回退/测试 | GAL UI 9 文件 88/88，`npx tsc --noEmit` exit 0。无图或显式旧 frame 的 story text 不加 V2 入场；`gal-ui-art.test.ts` 核对 V2/回退及 Modal 动作。设置页 `ui-audit`：重叠 0、对比硬失败 0、border-image 前提 0；标题 3.57:1 非阻断警告仍在，不抹去。 |

差异与限制：当前截图使用 GAL 审计夹具及已登记 demo 素材，不能替代 Owner 对最终角色/场景/CG 的逐件审美、来源与许可批准；全库 `scoped-gate` 尚有与本票无关的共享依赖违规，未声称总门绿。未运行整套 ZeroCraft、未写远程 Git/DB。独立复查另见 `review/GAL-ART-01A-settings-motion-2026-10-13-independent.md`。
