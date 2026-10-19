# SIMLIFE-GEN-GATE-01 Review 单｜逐阶段生成 Gate 数据合同

日期：2026-10-11  
施工人：BDM程序  
复查人：Codex（非施工独立复查）  
状态：**✅ PASS（独立复查）**

## 边界

只复查 `src/authoring/life-generation-gate*`、生成流程文档和本工单状态。不得改 Life package/runtime/snapshot/save/renderer/UI/launcher/materializer，不得调用模型/网络、物化游戏、生成/批准素材、写 AssetIndex/pending/ledger/数据库、启动服务或执行 Git/GitHub。

## 实现导航

1. `src/authoring/life-generation-gate.ts`：闭集 schema、阶段 artifact allowlist、pending-only 创建、严格单 gate/序列验证、只读推进判定。
2. `src/authoring/life-generation-gate.test.ts`：10 组点名测试，覆盖逐关解锁、阻断、stale、伪造、序列、稳定性与 Bundle/运行时隔离。
3. `docs/design/game-simlife/generation-workflow-v1.md`：M0 双门的共享实现与 owner 身份边界。
4. `docs/design/game-simlife/self-check/gen-gate01.md`：施工自证，仅作导航。
5. `docs/workflow/requests.md`：`REQ-LIFE-GENERATION-GATE` 在复查/策划收束前不得出池。

## 必须独立核验

- [x] 是否只复用 `sha256Canonical`，没有第二份 canonical JSON / SHA-256。
- [x] create 是否根闭集、ownerDecision 不可注入且结果只能 pending；输入是否限有限纯 JSON。
- [x] 单 gate 根/selfCheck/diagnostic/artifact 是否全闭集；未知字段、非法枚举/hash/ref、重复或非稳定数组是否 fail-closed。
- [x] stage artifact allowlist 是否与 Brief/World/Actors/Plot/Assets/Host/Bundle/Playtest 审阅语义相符且每阶段非空。
- [x] fail/error gate 是否不能 approved；warning 是否保留但不遮蔽 error。
- [x] gate 序列是否只允许从 brief 起的连续前缀，并拒绝跳关、重复、乱序、输入集合漂移和锁前施工。
- [x] 推进是否要求当前 gate 对当前内容 exact hash、pass+approved，只解锁紧邻下一关；pending/changes-requested/stale 是否阻断。
- [x] 是否明确不认证真人 owner，且 session/provenance/gate/hash 不进入 Bundle runtime payload、World、snapshot/save。
- [x] 独立复跑点名、完整 authoring、ESLint、tsc/build、docs/context 并读取全部 warning。
- [x] 对唯一 exact-hash 锚点独立撤修验红，恢复后锚点 1、marker 0、全回归绿。

## 施工自证摘要（不作为复查证据）

- gate **10 tests**；gate+bundle **18 tests**；完整 authoring **5 files / 74 tests**；相关 ESLint 零 warning。
- exact-hash 守卫撤修后 stale 点名用例 **1 failed / 9 skipped**，恢复后 **1 passed / 9 skipped**；终态锚点 1、marker 0。
- tsc 只保留既有无关红，零命中本单。详细证据见 self-check。

## 独立复查结论

**PASS。Blocker 0 / Major 0 / Minor 0，建议策划收束。**

### 架构与合同实证

- 接受本单：它把既有串行双门流程落为 World 外的纯 authoring 数据合同，不新增 gameplay capability、system 或第二份 hash 实现。`life-generation-gate.ts` 仅从 `life-generation-bundle.ts` 导入并调用 `sha256Canonical()`；本文件没有 `createHash` 或 canonical JSON 实现。
- `createLifeGenerationGate()` 的根、`selfCheck`、diagnostic、artifact 均为闭集；调用方不能提交 `ownerDecision`，成功结果固定为 `pending`。单 gate 对 schema/stage/status/decision/hash/ref/排序/重复项 fail-closed；八阶段 artifact kind 均使用各自 allowlist 且每阶段至少一项。
- `pass` 携带 error 非法；`approved` 只接受 pass 且零 error；warning 保留但不能遮蔽 error。序列只接受 `brief` 起的连续前缀及精确输入 stage 集，后关要求紧邻前关 approved+pass；推进只重算当前阶段的当前内容 exact hash，并仅解锁紧邻下一关。
- 独立临时 probe 证明 `undefined`、`NaN`、`Infinity`、循环引用均返回 `input_json`，嵌套 diagnostic 未知字段返回 `diagnostic_shape`，从 `world` 伪造起步返回 `stage_order`；probe 随即删除。
- 纯 JSON `approved` 明确只是决策 token，不认证操作者身份。gate/session/provenance 均未加入 `LifeGenerationBundle`、World、snapshot/save；与 Bundle checker 共存的前后结果和运行时隔离点名用例通过。

### 独立命令与退出码

- `npx vitest run src/authoring/life-generation-gate.test.ts`：exit 0，**1 file / 10 tests passed**。
- `npx vitest run src/authoring/life-generation-gate.test.ts src/authoring/life-generation-bundle.test.ts`：exit 0，**2 files / 18 tests passed**。
- `npx vitest run src/authoring`：exit 0，**5 files / 74 tests passed**。
- 临时 fail-closed probe：exit 0，**1 file / 2 tests passed**；终态文件已删除。
- `npx eslint src/authoring/life-generation-gate.ts src/authoring/life-generation-gate.test.ts --max-warnings 0`：exit 0，零 warning。
- `npx tsc --noEmit`：exit 1；完整读取后只见既有 `game-card-reveal`、`game-dice`、`game-simlife/art-consumption.test.ts`、`game-theft`、`src/launcher/game-runner.tsx` 类型红，零命中 `life-generation-gate` 或本单。
- `npm run build`：exit 1；同一组既有类型红使 `tsc` 阶段退出，Vite 未开始，零命中本单。
- `node scripts/docs-ref-guard.mjs`：exit 0，**46 Markdown / 393 路径，DOCS-REF: PASS**。
- `node scripts/context-budget-guard.mjs`：终态 exit 1；共享池 **9/10、24192/25000**，仅既有 `docs/design/galgame/requests.md` **49238/45000** 与 `docs/design/game-card-reveal/requests.md` **57152/45000** 超限，本单未新增超限。
- 沙箱内 Vitest 曾在收集前因 `node_modules/vitest/dist/spy.js` realpath EPERM 退出；随后以同一短生命周期测试命令在允许的文件系统上下文复跑取得以上真实计数，未将环境失败计为通过，未启动服务。

### 独立撤修验红

- 撤修前断言唯一锚点 `raw.inputHash !== hashed.hash` = **1**，独有 marker `GEN-GATE-REVIEW-SABOTAGE` = **0**。
- 用 `apply_patch` 将 exact-current-content 守卫临时恒假并加入 marker 后，点名 `marks an old gate stale after any current stage content change` 精确转红：**1 failed / 9 skipped**，失败锚在 `expected true to be false`。
- 用 `apply_patch` 精确恢复后，点名用例 **1 passed / 9 skipped**；终态锚点 **1**、marker **0**，随后再次完成 10、18、74 三组终态回归。

未执行 Git/GitHub、数据库、服务、模型/网络、materializer、素材或 `scoped-gate`；未留下 probe、sabotage 或其他复查临时改动。

### Lead 复查复跑（2026-10-11）

**PASS。** 复查人独立复跑 Gate + Bundle（18 tests）及完整 authoring（74 tests），均通过。临时撤掉 `raw.inputHash !== hashed.hash` 精确守卫后，陈旧内容点名用例精确转红（`1 failed / 9 skipped`）；原样恢复后为 `1 passed / 9 skipped`，终态守卫唯一且无临时标记。

该合同只验证数据与流程状态，不能以 JSON 自证“谁是 owner”；审批身份仍归控制台/会话授权。工单已从共享需求池移除，未替代任何 owner gate。
