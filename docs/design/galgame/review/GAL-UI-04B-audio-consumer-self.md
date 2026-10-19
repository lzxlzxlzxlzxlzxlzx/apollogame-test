# GAL-UI-04B-2B 剧情音频与三类音量施工自证

日期：2026-10-12。施工主体：GAL 主程 `/root`。工单已在代码施工前登记；范围见 `requests.md` 的 04B-2B。Owner 既有 A 裁决允许补通用能力，本票不扩 GalPackage/Profile schema，不碰 PUI 或其他游戏。

## 本票成果与界限

- 通用 `GalAudioCoordinator` 消费显式的作品媒体目录、已解析 URL 和独立通道；默认 Web 宿主复用 WebAudioPort/SynthAudioPort。当前台词在一次进入时播放语音和显式 SFX，重绘/ack 不重复；投影中继承的上一句 SFX 不会误播。回滚、同 ref 加载、新游戏和回想切换具独立 entry；系统页停语音/SFX、继续 BGM，标题/卸载全停。
- BGM 实际增益为 Profile 音量 ×（当前同曲 scene ambience.volume 覆盖或 media defaultVolume）；改变增益不重启曲目。语音、SFX 各自独立，mute 位仍由已有 Profile 消费。合成 SFX 复用既有端口，热改其音量会先停短音；无资产语音和非零 fadeTicks 列 unavailable。
- 声音页只开放 BGM/语音/SFX 三滑杆与存在作品音效时的试听按钮。滑杆复用 PUI `releaseSnap:true`，拖动期间本地跟随，松手提交；Profile 保存成功才刷新，失败重挂根恢复旧显示。主音量、语音自动、失焦静音、全局恢复默认仍禁用。
- `GalAudioStatus.ready` 表示帧接受，不代表音频硬件已输出；URL 缺失、端口同步错误可观察并且不阻断剧情。文件解码失败仍按既有 WebAudioPort 降级；未新增产品解码失败 UI 提示，未声称物理扬声器人耳验收。

## 实证

1. 相关回归 `npx vitest run src/services/gal-ui src/services/gal-profile src/services/gal-save src/services/audio src/services/voice src/ui/components src/assembly/gal-world.test.ts --maxWorkers=1 --minWorkers=1`：退出 0，**89 文件 718/718**。含旧 V1 Profile 迁移/坏档、512 历史、保存、回想、自动/跳过和共享控件；`validateLayoutNode` 点名零 issue。
2. 静态浏览器 `node src/services/gal-ui/verify-gal-audio-live.mjs`：退出 0。正式 `mountGalBrowserGame` 自动装配真实 HTMLMediaElement，原始生成 WAV 解码 `readyState>=2`、`paused=false`、播放时钟前进；原生拖动三个滑杆改变实际增益，提示音试听、失败保存恢复、真实滚轮回滚、同 ref 槽 2 加载、隔离回想、重开宿主保留偏好、缺配音降级、关闭后全停。KV 是纯内存测试替身，没有数据库或应用服务启动。Edge 是任务临时隔离配置，浏览器已关，临时静态构建已清理；无头像/剧本/正式音频资产被登记。
3. 初次原型目击在定稿 `.dc.html` 的声音页截图 `gal-04b-2b-prototype-audio.png`；真实播放器截图 `gal-04b-2b-playing.png`、`audio-settings.png`、`failed-volume.png`、`rolled-back.png`、`loaded-same-ref.png`、`replay-return.png`、`reopened.png` 均由同画布 1440×900 静态浏览器生成。音频波形是验收夹具，不是作品配乐。
4. 现成 ui-audit 对 active audio 深/亮主题均退出 0：重叠/硬低对比/透明度边框前提阻断零。亮主题标题一条 3.57:1 警告；36px 大字满足 3:1，保留告警。深色骨架华丽件命中 1 的既有警告保留，原图皮的视觉 1:1 不由这两个无图审计保证。
5. `npx tsc --noEmit --pretty false`：自证运行时退出 1，实见 game-card-reveal/game-dice/game-theft/launcher 的 14 条非 GAL 诊断，GAL/音频新增诊断零。独立复跑随后实见 16 条非 GAL 诊断，另含 game-demon-castle 2 条；以复查时的完整诊断为准，不称全库门禁通过。首次新夹具缺 RandomSeed、读档测试遗漏重新选槽，以及类型/拖动接线问题均修复后再复跑，失败不计作绿灯。

## 原型对齐单（局部功能）

| 承诺 | 结果 / 去向 |
| --- | --- |
| 三类音量改变真实声音增益、保存后重开保留 | ✅ 浏览器原生手势与实际媒体 volume、Profile 回读 |
| 试听按钮可播放作品提示音，离开页后停止 | ✅ 原始 WAV 播放状态与停播 |
| 保存失败旧值可见，且不改变播放增益 | ✅ 原生滑杆旧值与媒体值同时恢复 |
| 回滚/读档/回想切换停止旧台词，不改活动剧情 | ✅ 真手势/槽链/World hash/Profile 字节对比 |
| V2 设置系统外框 x18/y61/1404×824 | ✅ 真浏览器包围盒 |
| 框皮内部内容锚点与 V2 1:1 | ⚠ 既有原图 58px 边宽使标题/tabs/grid 等约 +57px；已在 `gal-art-01a-s5-diff.md` 的设置行登记，保留给独立几何收敛票。此票不签视觉/完整 S4。 |
| 主音量、语音自动、失焦静音与全局恢复默认 | ⚠ 仍诚实禁用，归 04B 合同/消费者后续票 |
| BGM 渐变、视频、TTS、声线创作品质 | ⚠ 未完成；归媒体/演出后续票，不用测试 WAV 代签 |

玩家视角：三类音量标签与百分比可读、试听反馈可见、失败保留旧值；setting root 与控件归属当前作品而非存档槽。故事阶段信息沿既有 UI，夹具缺正式背景/立绘有明确占位。新增声音设置均可真手势到达；系统页其他禁用项仍标待接入。标题的大框内部偏移是已登记视觉偏差，不能把“能够点击”当成定稿对齐。此票不新增玩法，整局重玩意愿/首作教学归首作 S1–S8。

独立复查、带唯一锚点隔离撤修验红另见 `GAL-UI-04B-audio-consumer-independent.md`；施工者不代签。
