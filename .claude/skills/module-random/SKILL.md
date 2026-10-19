---
name: module-random
description: ZeroCraft 随机与确定性模块线（全员必读·最短一本）。任何掷骰、洗牌、暴击判定、随机生成、AI 抖动之前调它。铁律：游戏层一切随机走引擎种子 PRNG，裸 Math.random 是硬红线，出货不豁免。
when_to_use: 写下任何一个「随机」字之前。也用于排查「同 seed 跑出不同结果」。
---

# 随机与确定性（module-random）

**权威手册**：`docs/playbooks/randomness.md`（全员必读·最短的一本）。

## ⛔ 铁律
**游戏层一切随机走引擎种子 PRNG，绝不裸 `Math.random`。**
裸随机破坏 **lockstep / 录放 / ZeroCraftBench 双跑同 hash**——它不是风格问题，是让联机和回放直接失效。

## 基座件（实名）
`RandomSeed`（种子组件）· `nextRandom`（取数）· `seededShuffle`（洗牌）· `chancePass`（概率门）·
`Effect.chance{num,den}`。原子层 `src/skills/atoms/random/index.ts`。

## 本线红线
- **禁裸 `Math.random`**——`node scripts/game-skill-audit.mjs <game>` 红旗，**出货不豁免**。一切随机从 `RandomSeed` 派生。
- 概率 / 掷骰系统对**无 seed** 一律 **fail-closed**（静默不触发），**绝不退回非确定路径**。
- **禁墙钟**（`Date.now()` / `performance.now()`）进 sim——时间也是不确定源。
- 排序同分必须有**全序兜底**（按 id），不许「看谁先来」——那会让同一世界两次跑出不同结果。

## 查不到怎么办
需要新的随机分布 / 取数器而现有函数表达不了 → 走 **`/ask-owner`**（按核心规则评审：**多半能用现有函数重组**）。
**绝不为省事绕开 `RandomSeed` 自造随机。**

## 交付前
「同 seed 同结果」**必须有断言**（S4 复查清单硬项）；`game-skill-audit` 零红旗。
