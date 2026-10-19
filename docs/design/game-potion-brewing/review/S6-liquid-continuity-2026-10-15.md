# S6 药液连续动画局部独立复查（2026-10-15）

范围：本轮投料/搅拌液色与闪光表现；不代替 S6 整体验收、Owner 美术平台逐行复核或 Owner 人门。

复查者与施工者不同。复查者自行运行 `npx vitest run games/game-potion-brewing/screen.test.ts games/game-potion-brewing/blueprint.test.ts`，10/10 PASS；自行运行 `node scripts/potion-s4-browser-probe.mjs --stage=S6`，20 帧、0 浏览器错误、exit 0。隔离测试浏览器和局部服务已关闭。

复查者目视 `self-check/shots/S6-02a-add-fade-start.png` → `S6-02b-add-fade-middle.png` → `S6-02-add.png`：旧浅蓝逐渐退去，新青绿色渐现，汤心亮光先增强后衰减；`S6-03-stir.png` 中搅拌重新触发亮光，锅体纹理未发光。代码检查确认旧水层只在颜色变化且非 reduced-motion 时出现，900ms 后清理；cue 180ms 攻击、950ms 清理，新事件/销毁时清除旧定时器。reduced-motion 跳过动态过渡，但保留静态反馈。

局部结论：常规投料/搅拌连续动画 PASS。边界保留：两次有效输入间隔小于 180ms 的快速连续触发尚未做真浏览器点名覆盖；旧液层以逻辑上的上一色为起点，理论上可能与中途合成像素有差异，不把该边界写为已验收。
