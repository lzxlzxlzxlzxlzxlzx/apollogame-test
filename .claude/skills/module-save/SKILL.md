---
name: module-save
description: ZeroCraft 存档与平台模块线。做进度保存、偏好设置、本地排行榜、云存档、成就、离线单文件打包之前调它。局外小态走 localStore + codec 闭集，绝不自己碰 localStorage。
when_to_use: 做「关了游戏再打开还在」的任何东西，或接平台成就 / 云存档之前。
---

# 存档与平台（module-save）

**权威手册**：`docs/playbooks/save-platform.md`。

## 分三层（最容易混的一件事）
| 你要存什么 | 用这个 |
|---|---|
| **局外小态**（偏好 / 进度 / 静音位 / 本地榜） | `localStore` + codec 闭集（`src/services/persist/`） |
| **快照存档**（世界态 / 迁移链） | `storage` 能力（**别拿 localStore 替代**） |
| 云存档 / 成就 / 富状态 | `platform-hooks`（发布接线 = **game-publisher agent**） |

**`localStore(key, fallback, codec?)`** 的 codec 四款：`jsonCodec`（blob + 形状校验）·
`textCodec`（原文枚举）· `intCodec`（整数 + 钳）· `flagCodec`（`'1'`/`'0'` 位·与既有静音键字节兼容）。
本地榜名次用 `insertRanked`（插入 + 排序 + 截断 + 1 基名次）。

## 本线红线
- **绝不自己碰 `localStorage`**——手写同形 = `game-skill-audit` 红旗 `engineTwin`。
- 坏档回缺省、无存储 / 隐私模式**静默降级、绝不抛**。
- **`savedAt` 时间戳由宿主注入**（app 层 `Date.now`），**绝不由 sim 取墙钟**（确定性红线）。

## 查不到怎么办
codec 闭集表达不了你的数据形状 → 走 **`/ask-owner`** 申请扩一款 codec，别塞自由序列化。

## 交付前
坏档 / 无存储两条路径要有测试；`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
