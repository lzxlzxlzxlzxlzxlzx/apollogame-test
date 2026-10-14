# GAP-POTION-05 / G5 · 有序步骤完成信号

> Owner 于 2026-10-13 在本会话对 S4 材料份数缺口选择 A：补通用引擎能力；不同意炼药游戏层第二套权威解释器。实查与失败重组见 [S4-stock-gap-2026-10-13.md](../self-check/S4-stock-gap-2026-10-13.md)。本单独立于已释放的 G1–G4，完成后立即复查并从公共池释放。

状态：2026-10-13 经[非施工者独立复查](../review/GAP-POTION-05.md)项目范围 PASS，能力标为 delivered，公共池票已释放；S4 整关与 Owner 人门仍独立验收。

- 施工主体：Codex/root（Owner 允许本项目本地施工主体领工锁，无须先推送）；确定性/快照面按 🔴 主程施工与非施工者独立复查。状态：delivered。
- 允许面：`src/skills/tier2/ordered-action-session.ts`、`src/engine/protocol/components/logic.ts`、点名测试、`docs/playbooks/events-logic.md`、本游戏蓝图/屏/验收与证据；禁止修改其它游戏、远程 Git/数据库或整套 ZeroCraft。
- 通用接口：`OrderedActionSession.steps[]` 可选 `completedSignal`（完整具名信号，1..128 字符）；若未填，旧内容的世界状态、信号、快照/hash 与行为逐字节不变。填了则**仅该步达到 requiredCount 且正确完成时**发一次具名 Signal，`source` 为会话实体；错误、短弧/未提交、同拍去重、终局后动作不发。每步信号名互异，且不得与输入动作、success/failure 冲突；非法表装载期与运行期同尺拒收。
- 相位/生命周期：G1 Commit 接受后、`effect-apply` 前输出，供同拍声明式资源效果消费；下拍清扫，不留泄漏；重复材料不同步骤分别有不同 completedSignal。同拍多源跨步按既有实体 id 全序，正确步逐个发信号；Effect 对不同信号分别扣减。不得改原有 success/failure、InputQueue 或 G2/G3 定序。
- 游戏接线：每个 add 步骤专属完成信号 → `Effect.modify-resource` 扣同 ID `Resource` 一份；`SelfRule(Resource≤0→destroy)` 移除耗尽材料；KeyBinding 条件门与 LayoutNode 只读投影显示剩余数并禁按钮。宿主库存仍由 DokiWorld 权威持有，游戏份数只为本局可交互性，不写宿主存档。
- 验收：正确一步扣一份、重复材料两份/同拍双步、错误不扣、反向搅拌不扣、耗尽后的拖/点/键不提交、旧配置 hash/行为不变、双跑/快照续跑同轨、DebugTrace 密度合规、系统图零新增 SCC；定向单测 + GD 5 剧本 + 真浏览器鼠标/触屏 + UI 审计 + 锚点撤修验红；非施工者独立复查后释放，不代签 S4 Owner 门。
