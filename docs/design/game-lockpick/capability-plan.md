# `game-lockpick` capability plan

> 当前结论：策划与合同可以立项；核心规则存在一个真实通用能力缺口。按缺口裁决协议，在 owner 选择 A/B 前不得写玩法 system。

## 1. 现有能力实查

| 需求 | 已查 registry / 手册 / 源码 | 结论 |
|---|---|---|
| 确定性目标生成 | `w1-random`、`RandomSeed`、`nextRandom`；`docs/playbooks/randomness.md` | 可复用，不得裸随机 |
| 状态与终局 | `j1-state`、`t3-flow`、`t2-event-when`、`t2-effect-apply` | 可承载相位与具名事件 |
| 输入桥 | `t2-keybind` 可透传 `Signal.arg` | 可承载 `slot:value` 闭集参数 |
| 三档滑钮 UI | `LayoutNode Slider`，支持 `min/max/step/value/action`；渲染为 range input | 机制可表达 `0/1/2`；首版可用，外观不得自由 DOM 逃生 |
| 拖放 | `t2-drag-place`、`t2-grid-drag-square` | 都是棋盘 / 网格落点语义，不适合机关离散滑钮 |
| 动画 | `t1-tween`、`t3-timeline`、LayoutNode `fx` | 可复用，表现不得驱动规则 |
| 音效 | `SynthAudioPort`、`SfxSpec` | 可复用，由 Signal 触发 |
| 资产 | AssetManifest、`loadGameArtOverrides`、资产闭包流程 | 可复用，所有资产必须包内闭包 |

同时检索 `combination`、`lockpick`、`mastermind`、`matchCount` 与现有 tier2/tier3：未发现能够“生成隐藏 N 位 M 进制组合 → 接收单槽修改 → 计算 exact-match → 输出整体反馈与终局”的通用 capability。

## 2. 为什么不能只靠现有能力重组

`t2-event-when + t2-effect-apply` 能响应已知条件，却不能以数据声明：

1. 从 `RandomSeed` 生成长度随难度变化的隐藏三进制向量；
2. 对任意槽位接收闭集值并更新；
3. 比较两个向量并计算 exact-match 数量；
4. 保证目标不等于初始向量；
5. 在终局后原子拒绝输入并输出一次结果。

枚举 3⁵ 个答案与所有转移会制造 243 组特判数据；在游戏层写循环则是“数据表 + 游戏层解释器”，违反数据驱动宣言。因此这是能力缺口，不是假缺口。

## 3. A/B 裁决（等待 owner）

### A. 补通用引擎能力（推荐）

新增候选能力 `t3-discrete-combination-session`：

- 通用场景：机关锁、密码盘、符文校准、电路调谐、Mastermind 类谜题。
- 数据配置：`slotCount`、`valueCount`、`initialValue`、具名输入 / 反馈 / 成功 / 放弃 Signal。
- 模拟状态：`status`、`target[]`、`current[]`、`matchCount`。
- 输入：`set(slot,value)` 与 `giveUp`；值域和槽位严格校验。
- 生成：只消费世界 `RandomSeed`；目标与初始向量相同则确定性重抽。
- 输出：整体 match tier、成功、主动放弃；不向 UI 投影 `target[]`。
- 确定性：同 config + seed + 输入流逐字段一致；支持快照 / 恢复。
- trace：记录 `decision` 生成摘要、`transition` 相位、非法 / 终局输入 `reject`、每次位置提交 `commit`；不开 trace 零开销，每 tick ≤3 条。

代价：需要主程负责 engine 面、注册 capability、协议组件、定序、测试、手册与独立 review；工期较长但形成可复用积木。

选错代价：若以后出现第二个组合谜题而本次没下沉，将重复造解释器并产生规则漂移。

### B. 游戏独有逻辑

在 `game-lockpick` 卡带内写专属 session，直接完成生成、比较与终局。

代价：首版更快，但形成游戏层解释器与明确架构债；必须获得 owner 游戏层例外、写入债务与边界测试，未来出现第二个同类玩法时仍需迁移到引擎能力。

选错代价：短期节省时间，长期重复实现、审计与复用成本更高。

### Lead 推荐

推荐 **A**。这不是一次性剧情逻辑，而是清晰、确定、可审计的通用“离散组合会话”能力。Lead 不代 owner 裁决。

## 4. 计划消费清单（A 路）

- `w1-random`：隐藏目标生成。
- `j1-state` / `t3-flow`：ready / playing / success / failure。
- `t3-discrete-combination-session`：待裁决的新通用规则能力。
- `t2-keybind`：键鼠 / UI action 到具名 Signal。
- `t1-tween` / `t3-timeline`：吸附、灯光、解锁演出。
- LayoutNode `Screen/Panel/Stack/Row/Slider/Button/Modal/Image/Particles`。
- `SynthAudioPort` + `SfxSpec`。
- AssetManifest + art override / closure。
- DokiWorld SDK `dokiworld.app/2`。

## 5. 游戏层允许内容

仅允许：版本化难度数据、LayoutNode 视图投影、主题与资产 key、SDK 严格适配、表现控制器。不得在游戏层再次实现目标生成、向量比较、计数或终局状态机（除非 owner 明确选择 B）。

