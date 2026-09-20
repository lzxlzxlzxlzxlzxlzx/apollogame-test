# R3 REQ-MCFIGHT-008 / 009 独立复查

日期：2026-09-15。复查者：独立能力边界 agent（未施工本次公共扩展）。范围仅限 EntityCheck 最大资源门、Flow 吞噬捕获、合格直接来源与周期伤害回执；不签整个 R3。

## 最新结论：PASS（限 REQ-008/009 本次有界扩展）

23:01 修复后独立复跑及撤修完成。下述首次退回保留为历史定位证据；待销毁来源的攻击区域问题已修复并通过独立复核。整个 R3 仍需主程汇总各机制族、身份场景与统一交付，不由本报告代签。

## 首次结论：退回一项清理边界（已修复）

原有 11 项测试独立复跑通过；5 组隔离撤修均被真实断言检出。但是新增真实接触探针发现：Flow 已成功吞噬并提交目标销毁后，目标已经生成但尚未结算的攻击区域仍造成 7 点伤害。REQ-008 暂不能验收通过。REQ-009 在本次有界场景中未发现失败；不代表所有召唤、转换身份场景通过。

隔离副本：`C:/Users/24652/Desktop/projects/apollpgame/mcfight-r3-public-008009-independent-20260915`。源码、游戏内容和测试复制到该目录，仅 node_modules 使用共享依赖 junction；所有撤修均在隔离源码执行，未撤销共享施工目录中的修复。

## 独立执行

工作目录为上述隔离副本：

```text
node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-devour.test.ts games/game-mcfight/r3-source-routing.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

22:53 执行：2 文件，吞噬 8 项、来源 3 项，共 11 通过，退出码 0。完整输出 `evidence/baseline.log`，未出现调度环、worker 或其他警告。未在本次复查中执行完整类型检查、构建或全项目回归；由主程最终交付证据覆盖。

## 新增失败及有效对照

隔离文件 `games/game-mcfight/review-008009-extra.test.ts`，输出 `evidence/additional-probe.log`。

- 初始布置真实独眼巨人、敌方目标及其攻击区域，区域带 PrefabOrigin 来源与 `sourceCheck.aliveResource`；实际 Flow、Overlap、Trigger、Hitbox、damage-route 推进一次，无 Trigger 注入。
- 目标最大生命 20：吞噬成功，目标本拍消失，但巨人 HP 从 150 降至 143；应为 150。失败为 HP 严格断言，退出码 1。
- 相同区域、目标最大生命 51：不被吞噬，区域正常造成 7 真伤；150→143，对照通过。
- 合计 2 项，1 失败、1 通过。不是因场景不能攻击产生的假阴性。

原因：`flow` 先写 `DestroyRequest`，但 `hitbox` 的来源检查只通过 `checkEntity` 检查仍存在的 HP；`checkEntity` 明确不包含待销毁状态。晚段 Caster 已有待销毁来源拦截，保护的是新区域生成，不能替代已生成区域接触时的来源拦截。

建议：在公共 Hitbox 按正式清理合同拒绝待销毁来源的未发生接触，并准确声明新增读依赖；保留最大生命 51 的正常攻击对照。修复后复跑此探针和原 11 项，再审调度图及相关伤害回归，不通过推迟断言掩盖额外伤害。

## 撤修验红

脚本 `review-mutations.mjs`；逐组日志在 `evidence/mutation-*.log`，汇总 `evidence/mutation-results.json`。每个修改锚点恰好命中 1 次；每次只撤一项，执行后 finally 恢复原始字节并核对 SHA-256。

| 组 | 撤修内容 | 结果 |
|---|---|---|
| max-field | 最大生命读取退回当前生命 | 退出 1，AssertionError |
| capture-delete | 不提交实际目标销毁请求 | 退出 1，AssertionError |
| capture-race | 删除待销毁来源/目标争抢闸门 | 退出 1，AssertionError |
| qualified-retention | 转换退回最后普通伤害来源 | 退出 1，AssertionError |
| periodic-routing | 周期效果绕过正式伤害路由 | 退出 1，AssertionError |

五组恢复后 SHA 均与原始值相同。验红不由编译错误、导入失败或 worker 异常产生。

## 已确认与未覆盖

已确认：最大生命检查默认仍使用 current、显式 max 可拒绝当前低血但最大生命超阈值者；单目标吞噬争抢只首个花 CD；三轮 CD 和恢复；吞噬无治疗；新 Caster 释放被销毁拦截；合格直接来源不被普通/间接来源覆盖，来源死亡后阵营快照保留；周期真实伤害绕护甲、扣血回执钳制；周期实际治疗与过量治疗回执。

未覆盖：整批 R3、84 身份、所有状态刷新组合、独立大范围回归、浏览器及性能。不得将本记录视为 owner 签核。

## 修复后独立复核

仅从共享施工目录同步修正的 `src/skills/tier2/hitbox.ts` 和新增固定回归 `games/game-mcfight/r3-devour-pending-hit.test.ts`。原独立探针保留，不改变失败 HP 断言。

- 修复读取本拍 Hitbox 执行前已存在的 DestroyRequest 集合，在两处 sourceCheck 路径拒绝待销毁来源；区域进入取消清理集。未配置 sourceCheck 的历史区域语义保持不变。
- `DestroyRequest` 读取申报保留。显式 Hitbox 在 Mortal 前，准确表达“读取此前 Flow 意图，而非等待稍后的本拍致死判定”。不是删除真实依赖，也没有将伤害后的死亡阶段提前。
- 修复后 15 项（原 11＋固定 2＋独立 2）通过，退出 0，日志 `evidence/repaired.log`。吞噬场景 HP 保持 150，非吞噬对照 HP 为 143，区域清理断言通过。
- 撤修仅移除两处 `doomed.has(source)` 检查，锚点总数严格为 2，其余读写声明及排序不变。固定与独立探针各自重现原始 HP 失败；共 2 失败、2 正常对照通过，退出 1。日志 `evidence/mutation-pending-source.log`；恢复字节 SHA 校验通过，详见 `evidence/mutation-pending-source.json`。
- 撤修恢复后的最终复跑：`r3-devour` 8、`r3-source-routing` 3、固定清理 2、独立清理 2、公共 Hitbox 24，共 **5 文件 39 项通过，退出 0**。`evidence/final-restored.log`，未出现调度环或 worker 警告。

组合审计脚本 `review-audit.ts` 使用真实 `s4Capabilities + overTimeCapability` 装配，审计无 SCC、无重复系统，实际系统执行顺序断言通过，退出 0。完整图及可选引用清单保留在 `evidence/repaired-audit.log`。关键实际链路为：

```text
Flow → motion → overlap → trigger → Hitbox → over-time → damage-route
→ resource-apply → death-conversion → Mortal → hierarchy-cascade
→ destroy-apply → targeted-caster → targeted-prefab-spawn
```

修复版 Hitbox SHA-256：`99a32f22f6c6e4cca581ac36d9b60b2aafcc7f8d47d4a0137951879345a81281`。

## 全库声明收尾增量复核（23:08）

主程全库回归暴露声明配套守卫后，本复查额外同步四份文件：`flow.ts`、`component-universe.gen.ts`、`component-manifest-baseline.json`、`declaration-audit.test.ts`。

- 生成组件宇宙和 manifest 基线均已收录 QualifiedDamage。
- Flow 的 DestroyRequest 读写申报保留；新增明确 `runsBefore: merge-rule`。静态核对 merge-rule 为 Update 阶段读取真实 Transform 的合成系统，其位置应晚于 motion。Flow 不应为了读取本拍稍后合成销毁而反过来等待 merge-rule。
- 全库 SCC 棘轮保留原节点集合；新增 viaComponents 中的 DestroyRequest 并附注释。真实 MC Fight 组合无环断言仍严格存在，未改为空白/忽略警告。
- 隔离复跑原 13 项与 declaration-audit 7 项，共 **4 文件 20 项通过，退出 0**，见 `evidence/declaration-final-complete.log`。第一次因隔离副本没有既有 game108 依赖而收集失败，记录 `evidence/declaration-final.log`；补复制原 game108 后复跑，上述通过数不包含该收集失败。
- 额外实际安装 `s4Capabilities + overTimeCapability + mergeRuleCapability`，审计无 SCC、无重复系统，排序断言通过，退出 0，见 `evidence/merge-combination-audit.log`。关键顺序为 **Flow → motion-apply → merge-rule → Hitbox → over-time → damage-route → resource-apply → Mortal → destroy-apply → targeted-caster**。

本次收尾未发现对已复核 008/009 行为的回归，有界 PASS 结论保持。完整全库测试结果仍由主程最终运行记录提供，不在本次 20 项独立复跑中冒称覆盖。
