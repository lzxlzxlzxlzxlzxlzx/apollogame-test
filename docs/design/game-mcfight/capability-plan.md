# MC Fight S2 能力计划

> 当前收尾（2026-09-15）：[程序收尾结论](s2-program-closeout-20260915.md)。225项回归、类型/构建全绿；C1/C3—C6及播放器接口独立复查通过，六组撤修验红；REQ-001～003已按原合同closed。真实14段动作素材仍未验收，S2人审不代签。以下旧待办/失败状态保留为历史。
> 2026-09-15 收尾更新：原mortal死亡当拍掉落合同已恢复，225项相关回归通过、类型/构建通过；REQ-001～003按独立历史合同核对已closed。旧195通过/1失败记录为修复前历史。详见 [死亡掉落合同](s2-mortal-closeout.md)、[可选排序核对](s2-optional-order-audit.md)、[性能风险](s2-performance-risk.md)。本批独立复查结论另行落账；真实14段动作素材未验收。
## 2026-09-15 当前交付

详见 [连续批次总交接](s2-batch-delivery-20260915.md)。V01/V03/V04保留已独立通过范围；V02原逻辑与UI通过，C1/动作扩展部分通过；V05补齐C1自证待复核；V06补3/6围攻与双向边角；V07补三段移动进出、半倍率友伤及中断；V08三次确定性和20/50/100各1000Tick测量完成，但100单位明显非线性，不判性能达标。C6新增弹丸、持续光束、固定落点、召唤，以及用户新选A后的共享伤害池/转换七项自证，独立复核仍待办。真实14片段未交付，S2不签核。

## 2026-09-14 历史快照（以下旧计数/未测描述不代表当前状态）

更新：2026-09-14。程序维护；不是独立复查结论或阶段签核。

## 当前批次与实现边界

本批仅推进 V02 与模板参数复用。`games/game-mcfight/s2-multiskill.fixture.ts` 使用同一数据模板装配近战和远程技能，通过独立 Timer、Flow 和共享动作 State 竞争执行；第二单位复用近战模板。没有新增单位专属系统。

实验参数：近战 CD 8、距离 3、伤害 7；远程 CD 19、距离 30、伤害 11；第二单位近战距离 5、伤害 13。距离与时间均为实验单位。两技能同时可用时近战优先；近战冷却且动作空闲时允许远程。这是样例选择策略，待策划确认，不是正式数值或优先级规则。

远程采用定点生成攻击区域，尚未证明弹丸飞行。攻击者静止；未证明移动宿主的技能挂点跟随。素材仍为几何占位，不能认定动作绑定通过。

## V01—V08 对照

| 项目 | 状态 | 已有证据 | 明确剩余项 |
|---|---|---|---|
| V01 双实例隔离 | 通过（已测机制范围） | s2-round2.test.ts 三轮；s2-dive.test.ts 双实例；独立 contact 复核 | 新动作素材下重复验证；不据此签 S2 |
| V02 多技能选择 | 部分覆盖 | s2-multiskill.test.ts 7 项；80 拍逐拍记录；共享动作锁、独立 CD、距离与资格选择 | 逻辑与默认 UI 已独立复查通过；真实动作绑定、取消集成及移动宿主挂点未测 |
| V03 目标承诺 | 通过（已测契约） | review-probes.test.ts、rereview-boundaries.test.ts；R1 独立复核 | 新技能类型分别定义承诺策略 |
| V04 真实俯冲 B | 通过（B 对照表范围，独立验收） | s2-dive.test.ts、s2-visual.fixture.test.ts、独立 contact 复核 | 独立画面补验已通过，见 s2-b-acceptance-evidence.md；真实动作绑定另验 |
| V05 取消与清理 | 部分覆盖 | 生命周期、review-death、R3 硬控复核 | 新双技能样例的取消集成未测；请求级完整复查结论 |
| V06 接敌与避让 | 部分覆盖 | s2-v06.test.ts 7项：接近/重叠/宽墙、残距/限速、边角/断路；审计无环 | 最新steering修复与新增画面待最终独立复核；不可达策略仅物理挡停 |
| V07 多段与效果 | 部分覆盖 | 范围双目标各一次及区域销毁；s2-v07.test.ts 三段/间隔/来源/友伤开关 | 新三段样例待独立复核，其他持续效果未覆盖 |
| V08 确定性与规模 | 部分覆盖 | s2-v08.test.ts 相同seed/输入60拍快照及16/64/128单位测量 | 新证据待复核；不含渲染/跨平台；性能阈值待定 |

测试路径均在 `games/game-mcfight/`，review-death 在 `src/skills/tier3/`。历史反例不计作功能通过。独立复核来源：`../mcfight-review-20260914-contact/independent-contact-review.md`（相对项目根的同级目录）；其 R1—R3 结论不自动覆盖本批 V02。V02 已有独立报告：项目同级 mcfight-v02-review-20260914/independent-v02-review.md，仅通过逻辑与默认 UI。

## 能力组合与验证命令

本批复用：t3-flow、t3-aggro、t3-caster、t3-prefab、e1-timer、t2-event-when、t2-effect-apply、t1-motion-apply、d1-overlap-detect、t2-trigger-zone、t2-hitbox、f1-resource、t2-mortal、k2-destroy。14 能力、19 系统组合审计通过。

在项目根执行：

```powershell
node node_modules/vitest/vitest.mjs run games/game-mcfight src/skills/tier3/flow.test.ts src/skills/tier3/aggro.test.ts src/skills/tier3/targeted-caster.test.ts src/skills/tier3/prefab.test.ts --silent
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite-node/vite-node.mjs scripts/system-graph-audit.mjs t3-flow t3-aggro t3-caster t3-prefab e1-timer t2-event-when t2-effect-apply t1-motion-apply d1-overlap-detect t2-trigger-zone t2-hitbox f1-resource t2-mortal k2-destroy
```

本批实际结果：11 文件 96 项通过；类型检查退出码 0；审计退出码 0。新增 V02 为其中 7 项，不与总数重复相加。逐拍日志见 [V02 日志](evidence/v02-multiskill-20260914.log)。可视化入口新增“V02 双技能与参数复用”，复用同一工厂；独立复查已保存 7 张截图（同级 mcfight-v02-review-20260914），默认近距场景画面通过；远距/飞行分支仅自动测试覆盖。

## 最小素材适配交付条件

现有素材目录有单位姿态和特效图集，库存不等于动作绑定已验收。本批未生成或批量导入素材。

1. 两套可区分挥砍动作：配置到上述共享近战模板，逐帧对照前摇、生效、后摇，保留 7/13 伤害和不同逻辑范围的 HP 证据。
2. 一个俯冲动作：下降与开窗、回升完成与关窗同边界；验证朝向、脚底/攻击挂点与实际 Shape 对齐。
3. 保存暂停、单步画面，叠加真实逻辑范围和 Tick。透明边缘及光晕不计命中范围。

程序负责绑定与测试；策划负责素材要求和可接受偏差。策划已确定卫道士斧劈、僵尸横扫、恼鬼俯冲及完整挂点/时间/范围合同，见 s2-action-binding-gaps.md 最新记录。绑定字段与缺失提示已落地；待制作14个动作片段及标注实际画布、挂点、帧序。不是等待策划重复定义要求。

## 后续代表性能力

光束、固定落点轰击、持续区域、召唤、特殊关系均未验证，分别建立最小样例后再判断复用覆盖。特殊关系包括共享生命部位、骑乘、蛇身及尸巫归属，规则由策划明确。本批没有扩大这些范围。

## 请求与阶段门

REQ-001—003 保持 in-progress。R1—R3 可按独立报告记为缺陷修复复核通过；尚无三张请求逐项闭合的正式结论。请求关闭核对见 requests.md 最新记录。S1 人审未签；B 对照表范围已独立验收通过；V02 扩展逻辑与默认 UI 已独立复查通过，素材绑定仍未完成；S2 还缺上述素材、V06—V08 和复杂代表机制，不代签看板。





2026-09-15 最新交付与具体边界见 s2-action-v06-v08-delivery.md。原B独立通过保持。



## 2026-09-15 S4 当前消费范围（覆盖前文历史状态）

Owner 已确认 S2/S3 三门通过并授权 S4 施工；REQ-001～003 已按 requests.md 关闭。前文 S2 未施工描述为历史记录，不重置通过结论。

S4 唯一玩法基线：s4-playable-vertical-slice.md。消费 s4Capabilities 的23项能力、29个实际系统，再独立装配drag-place部署世界；联合审计为31系统。新增消费既有 damage-routing，所有六单位配置自身hp、倍率1的DamageReceiver，来源记录用于伤害摘要，不加入共享血池/转换玩法。

Owner 2026-09-15 选择 A 后，限定扩展：

- REQ-005：EntityCheck拍初圆邻域、闭区间minRange与局部资源阈值；Flow可选捕获归一方向。自疗不借用全局第一个hp。
- REQ-006：capsule实际宽相位和接触几何、Canvas/SVG同形状参数；Caster来源安全/释放原点/锁定身份/朝向/跟随独立配置，Hitbox可选单体身份及来源资格。
- 释放后物化放Materialize(12)，供下一拍接触；来源资格仍在Resolve死亡结算之后检查。无新增游戏system。

S4数据为六单位、九技能、固定敌军与完整经济部署结算循环。程序只在S3已获例外的会话中管理阶段/预算/轮次/结果；战斗与接触由正式公共能力解释。正式入口与preview均使用mountS4，历史S3测试保留专用s3-mount。

时序和统计边界见S4-alignment.md；最终测试/审计/浏览器/机器门和独立复查入口见s4-program-evidence.md。无S5精修、S6正式素材或额外特殊机制制作。
