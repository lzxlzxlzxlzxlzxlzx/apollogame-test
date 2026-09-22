---
name: module-ai
description: ZeroCraft 对手 / 敌人 / NPC AI 模块线。做电脑对手、怪物行为、NPC 决策、难度阶梯之前调它。owner 硬规矩——有 AI 的游戏必须有「AI 设定」在档，不许做完了敌人没脑子。走 behavior-tree / flow 相位门 / State 心态机 / 种子骰 / NpcAgentPort。
when_to_use: 游戏里任何「电脑替谁做决定」的东西开工之前，以及 S4 复查前核对 AI 设定是否在档。
---

# 对手 / 敌人 AI（module-ai）

**权威手册**：`docs/playbooks/opponent-ai.md`。正样例：game108 大师 v5 · game-a 行为树。

## ⚖ owner 规矩（2026-08-10·S4 复查清单点名查）
**有对手/敌人/NPC 决策的游戏必须有 AI 设定**——初版可以基本（性格一句话 + 决策口径 + 难度阶怎么爬），
但**随迭代同步更新，不许没有**。放哪：
- `capability-plan.md` **§4.65** 写摘要
- 详设落 `docs/design/<slug>/`（GDD「对手 AI」章或独立档）

> owner 原话：「做完以后敌人没有 AI 算什么」。

## 基座件（实名·按决策者形态选）
| 决策者 | 用这个 |
|---|---|
| 规则树 / 行为分支 | `behavior-tree` |
| 按相位开合的决策窗 | `event-when` + `flow` 相位门 |
| 心态 / 状态机 | `State` |
| 概率决策 | `Effect.chance{num,den}`（`chancePass` fail-closed） |
| 拉仇恨 | `aggro` |
| **外部 LLM / 远端服务当决策者** | `services/npc-agent` 的 `NpcAgentPort` |

**`NpcAgentPort` 契约**：`decide(AgentContext) → Promise<Intent[]>`；**端口不写世界**。
无网 CI / 断网降级用 `NullNpcAgentPort`（确定性桩·规则表驱动）；接真后端换 `HttpNpcAgentPort`
（失败恒落 `[]` + `lastError`，**绝不抛**）。

## 本线红线
- 游戏层**禁裸 `Math.random`**——一切 AI 概率走种子 PRNG（`/module-random`）。裸随机 = 不可回放。
- BT 树内随机经**传入的 seed**，不自己取。
- **行为测不到就测结构**：双闸并存时行为测试只咬得住后一道闸，前一道零覆盖 = 裸防御。
  断言「决策规则必须含某旗 / 不许含某段 / 窗口态禁 `after`」，**三种拉宽方式各自撤修即红**
  （先例 `games/game108/game108.test.ts:878`）。

## 查不到怎么办
你的 AI 形态重组不出来 → 走 **`/ask-owner`**，摆 A（下沉通用 AI 能力）/ B（游戏层例外·记债）。

## 交付前
AI 行为**必须有点名测试**（S4 复查清单硬项）；`node scripts/game-skill-audit.mjs <slug>` 零红旗；
宣称做完前跑 **`/align-check`**。
