# S5 当前 UI 域独立复查（2026-10-15）

- 复查主体：`/root/potion_current_review`，非施工者；`ui=2612e091f095bd66`。
- 判词：**PASS（UI 结构、可读性、可驱动性）**。没有 golden 像素基准，不能将此判词扩写为自动逐像素 1:1 或整个 S6 美术/动效通过。

## 独立核证

1. `node tools/ui-audit.mjs tools/audits/potion-brewing.audit.ts` 在隔离 Edge 下退出 0：重叠 0、硬对比 0、低对比警告 0、border-image 前提错误 0。首次受限沙箱启动 Edge 失败，沙箱外重跑成功；失败不是 UI 缺陷。审计另报华丽件命中 0、house 否，为 fixture 的非阻断启发式告警；正式游戏 `game-potion-brewing.ts:34,64-76,214-217` 均通过 `mountUI(...,POTION_THEME)`，`screen.ts:5-6` 从 house 主题调整透明宿主洗色，不是裸 DOM 灰皮。
2. `npx vitest run src/ui/components` 独立 76 文件、573/573；`node scripts/potion-s4-browser-probe.mjs --stage=S5` 独立 12 张真浏览器关键帧、0 page error、exit 0，短时测试服务和浏览器已关闭。S3 Canvas 真手势 mouse/touch 2/2 及 S4 39 个验收检查点另有当前域独立复查，不以 DOM 控件数量冒充可驱动性。
3. 目视并排检查 `ui-refs/29-transparent-fixed-recipe.png` 与本轮 `self-check/shots/S5-01-start.png`：1440×900 三栏相对位置、锅与卷轴/货架锚点、金白标题/暖纸/深木层级保持；现屏删除了旧原型右侧数量圆标，系 Owner 后续 S1-P-07/08 的明确改动。当前截图里卷轴文本和步骤卡无明显重叠、裁切，架卡与横档仍分层可读。再核 `S5-alignment.md` 文首明确旧份数/QE/重开/emoji 内容是历史基线，现合同附录逐项覆盖居中、悬停、液色和结果。
4. UI 节点仍由 `screen.ts` 的 LayoutNode 构造，锅属于 Canvas play-field；没有在本游戏 UI 里引入自由 DOM 屏逃生。当前 S5 调整与 Owner 原型变更相随，不把“冻结 S4 结构”错误理解为拒绝已定稿的后续修改。

## 已读告警与未扩大结论

S5 machine 报“无 golden 基准、未照比”，故截图仅为人工同画布抽查，不声称像素级自动视觉回归；S6 美术资产逐行复核与多帧动效仍在其各自控制面。华丽件 0/house 否仅属通用 audit fixture 的非阻断告警，正式 `POTION_THEME` 接线与真实屏为核对依据。本复查未操作 Owner 日常浏览器、账号或主系统，未代签 Owner 人门。
