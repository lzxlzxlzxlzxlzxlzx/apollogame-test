# S6 真 PNG 候选映射自检

2026-10-13；本聊天施工自检，不是独立复查或 S6 完成。

## 范围与结果

- 资产专员已登记 8 texture / 7 hit-mask；本聊天读取真实生产 PNG，而非模拟矩形，测试候选 manifest 严格装载与七目标绑定。
- `npx vitest run games/game-clue-investigation/s6-alpha.test.ts`：9/9 PASS，退出 0，最终运行无告警。
- 每物件分别在 contain/cover、0.5/1/1.75/-1 倍变换下采样 31×31 点，共 53,816 点；预期值由独立居中图像适配公式和解码 PNG alpha≥150 推导，不调用生产的 planSpriteDraw 作为预期值。
- 每张图的 contain 均断言至少一个实心与非实心反例；缺失 mask 与非零旋转均明确 invalid-mask，不退回矩形。
- 首次沙箱运行遇 realpath EPERM，没有执行测试。获准本地重跑后，测试初稿误把 Web URL 当文件路径，7 项 ENOENT；修正为验证 `/games/game-clue-investigation/art/` 前缀后映射到本地 artRoot，再跑 9/9。上述失败不隐藏，也不算产品命中缺陷。

## 产物与边界

- `review/S6-before-manifest.json`：修改前完整语义快照。
- `self-check/S6-manifest.candidate.json`：只添加 Sprite/mask 和白色不透明 Color；正式 manifest 尚未替换，UI 证据图仍待接入。
- `games/game-clue-investigation/s6-alpha.test.ts`：候选数据定向测试。
- `review/S6-assets-import.md`：资产专员来源、尺寸、SHA、自检证据。

正式加载桥由引擎程序施工；尚未验证浏览器网络装载、截图、视口适配、触控、反馈轮廓与收录后图像保持。未跑全库门禁、未声称视觉 1:1、未代签任何人门。异人复查单独出具，不把本记录作为其证据替代。
