# 《言弹交锋》基础内容 v0.1

## 参照边界

本表从 `fanren_qiyuan` demo 提炼了“目标 10、压力上限 10、四回合、可见施压意图、进攻/稳压/混合三类基础牌”的节奏骨架；卡牌名称、文案、敌人、视觉描述与目录 ID 均为本游戏原创。它不复制 demo 的卡表、角色或代码。

## 当前能力边界

以下每项效果都对应 `t2-identity-card-play` 当前的闭集格式：

```ts
{ kind: 'modify-resource', targetId: 'progress' | 'pressure' | 'focus', op: 'add', value: number }
```

因此 v0 不含条件、抽牌、保留、状态、随机、改写意图或外部物品消耗。要加入其中任一种，必须先扩充通用 capability，再调整内容表；不能让游戏层用特判实现。

## 资源与数值基线

| 资源 | 初始/上限 | 说明 |
| --- | --- | --- |
| `progress` | 0 / 胜利目标 | 达标立即胜利 |
| `pressure` | 0 / `pressureLimit` | 达到上限立即失败 |
| `focus` | 每回合按遭遇设为 3 | 仅用于本回合出牌费用；由回合流程重置 |

首发遭遇默认：胜利目标 10、压力上限 10、回合上限 4、起始手牌 5、每回合抽 3、手牌上限 6。它是 playtest 起点，不是平衡结论。

## 基础言弹目录

| cardId | 名称 / 功能定位 | 费用 | 最大副本 | 闭集效果 | 卡面文案 | 视觉槽描述 |
| --- | --- | ---: | ---: | --- | --- | --- |
| `probe-question` | 试探提问／低风险推进 | 1 | 3 | `progress +1` | “先让他把话说完整。” | 手执卷宗、烛光、侧脸思索 |
| `pin-down-detail` | 钉住细节／标准进攻 | 2 | 2 | `progress +3` | “那就请你把这一处说清。” | 指向账目、墨迹、锐利手势 |
| `steady-breath` | 稳住呼吸／强力稳压 | 1 | 2 | `pressure -2` | “别急，先把气息稳下来。” | 闭目吐息、衣袖、柔和光圈 |
| `catch-the-thread` | 接住话头／攻守兼备 | 1 | 2 | `progress +1`，`pressure -1` | “这句话，恰好说明了问题。” | 两段丝线相接、言辞流线 |
| `press-the-point` | 连环诘问／高费用爆发 | 3 | 1 | `progress +4` | “一个问题答完，再答下一个。” | 连续问号、前倾身影、强对比 |
| `reframe-the-case` | 换位陈述／稳定中速 | 2 | 2 | `progress +2`，`pressure -1` | “若换作是你，也会这样选吗？” | 两面镜框、翻转卷轴、平衡构图 |
| `state-the-line` | 直陈底线／以压换进度 | 2 | 1 | `progress +3`，`pressure +1` | “此事没有退让的余地。” | 挺直站姿、界线、朱色印记 |
| `hold-the-answer` | 暂缓回应／零费止损 | 0 | 2 | `pressure -1` | “不必急着接下这句话。” | 收拢的折扇、留白、静止尘埃 |
| `gather-your-thoughts` | 整理思路／回收专注 | 0 | 1 | `focus +1` | “把散乱的念头排成一线。” | 散页归拢、光点、案头俯视 |
| `close-the-argument` | 收束论点／终结推进 | 2 | 1 | `progress +3` | “所有证词，都指向同一个答案。” | 合拢卷宗、印章、中心光束 |

### 起始牌组：`starter-calm-reason`

共 15 张；它保证玩家在首局就能体验“推进、降压、两难换血、集中爆发”。

```yaml
deck:
  - { cardId: probe-question, copies: 2 }
  - { cardId: pin-down-detail, copies: 2 }
  - { cardId: steady-breath, copies: 2 }
  - { cardId: catch-the-thread, copies: 2 }
  - { cardId: press-the-point, copies: 1 }
  - { cardId: reframe-the-case, copies: 2 }
  - { cardId: state-the-line, copies: 1 }
  - { cardId: hold-the-answer, copies: 1 }
  - { cardId: gather-your-thoughts, copies: 1 }
  - { cardId: close-the-argument, copies: 1 }
```

`hold-the-answer` 的目录上限为 2，但起始只给 1 张；第二张可留给后续宿主牌组配置。每张牌的最终 `maxCopies` 由游戏目录验证，宿主只能引用，不能提高。

## 首发敌人与遭遇脚本

v0 敌人只提供按回合顺序结算的压力意图；它们不是 AI。每条意图都以与卡牌相同的 `modify-resource` 资源效果表达，宿主可根据 `encounterId` 传入相应脚本。

### 1. `gatekeeper-shi`｜石七，旧巷守门人

| 项 | 内容 |
| --- | --- |
| 遭遇目标 | 让石七打开被私占的巷门 |
| 配置 | `target: 10`、`pressureLimit: 10`、`turnLimit: 4`、`focusPerTurn: 3` |
| 对手立绘槽 | 靛青短褂、鬓角斑白、横木门前、三分之二侧脸 |
| 背景槽 | 雨后旧巷、木门、石板反光、低饱和暮色 |

| 回合 | 意图 | 对玩家影响 | 预告文案 |
| ---: | --- | --- | --- |
| 1 | `cold-question` 冷声质问 | `pressure +1` | “你凭什么要我开门？” |
| 2 | `raise-the-bar` 抬高门槛 | `pressure +2` | “规矩不是为你一个人改的。” |
| 3 | `public-ridicule` 当众讥讽 | `pressure +2` | “说得好听，旁人可未必信。” |
| 4 | `final-refusal` 最后拒绝 | `pressure +3` | “再纠缠，我便叫人送客。” |

### 2. `merchant-luo`｜罗掌柜，精于算计的商人

| 项 | 内容 |
| --- | --- |
| 遭遇目标 | 说服罗掌柜兑现先前的口头约定 |
| 配置 | `target: 11`、`pressureLimit: 9`、`turnLimit: 4`、`focusPerTurn: 3` |
| 对手立绘槽 | 褐金长袍、铁算盘、含笑而警惕、半身正面 |
| 背景槽 | 药铺柜台、暖灯、账簿与木格、细尘浮光 |

| 回合 | 意图 | 对玩家影响 | 预告文案 |
| ---: | --- | --- | --- |
| 1 | `count-the-cost` 盘算得失 | `pressure +1` | “这笔账，究竟谁来承担？” |
| 2 | `test-the-price` 抬价试探 | `pressure +2` | “你想要的，总得拿出相称的东西。” |
| 3 | `seize-a-flaw` 揪住细节 | `pressure +2` | “这一句前后不一，你如何解释？” |
| 4 | `close-the-ledger` 合账送客 | `pressure +2` | “账已算完，今日便到这里。” |

### 3. `instructor-jiang`｜姜教习，严厉的见证人

| 项 | 内容 |
| --- | --- |
| 遭遇目标 | 让姜教习承认你提出的处置方案可行 |
| 配置 | `target: 12`、`pressureLimit: 10`、`turnLimit: 4`、`focusPerTurn: 4` |
| 对手立绘槽 | 深绿教习服、束发、目光冷静、端坐正面 |
| 背景槽 | 讲堂木梁、兵器架、晨雾斜光、肃静空席 |

| 回合 | 意图 | 对玩家影响 | 预告文案 |
| ---: | --- | --- | --- |
| 1 | `formal-challenge` 先礼后问 | `pressure +1` | “先说说，你的依据从何而来。” |
| 2 | `rapid-cross-exam` 连番追问 | `pressure +2` | “这一点尚未回答。下一点呢？” |
| 3 | `attack-the-weakness` 攻其短处 | `pressure +3` | “你的方案，最经不起推敲的正是这里。” |
| 4 | `final-judgment` 当场裁断 | `pressure +2` | “给你最后一次机会，说服我。” |

## 实机平衡待验证项

1. 以 `starter-calm-reason` 在固定种子各跑三名敌人，目标是首名敌人稳定可胜、后二名需有选择张力但不靠极端抽牌。
2. 验证 `gather-your-thoughts` 的额外专注不会在单回合使所有手牌无代价打空；若过强，先调为费用 1/回复 2 或移出起始牌组，不能临时写特殊规则。
3. `pressure` 的资源最小值应为 0，避免降压卡将压力减为负数而改变平衡语义。
4. 只有实机测试发现“条件牌/意图反制/抽牌”确属核心乐趣时，才新开 capability 需求；本表不预埋未被解释的文案效果。
