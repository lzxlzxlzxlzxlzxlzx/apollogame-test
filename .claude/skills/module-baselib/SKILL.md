---
name: module-baselib
description: ZeroCraft 底层功能库与共享件模块线。写任何「感觉很基础」的工具函数之前先查它——数学、按 id 取/排序、事件总线、事件日志、本地存储、排行榜、随机派生、牌码。表里有的必须用，手写同形会被 game-skill-audit 判红旗 engineTwin。
when_to_use: 你正要写一个小工具函数 / 小工具类的时候。这是「先查后写」的第一站。
---

# 底层功能库与共享件（module-baselib）

**权威手册**：`docs/playbooks/base-lib.md`。

## 定位（owner 2026-09-08）
> 「event-log、local-store、事件总线我都需要，以后做的时候让他们用这个来消费。」

**做任何游戏、写任何 tier 能力之前先查这张表**——**表里有的必须用**。

## 货架（实名）
`@engine/math`（数学）· `byId` / `sortedIds`（按 id 取与全序）· 事件总线 · `event-log`（事件日志）·
`persist` / `localStore`（局外小态）· `insertRanked`（排行榜）· `@atom-skills/random`（随机派生）· 牌码 · 数据糖。

## 本线红线
- **手写同形 = `game-skill-audit` 红旗 `engineTwin`**，基线**只降不升**。
  当场计红的有：`localStorage.` · `GameLog` · `recordScore` · `Math.imul`。
- 裸 `Math.random` = 红线 → 走 `/module-random`。
- 共享件是**引擎已下沉的东西，游戏侧必须消费**，不是「可以参考的实现」。

## 怎么用这条线
你正要写一个小函数之前，先问一句：**「这东西是不是已经有了？」**
`base-lib.md` 那张表 + `node scripts/dump-capability-catalog.mjs` 实查一遍，**查到就用**。

## 查不到怎么办
确实没有 → 走 **`/ask-owner`**：这多半是一个**该下沉进引擎**的共享件（A 路），不是该在你游戏里写一份的私货（B 路）。

## 交付前
`node scripts/game-skill-audit.mjs <slug>` 零红旗（`engineTwin` 计数不许涨）。
