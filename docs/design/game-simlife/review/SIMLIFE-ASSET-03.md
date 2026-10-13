# SIMLIFE-ASSET-03 Review 单｜Life 素材候选执行与槽位绑定审批

日期：2026-10-11  
施工人：Codex/root  
复查人：Codex/review_eng11（非施工人）  
状态：**PASS · R1 独立复查通过，待策划收束**

## R1 原始缺陷与架构判定

首轮虽然已经完成 strict brief、候选计划、AI pending/approve、原 key 绑定与 CLI 入口守卫，但 `local-review` 只输出候选提示，没有批准、复制和登记入口；因此“本地库优先且逐候选人审后进入游戏”并未闭环。

接受 R1 为既有 vendor 与 AssetIndex upsert 语义的作者态组合，不新增 gameplay capability/system/phase。可信来源先限定 project `assets/index.json`；当前只有能从字节严格验证 width/height/alpha 的 PNG 可批准。FreeArtLib 等来源在有同等级可信索引与本地闭包验证前显式拒绝。

## R1 必须独立核验

- [x] CLI 默认 plan 零写入；`--generate`、`--approve-local + --reviewed-by`、`--reject-local` 才分别进入待审、批准、拒绝动作。
- [x] local 待审 JSON 对人可读且不含 path/URL/bytes/license/secret/approval；源字节 SHA-256 与安全元数据 fingerprint 均在档。
- [x] approve 重新读取 current manifest、可信 index 与源文件，不信任待审 JSON；完整重验 game/slot/original key/source/id/fingerprint/spec/style/license/status/type/PNG pixels/alpha/content hash。
- [x] project PNG 经批准复制到 game-local `vendor/project/`，文件名带原始 slotId 的稳定哈希防止 slug 碰撞；以原 `art:` key upsert，`vendoredFrom`、slot binding、reviewer/time/contentHash 在 provenance，loader 原 key 语义不变。
- [x] reject 只清 local review 项；旧 placeholder 文件不删除。无批准、伪造 id/source、manifest 漂移、可信记录漂移、源字节变化/缺失、非 PNG、越根/穿越、cross-game 全部 fail-closed 且旧 index/formal bytes 不变。
- [x] AI 回归、外部 import-safe、真实 wrapper CLI、只读 Little Valley 21 槽 plan 均不退化；无真实 provider、网络或正式工作区素材写入。
- [x] 独立复跑相关测试/ESLint/asset reconcile/ledger strict/game audit/docs guard，读取 warning；独立做带唯一锚点的撤修验红并完整恢复。

## 施工方证据（只作导航，不替代独立复跑）

- 相关 Vitest：**11 files / 156 tests passed**；相关 ESLint exit 0。CLI 无值 approve/孤立 reviewer 与同 slug 双槽文件隔离另有回归。
- asset reconcile、ledger strict（21/21/0）、DOCS-REF、audit ratchet 均 PASS；game audit 仅既有薄宿主黄项。
- context budget 主池 10/10、24885/25000；仅既有两份游戏 requests 与 UI 手册超限。
- tsc/build 只命中既有 `game-card-reveal`、`game-dice`、`game-theft`、launcher 类型红，零命中本单文件。
- 施工方把唯一 R1 pending 对账锚点临时反转后精确 2 failed / 33 skipped；恢复后 2 passed / 33 skipped，marker 0，并完成最终全量相关回归。

## 首轮历史复查（R1 前）

首轮复查曾发现并打回两处 CLI 入口缺陷：非 Vitest import 会误执行 CLI；首次返修又令真实 vite-node CLI 静默不执行。终态已拆为纯核心模块 `life-asset-generate.mjs` 与唯一顶层 wrapper `life-asset-generate.cli.mjs`，对应 import-safe 与真实 21-slot CLI 回归继续保留。首轮 PASS 不覆盖本次 R1，R1 必须重新独立复查后才能收束。

## R1 独立复查实证

- 第一轮 R1 复查发现 1 项 Major：合法 `hero.one` / `hero-one` 会被有损 slug 映射到同一目标文件，第二次批准可覆盖第一份已批准字节。返修后目标名为 `slug(slotId)-sha256(original slotId)[0:12].png`；独立点名实证中两次 approve 均成功、两个原 `art:` key 路径不同，且两份 PNG 字节分别保持。
- 最终相关回归：`npx vitest run` 点名 11 文件，**11 files / 156 tests passed**；`scripts/life-asset-generate.test.mjs` 为 38 tests，覆盖 import-safe、真实 wrapper、缺值参数、审批/拒绝、伪造/漂移/路径/字节拒收及碰撞隔离。相关 ESLint exit 0、零 warning。
- `node scripts/asset-reconcile.mjs game-simlife`：PASS；`npm run ledger:audit -- game-simlife --strict`：21/21 有槽、0 orphan；`node scripts/docs-ref-guard.mjs`：46 Markdown / 394 paths，PASS；`node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 0、RATCHET PASS。
- 已逐字读取 warning：game audit 仅既有薄宿主“零能力接入”黄项；context-budget 仅既有 `galgame/requests.md`、`game-card-reveal/requests.md` 与 `ui.md` 超限。`tsc --noEmit` / `npm run build` 仅命中既有 game-card-reveal、game-dice、game-theft、launcher 类型错误，零命中本单文件。
- 只读 Little Valley 真实 CLI 返回合法 21 槽 batch；正式 AssetIndex SHA-256、正式素材文件集合前后相同。本复查未调用真实 provider/API/网络，未写正式资产、pending 或 AssetIndex。

## 独立撤修验红

- 哈希后缀锚点 `const stableFileStem = ...sha256...slice(0, 12)` 初始命中 **1**，独有 marker 初始 **0**。
- 临时撤掉哈希后缀、退回纯 `slug(value)` 后，双槽碰撞点名用例精确 **1 failed / 37 skipped**，失败位于“两个批准路径必须不同”；证明返修承重且测试不是假绿。
- 同回合精确恢复后点名 **1 passed / 37 skipped**，最终 11/156 全绿；锚点 1、marker 0、临时 probe 0。

## 独立结论

**PASS**。Blocker 0 / Major 0 / Minor 0（历史 R1 Major 1 已返修并以撤修验红闭环）。本结论只证明资产候选、人工审批、可信本地 PNG 物化与原 key 消费合同成立；**资产管线 PASS ≠ 真实视觉质量、真实 API、供应商许可或新游戏试玩完成**。roadmap 未修改，交策划收束。
