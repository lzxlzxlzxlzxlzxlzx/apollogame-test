# GAL-UI-04B-2C 主音量与失焦静音独立复查

- 复查主体：`/root/review_gal_audio_policy`，非施工者；2026-10-12。
- 裁决：**本票局部功能 PASS；全库类型门及 V2 视觉对齐仍为 CONCERNS**。本报告不批准 `ui-settings-confirmations` 整项，不代 Owner 人门。
- 边界：只审 Profile V3 音频政策、协调器/宿主/声音页、相邻确认政策与三声道回归。未修改施工源码、UI 基座、资产或真实数据库；仅写本复查报告。

## 独立证据

1. 阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,ui,audio,save-platform,testing,self-check,review-gates}.md`、`docs/design/ui-playbook.md` 与 `module-ui/module-audio/module-save/check-ui/project-roadmap` 技能后，实查 `src/services/gal-profile/gal-profile.ts`、`src/services/gal-ui/gal-audio-coordinator.ts`、`gal-ui-slice-host.ts`、`gal-ui-settings.ts`、对应测试及浏览器验收脚本。工单范围与 `GAL-UI-04B-audio-policy-self.md` 对照，未以施工自陈作为复查结果。
2. `npx vitest run src/services/gal-profile src/services/gal-ui/gal-audio-coordinator.test.ts src/services/gal-ui/gal-audio-host.test.ts src/services/gal-ui/gal-ui-settings.test.ts --maxWorkers=1 --minWorkers=1`：**5 文件、42/42 PASS**。首次默认沙箱读取 `node_modules/vitest/dist/spy.js` 遇 EPERM、零测试，隔离环境权限调整后重新执行并以真实退出码 0 判定。`gal-profile.test.ts:123-165` 覆盖 V1→V2→V3、V2→V3，信封未原地改写、已读/解锁/六确认保留、三音量与焦点政策同包串行保存、坏值拒绝；`gal-audio-coordinator.test.ts` 覆盖主音量乘积、失焦归零、恢复不重播；`gal-audio-host.test.ts` 覆盖 UI 动作、落盘、失焦事件和原三音量。
3. `node src/services/gal-ui/verify-gal-audio-live.mjs --transient-shots` 退出码 **0**：仅访问短期 Vite 构建的 `file://` 静态文件；Edge 使用临时隔离配置，存储为覆盖 `IndexedDbKV` 的纯内存 KV。实测解码后的 WAV 播放、主/三声道滑杆、失焦静音/恢复、试听、失败回退、滚轮、同 ref 读档、回想、重开、缺语音降级与卸载停播；脚本 `finally` 关闭浏览器并清理临时目录。未启动应用服务或打开真实 IndexedDB。
4. `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-settings-audio-active-dark.audit.ts --w1460 --h900` 和亮版同命令均退出 **0**，重叠、硬低对比、border-image 阻断各 0。暗版华丽度仅 1 且无 house 主题是已有 S5 告警；亮版标题比率 3.57:1（36px 大字，达到大字 3:1 下限）仍保留工具警告。此审计不能替代 V2 同画布视觉 1:1 裁决。
5. `npx tsc --noEmit --pretty false` 退出码 **1**；诊断见 `games/game-card-reveal`、`game-dice`、`game-simlife`、`game-theft`，`src/authoring/life-host-descriptor.*`、`src/engine/host/life-game-host.ts` 与 `src/launcher/game-runner.tsx`，无 `gal-profile`/`gal-ui` 音频文件诊断。共享树同时有其他施工，不能把这些断言为本票引入或宣称全库绿。

## 两处隔离撤修验红

两次均由 `esbuild` `onLoad` 在**内存中**替换唯一命中锚点（各 `hits=1`），`write:false`；原文件未修改。运行真实导出的 `GalAudioCoordinator`/测试包/`NullAudioPort`，同一行为断言先绿后红。

| 锚点 | 原版预期/实值 | 隔离破坏 | 破坏后实值 |
|---|---:|---|---:|
| `gal-audio-coordinator.ts` 中 `const master = p.muted || (p.focusMute && !focused) ? 0 : p.masterVolume;` | 失焦且政策开启时 voice 增益 0/0 | 改为仅 `p.masterVolume` | 0.35，断言转红 |
| 同文件 `this.ports.voice.setMasterVolume(master * p.voiceVolume);` | 主音量 0.5 × voice 0.7 = 0.35/0.35 | 移除 master 相乘 | 0.7，断言转红 |

第一处临时探针最初因手拼 projection 缺少有效场景状态而量到未启动声道的缺省 1；改为直接调用协调器增益路径后得到上述有效绿→红实验，未把无效尝试当通过证据。

## 边界与未签项

- `GalAudioStatus.ready` 只是帧接收，不保证用户设备真实出声；隔离 Edge 验证了文件解码、播放状态和音量，未做人耳音质验收。
- 语音自动、画面/文字剩余设置、全局恢复默认、完整 V2 视觉与 S5/S6 演出尚未完成；整项里程碑维持 active。
- 全库类型门红，不能提交全绿推送结论；本复查未执行任何 Git/GitHub、应用服务启动、数据库持久写入或 Owner 审批。
