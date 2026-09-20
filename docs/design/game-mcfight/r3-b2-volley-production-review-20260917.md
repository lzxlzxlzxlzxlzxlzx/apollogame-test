# R3-B2 齐射生产接线复核（2026-09-17）

范围：`src/skills/tier3/caster.ts`、`src/skills/tier3/volley-emitter.ts`、`games/game-mcfight/s4-world.ts`。本文件是静态复核结论，不替代测试。

## 结论

Caster 已能创建 `VolleyPlan`，但现有实现仍不满足烈焰人三连和铜羽泽鹗同 Tick 双羽的正式合同。以下事项必须在进入 B 身份场景前修正。

## P1：interval=0 当前不会同 Tick 发两枚

`volley-emitter` 每 Tick 只执行一次发射逻辑；即使 `intervalTicks=0`，它也在本次循环结束才等待下一 Tick。因此铜羽泽鹗会变成相邻 Tick 两枚，而非同 Tick 双羽。

**修正：**在一次系统执行内循环发射所有 `nextEmitTick <= now` 的子弹；`intervalTicks=0` 时同一 Tick 发尽所有余弹。每枚保持独立 SpawnRequest、shotIndex 和清理链，并设定循环上限为 `count-nextShotIndex`，防止无限循环。

## P2：目标快照错误地读取 live Relation

Caster 已有 `targetFlow`，但创建计划时 `targetId` 读取来源实体当前 `Relation`。该 Relation 可在施法后重选，违反“成功启动时捕获目标”的合同。

**修正：**从 `targetFlow` 的 `GameFlow.targetSnapshot` 读取目标 ID 与 aim 快照；创建计划后不再读取 live Relation。若该快照不存在则拒绝创建计划并留下可断言的失败记录。

## P3：散布未按模板区分，且没有对局种子

当前 `s4-world` 对所有 Volley 统一写 `±0.175`；铜羽泽鹗应为同向双羽（散布为 none）。`Caster` 也没有向 Plan 写 `seed`，导致烈焰人散布与对局种子无关。

**修正：**模板增加 `volleySpread`；烈焰人使用 `{ kind:'seeded-uniform', halfAngleRadians:0.175 }`，铜羽泽鹗使用 `{ kind:'none' }`。Caster 从确定性对局种子和 cast 序号派生 `seed` 后写入 Plan；同 seed/相同事件序列轨迹一致，不同 seed 可产生不同合法散布。

## P4：发射有效性还缺目标失效取消

当前 emitter 只检查来源死亡、硬控、显式取消。按策划合同，捕获目标在后续子弹发射前死亡、销毁或失去敌对资格时，尚未发射的余弹必须取消；已发射弹继续按方向快照飞行。

**修正：**emitter 在每次新发射前校验 `targetId` 的生命与目标资格；失败时清理 Plan，不回滚已生成的弹。

## 进入 B 的前置测试

新增或扩展真实生产链测试，至少覆盖：

- 铜羽泽鹗在同一 Tick 产生相同 castId、shotIndex 0/1 的两枚独立弹；
- 烈焰人 shotIndex 0/1/2 的发射 Tick 间隔为 2；
- 风向改变或 Relation 重选后，后续弹仍使用启动时目标/方向快照；
- 第二枚前目标死亡，余弹不生成；第二枚前来源硬控或死亡，余弹不生成；
- 相同 seed 三轮轨迹一致，铜羽泽鹗两枚方向相同。
