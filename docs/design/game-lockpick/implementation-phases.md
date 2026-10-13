# `game-lockpick` 分阶段施工

## 阶段总览

| 阶段 | 目标 | 出口 |
|---|---|---|
| S1 立项 | 固化玩法、边界、SDK I/O | 本目录策划文档一致 |
| S2 能力规划 | 实查现有能力并完成 A/B 裁决 | owner 明确选择 A 或 B；gap 有去向 |
| S3 规则切片 | 完成确定性会话与无头测试 | 规则验收 A/B/C 全绿；无 UI 依赖 |
| S4 可玩骨架 | LayoutNode 可完整游玩 | 三难度、键鼠触控、放弃确认、终局跑通 |
| S5 美术音频 | 接机关盘、滑钮、灯光与音效 | 资产台账闭合；美术 / 音频不驱动规则 |
| S6 演出与适配 | 完成开锁 / 放弃时序与响应式 | 1440×900、810×506、reduced-motion 验收 |
| S7 SDK 与打包 | 接 Doki SDK、manifest、调用说明、资产闭包 | 独立 dist 可部署；严格 I/O 测试通过 |
| S8 出货复查 | 全门禁、真渲染、自玩、撤修验红、独立 review | align-check 退出 0；scoped gate 全绿 |

## 阶段锁

- 当前已完成 S1 文档；S2 发现 `GAP-LOCKPICK-01`，等待 owner A/B 裁决。
- 未裁决前，程序 Agent 可复核文档与注册表，但不得进入 S3 写玩法 system。
- A 路碰 engine / skills / assembly，归主程施工且必须独立复查。
- UI 基座缺口归 PUI；不得用自由 DOM/CSS 绕过。
- 资产导入登记归 asset-manager；游戏侧只接已有 key。
- 不得在 S4 提前生成最终美术；先用合法占位 skinKey 验证布局，S5 再接正式资产。

