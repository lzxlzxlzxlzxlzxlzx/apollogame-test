# UI-02 候选接线自证 · 2026-10-13

> 历史候选记录：颜色已获Owner修正许可，共享UI02已独立PASS并于2026-10-14消费正式。当前版本/真实结果以 `S6-ui02-formal-freeze.md` 为准；下文旧hash、ratio1.05和未获裁状态保留为历史，不是当前结论。

状态：**候选几何/裁切行为通过；UI 对比门 FAIL；不得物化或称 S6 完成。** 共享 UI-02 仍等非施工者独立复查，UI-03 尚待 Owner 裁决。本次只接 reveal/collected 的最初纸框、裁切、按钮排版，不声称九态全部返修完成。

## 文件与冻结

- authoring变换：`s6-ui02-candidate.mjs`，输出纯JSON `S6-ui02.candidate.json`。不是游戏runtime，也不替换正式manifest。
- source正式 SHA256：`8a7306cb7439875b1a79b320aa66c7303b01534075a77caa0856bb19449f1a9d`。
- 候选 SHA256：`16429de845a94e4f210603c86d2da8564033dae1f3a36f2f0a93ef2f56fe85f1`。
- authoring脚本断言 source hash命中且最终未变；剔除presentation.ui后候选与正式deepEqual，保护全部世界rules、8Sprite/7hitMask、资产引用、旗标、输入与输出协议。没有在未落地接口里填UI-03字段。

## 实跑证据

1. 严格`manifest-check --art-index library/game-clue-investigation/art/index.json`经vite-node运行：exit0，warnings=[]，包含真实索引解析/装载。沙箱首次realpath EPERM后以受控本地权限重跑，不把环境报错当内容PASS。
2. `node .../s6-visual-map.mjs --fixture --candidate`：exit0。局部Vite5728与隔离Edge，六处精确矩形断言+cover/top+无重复关闭chrome+正式hash未变；通过真实lock收录、prints收录、完成重开、取消旅程。未route Owner页面，未修改真实账号/存档。
3. 实测reveal和collected纸框均(310,170,820,560)，图片框均(362,296,716,274)，Image(369,303,702,260) cover / object-position50%0%，收录按钮(970,638.38,108,47)，原型y638.39，误差0.01px。
4. 截图：`shots/S6-ui02-candidate-reveal.png`、`shots/S6-ui02-candidate-collected.png`；本施工者已目击reveal截图。机器测量存`S6-ui02-candidate.measurements.json`。图片实物裁切位置到达原型；透明背景的径向底渐变与边框仍有下列未解差异，不能称整个图框像素相等。
5. `VITE_GCI_UI02_CANDIDATE=1`选择`s6-reveal.audit.ts`候选；reveal/collected×deep/light四轮最终均exit1：重叠0、硬对比1（eyebrow ratio1.05）、AA告警0、border-image问题0。一次亮底因另一并发审计清理固定`.ui-audit-tmp`导致ERR_FILE_NOT_FOUND，已独立补测得到同一真实低对比，未掩盖错误。

## 仍未完成/裁决项

- **原型本身对比冲突**：cyan `#7EE9EC` eyebrow在浅纸上ratio1.05，违反UI硬门。已报告主聊天，不能一边声称原型逐色复刻、一边默改深色或悄悄豁免；须Owner明确颜色调整/允许差异。
- 图框原型7px棕边；候选现有Panel仅主题1px边+6pxpadding。此时几何已对，但边色和内渐变还不一致。等待UI-03受控Panel边后接入，不用未知border字段。
- Label多行lineHeight30.4、印章字重900/5px透明红边未支持，候选如实保留。当前印章仅基础Label旋转，非最终印章。
- 候选Modal框已替换，但完整lift轨迹/淡入、其他HUD/完成/退出/取消九态重排尚未消费；本候选没有用“局部通过”覆盖这些工作。
- 回看按钮维持所在selected对象组及原collected旗标，单一“回到现场”发原investigation.close。删除额外可见返回按钮/X，但不修改World信号或规则。后续浏览器补专门Escape及三对象回看覆盖，现不宣称这部分已独立验完。

清理：本轮探针finally关闭浏览器和Vite；Owner5173原先拒连未启动/重启。正式manifest未变，当前停在共享复查及Owner颜色/UI-03裁决依赖处。
