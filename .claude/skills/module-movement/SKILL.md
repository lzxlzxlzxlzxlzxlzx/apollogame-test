---
name: module-movement
description: ZeroCraft 运动与寻路模块线。做移动、跟随、转向、群集、网格/六边形寻路、A*、推挤避让之前调它。走 motion/tween/steering/grid-move/pathfind 基座件，不手写移动积分或寻路算法。
when_to_use: 任何「让东西动起来 / 让它自己找路过去」的需求之前。
---

# 运动与寻路（module-movement）

**权威手册**：`docs/playbooks/movement-pathfinding.md`。

## 基座件（实名）
`motion`（位移积分）· `tween`（缓动）· `steering`（转向/避让/群集）· `grid-move`（网格 + 六边形 A*）· `pathfind`。

## 本线红线
- **禁游戏层自写移动积分 / 自写 A***——表里有的必须用，手写同形 = `game-skill-audit` 红旗 `engineTwin`。
- 任何随机抖动（散射 / AI 抖动）走种子 PRNG（`/module-random`），**禁裸 `Math.random`**。
- **禁墙钟**：一切推进按 tick，不取 `Date.now()`。

## 调参陷阱（实测在案·别凭直觉调）
`timeHorizon` **非单调**——为中场调大会把终点段调塌。**改它必须中场 + 终点一起量。**
全表见 `docs/design/game211/crowd-pathfinding-research.md §10`。

## 查不到怎么办
现有件表达不了你的运动形态 → 走 **`/ask-owner`**（多半能用现有件重组，先实查）。

## 交付前
`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
