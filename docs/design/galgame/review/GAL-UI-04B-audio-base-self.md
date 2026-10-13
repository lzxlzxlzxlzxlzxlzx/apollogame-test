# GAL-UI-04B-2a 通用文件音频底座施工自证

日期：2026-10-12。施工主体：GAL 主程。范围仅 `src/services/audio/web-audio.ts` 与 `web-audio.test.ts`；不碰 PUI、作品剧情、资产、数据库或服务。本票属 `ui-settings-confirmations` / `media-and-final-skin` 的前置局部件，不签声音页或完整 04B-2。

## 需求与实查

- 既有 `AudioPort` 支持 `play/stop/stopAll/setMasterVolume`；`WebAudioPort` 对 loop 缓存原元素，但一次性声音通过未登记克隆播放，`stop` 无法打断克隆。`setMasterVolume` 直接把缓存元素音量设为主音量，丢失 `play(...,{volume})` 的相对增益。
- GAL `NarrativeProjection` 已给 BGM/SFX/voice assetKey；宿主尚无媒体协调器。声音设置的 UI 行仍禁用，不能因本票开启。

## 本地结果

1. 一次性实例按 clipId 登记；`stop(clipId)` 可打断该 clip 所有正在播放的克隆，不波及其他 clip；自然结束/错误/播放拒绝后释放登记。
2. 原始单曲增益与主音量相乘，热更新不覆盖相对值；输入音量钳至 0–1，非有限值回退 1；无 `Audio` 或音频构造器同步失败时静默降级。
3. 同 clip 的 loop→one-shot 不让克隆继承循环属性。
4. 沙箱初跑 `node_modules/vitest/dist/spy.js` 的 `realpath` 报 EPERM、0 个用例执行；受控最终回归 `npx vitest run src/services/audio src/services/voice --maxWorkers=1 --minWorkers=1` 退出 0，**47/47**（其中 WebAudioPort/AudioSync 9/9）。全库 `npx tsc --noEmit --pretty false` 仍退出 1，错误在 game-card-reveal、game-dice、game-theft、launcher，共 14 条；本票文件无诊断。独立复查发现音频构造器同步异常未保护，施工者补保护和点名测试后重新复跑。未运行 Git 或启动服务。

## 未签

本票没有 GAL assetKey→URL 装配、剧情 ref 去重/回滚停播、BGM/语音/SFX 分通道音量与设置页消费，也没有真声音设备/浏览器试玩。独立复查、撤修验红与最终判词另见 `GAL-UI-04B-audio-base-independent.md`。
