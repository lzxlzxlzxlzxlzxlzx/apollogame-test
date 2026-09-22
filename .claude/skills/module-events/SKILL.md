---
name: module-events
description: ZeroCraft 事件与逻辑链模块线。做触发器、条件判定、连锁反应、剧情时间线、演出编排、快进、按键绑定之前调它。核心是信号铁律——写世界只能发具名 Signal 入队，handler 里绝不塞自由逻辑。
when_to_use: 做「当 X 发生 → 就 Y」这类规则、剧情 cue、演出节奏、键位绑定之前。
---

# 事件与逻辑链（module-events）

**权威手册**：`docs/playbooks/events-logic.md`。

## ⚡ 信号铁律（这条线的全部要义）
**写世界 = 具名 `Signal` 经 enqueue 入队 → 由能力系统消费。**
**handler / 触发点里绝不塞自由逻辑。** UI 和交互只负责发信号，一切世界改动由 `effect` / `craft` / `flow`
这些能力在 sim 里做。破了这条，规则就从数据跑回代码里了。

## 基座件（实名）
`event-when`（触发）· `condition`（条件）· `effect-apply`（效果）· `flow`（相位/流程）· `timeline`（何时）· `tween`（怎么动）· `keybind`（键位）。

## 两条容易踩的
- **timeline 管「何时」、tween 管「怎么动」**：cue 只能做四件事——发 `Signal` / 写 `Flag` / 写 `Resource` / 发 `SpawnRequest`（四闭集）。表现层订阅信号，tween 演动画。**cue 里绝不塞自由演出逻辑。**
- **快进**：用 `skipOnSignal`——一 tick 内按序补发全部剩余 cue，**终态与逐 tick 播放完全一致**（回放安全）。**绝不走墙钟**，游标按 tick 推进。

## 本线红线
- handler 里绝不塞自由逻辑（见上）。
- 概率门用 `chancePass` 种子化（`/module-random`），**禁裸 `Math.random`**。
- 数据表必须有现成能力消费——**填了字段却没人解释 = 虚胖数据**，S2 门会打回。

## 查不到怎么办
你的触发/条件形态表达不了 → 走 **`/ask-owner`**。**绝不在游戏层写一个 system 来绕过**——这是本仓最严重的一类事故。

## 交付前
`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
