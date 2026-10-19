# 《言弹交锋》演出规格 v0.1

## 目标与原则

目标不是复制 `fanren_qiyuan` demo 的 React/CSS 实现，而是以 [demo 对齐圣经](demo-reference-bible.md) 为第一交付基准，复现其画面结构、卡牌样式、信息层级和演出节拍。每一次状态变化都必须有可读的因果、停顿与视觉重音，玩家应清楚看见“我出了一张什么牌 → 它造成了什么 → 敌人怎样回应 → 下一回合发生了什么”。在这一基准通过前，当前简化迁移界面不构成视觉设计依据。

**规则先提交，演出后播放。** 模拟先确定性地提交命令与终局；演出层只读取“提交前快照、提交后快照和变化摘要”，绝不以动画完成、墙钟、图片加载或网络结果驱动规则。这样暂停、跳过、掉帧、重放与减弱动态效果都不改变胜负。

## 演出层分工

| 层 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| 模拟 / flow / resource | 命令是否合法、费用、卡牌效果、敌人意图、胜负、随机 | 时间动画、DOM、图片加载 |
| 只读演出投影 | 由已提交的前/后快照排出播放阶段；忙碌时锁住重复输入 | 改写 `progress` / `pressure` / `focus`，再次抽牌或生成随机数 |
| LayoutNode UI | 手牌、资源 HUD、意图条、日志、操作按钮、终局面板 | 场景立绘和命中特效 |
| play-field 渲染 | 背景、敌人立绘、卡牌飞行残影、飘字、受击闪白、粒子 | 规则判定或 UI 菜单 |

UI 一律使用 LayoutNode。场景表现使用 `Sprite`、`VisualEffect`、`t1-tween`、`t3-timeline` 等既有能力；不手写 React/CSS/canvas 演出逻辑。真实图像仅按资产 key 或宿主授权的 render-only 引用加载，不进入模拟状态。

## 固定演出节拍

每个阶段都可由用户的“跳过演出”或减弱动态效果立即抵达终态；跳过只改变观看时长，绝不发额外命令。

| 场景 | 阶段序列 | 玩家应看见什么 | 规则锚点 |
| --- | --- | --- | --- |
| 进入遭遇 | `camera → reveal-intent → deal-opening-hand → ready` | 背景/敌人淡入、首条意图出现、起始手牌依次发到手边 | 已验证的开局快照 |
| 打出言弹 | `card-lift → card-flight → impact → opponent-response → ready` | 选中牌抬起并飞向交锋中心；进度/压力/专注显示增减与飘字；敌人立绘短暂反应 | 该次 `IdentityCardCommand` 已提交 |
| 敌人回合 | `round-end → enemy-intent → enemy-impact → focus-refresh → deal-new-cards → ready` | 上回合收束、敌人意图放大并播反应；压力变化；专注恢复；新增手牌依次发入 | 对手脚本该回合已结算、下一回合快照已提交 |
| 胜利 | `victory-impact → portrait-resolve → result-panel` | 最后一击的数值重音、敌人姿态缓和、胜利结算面板 | `progress >= target`，立即终局 |
| 失败 | `failure-impact → portrait-dominates → result-panel` | 压力越线或回合耗尽的重音、敌人压迫反馈、失败面板 | `pressure >= pressureLimit` 或回合耗尽 |

`ready` 是唯一允许新的出牌/结束回合/退出命令的阶段。所有其他阶段均应在 UI 层禁用可写操作，防止重复提交；这只是输入门控，不是游戏规则。

## 演出投影合同

演出层接收的最小只读数据必须足以说明变化，而不是从文字或 DOM 猜测：

```ts
type RhetoricPresentationTransition = {
  before: Readonly<DuelViewSnapshot>;
  after: Readonly<DuelViewSnapshot>;
  kind: 'enter' | 'card-played' | 'enemy-turn' | 'terminal';
  cardId?: string;
  drawnCardIds?: string[];
  resourceDelta?: Array<{ resourceId: 'progress' | 'pressure' | 'focus'; value: number }>;
  intentId?: string;
  outcome?: 'win' | 'loss';
};
```

这是**只读渲染投影**，可以由 SDK/session 适配器从同一条已提交的状态转换派生；它不是第二套规则状态，也不能作为存档、同步或胜负来源。若现有会话接口无法稳定获得这一转换，程序应先核查 `Signal + t3-timeline` 能否用数据重组；不能时按缺口流程申请一个通用“已提交状态转换观察”接口，不能在游戏层偷写结算器。

推荐的语义 cue 名称：`duel:enter`、`duel:intent-reveal`、`duel:deal`、`duel:card-committed`、`duel:impact`、`duel:enemy-act`、`duel:focus-refresh`、`duel:result`。`t3-timeline` 只排这些 cue 的确定性先后；`t1-tween` 和 `VisualEffect` 只决定其移动、淡入、闪白、抖动、浮动等表现。

## 视觉与音画资产槽

| 消费槽 | 内容 | 后备表现 |
| --- | --- | --- |
| `skin.background` | 宿主授权背景或游戏本地背景 | 主题化渐层与纹理 |
| `skin.opponent.portrait` | 宿主授权敌人立绘 | 剪影/徽记 + 名称 |
| `skin.card.<cardId>` | 游戏拥有的言弹卡图 | 该牌的图标和色彩令牌 |
| `fx.card-flight` | 卡牌飞行残影 | `pop + float` 视觉效果 |
| `fx.progress-impact` | 金色进度飘字/光束 | `flash + pop` |
| `fx.pressure-impact` | 压力飘字/敌人压迫反馈 | `shake + flash` |
| `fx.enemy-response` | 敌人呼吸、逼近、退让 | `t1-tween` 位移/透明度 + `VisualEffect` |

每一行必须在后续 `art-ledger` 有真实消费槽；导入真实卡图、立绘、背景由 asset-manager 负责登记，游戏侧只引用 key。宿主图片失败时必须走后备表现，不得阻塞对局。

## 动效质量与可访问性验收

1. 每一张牌从手牌到中心的飞行只对应一次已提交命令；不会二次扣费或重复结算。
2. 每一张新抽到的牌都从牌库方向依次入手，已有手牌不重复播放。
3. 敌人意图在伤害/压力变化前可见；敌人行动、压力变化、专注刷新和抽牌不能合并成一帧跳变。
4. 数字变化与飘字同源于 `resourceDelta`，不会出现动画显示 `+3` 而模拟实际改 `+2`。
5. 减弱动态效果、跳过、窗口失焦或低帧率后，画面直接对齐 `after` 快照；不会卡在禁用输入状态。
6. `aria-live` 仅播报“言弹已打出 / 对手行动 / 胜利或失败”等语义结果；不把每一个装饰动画播给读屏器。
7. 每一类演出在 UI 审计、验收剧本和真渲染截图序列中都有一条可验证证据。

## 分阶段交付

| 阶段 | 必须交付 | 不可跳过的验证 |
| --- | --- | --- |
| S3 骨架 | 可玩命令、只读快照、`ready` 输入锁 | 点一张牌只提交一次，状态真实改变 |
| S4 演出接线 | 五类节拍、HUD/场景分层、跳过/减弱动态效果 | 对同一命令录制阶段序列，最终快照一致 |
| S5 视觉精修 | 正式皮肤槽、卡图/立绘/背景、粒子与音画节奏 | 资产台账零孤儿、UI 审计、真渲染对齐 |
| 交付 | 完整遭遇自玩、截图序列、演出/规则对齐单 | `align-check` 归零 |
