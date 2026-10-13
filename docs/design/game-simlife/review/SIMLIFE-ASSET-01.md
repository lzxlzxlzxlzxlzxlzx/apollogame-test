# SIMLIFE-ASSET-01 Review 单｜共享素材候选计划器

日期：2026-10-10  
施工人：BDM程序  
复查人：非施工人独立复查  
状态：**✅ 已独立验收（2026-10-10）**

## 工单边界

只复查 `src/assets/**` 的只读 authoring 计划器及导出、点名测试、资产手册接线和需求池锁。不得 vendor/下载/生成/移动/审批素材，不得修改 AssetIndex、pending、ledger、游戏内容、UI、renderer、Life sim、数据库、服务或 Git/GitHub。

## 实现导航

1. `src/assets/life-asset-candidate-plan.ts`：稳定输入归一、严格 brief 诊断、rankRecords 查询、资格过滤、local/AI/invalid 计划与 asset-manager handoff。
2. `src/assets/life-asset-candidate-plan.test.ts`：13 项点名测试（含参数化资格负例与 Little Valley 21-slot 纯调用）。
3. `src/assets/index.ts`：公共导出；`docs/playbooks/assets.md`：一条生产线接线说明。
4. `docs/workflow/requests.md`：`REQ-LIFE-ASSET-CANDIDATE-PLAN` 锁与固定合同。

## 必须独立核验

- [x] query 是否只来自 `generation.prompt`，并真实复用 `rankRecords` 的 score/id 稳定序。
- [x] local 资格是否严格包含 texture、filled、outputPx 宽高、alpha、style；低分但合格项不会被高分不合格项遮蔽。
- [x] AI 分支是否只复制 slot 自带 prompt/negativePrompt/闭集 spec，绝不调用外部模型。
- [x] 非法/unparsed manifest 是否稳定返回 invalid 且不抛半计划；slot/record 乱序是否逐字节同输出。
- [x] 输出是否 JSON round-trip，且不含候选 path/license/provider/bytes/contentHash/approval。
- [x] `validateAssetPendingIsolation` 是否仍阻止未审候选进入 active index；本计划器是否零写入、零 sim/runtime 污染。
- [x] Little Valley 现有 brief 是否可直接调用且不改游戏/正式资产。
- [x] 独立复跑指定与资产全量测试、ESLint、docs/context/build；完整读取 warning；独立按唯一尺寸锚点撤修验红并恢复 marker 0。

## 施工人自证摘要（仅导航，不作为复查证据）

- 指定 **4 files / 38 tests**、完整资产 **18 files / 171 tests**、相关 ESLint 全绿。
- 全库 tsc/build 仅既有无关红，零命中本单；docs-ref PASS。
- context-budget 仅被既有 `game-card-reveal/requests.md` 超长基线阻塞，本单引擎池计数与字符预算仍在上限内。
- 尺寸 width 守卫撤修后点名精确 **1 failed / 12 skipped**，恢复后点名绿，marker 0。
- 详细记录：`docs/design/game-simlife/self-check/asset01.md`。

## 独立复查结论

结论：**PASS**。Blocker **0** / Major **0** / Minor **0**。建议接受并出池；`REQ-LIFE-ASSET-CANDIDATE-PLAN` 已在独立复查通过后按完成票规则从活动需求池删除，释放一个硬槽。

### 1. 架构与合同核验

- 架构判断：**接受**。这是 `AssetSlotBrief + rankRecords + pending isolation` 既有资产 authoring 设施之间缺失的纯计划接缝；实现位于共享 `src/assets/**`，只产闭集计划，不引入游戏私有选材逻辑，也不取得 vendor、生成、审批或登记权限。
- 查询与稳定序：生产实现唯一检索调用为 `rankRecords(records, slot.generation.prompt)`；没有使用 slotId、assetKey、consumer 或其他字段拼 query。`rankRecords` 继续按 score 降序、同分 record id 字典序；计划器先按 slot identity 稳定排序。反转 slot 与 record 输入的测试证明 `JSON.stringify` 逐字节相同。
- local 资格：候选必须同时满足 `type === 'texture'`、`status === 'filled'`、width/height 与 `outputPx` 精确相等、`transparent` 与 alpha 精确相等、style 与 `styleId` 严格相等。过滤发生在完整排名之后，再取首个 qualified，因此高分不合格项不会遮蔽后续低分合格项；同分仍由既有 id 次序决胜。
- AI 分支：未命中 qualified 时只复制槽位自己的 prompt、negativePrompt，以及 kind/styleId/usage/colorSpace/outputPx/alpha/sampling/可选 frame 闭集；生产文件只 import brief validator/canonicalizer 与 `rankRecords`，无 provider、fetch、文件 IO、网络、墙钟、随机或环境变量调用。
- fail-closed：先稳定排序 raw slots，再对归一 manifest 运行严格 `validateAssetSlotManifest`；任一诊断把整份计划稳定降为 `invalid`，不会保留前半份 local/AI 结果。外围 `try/catch` 把不可读输入降为 `manifest_unreadable`，不向调用方抛半计划。
- 输出隔离：local candidate 仅暴露 id/score；AI request 仅为槽位生成合同。local 与 AI 两条均可 JSON round-trip，且无 `path/license/provider/bytes/contentHash/approval` 字段。handoff 固定为 `asset-manager → vendor-or-create-candidate → human-review → asset-index-registration`。
- 审批与 Life 隔离：`validateAssetPendingIsolation` 的 approval-bypass 守卫在计划调用前后都保持红；计划器不接 AssetIndex/pending/ledger 或 Life World。Little Valley 当前 **21 slots / 21 local index assets** 只作为纯只读输入，返回 21 个非 invalid 项；游戏 JSON、正式素材与运行时均未修改。

### 2. 独立命令与结果

- `npx vitest run src/assets/life-asset-candidate-plan.test.ts src/assets/library.test.ts src/assets/asset-slot-brief.test.ts games/game-simlife/asset-slots.test.ts`：最终 **4 files / 38 tests passed**，exit 0。
- `npx vitest run src/assets`：最终 **18 files / 171 tests passed**，exit 0。
- `npx eslint src/assets/life-asset-candidate-plan.ts src/assets/life-asset-candidate-plan.test.ts src/assets/index.ts`：exit 0，零 warning。
- `node scripts/docs-ref-guard.mjs`：独立复查写档前扫描 **46 Markdown / 392 paths**，`DOCS-REF: PASS`；写档与出池后再次通过。
- `node scripts/context-budget-guard.mjs`：出池前活动池 **10/10、24620/25000**；唯一失败为既有 `docs/design/game-card-reveal/requests.md` **57152 > 45000**。本票删除后活动池为 **9/10、24109/25000**；终态仍只剩该既有无关红，不命中本单 Review 或资产手册。
- `npm run build`：exit 1，停在 `tsc`，Vite 未开始。完整错误只命中既有 `game-card-reveal/s4-flow.test.ts`、`game-dice/dice-window*`、`game-simlife/art-consumption.test.ts`、`game-theft/ui.ts` 与 `src/launcher/game-runner.tsx`；**零命中** `life-asset-candidate-plan*`、`asset-slot-brief`、`library`、资产导出或本 Review，且没有额外 WARN。
- 受限沙箱内首次四文件 Vitest 因 Vite `realpath EPERM` 在收集前失败；改用允许的短生命周期非服务进程重跑后取得上述真实结果。未把环境失败计为绿，未运行会调用 Git 的 `scoped-gate`。

### 3. 撤修验红与残留

- 撤修前对完整尺寸锚点 `candidate.width !== slot.asset.outputPx.width || candidate.height !== slot.asset.outputPx.height` 精确计数：**1**；独立 marker `ASSET01-REVIEW-SABOTAGE`：**0**。
- 用 `apply_patch` 临时移除 width 条件并加入唯一 marker；点名 `routes a width mismatch to an AI request without calling a provider` 精确 **1 failed / 12 skipped**，实际错误决策由 `ai-required` 变为 `local-candidate`。
- 同回合精确恢复；点名 **1 passed / 12 skipped**，随后最终四文件 **38 tests** 与完整资产 **171 tests** 全绿。终态锚点 **1**、marker **0**；无临时目录或复查生产代码改动残留。

### 4. 边界确认

复查期间未 vendor、下载、生成、移动或审批素材，未改 AssetIndex、pending、ledger、游戏内容、UI、renderer 或 Life sim；未执行 Git/GitHub、未启动服务、未写数据库。永久修改仅为本 Review 单，以及通过后按规则删除已完成的活动需求池条目。
