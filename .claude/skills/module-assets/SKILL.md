---
name: module-assets
description: ZeroCraft 资产接入模块线（游戏侧消费半边）。给游戏接贴图、模型、精灵表、音频文件之前调它——怎么按 key 取资产、AssetManifest 怎么写、art: 引用怎么解析。真正的资产导入登记归 asset-manager agent，本 skill 管游戏怎么消费。
when_to_use: 游戏里要用一张图 / 一个模型 / 一个音频文件之前。想新增资产到库里 → 那是 asset-manager agent。
---

# 资产接入（module-assets·游戏侧消费）

**权威手册**：`docs/playbooks/assets.md`。**资产的增 / 改 / 导入 / 登记 = `asset-manager` agent 的域**，本 skill 只管你怎么消费。

## 三层（记牢，别越层）
1. **raw 存储索引** `assets/index.json` = 所有类型的**单一真相**（asset-manager 维护）。
2. **运行时桥** `registerAssetIndex` → `AssetManager`，渲染器按 **key** 取句柄。
3. **消费端（你在这层）**：sim / 蓝图 / 组件**只持 key**。

## 本线红线
- **sim 只持 key**，**绝不塞 URL / 二进制 / DataUrl**。真实字节在资产层。
- 资产是 **render-only 表现层**：**不进 lockstep hash**（render 组件须在 `src/net/determinism.ts` 的 `NON_DETERMINISTIC`）。
- **禁只读硬编码路径**（owner 2026-07-27「换了没反应」铁律）：视觉加载**先取 `skinMap['<skinKey>']`**
  （= 台账当前图，含创作台替换图），**硬编码路径只作回退**。破了这条，美术换了图画面不变。
- 密钥走 env、**绝不入库**。
- **无自动入库**（宪法）：AI 生成物落**待审区**，人审 approve 才登记 index。

## 查不到怎么办
要新增资产 / 改 `spec` 闭集 → **不是你的活**，交给 `asset-manager` agent；`spec` schema 改动要 Lead review。
消费侧表达不了 → 走 **`/ask-owner`**。

## 交付前
无孤儿 key；`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
