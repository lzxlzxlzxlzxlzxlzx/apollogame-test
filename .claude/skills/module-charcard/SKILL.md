---
name: module-charcard
description: ZeroCraft 平台角色卡桥模块线。把外部平台的角色卡数据接成游戏里的席位（掼蛋 / 雀宴 / 德州这类多人桌游）之前调它。纯确定性桥，零网络零时钟零随机；卡文本是外部不可信输入。
when_to_use: 游戏要吃外部角色卡 / 头像 / 玩家资料并落成席位之前。
---

# 平台角色卡桥（module-charcard）

**权威手册**：`docs/playbooks/character-card.md`。桥本体 = 引擎 `services/character-card`。

## 基座件（实名）
`normalizeCharacterCard`（归一）· `toSeatCard`（落席位）· `isCardUsable`（可用性）· 媒体取优 · 成年硬闸 · passthrough 对账。

## 本线红线
- **纯确定性**：零网络 / 零时钟 / 零随机，**同输入深等输出**。
- 媒体 / DataUrl **不入美术台账、不入 sim hash**。
- **卡文本 = 外部不可信输入**：展示层自行**长度截断 / 转义**，别直接信。
- 仅有 `OssKey` 时需 `opts.resolveOssKey(key) => url`；**无解析器 / 解析空 / 解析器抛错 → 该源弃 + warn**
  （field = 真实键名如 `avatarOssKey`），**绝不炸**。
- **成年硬闸**：三游戏（掼蛋夜宴 / 雀宴 / 德州·姨太题材）接卡时**必须 `requireAdult: true`**，不得省。

## 查不到怎么办
缺字段 / 缺取优规则 → 提 `docs/workflow/requests.md`（REQ-CHARCARD 域）等 Lead 裁，
**绝不在游戏层手写解释器**。走 **`/ask-owner`** 立单。

## 交付前
「解析器抛错 → 弃 + warn 不炸」要有测试；`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
