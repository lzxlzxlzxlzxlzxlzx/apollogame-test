---
name: module-fx
description: ZeroCraft 2D 渲染与特效模块线（play-field）。做战场/棋盘/角色贴图/血条/受击闪白/飘字/粒子这类「非 UI 的画面」之前调它。走 render 组件 + EffectKind 闭集，不走 LayoutNode（那是 /module-ui），也不手写 canvas 绘制。
when_to_use: 做 play-field 表现层——精灵、动画帧、血条、特效、屏震、飘字——之前。
---

# 2D 渲染与特效（module-fx）

**权威手册**：`docs/playbooks/rendering-fx.md`。

## 分工（最容易搞混的一件事）
- **UI / HUD / 菜单 / 面板** → `LayoutNode` 闭集 → **`/module-ui`**
- **play-field**（战场 / 棋盘 / 角色 / 场景物） → **render 组件** → 本线
两者都是数据，但词表不同。别拿 LayoutNode 画战场，也别拿 render 组件搭菜单。

## 基座件（实名·以 `capability-registry` 的 describe/examples 为准）
`Sprite`（贴图 key）· `Color` · `Frame`（动画帧）· `Gauge`（血条/进度）· **`EffectKind` 闭集**（特效种类）· 主题令牌。

## 本线红线
- **render-only**：表现层组件**不进 sim / 不进 hash**（须在 `src/net/determinism.ts` 的 `NON_DETERMINISTIC` 名单里）。
- **sim 只持 key**：贴图/动画在数据里只写**字符串 key**，真实字节在资产层（`/module-assets`）。**绝不塞 URL / 二进制**。
- **禁**手写 canvas 绘制 / 自由 DOM —— 表现走组件，渲染器负责画。
- 特效随机（散射/抖动）走种子 PRNG（`/module-random`），**禁裸 `Math.random`**。
- **反捷径**：别给素坯糊 Glow 冒充质感。视觉验收走 `docs/playbooks/visual-scorecard.md` 八维。

## 查不到怎么办
`EffectKind` 里没有你要的特效 → **绝不自己画**，走 **`/ask-owner`** 申请扩**一个**枚举。

## 交付前
`node scripts/game-skill-audit.mjs <slug>` 零红旗；宣称做完前跑 **`/align-check`**。
