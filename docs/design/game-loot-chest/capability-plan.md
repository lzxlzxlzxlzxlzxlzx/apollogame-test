# game-loot-chest｜固定三段锁芯 QTE 能力总览

## 1. 游戏一句话

宿主给出确定性掉落树；玩家用一次固定规则的三段时机判定解开宝箱，随后查看并领取宿主可复算的奖励。

## 2. 消费的引擎能力

| capability | 用途 | 状态 |
|---|---|---|
| `e1-timer` | 固定 tick 的锁芯扫描周期与开箱等待 | ✅ 现有 |
| `f1-resource` | 已解锁数、连续失误数、尝试序号 | ✅ 现有 |
| `j1-state` | `ready → playing → opening → revealed` | ✅ 现有 |
| `t2-keybind` | 点击、触屏、空格统一为具名动作；ConditionExpr 判命中/失误 | ✅ 现有 |
| `t2-event-when` | 三锁完成、开箱等待完成的阈值事件 | ✅ 现有 |
| `t2-effect-apply` | 信号修改资源/状态并重置计时器 | ✅ 现有 |

结论：固定 QTE 可由现有能力重组表达，不新增 capability，不写宝箱专属 system。

## 3. 摆成数据的规则面

| 数据 | 内容 | 解释器 |
|---|---|---|
| `QTE_TIMING` | 100 tick 周期、48–62 普通窗口、38–72 辅助窗口、3 次失误触发辅助 | `e1-timer` + `ConditionExpr` |
| QTE 蓝图实体 | 输入门、命中/失误效果、完成和揭示阈值 | `keybind/event-when/effect-apply` |
| LayoutNode 投影 | 宝箱、判定环、指针、三枚锁印、奖励卡 | `mountUI` |

掉落树与 QTE 完全正交：QTE 不改变 seed、权重、数量或奖励集合。

## 4. 游戏层代码例外

无玩法例外。`session.ts` 仅承担引擎固定步输入与只读快照投影；`main.ts` 仅承担 DokiWorld SDK 生命周期和领取上报。

## 4.5 美术接入

- 继续消费包内 `treasure-chest.png` 与 `treasure-chest-open.png`。
- 锁环、指针、锁印和反馈使用 LayoutNode 闭集形态与主题特效，不新增图片资产。
- 奖励物品仍使用宿主 HTTPS 展示图，失败时使用本地符号回退；图片不进入规则状态。

## 4.6 UI 呈现

- house 主题：`apolloOnyx` 的透明页面变体。
- 成熟件：`Image`、`ProgressBar.shape:ring`、`Panel.shape`、`Particles`、`fx:glow/flash/shake`、`press3d`。
- UI 只声明 action 字符串；QTE action 经 `ActionSink → InputQueue → t2-keybind` 写入世界。

## 4.65 AI

无对手或 NPC 决策，不适用。

## 4.7 代码准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 三段锁芯、判定窗口、辅助窗口、完成门 | L1 | 纯蓝图数据 + 现有 capability |
| QTE 图形和反馈 | L1 | LayoutNode + 既有闭集特效 |
| 掉落结算 | L1 | 既有确定性掉落树解析器 |
| SDK 生命周期 | 平台适配层 | 不解释玩法，只校验输入与 complete 输出 |

## 5. 确定性声明

- QTE 按 60 tick/s 固定步运行；命中只读取 `Timer.elapsed`，不读取 `Date.now()`。
- 掉落继续只使用宿主 seed 和引擎 `mulberry32`。
- QTE 成败不参与掉落结算，因此不会改变既有输入输出合同或宿主发奖权威边界。

## 6. 评审记录

- 日期：2026-09-28
- Lead 裁决：✅ 通过；现有能力可重组，无需 owner A/B 缺口裁决。
