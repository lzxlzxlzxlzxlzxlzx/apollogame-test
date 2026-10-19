---
name: module-cards
description: ZeroCraft 卡牌模块线。做牌堆、抽牌弃牌、出牌、牌型判定、计分、小丑/遗物类效果之前调它。牌型和计分全部走能力，游戏层不写计分循环。
when_to_use: 任何有牌的游戏——扑克、麻将、构筑、集换——开工之前。
---

# 卡牌（module-cards）

**权威手册**：`docs/playbooks/cards.md`。正样例：game-e 计分核。

## 基座件（实名）
`card-pile`（牌堆/手牌/弃牌）· `card-play`（出牌）· `poker-hand`（牌型判定·含 wild）· `card-scoring`（计分）。

## 本线红线
- **牌型 / 计分 / 发牌全用能力，游戏层不写计分循环。**
- **虚胖数据禁**：小丑 / 遗物效果**必须由 `card-scoring` 真消费**，不能只是文案摆设。
  填了效果文案却没人解释 = S2 门打回。
- 发牌 / 洗牌种子化（`/module-random` 的 `seededShuffle`），**禁裸 `Math.random`**。

## 查不到怎么办
你的牌型 / 计分规则重组不出来 → 走 **`/ask-owner`**（先对 `capability-registry` 实查，留下「查了什么、为什么不成」的原文）。

## 交付前
同 seed 同牌序要有断言；`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
