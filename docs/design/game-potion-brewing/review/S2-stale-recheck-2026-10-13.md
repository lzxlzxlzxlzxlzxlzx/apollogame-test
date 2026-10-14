# S2 能力计划/缺口新鲜度独立复查（2026-10-13）

- 复查人：Codex `/root/g5_review`，非 S2/G1–G5 施工者。
- 复查对象：`capability-plan.md`、`capability-gaps.json`、G1–G5 工单/独立复查与当前流程 S2 清单；不重签 S2 Owner 人门，也不替代 S3/S4 阶段复查。
- 判词：**PASS（S2 能力计划/缺口状态）**。GD 第 05 验收剧本稳定后，最终复核 `gameHash=2b771b62aca79e68` 与 S2 gate 所记指纹相同、`exit=0`；`gapsHash=5361711f44a83e70`。按当前双指纹落独立复查，不代 Owner 人门。

## 对 S2 checklist 的逐项结论

1. **范围**：`git status --short --` 和 `git diff --stat --` 核对本项目 S2 文档/G5 工单、事件手册、共享有序动作组件/能力/点名测试与 `games/game-potion-brewing/`；可见改动落在各自工单声明面。本次未把并行 Life 项目改动归给炼药，也未修改生产或规格文件。G5 复查记录仅由非施工者撰写。
2. **实名能力**：`src/assembly/capability-registry.ts` 真登记 `orderedActionSessionCapability`、`angularGestureCapability`、`dragPlaceCapability` 等；`capability-registry.gen.ts` 真含 `t2-ordered-action-session`、`t2-angular-gesture`、`t2-drag-place`、`t2-effect-apply`、`f1-resource`、`t2-self-rule` 及计划列明的对照能力。`npx vitest run src/assembly/registry-guard.test.ts games/game-potion-brewing/blueprint.test.ts` 独立 **9/9 PASS**，蓝图两份 fixture 真 `Engine.load` + 2 tick。`DragPreviewLayer` 如计划所述是 render-only runtime，**没有**被冒充为 registry capability。
3. **规则解释责任**：`capability-plan.md` §2–§3 将 add/stir 顺序交 G1、椭圆轨迹交 G2、锅口命中交 G3、实时预览交 G4、正确完成材料扣份交 G5 `completedSignal` + `Effect`/`Resource`/`SelfRule`；`blueprint.ts:17-29,90-106` 为数据接线。`review/G1-G4-scoped-release-2026-10-13.md` 非施工者项目范围 PASS；`review/GAP-POTION-05.md` 有独立 29/29、5/5 AC、撤修验红和真触屏证据。未见“规则数据表 + 游戏层待写解释器”的 S2 虚胖项，正式 S4 的闭环与观感另验。
4. **例外裁决**：`capability-plan.md` §4 的 G1–G4 游戏层 B 方案均记录 Owner 选择 A、不批准自由玩法代码；G5 在 §2 增补与 `work-orders/GAP-POTION-05.md:3,9-12` 独立记录 Owner A，游戏库存不另立第二套权威解释器。`game-skill-audit` 本游戏红旗 0、棘轮 PASS；其美术台账缺失、render-only `performance.now()` 为非阻断提示，不能伪称 S5/S8 已过。
5. **§4.5 美术接入**：计划写明锅体/药液/棒/卷轴/材料/成品槽、原型图尚未登记生产资产、S5 资产专员登记及编译期台账脚本待定；§4.6 写 `apolloBrocade` 透明派生、无选方/主菜单及不用固定星级 starter 结果屏的理由。即 **S2 已答方案**，不把 S5 素材台账/视觉完工提前判绿。

## 独立机器核证、撤修与告警

- 直接调用流程脚本 `readCapabilityGaps`/`evalCapabilityGaps`：校验错误 **0**；G1–G5 **5/5 `delivered`**、`P1/engine`、工单路径 **5/5 存在**，结果 `state=ok`、`全部了结`。复查前重读合法流程板：S2 gate `exit=0`，gate/current `gameHash` 均为 `2b771b62aca79e68`，当前 `gapsHash=5361711f44a83e70`。
- **锚点撤修验红（内存、不改文件）**：从五条中断言 `GAP-POTION-05` 恰好一条且原状态 `delivered`，仅把其内存副本状态换回 `open`；`evalCapabilityGaps` 立即由 `ok` → `warn`，显示“缺口 1/5 未裁决”，`blockingGaps(...,'S4')` 返回 `GAP-POTION-05`。恢复原对象后仍为 `ok`。这证明 S2/S4 的缺口锁确在测当前机读台账，而非采信人写的标题。
- `npx vitest` 的有效退出码 0、9/9；测试输出无 WARN。`git diff` 的 LF→CRLF 是 Windows Git 换行提示，不是失败。G5 的完整系统图/真浏览器/音画范围以独立 G5 复查单为准。S2 文案残留“仅四项/施工中”已由施工者修正为 `capability-plan.md:27` 五项和 G5 工单 `:5,7` delivered，复读后没有互相矛盾的当前状态。旧 `S2-review.md` 自述“能力尚未交付”明确是 2026-10-12 历史阶段记录，不作为当前交付判词。

## 边界

本次 S2 通过只表示能力计划、Owner A 裁决和通用能力交付链可核；不宣称 S4 门绿、全库 `scoped-gate` 绿、生产美术台账或 DokiWorld 出包。Owner 先前在流程板的 S2 人门由 Owner 本人操作，本复查不调用 `signoff`/`owner_decide`。
