# R3-B2 生产接线与收口施工单 v1.0

日期：2026-09-17。本文是 `VolleyPlan` 运行时完成后的唯一收口任务。程序不得把“协议能编译”作为 B2 完成；只有正式目录、真实链路、八单位身份场景和冻结复查包均完成，才可提交。

## A. 编译器与生产链接线

在 `games/game-mcfight/content/r3-catalog.ts` 和 `games/game-mcfight/s4-world.ts` 中扩展**通用模板数据**，不能在 ECS 运行时按单位 ID 分支。

- 将批次临时 `B2_SKILL_CONFIG` 拆出 B2 与 B3，删除 `B3_PRELOAD_PROFILE = B2_SKILL_CONFIG` 的同对象别名。
- 模板数据须能表达 `shape: 'cone'`、`coneRadius`、`coneAngleRadians`、`pulseCount`、`pulseIntervalTicks`、`lockAimOnStart`、`volleyCount`、`volleyIntervalTicks`、`volleySpread`、`armorPiercing`。
- Caster 成功启动烈焰人或铜羽泽鹗模板时创建 `VolleyPlan`；它是一次施法的唯一计划实体，不能由两个候选技能或循环复用一个弹实体代替。
- 烈焰人：3 枚，间隔 2 Tick，启动时锁定方向，种子散布 ±0.175 rad；每枚发射点读取该枚发射 Tick 的来源 Transform。
- 铜羽泽鹗：2 枚，同 Tick、同向、各自独立 `castId/shotIndex`，使用 armor-piercing 伤害。
- 喷火甲虫、寒冬狼：真实 `Shape.kind:'cone'`，字段为 `radius`，完整夹角 60°，半径 64/24；共 4 脉冲、每 10 Tick 一段、方向只在启动时锁定。前者 onHitStatus=burn，后者=slow。
- 三个状态投射物、凋零骷髅维持标准 SK05/SK01 公共链，不能因新接线退化。

## B. 必须新增的真实身份场景

每个场景只可读取真实世界状态、实际 Transform、SpawnRequest/Prefab、Overlap/Trigger/Hitbox、Resource 与销毁记录；禁止手改 HP、手写命中回执或放宽次数。

1. 烈焰人：三枚各自具有不同 shotIndex；Tick 间隔为 2；实际飞行；每枚最多一次命中并清理；来源死亡/硬控后剩余弹不发射；三轮可复现。
2. 铜羽泽鹗：同一 castId 的双弹同 Tick 生成、独立实体与命中记录；均为 armor-piercing；任一弹清理不影响另一弹。
3. 喷火甲虫：cone 内、边界、角度外、半径外；转向目标后已开始引导仍按锁定方向；四段每目标每段至多一次；burn 刷新且不叠层。
4. 寒冬狼：同上 cone 验收；slow 刷新、不叠层；失效目标不再取得后续脉冲。
5. 流浪者、鸡蛇、观测者：标准投射物真实命中后分别 slow/wither/burn；未命中不挂状态；同状态刷新、不同 DOT 共存、免疫目标有明确记录。
6. 凋零骷髅：近战真实命中后 wither；重复命中只刷新；对空/地面资格遵从既有目标规则。

## C. 通过门槛与交付

仅在全部身份场景通过后：

1. 更新 B2 八单位矩阵为 `passed-program`，总数由 28/84 升至 36/84。
2. 执行完整受影响回归、类型检查、构建和全部 R3 组合审计。
3. 输出每条命令、退出码、测试数和失败清单（若无写 `0`）。
4. 冻结复查副本，新增 B2 程序证据，并按独立复查清单准备六组撤修检验。
5. 任何一项不通过都不得更新 36/84，也不得提交“B2 通过”。

## D. 字段命名与静默丢失防线（必须先执行）

`volleyIntervalTicks` 是编译后模板与 `VolleyPlan.intervalTicks` 的唯一正式字段名。内容层可保留以秒为单位的 `volleyInterval`，但编译器必须显式调用 `secondsToTicks` 转换；不得让同名数值跨层隐式解释为 Tick。`pulseIntervalTicks` 同理。

为防止“配置已写但没有进入真实战斗”，在完成 Caster 接线前新增一条目录到运行时的结构性测试，逐项断言：

- 烈焰人的已编译模板具有 `volleyCount=3`、`volleyIntervalTicks=2`、种子散布和投射物模板引用；
- 铜羽泽鹗具有 `volleyCount=2`、`volleyIntervalTicks=0`、armor-piercing；
- 喷火甲虫、寒冬狼的已编译模板具有 `shape='cone'`、`coneRadius=64/24`、`coneAngleRadians=Math.PI/3`、`pulseCount=4`、`pulseIntervalTicks=10` 与 `lockAimOnStart=true`；
- `s4-world` 将上述字段原样传入 Caster/Flow/Hitbox 所需组件；任何未知字段、未消费字段或缺失转换均令测试失败。

本节通过只证明模板装配，不替代第 B 节的真实身份场景。
