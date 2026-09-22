---
name: module-combat
description: ZeroCraft 战斗模块线。做伤害判定、命中盒、生死、属性与加成、持续效果（中毒/灼烧/buff）、仇恨、掷骰对抗之前调它。加成聚合必须走 modifier-stack/stats，禁游戏层各写一套 add/max 循环。
when_to_use: 做任何战斗规则——打到没打到、掉多少血、buff 怎么叠、谁打谁——之前。
---

# 战斗（module-combat）

**权威手册**：`docs/playbooks/combat.md`。正样例：game-g 战斗核。

## 基座件（实名）
`hitbox`（命中）· `mortal`（生死）· `t2-stats`（实体属性）· `t2-over-time`（持续效果）· `aggro`（仇恨）·
`dice` 族 + `opposedRoll`（掷骰对抗）· `t2-modifier-stack`（加成聚合）。

## 本线红线
- **禁游戏层自写聚合器**（各写一套 add/max/or 循环）：逐字段单策略走 `t2-modifier-stack`，实体属性走 `t2-stats`。
  **应用序固定** `add → mul → max → min → or → floor`（乘性非交换 → 靠 order/id 定序，**禁墙钟 / 禁 `Math.random`**）。
- 掷骰 / 概率一律种子化（`/module-random`），**禁裸 `Math.random`**。
- **数据表必须有现成能力消费**——填了 buff 文案却没有解释器 = **虚胖数据，比没有更糟**。S2 门点名查这条。

## 查不到怎么办
你的战斗规则重组不出来 → 走 **`/ask-owner`**：摆 A（下沉成通用战斗能力）/ B（申请游戏层例外·记债），附代价，等裁。

## 交付前
`node scripts/game-skill-audit.mjs <slug>` 零红旗；失败路径要有测试（非法输入被拒 / 终局判定不误报）；
同 seed 同结果要有断言。宣称做完前跑 **`/align-check`**。
