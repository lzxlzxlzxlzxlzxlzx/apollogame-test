# 音频手册

> **声音 = 数据**：每种音的频率/波形/时长/音量是一张表，合成器 = 引擎固定解释器（零外部音频文件、确定性、headless 静默 no-op）。
> 机读真相：端口 + 数据类型 `src/services/audio/index.ts`（`SynthAudioPort`/`SfxSpec`、`SynthMusicPort`/`MusicTrack`）；组件 `Sound`（`l4-sound`，`src/assembly/component-map.ts`）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| sim 里声明「该响什么」 | `l4-sound`（组件 `Sound`） | 挂 `Sound{clipId,volume,loop}`；表现层读取并播放 |
| 程序化音效（点击/金币/失败） | `SynthAudioPort` + `SfxSpec` | 写音色表 `{partials:[{wave,freq,freqTo?,dur,gain}]}`，端口合成（无音频资产） |
| 背景音乐循环 | `SynthMusicPort` + `MusicTrack` | 写音符表 `MusicNote{beat,freq,dur,wave}`，端口循环合成；BGM 与 SFX 独立开关/音量 |
| 角色语音（台词朗读/配音） | `VoicePort`（`services/voice`）：`TtsVoicePort`(合成·v1)/`SamplePackVoicePort`(采样)/`createVoiceChain` | 游戏侧只发 `{charId,event,text,params?}` 纯数据；链 ①TTS→②wav→③兜底(`SynthAudioPort` 提示音+字幕)。事件键闭集校验归消费方 spec。**表现层旁路·不进 sim/hash** |
| headless/SSR 环境 | 端口内建降级 | 无 `AudioContext`/`speechSynthesis` → 静默 no-op（测试安全） |
| sim↔音频同步 | `AudioSync` | 把 sim 产出的 Sound 投递给端口 |
| GAL 剧情与声音页音量 | `GalAudioCoordinator` + `createGalBrowserAudioPorts`（`services/gal-ui`） | 显式 GalPackage 媒体目录和 contentUrls 交通用宿主；独立 BGM/voice/SFX 端口消费已解析文件，SFX synth 复用 SynthAudioPort。Profile V4 的主音量与三声道音量由 `persistGalAudioVolume` 串行保存并相乘；`focusMute` 经 `persistGalFocusMute` 保存，宿主只传浏览器焦点/可见性，失焦热静音、恢复不重播。`voiceAuto` 经 `persistGalVoiceAuto` 保存；关闭后入句不自动播语音，修订 V2 剧情工具栏的具名动作仍可重播当前句。`audio:false` 可禁用产品默认装配。帧 identity 是宿主 entry+StoryRef，ack/重绘不重播；当前 node 显式 sfx 才触发。系统页停一次性声、保留 BGM；加载/回想切换和卸载清理旧实例。 |

## ② 样例指针

- **正样例**：`games/game-g/sfx.ts`（音色表 → `SynthAudioPort`）、`sound.ts`（静音持久 + 键）、`bgm.ts`（音符表 → `SynthMusicPort` 循环）。
- 端口实现：`src/services/audio/synth-audio.ts`、`synth-music.ts`。
- 试听台：`games/game-i/sounds.ts`。

## ③ 本线红线

- 声音走**数据表 + 引擎合成端口**，不在游戏层手写 Web Audio（game-g 曾重复手写，已下沉统一端口）。
- 无 `AudioContext` 必须静默降级，不炸测试/SSR。
- 音色/音符表用**闭集字段**（wave/freq/dur/gain…），不塞自由 DSP 代码。
- 版本化 GAL 合同中的配音/BGM 文件通过上述通用端口消费，不在作品层写播放胶水。`GalAudioStatus.ready` 只表示接受了表现帧；缺少已解析 URL 会列 unavailable，文件解码/设备输出不由该状态保证。主音量、语音自动/失焦偏好、BGM fadeTicks、视频与无资产 TTS 尚未接入本票，不能称完整音画设置。

## ④ 正样例 / 反面教材

- ✅ game-g `sfx.ts`/`bgm.ts`：声音=数据，合成器=引擎（曲/音色纯数据·可弱 LLM 产）。
- ✖ 游戏层直连 `new AudioContext()` 手写振荡器 / 依赖外部 mp3 资产文件。

## ⑤ 查不到怎么办

需要现有端口表达不了的音频能力（如采样播放、空间音频） → `docs/workflow/requests.md` 提缺口（先看能否用 SfxSpec/MusicTrack 数据重组）。**不在游戏层手写音频引擎。**
