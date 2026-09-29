# 《言弹交锋》W5.3｜1440×900 逻辑画布与可读演出节奏纠偏

## Owner 裁定

- 唯一正式逻辑画布与主验收视口恢复为 **1440×900**。
- 810×506 是 Codex 侧栏页面，不得再据此反向放大正式游戏字号与卡牌。
- 所有需要玩家阅读的阶段至少可见 1.2–1.6 秒。
- 抽牌与出牌必须展示连续路径；卡牌不得瞬移。

## Demo 实查结论

参考源码：`doki-design-base-main/src/free-roam/ui/`。

- `useConflictPresentation.ts` 把出牌拆为 play → impact → response → ready；规则结果先提交，演出只投影快照。
- `CardConflictView.tsx` 从被点击卡真实矩形起飞，使用独立 ghost，飞行期间锁输入。
- `card-conflict.css` 的桌面卡牌约 108–142.5×165–250px，桌面标题约 28px、卡名13px、卡效11px。
- Demo 原始阶段较快；本作只借鉴“拆阶段、真实起点、先提交后演出”，时长按 owner 的 1–2 秒阅读要求加长。

## 实现规格

- 舞台：1440×900，`mountHost` 在主验收视口 scale=1。
- 卡牌：132×234，五张手牌使用 10px 间距；卡名17px、效果15px。
- 开局抽牌：单张900ms、相邻180ms、五张总1620ms，phase 1800ms。
- 出牌：确认240ms；飞行1000ms；飞行 phase 1100ms；命中1500ms；回应1400ms。
- 意图/回合/敌方影响/终局文字阶段：1200–1600ms。
- `prefers-reduced-motion` 只把空间位移缩短到120ms；文字停留时间不缩短。
- 演出推进按 `requestAnimationFrame(timestamp)` 的真实毫秒差计算，不再按 RAF 次数假定屏幕恒为60Hz。
- simulation、卡表、敌人意图、随机序列、输入输出契约冻结。

## 验收

- 1440×900 实测 scene 必须为1440×900、transform scale=1。
- 字号与卡牌矩形按真浏览器 computed style / bounding rect 记录。
- 实测飞行可见时长至少950ms；完整 play→ready 至少3.8秒。
- busy、skip、失焦、reduced-motion 与普通路径落同一 committed after。
