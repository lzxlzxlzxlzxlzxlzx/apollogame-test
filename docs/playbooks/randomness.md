# 随机与确定性手册

> 全员必读（最短一本）。铁律：**游戏层一切随机走引擎种子 PRNG，绝不裸 `Math.random`**——它破坏 lockstep / 录放 / ZeroCraftBench 双跑同 hash。
> 机读真相：`RandomSeed` 组件（`src/assembly/component-map.ts`）+ 取数函数（`src/skills/atoms/random/index.ts`）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 世界持有随机序列 | `w1-random`（组件 `RandomSeed`） | world 放一个 `RandomSeed` 单例实体；同 seed → 同序列，存初始 seed 即可复现整局 |
| 取一个 [0,1) 随机数 | `nextRandom(seed)` | 系统里调它并推进序列（掉落判定 `nextRandom(seed) < dropRate`） |
| 取整数区间 | `randomInt(seed,min,max)` | 散射角度 / 选下标 |
| 概率门（num/den） | `chancePass(seed,num,den)` | 概率触发，fail-closed（无 seed/den≤0 不中） |
| 确定性洗牌 | `seededShuffle(items,seed)` | 发牌 / 打乱池；纯函数不改输入 |
| 脱离运行态的 PRNG | `mulberry32(seed)` | 装配期一次性取数（与 nextRandom 同算法） |
| 掷声明骰池 | `t2-dice-roll`（组件 `DicePool`/`RolledDice`） | 消费世界 `RandomSeed` 确定性掷骰，见 combat.md |
| 信号触发·按权重表随机选模板生成（可选先扣资源） | `t2-weighted-spawn`（组件 `WeightedSpawn`） | 挂"生成器"实体：收 onSignal 时（可选）原子扣自身 Resource、消费世界 `RandomSeed` 按 `table` 权重抽 templateId → 发 `SpawnRequest`（Commit 相位，runsAfter craft-recipe/effect-apply 破 RMW 伪环）；加权抽算法核见共享纯函数 `weightedPick`（weighted-pick.ts，draft-offer 同款） |
| 渐进风险会话的循环概率抽取 | `t3-progressive-risk-session` | 固定 tick 窗口命中才消费 `RandomSeed`；错按/timeout 与无 seed 均不推进序列，后者 fail-closed 不发奖 |
| 风险翻格会话的隐藏槽位布局 | `t3-risk-reveal-wheel` | `start` 时用世界 `RandomSeed` 做一次 Fisher–Yates，布局随快照保存；翻格本身不再消费随机，无 seed 则 aborted |

## ② 样例指针

- registry：`w1-random` 的 `describe.examples`（掉落 / 弹幕散射 / 重放存 seed）。
- 真实用法：`games/game-g/clash-resolve.ts`（种子化对掷）、`games/game-g/coin-flip.ts`（种子硬币）。
- 算法/断言：`src/skills/atoms/random/random.test.ts`、`seeded-shuffle.test.ts`。

## ③ 本线红线

- **禁裸 `Math.random`**（`node scripts/game-skill-audit.mjs <game>` 红旗，出货不豁免）——一切随机从 `RandomSeed` 派生。
- 概率/掷骰系统对无 seed 一律 **fail-closed**（静默不触发），绝不退回非确定路径。
- 不在渲染/表现层擅自引入随机抖动进 sim（进 hash 就破回放）。

## ④ 正样例 / 反面教材

- ✅ `src/skills/tier2/dice-roll.ts`：消费世界单例 `RandomSeed` 掷骰，`runsBefore` 打破 RMW 伪环。
- ✅ `games/game-g/clash-resolve.ts`：对掷全程种子化。
- ✖ 手写 `Math.random()` 做掉落/洗牌/掷骰（game-d 旧手写 sim 曾踩，已推倒）。

## ⑤ 查不到怎么办

需要新的随机分布 / 取数器而现有函数表达不了 → 去 `docs/workflow/requests.md` 提缺口（按核心规则评审：多半能用现有函数重组）。**绝不为省事绕开 `RandomSeed` 自造随机。**
