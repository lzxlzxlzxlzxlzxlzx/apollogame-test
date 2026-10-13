# GAL-UI-04B-2B 剧情文件音频与三类音量独立复查

- 复查主体：非施工 agent `/root/review_gal_audio_base`；日期：2026-10-12。
- 范围：`src/services/gal-ui/gal-audio-coordinator.ts`、GAL 宿主/设置接线、既有 Profile 三音量更新、相应测试及静态浏览器审计；未修改施工源码。
- 判词：**04B-2B 局部功能 PASS；全库类型门和 V2 视觉对齐 CONCERNS。** 只签剧情 BGM/语音/SFX 消费及声音页三个音量/试听控件，不签完整 `ui-settings-confirmations`、`media-and-final-skin`、桌面发行或全库门禁。

## 独立实证

1. `gal-audio-coordinator.ts:32-42` 按显式 GalPackage 媒体目录和已解析 URL 组装相互独立的 BGM/voice/SFX 端口；`:54-58` 拒绝同一端口充任不同通道。`gal-browser-game-host.ts:62-64` 默认浏览器装配，`audio:false` 或无 `Audio` 环境不启用，未引入作品私有播放器。
2. `gal-audio-coordinator.ts:88-105,130-140` 依 Profile 通道值、静音位、同曲 scene ambience 覆盖或媒体 defaultVolume 计算增益；BGM identity 不变时只热改音量不重播。`:147-161` 以宿主 entry + StoryRef 去重，语音只取当前 line，SFX 只取当前 node 显式 `presentation.sfx`，不把投影继承的旧 cue 粘到下一句。`gal-audio-coordinator.test.ts` 的 5 项覆盖默认/scene 音量、ack/重绘去重、分通道及缺资源/异常降级。
3. `gal-ui-slice-host.ts:208-218` 限制声音页闭集动作和 0–100 整数；`gal-profile.ts:280-294` 复用 V2 三字段与同包串行保存，成功后才替换可见 Profile，失败重绘回旧值。`gal-ui-slice-host.ts:308,361,365,412,435,453,513,579` 在回想、回滚、读档、新游戏及自动推进等节点维持表现 entry 与停播；`:379-387` 把当前投影和可见性送通用协调器。`gal-audio-host.test.ts` 4 项验证同 ref 读档再播、回想不改活动 World/Profile、失败写入旧值、预览离页停止。
4. 独立 `npx vitest run src/services/gal-ui src/services/gal-profile src/services/gal-save src/services/audio src/services/voice src/ui/components src/assembly/gal-world.test.ts --maxWorkers=1 --minWorkers=1`：退出码 **0，89 文件 718/718**，无测试告警。另先独立跑核心四文件 **28/28** 和 GAL UI/Profile/audio 目录 **124/124**，均退出 0；最终采信覆盖最广的一次。
5. 独立运行 `node src/services/gal-ui/verify-gal-audio-live.mjs --transient-shots`：退出码 **0**。静态 `file://`、任务隔离 Edge、纯内存 KV；真实 `HTMLMediaElement` WAV 已解码、在播和时钟前进；原生滑杆手势三通道实际媒体 volume、试听、失败保存旧值、真实滚轮、同 ref 槽读取、隔离回想、重开宿主、缺配音及关闭停播均有脚本断言。浏览器关闭，临时静态构建及临时截图清理；没有应用服务或数据库启动/写入。`GalAudioStatus.ready` 仅表示帧接受，不作物理扬声器输出保证。
6. 独立顺序运行 `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-settings-audio-active-dark.audit.ts` 和 `...active-light.audit.ts`：均退出码 **0**，重叠、硬低对比、border-image 前提阻断均 **0**。亮主题 `gal-settings-title` 对比 **3.57:1** 警告，36px 大字达到 3:1，但不是正文 4.5:1；暗主题审计有“华丽件 1、非 house”非阻断告警，保留给视觉票。独立目击 1440×900 原型与真实声音页截图：外框包围盒一致，但标题、页签、卡片等内部约 +57px 偏移，按钮/轨道皮和预览框也未达 V2 1:1，已由 `gal-art-01a-s5-diff.md` 追踪；本票不消除该差异。
7. **带唯一锚点的隔离撤修验红**：复制协调器与点名测试到同目录临时副本（测试仅改导入副本），确认锚点各命中一次。将 `?? bgm.defaultVolume ?? 1` 改为 `?? 1` 后，默认增益及 scene 恢复测试准确 **2/5 红**；恢复该锚点，再将 `node.presentation?.sfx` 改为投影继承 `view.sfxIds`，去重测试准确 **1/5 红**。两次均退出码 1、无额外告警；副本按精确路径清理，原件未破坏。

## 未签事项与门禁

- 独立 `npx tsc --noEmit --pretty false` 退出码 **1，当前共 16 条非 GAL 诊断**：`game-card-reveal` 2、`game-demon-castle` 2、`game-dice` 5、`game-theft` 6、`src/launcher/game-runner.tsx` 1。施工自证记 14 条；本次额外观察到 `game-demon-castle/playtest-contract.test.ts:80,89` 两条。无 GAL/audio 文件诊断，但不能把全库门禁写为通过，也无法在 Owner 禁 Git 条件下证明这些诊断相对于提交基线何时出现。
- 主音量、语音自动、失焦静音和恢复默认仍禁用；BGM fadeTicks、视频、无资产语音和真正作品配音质量不在本票内。`audio:false`、缺已解析 URL、无设备/解码失败的降级不等于“声音全功能可用”。
- 不执行任何 Git/GitHub 操作，不能用 `git diff --stat` 做提交基线范围核验；工单 `requests.md` 04B-2B 的本地施工主体在编辑前登记，但远端锁/提交未证。复查结论仅依文件、测试、真浏览器与已核工单。
