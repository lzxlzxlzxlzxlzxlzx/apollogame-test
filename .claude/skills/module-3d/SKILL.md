---
name: module-3d
description: ZeroCraft 3D 盒庭线（**P3D 专属域·游戏开发主 agent 只读不写**）。需要 3D 场景、模型、光照、后期、3D 特效时调它——先确认这是不是你能碰的：src/renderer/three-* 与 games/game-z/** 归 P3D，别的 session 勿擅改，缺件走需求池报 P3D。
when_to_use: 游戏要用 3D 之前。主要作用是告诉你边界在哪、怎么正确提需求，而不是让你动手改渲染器。
---

# 3D 盒庭线（module-3d·**P3D 域**）

**权威手册**：`docs/playbooks/3d.md`。边界定义：`docs/workflow/finish/P3D-game-z-handoff.md §0.1` 三档表。

## ⛔ 先看边界（这是本 skill 最重要的一段）
`src/renderer/three-*` + 3D render-only 组件 + `games/game-z/**` = **P3D 专属域**。
**你（game-dev）在这片是只读的。** 缺件 / 要改渲染器 → `docs/workflow/requests-3d.md`（3D 独立需求池）报 P3D，
**绝不自己改**。擅改专职域 = 结构性事故。

活样例：`games/game-i/three3d.ts`（**逐特性隔离展台**·想学「怎么单独驱动 X」看这里最清）+ `games/game-z/**`（综合场景）。

## 组件（实名·你在蓝图里消费它们是合法的）
`Mesh3D` · `Transform3D` · `Camera3D` · `Light3D` · `Post3D` · `Vfx3D` · `Model3D` · `Material3D`。

## 铁律（每步校）
- **render-only**：所有 3D 组件是表现层——**绝不进 sim / hash、绝不被 `Condition` 读**
  （须入 `determinism.ts` 的 `NON_DETERMINISTIC`·可用随机 / 时间 / 三角）。
- **sim 只持 key**：模型 / 贴图 / 材质在蓝图里**只写字符串 key**（可哈希回滚），**绝不塞 URL / 二进制**。
- **UI 不在这**：3D 场里的 HUD / 菜单 / 面板走 **LayoutNode** → `/module-ui`。**禁**手写 React / DOM。
- **反捷径工艺律**（owner 2026-07-06 批）：**先造型 → 再材质 → 再光照 → 最后特效**。
  **禁**给素坯糊 `Glow3D`/bloom 冒充质感；**主角面禁纯程序化图元充数**（真做不到 → 资产台账记 blocker）。
  视觉验收走 `docs/playbooks/visual-scorecard.md` 八维（0–3 分·premium = 全维 ≥2）。

## 查不到怎么办
走 **`/ask-owner`** → 立单进 `docs/workflow/requests-3d.md` 报 **P3D**。别在游戏层绕。
