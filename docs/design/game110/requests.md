# game110《关键时刻》· 游戏级工单池

> 游戏级工单随游戏走，不占引擎 10 硬槽（CLAUDE.md 需求池条）。引擎缺口另走 `capability-gaps.json` + 主池。

## 领工声明 · REQ-110-S1S2（S1 立项卡 + S2 能力总览起草）

- **施工主体**：PE-110 session（owner 2026-09-12 指派本 session 兼 GD 起草设计文档）
- **启动词**：owner「我要开个新的游戏，你的角色是这个 110 游戏的程序员」+ DokiWorld 概念图一张
- **代码基线**：`claude/mainbranch` @ `efb8a5a8`
- **碰过的文件（边界栏·复查人按此跑 `git diff --stat` 对照）**：
  - `docs/design/game110/brief.md`（新建）
  - `docs/design/game110/capability-plan.md`（新建）
  - `docs/design/game110/capability-gaps.json`（新建）
  - `docs/design/game110/requests.md`（新建·本文件）
  - **零代码改动**（plan 未过审不写游戏层代码——CLAUDE.md 游戏能力总览铁律）
- **状态**：⬜ 待 owner/Lead 审（S1 人门签 + S2 评审）

## 待 owner 裁决

| 单号 | 事项 | 状态 |
|---|---|---|
| **GAP-110-01** | 局中牌池可变性：A 补引擎算子 / B 用现有算子语义降格。摆盘见 `capability-plan.md §4.8`，台账见 `capability-gaps.json` | ⬜ 待 owner 判 A/B |
| **REQ-110-Q1** | `capability-plan.md §4.65`：场景人物要不要「有脾气会还手」的决策型 AI？要 = plan 回炉补 `behavior-tree`/`caster` 消费面 | ⬜ 待 owner 答 |

## 待 Lead 评审

| 单号 | 事项 | 状态 |
|---|---|---|
| REQ-110-S2 | `capability-plan.md` 整体过审（§4 游戏层代码例外逐条裁） | ⬜ 待 Lead |

## 已完成

（暂无）
