# SIMLIFE-ASSET-02 Review 单｜Life 素材候选审阅包

日期：2026-10-11  
施工人：BDM程序  
复查人：Codex（非施工人独立复查）  
状态：**✅ PASS｜已独立复查，待策划收束**

## 工单边界

只复查 `src/assets/**` 的只读 review packet 投影、公共导出、定向测试、资产/生成流程文档和需求池锁。不得 vendor/下载/生成/移动/审批素材，不得修改 AssetIndex、pending、ledger、游戏内容、UI、renderer、Life sim、数据库、服务或 Git/GitHub。

## 实现导航

1. `src/assets/life-asset-review-packet.ts`：schema/类型、strict brief 校验、candidate-plan 对账、闭集条目投影与 packet-level fail-closed。
2. `src/assets/life-asset-review-packet.test.ts`：8 项定向测试，含 local/AI/invalid、字段白名单、计划对账、稳定性、隔离与 Little Valley 21-slot。
3. `src/assets/index.ts`：只公共导出正常调用入口与 schema/types；`buildLifeAssetReviewPacketFromPlan` 仅保留为模块级验证缝，未进入 barrel。
4. `docs/playbooks/assets.md`、`docs/design/game-simlife/generation-workflow-v1.md`：固定 candidate-plan → review-packet → human decision → asset-manager 链路。
5. `docs/workflow/requests.md`：`REQ-LIFE-ASSET-REVIEW-PACKET` 锁与固定合同；复查通过前不得出池。

## 必须独立核验

- [x] public 入口只组合 strict `validateAssetSlotManifest` 与唯一 `planLifeAssetCandidates`；review packet 文件无 `rankRecords`、`candidateFailures` 或 qualified-match 副本，验证缝未从 `src/assets/index.ts` barrel 导出。
- [x] 合法包固定 schema/game/三类计数、slotId 稳定序和 `pending-human-review`，完整显示 spec/render/consumer。
- [x] local 仅 `{id,score}`；AI 仅 slot-owned prompt/negativePrompt/spec；invalid 仅稳定 reasons。
- [x] schema/game/handoff/slot set/order/assetKey/reasons/decision payload 与同一 records 产生的 accepted plan 精确对账；任一不一致整包 fail-closed，零部分 local/AI 且不抛。
- [x] JSON round-trip、slots/records 逆序逐字节稳定；输出无 path/license/provider/bytes/contentHash/approval/可执行字段。
- [x] pending isolation 仍阻止未审候选激活；实现无 I/O、模型、网络及 sim/runtime/hash/save 污染。
- [x] Little Valley 21-slot 只读生成 21 条 pending 项；未修改游戏或正式资产。
- [x] 已独立复跑指定/资产全量/ESLint/docs/context/build并逐字读取 warning；完成 reasons 对账独立撤修验红并恢复，终态 marker 0。

## 施工人自证摘要（仅导航，不作为复查证据）

- 新模块 **8 tests**；指定 **5 files / 46 tests**；完整资产 + Little Valley **20 files / 182 tests**；相关 ESLint、docs-ref 全绿。
- tsc/build 仅既有无关类型红，零命中本单；context 仅既有 galgame/card-reveal 需求单超长红。
- assetKey 对账撤修后点名精确 **1 failed / 7 skipped**，恢复后点名绿；终态锚点 1、marker 0。
- 详细记录：`docs/design/game-simlife/self-check/asset02.md`。

## 独立复查结论

**PASS。Blocker 0 / Major 0 / Minor 0。建议进入策划收束；保留需求池条目，不推进 roadmap done。**

### 第一轮问题与返修核验

- 第一轮判定 **Major 1**：验证缝只校验 reasons 的闭集 shape，shape 合法但伪造的 `{code,detail}` 仍会得到 `valid:true`。
- 返修后 `buildLifeAssetReviewPacketFromPlan(rawManifest, rawPlan, records)` 使用同一 records 再调用唯一 accepted `planLifeAssetCandidates`，逐 slot 精确比较 decision、reasons 和 branch payload；没有复制 rank/match。
- 独立临时 probe 将 reasons 改为 `{code:'forged',detail:'forged'}`：终态得到 packet-level `valid:false`、local/AI count 均为 0、全部条目为 invalid，并带 `plan_reasons` 诊断。

### 独立命令与结果

- `npx vitest run src/assets/life-asset-review-packet.test.ts src/assets/life-asset-candidate-plan.test.ts src/assets/library.test.ts src/assets/asset-slot-brief.test.ts games/game-simlife/asset-slots.test.ts`：exit 0，**5 files / 46 tests passed**，零 warning。
- `npx vitest run src/assets games/game-simlife/asset-slots.test.ts`：exit 0，**20 files / 182 tests passed**，零 warning。
- 点名 forged-reasons 用例：`npx vitest run src/assets/life-asset-review-packet.test.ts -t "fails closed when plan schema, game, slot set or decision payload does not reconcile"`：恢复后 **1 passed / 7 skipped**。
- 相关 `npx eslint ... --max-warnings 0`：exit 0，零 warning。
- `node scripts/docs-ref-guard.mjs`：exit 0，**DOCS-REF: PASS**（46 Markdown、393 路径）。
- `node scripts/context-budget-guard.mjs`：exit 1；终态本单主池 **9/10、23820/25000**，仅既有 `docs/design/galgame/requests.md` 48330>45000 与 `docs/design/game-card-reveal/requests.md` 57152>45000。
- `npm run build`：exit 1，tsc 阶段仅既有 `game-card-reveal`、`game-dice`、`game-simlife/art-consumption.test.ts`、`game-theft`、`launcher/game-runner.tsx` 类型红；零命中 ASSET-02，Vite 未开始。

### 独立撤修验红

- 撤修前断言唯一锚点 `stableAssetSlotJson(item.reasons) !== stableAssetSlotJson(expected.reasons)` 为 **1**，独有 marker 为 **0**。
- 临时以 `ASSET02-REVIEW-REASONS-SABOTAGE` 撤掉该守卫：既有 corruption 点名用例精确 **1 failed / 7 skipped**，错误明确为 `plan_reasons: expected true to be false`；独立 forged-reasons probe 同样 **1 failed / 1**，表现为 `valid:true`。
- 原样恢复后：点名用例 **1 passed / 7 skipped**，独立 probe **1 passed / 1**；随后删除 probe。终态锚点 **1**、marker **0**、probe 文件不存在，最终 5/46 与 20/182 全绿。

### 边界与 warning 判读

- build/context 的非零项均为本单前后相同的无关存量基线；本单测试、ESLint、docs-ref 无 warning。
- 未 vendor、下载、生成、移动或审批素材；未修改 AssetIndex、pending、ledger、游戏内容、UI、renderer、Life sim、数据库、服务或 Git/GitHub。

### Lead 复查复跑（2026-10-11）

**PASS。** 复查人独立运行 5 文件 46 测试，全部通过。随后临时撤掉 `plan_reasons` 的精确对账守卫；指定伪造 reasons 用例精确失败（`1 failed / 7 skipped`，错误为 `plan_reasons: expected true to be false`）。恢复同一守卫后该用例恢复为 `1 passed / 7 skipped`。因此该审阅包确实拒绝形状合法但内容伪造的计划，不存在部分可审批输出。

本条已从共享需求池移除以释放槽位；路线图仅追加实现证据，不代替依赖里程碑的 review 或 owner 门。
