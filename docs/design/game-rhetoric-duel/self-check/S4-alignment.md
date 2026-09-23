# game-rhetoric-duel｜S4 真渲染对齐单

- 对照：`gdd.md`、`content-v0.md`、`presentation-spec-v0.md`、`demo-reference-bible.md`、W4 施工单
- 真渲染：Edge，桌面 1440×1000；窄屏 390×844
- 自玩路径：石七胜利、罗掌柜回合耗尽失败、skip、reduced-motion、终局返回游戏库

| # | GDD / W4 可见承诺 | 结论 | 证据 / 说明 |
|---:|---|---|---|
| 1 | camera 阶段只保留场景，牌局 UI 与人物尚未出现 | ✅ | `shots/01-enter.png` |
| 2 | 意图在手牌发入前揭示，敌人、目标与预告压力可读 | ✅ | `shots/01b-intent-reveal.png` |
| 3 | ready 时敌人、目标、回合、意图、进度、压力、专注、牌库/弃牌与五张起手齐全 | ✅ | `shots/02-opening-hand-ready.png` |
| 4 | 卡牌显示费用、中文名称、闭集效果摘要、卡面文案与内部视觉槽 | ✅ | `shots/02-opening-hand-ready.png`；卡面 `faceArt` 为 W4 本地后备，正式图归 W5 |
| 5 | 出牌原位置收拢，单个只读投影飞向中央，不再次结算 | ✅ | `shots/03-card-flight.png`；同 cardId 的另一实例保持原位 |
| 6 | 进度、压力与专注反馈直接来自 `resourceDelta`，颜色语义可分 | ✅ | `shots/04-progress-impact.png`、`shots/05-enemy-impact.png`、`shots/06-focus-refresh.png` |
| 7 | 敌人意图、敌人冲击、压力变化、专注刷新和新牌发入为独立阶段 | ✅ | `shots/05-enemy-impact.png`、`shots/06-focus-refresh.png`、`shots/07-next-turn-draw.png` |
| 8 | 只对 `drawnCardIds` 的新增实例播放发牌，旧手牌不重发 | ✅ | `shots/07-next-turn-draw.png`；W4 单测以 before/after 多重集核新实例 |
| 9 | 最后资源冲击完成后再显示胜利或失败结果，失败原因可读 | ✅ | `shots/08-victory.png`、`shots/10-defeat-turns.png` |
| 10 | 终局唯一出口真点后回到游戏库，不重复提交结果 | ✅ | `shots/09-victory-exit.png`；`presentation-controller.test.ts` 覆盖结果幂等 |
| 11 | skip、失焦恢复和 reduced-motion 不改变权威 after 快照 | ✅ | `shots/11-reduced-motion.png`；`presentation-controller.test.ts` 深比较最终快照 |
| 12 | 图片/正式资产缺失时使用背景与人物几何后备，不进入永久 busy | ✅ | `shots/12-fallback-visual.png`；play-field 的 Sprite 槽与 Shape 后备同实体 |
| 13 | 中央背景、人物、飞牌、数值飘字属于 render-only play-field；HUD/按钮属于 LayoutNode | ✅ | `play-field.ts` 使用 `CanvasRenderer`；`ui.test.ts` 断言 UI 树不含战场人物节点 |
| 14 | 动画只表现已提交结果，不能驱动规则 | ✅ | 阶段来自 `committed-transition`；rAF 只调用 render-only controller `advance()`，session 在动作到达时已提交 |
| 15 | ready 是唯一可写阶段，双击、键鼠并发与终局输入均 fail-closed | ✅ | `presentation-controller.test.ts`；忙碌时 play/end-turn/exit 禁用，只保留 skip |
| 16 | 1–6 数字键、结束回合、skip、退出可操作且节点 id 唯一 | ✅ | `game-rhetoric-duel.ts` 键盘接线；LayoutNode 唯一 id 测试；完整浏览器自玩 |
| 17 | aria-live 仅播报出牌、资源、敌人行动和终局语义 | ⚠ **共享 UI 待接** | 语义文本已收敛到 `rhetoric-semantic-live`，但 LayoutNode 无公开 live-region 字段。owner 已选路线 A；去向：`requests.md#W4-UI-ARIA-001`，由 PUI 扩闭集字段并复查 |
| 18 | 390×844 窄屏保持可读并允许手牌横滚 | ⚠ **排入 W5/W6** | `shots/13-narrow-ready.png` 证明现有固定 16:9 舞台会整体缩放、功能未丢但文字偏小。owner 施工单裁决去向：`program-work-order-s4-s5.md` W5 §6.3 与 W6 §7.1 响应式/UI 审计，正式资产接入时一并修正；不得在 W4 用自由 CSS 逃生 |
| 19 | 10 张正式卡图、三名敌人立绘和三张背景全部可见 | ⚠ **按施工单留 W5** | W4 明令不提前导入正式图片；当前消费槽与后备已接。owner 施工单裁决去向：`program-work-order-s4-s5.md` W5 §6.1–§6.3，交 asset-manager 后以 S5 alignment 收口 |
| 20 | demo 卡框的来源行、条件行与快捷键角标逐项同构 | ⚠ **排入 W5 视觉精修** | W4 已有费用、名称、效果、文案和键盘功能，尚未补独立来源/条件/角标视觉行。报 owner 的裁决去向：`demo-reference-bible.md` ART-1/QA-1 与施工单 W5 §6.3；正式卡图到位后逐卡核 |

## 玩家视角复核八问

1. 核心信息最抢眼：左侧意图绶带与右侧论证进度形成第一阅读层，中央人物承接视线。
2. 操作确认：被选牌原位隐藏，飞牌进入中央；impact 后语义记录显示卡名与真实 delta。
3. 结果明示：金色论证/危险色压力飘字与资源条同步；胜负独立结果面板延后出现。
4. 数值差异：条长度、数值与飘字共同表达；强弱粒子精修留 W5，不影响 S4 因果可读性。
5. 阶段与剩余时间：右侧显示回合、总回合及当前演出 phase；牌库/弃牌在底栏常驻。
6. 初次玩家理解：卡面同时给费用、效果摘要和文案；按钮为中文。完整教学不在 v1 立项边界。
7. 功能可达：play/end-turn/skip/exit 均有真控件；1–6 键与同一 play action 汇合。
8. 归属与时效：左侧明确“下一意图”，右侧为对手/本局进度，底部是玩家压力/专注/手牌；阶段快照避免提前显示 after。

## 好玩三问

- 想再来一把吗：可以。可见意图与有限专注形成了清楚的短局决策，但正式卡图和敌人姿态会显著影响重复游玩欲，归 W5。
- 关键反馈是否一眼可见：可见。飞牌、资源飘字、敌人位移、条值与语义记录互相印证。
- 是否困惑或等待：普通模式的敌人回合按五段播放，最长约 2.25 秒且每段都有状态变化；可随时 skip。没有超过 1 秒的纯空等窗口。

## 迭代记录

- 第 1 轮：发现旧界面是上/中/下盒式布局、战场由 LayoutNode 绘制；判为未对齐并重构。
- 第 2 轮：改为 mountHost + CanvasRenderer play-field，HUD 改五区浮层；UI audit 发现 3 处装饰底板意图重叠。
- 第 3 轮：为底板声明 `allowOverlap`、重染高对比古铜墨主题、隐藏 camera 阶段 UI、修正同 cardId 多实例与新增牌判定；阻断偏差 0，剩 4 条均有明确后续去向。
