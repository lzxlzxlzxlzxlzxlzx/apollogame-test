# GAL-UI-04B-2D 非施工独立复查

- 复查人：`/root/review_gal_voice_auto`；施工人：`/root`。2026-10-12。只写本报告，未修改共享源码、原型或项目控制台。
- 判词：**局部功能 PASS；整项 `ui-settings-confirmations` 仍 active / CONCERNS**。本单范围内的 Profile V4、语音自动政策、当前句手动重播、具名 UI 动作在所述边界有实证；这不签认 V2 全画面结构/视觉 1:1，也不签认全库类型门或剩余设置。

## 范围与合同核证

1. `src/services/gal-profile/gal-profile.ts:7,37-39,134-174,252-255`：V4 按 V1→V2→V3→V4 链升级，旧三通道、主音量、失焦政策、六项确认与进展字段保持；V3→V4 对旧档补 `voiceAuto:true`。`loadGalProfile` 使用解码迁移，未将旧信封原地写回；新值经严格布尔及额外字段检验。`persistGalVoiceAuto`（同文件 :341-351）沿用同 package 串行读改写，并在 SavePort 成功后返回更新档案。现有测试覆盖 V1/V2/V3、并发确认/主音量和无效参数；语音自动写失败有宿主 catch 回退实现，但**本票没有独立的专门失败写断言**，仍建议在总设置票补上。
2. `src/services/gal-ui/gal-audio-coordinator.ts:122-146,177-188`：关自动语音时当前句不发声，BGM 与当前节点显式 SFX 照常；手动入口校验活动会话、当前可见 line、package、entry、StoryRef、voiceId/assetKey 和已解析 URL，重复点击先停上一条语音再重播。声音只在表现端口发生，不投剧情 InputQueue，故不改 World 或已读。无资源时按钮禁用；`reset`/`stopOneShots` 使读档、回滚、回想离页与卸载的旧实例停播。
3. `src/services/gal-ui/gal-ui-slice-host.ts:245-276,423-440`：声音页 `gal.settings.voice-auto` 只接受 `'true'/'false'` 并在持久化成功后换可见 Profile；失败更新渲染修订号。`gal.story.voice-replay` 只在故事页消费，系统页、确认窗、历史窗受入口闸拦截。`src/services/gal-ui/gal-ui-settings.ts:76-78` 和 `gal-ui-structure.ts:117` 分别使用闭集 Toggle/Button 与具名动作，无私有 DOM 逃生。
4. Owner 在会话中对修订截图明确回复“确认修订稿，按此实现”；目标为 `docs/design/galgame/gal-ui-complete-v2.md` 所登记的 1440×900 V2 修订。复查目击 `review/gal-v2-voice-replay-proposal.png` 与 `review/gal-04b-2d-playing.png`：重播入口确已进入顶栏且可发现；正式截图的按钮很小，按钮组间距、背景/立绘占位与原型仍明显不同。这个视觉差异只能留在 S5/S6 差异账，不能以本单功能 PASS 关闭。

## 独立复跑与撤修验红

| 检查 | 实际结果 |
|---|---|
| 定向 Profile、协调器、宿主 | 首次普通沙箱访问 `node_modules/vitest/dist/spy.js` 报 EPERM，0 项执行；只读重跑退出 0，4 文件 **56/56**。命令包含 `gal-profile.test.ts`、`gal-audio-coordinator.test.ts`、`gal-audio-host.test.ts`、`gal-ui-slice-host.test.ts`；不存在的 `gal-ui-settings.test.ts` 未被收集，不计文件数。 |
| 相邻 GAL/UI/Profile/存档/音频/语音/装配回归 | `npx vitest run src/services/gal-ui src/services/gal-profile src/services/gal-save src/services/audio src/services/voice src/ui/components src/assembly/gal-world.test.ts --maxWorkers=1 --minWorkers=1`：退出 0，**89 文件 726/726**。 |
| 静态真实浏览器 | `node src/services/gal-ui/verify-gal-audio-live.mjs --transient-shots`：退出 0。隔离临时 Edge 访问本机 `file://` 构建产物，使用纯内存 KV、原生 WAV 解码。实际点击语音自动关闭后第二句无自动配音，点击重播有当前句声音；滚轮回滚、同 ref 读档、回想、重开、缺 voice URL 禁用、卸载停播和音量/失焦路径通过。脚本 finally 关闭浏览器并清理临时产物；未访问服务或真实数据库。 |
| UI 审计 | 剧情 `gal-ui-story-03e.audit.ts`、声音页深/亮两案退出码均 0，重叠、硬对比及边图前提阻断均 0。亮主题 `gal-settings-title` ratio **3.57** 属大字非阻断提示；剧情审计华丽度 0，且工具运行布局为 1060×760，并非 1440×900 原型对拍。 |
| 全库类型门 | `npx tsc --noEmit --pretty false` 退出 1；诊断在 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx`，未见 GAL/Profile/audio 诊断。不能称全库三绿或可推。 |

撤修在系统 TEMP 的临时 Vitest 配置中通过 Vite `transform` **内存替换**，每次先断言指定锚点命中；另以 `rg -F` 核对两个锚点在各自源文件仅出现一次。未触及共享文件：

1. `gal-audio-coordinator.ts` 锚点 `node.kind === 'line' && node.voice && p.voiceAuto` → 改为 `&& true`；`gal-audio-coordinator.test.ts` 退出 1，7 项中 1 红，`...test.ts:106` 报“关闭自动时仍播放 first”。
2. `gal-profile.ts` 锚点 `normalizePreferencesV3(legacy.preferences, pkg), voiceAuto: true` → 改为 `voiceAuto: false`；`gal-profile.test.ts` 退出 1，18 项中 3 红，分别为 V1、V2、V3 旧档迁移默认值。两份临时配置随后按绝对路径逐一删除并核对不存在。

## 后续边界

本票的局部功能证据充分；正式 V2 同画布对齐、文字/画面设置消费者、全项恢复默认、正式退出宿主与全库类型错误仍须在后续票独立处理。浏览器测试证实解码与播放状态，不等于扬声器听感、人工作画品质或最终桌面应用验收。
