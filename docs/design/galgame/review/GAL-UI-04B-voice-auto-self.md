# GAL-UI-04B-2D 自动语音与当前句重播施工自证

- 施工主体：GAL 主程 `/root`，2026-10-12。施工前本地登记 `docs/design/galgame/requests.md` 的 2D 工单。
- 原型人门：Owner 对 1440×900 修订截图 `gal-v2-voice-replay-proposal.png` 明确回复“确认修订稿，按此实现”；当前目标哈希见 `gal-ui-complete-v2.md`。
- 范围：Profile V4 逐步迁移、语音自动偏好串行保存、协调器当前 ref 手动重播、GAL 宿主具名动作、LayoutNode 剧情顶栏与声音设置。未改 PUI 基座、World、正式资产或其他游戏。

## 自证

1. `openEnvelope` 按 V1→V2→V3→V4 逐步迁移，V3→V4 默认 `voiceAuto:true`；旧三音量/主音量/失焦、六确认、已读/解锁保持，旧信封只读不原地改写。无效 `voiceAuto` 拒绝；`persistGalVoiceAuto` 与确认、音量共用同包串行 lane，失败不更新可见状态。
2. `voiceAuto:false` 时进入 line 不触发语音播放，不影响 BGM、节点显式 SFX 或剧情推进。`gal.story.voice-replay` 只在当前可见 line、有已解析语音且 entry/StoryRef 对齐时可用；重复点击只重播当前语音，过期 ref、缺语音、系统页、卸载拒绝，不发剧情输入、不改 World/已读。true 时依旧允许玩家重播。
3. Profile/音频定向 **5 文件 46/46**、相关 GAL/UI/Profile/存档/音频/语音/装配回归 **89 文件 726/726**，退出码 0。`node src/services/gal-ui/verify-gal-audio-live.mjs` 退出码 0：隔离 `file://` Edge、纯内存 KV、真实 WAV，开关关闭后无自动第二句、手动重播、滚轮/同 ref 读档、回想、重开、缺语音按钮禁用、卸载停播均实测；浏览器及临时构建已关闭/清理。
4. 原型 1440×900 截图为 `gal-v2-voice-replay-proposal.png`；正式浏览器当前剧情截图为 `gal-04b-2d-playing.png`。按钮可用性脚本直接断言。`gal-ui-story-03e.audit.ts` 零重叠/硬对比/border-image 阻断，但华丽度 0 警告；正式顶栏按钮组与原型仍有横向间距差异，沿用 S5 差异账，不把本票当作 V2 视觉 1:1。
5. `npx tsc --noEmit --pretty false` 退出 1，报错在其他游戏与启动器；输出未见 GAL/Profile/audio 新诊断，不称全库类型门通过。

## 未签

本单等待非施工者独立复查。文字逐字完成、画面消费者、全项恢复默认、正式退出宿主及 V2 S5/S6 仍未完成；`ui-settings-confirmations` 继续 active。
