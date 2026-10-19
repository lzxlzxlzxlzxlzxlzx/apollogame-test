---
name: module-art
description: ZeroCraft 美术管线模块线。给游戏配美术、换皮、接皮肤槽、清美术台账之前调它。硬律：视觉实体必须有皮肤槽（art: 或 skinKey），台账只列有消费槽的行，孤儿行禁止入册。
when_to_use: 给游戏配图 / 换皮 / 建美术台账 / 排查「换了图没反应」之前。
---

# 美术管线（module-art）

**权威手册**：`docs/playbooks/art-pipeline.md`（**做游戏必读**）。终态档 `art-ledger.json` = 唯一权威。

## 核心动作
生成游戏时，**视觉实体必带 `art:` 皮肤槽**，引用写成**详细图像小样**（主体 + 特征 + 颜色 + 视角·4–10 词·**禁裸名词**）。

## 本线红线
- **禁纯色块游戏**：主体视觉实体必须有皮肤槽（`art:` 或 `Sprite`+`skinKey`）。**没槽 = 不可换皮 = 生成线白搭。**
- **台本只列「有消费槽」的行**（owner 2026-07-22 铁律）：`art-ledger.json` 每行必须有真实消费槽。
  **孤儿行（无槽·生成了也不上画面）禁止列进台本**——换了白换 = 坑 owner。清台本二选一：**接槽 或 退役**。
- **游戏侧消费必须读台账 / skinMap，禁只读硬编码路径**（owner 2026-07-27「换了没反应」铁律）：
  先取 `skinMap['<skinKey>']`，硬编码路径只作回退。生成器 / 物品 / 立绘 / 背景走**同一条皮肤槽装载路径**。
- 程序化背景要能替换 → 用 `mountHost` 背景皮肤槽（有图用图 / 无则回退程序化·兜底不丢）。

## 机器守卫
```bash
npm run ledger:audit                       # = node scripts/ledger-audit.mjs [<game>|--all]
node scripts/ledger-audit.mjs <game> --strict   # 有孤儿即退 1
```
报 `ORPHAN-LEDGER-ROW`（无 `skinKey` 且无 manifest `art:`）。**完工判据 = 该游戏零孤儿**（样板 game-g 110/110）。

## 诊断「换了没反应」
**第一步永远是**：查该视觉是否 **skinMap 优先**（而不是读死路径）。反面教材 = game-101 订单卡立绘读死 `CUST_PORTRAITS`。

## 查不到怎么办
走 **`/ask-owner`**；资产本身的导入登记 = `asset-manager` agent。
