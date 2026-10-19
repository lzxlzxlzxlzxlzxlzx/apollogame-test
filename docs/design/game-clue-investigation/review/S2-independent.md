# S2 能力计划与宿主合同 · 非施工者独立复查

日期：2026-10-12  
复查人：`/root/s2_independent_review`（未参与 capability plan、合同或 S2 自检施工）  
终态结论：**PASS（Critical 0 / Major 0 / Minor 0）**

本判词只覆盖 S2 技术材料，不代替 Owner 人门，也不解锁 S3。

## 独立实证

- 八个定向文件独立复跑：**8 files / 120 tests PASS**，exit 0。沙箱内首跑因 Windows `realpath` EPERM 为 0 tests，未采信；改在允许的短生命周期测试环境用同一命令复跑后通过。
- `capability-gaps.json` 与项目路线图均严格 JSON 可解析；两个 gap 均为 `delivered`，open 为 0。
- 能力计划所列 14 个真实 registry id 均在 `src/skills/**` 命中。`GCI-S2-01/02` 是缺口/工单标识；实际消费落在扩展后的 `t2-clickable` 与 `HostVisualSession/projectHostVisual` 资产桥，不是游戏自由解释器。
- `node scripts/docs-ref-guard.mjs`：46 docs / 396 refs，PASS；合同两个 fenced JSON 示例均可 `JSON.parse`。
- `node scripts/context-budget-guard.mjs`：终态读取到本项目未新增容量红；仍有 GAL/card-reveal 游戏需求单和 events/UI 手册的共享既有红项，未冒称全库门禁绿。
- 静态/动态 mask 两份独立复查证据均包含独立复跑、唯一锚点撤修验红、fail-closed、trace 与告警边界；动态桥 120/120 与本轮复跑一致。

## 合同与架构核对

- 64 KiB envelope、131072 mask bits、1–12 objects、HTTPS PNG/CORS/解码尺寸、contain/cover/anchor、rotation 0 均为闭集。
- preview 零远程、零 complete；只有全部必需线索首次收录能进入唯一 completed；cancelled/error 不产生业务结果。
- 宿主保持业务 authority，以 requestId 幂等结算；App 不读取或写入宿主知识、任务、奖励、存档或数据库。
- 正式 parser、schema 3 manifest、SDK 假宿主、SHA 与 dist 明确属于 S7，不构成 S2 设计冻结的循环前置。
- 无游戏层代码例外、自由 DOM/Canvas、自由命中解释器或数据表旁路。

## 首轮发现与关闭

1. **Major：ID 合法域与桥不一致。** 原合同允许任意非空 Unicode `objectId`，桥的 `keyPart()` 只接受 `[A-Za-z0-9_-]+`。现 requestId、investigationId、objectId 三类 ID 均锁定为 1–128 ASCII 安全集，并写明直接进入 session/temp key，无游戏层映射器。复验关闭。
2. **Major：输入/输出示例不可达。** 原完整输入只有 `broken-latch`，输出却含输入不存在的 `wet-footprint`。现 objective 为一项必要证物，输出仅含 `broken-latch`，是输入 clue 子集并覆盖全部 required。复验关闭。

终态 Critical/Major/Minor 均为 0。

## 控制台边界

S1 当前仍为 `review / selfCheck pass / review pass / owner required`。S2 技术自检与独立复查虽已 PASS，但在 S1 Owner 控制台终审前必须保持 `blocked`；复查人未保存路线图，也未执行任何 Owner 审批。
