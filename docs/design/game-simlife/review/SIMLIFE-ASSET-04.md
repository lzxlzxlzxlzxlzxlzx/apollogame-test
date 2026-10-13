# SIMLIFE-ASSET-04 Review 单｜GPT Image provider 进入 Life 待审素材链

日期：2026-10-11  
施工人：Codex/root  
复查人：Codex/review_eng11（非施工人）  
状态：**PASS · 独立复查通过，待策划收束**

## 复查范围

- `src/assets/life-asset-generation-batch.ts` / `.test.ts` 与 `src/assets/index.ts`：闭集 provider、默认兼容、整批/逐槽稳定选择。
- `scripts/ai-gen.mjs` / `.test.mjs`：官方 GPT Image HTTP adapter、显式模型/key/license、base64 PNG、尺寸规范化、错误去敏与 provider-neutral approval binding。
- `scripts/life-asset-generate.mjs` / `.test.mjs`：CLI/API provider 选择、real/key 双门、全批预生成后 pending、原 key approve/reject 与 qwen 回归。
- 资产/Life 手册、M2.5 合同、SOP、generation workflow、施工单与本自检。不得把手册导航当成代码证据。

## 必须独立核验

- [x] 默认 qwen 逐字兼容；`gpt-image` 与 per-slot override 稳定、坏值/未知 slot 整批 fail-closed。
- [x] GPT 请求只到官方 `/v1/images/generations`，模型 `gpt-image-2`、PNG、透明背景与合法尺寸显式；key 只在 Authorization header，任何 batch/review/pending/错误/日志无明文 key。
- [x] 无 `allowRealProvider` 或无 `OPENAI_API_KEY` 拒绝；测试只用 mock/stub，不发生外部调用。
- [x] GPT 大图按槽位 outputPx 确定性规范化，实际 PNG width/height/alpha、workflow provider 与 provenance 一致。
- [x] AI 生成只进 game-local pending；审前 AssetIndex 不存在/不变；approve 重验当前 manifest 后只登记原 `art:` key，reject 只清候选；workspace mock 仍不可批准。
- [x] qwen、local trusted approve、路径/字节/fingerprint/spec/cross-game 防线、真实 wrapper CLI 与 Little Valley 21 槽只读 plan 无回归。
- [x] 独立复跑相关测试、ESLint、asset reconcile、ledger strict、docs/audit；逐条读 warning，并做带唯一锚点的撤修验红与恢复。

## 施工方导航（不替代复查）

- Vitest：11 files / 167 tests passed；ESLint exit 0。
- 真实 21 槽 GPT plan：exit 0、21 items、results 0、index hash 不变、pending 不存在。
- reconcile / ledger strict / DOCS-REF / audit ratchet PASS；context/tsc/build 仅既有无关红。
- 撤修：provider approval 锚点 1；临时退回 qwen-only 后 GPT approve 用例 1 failed / 41 skipped，恢复后 1 passed / 41 skipped；marker 0。
- 未调用真实 API、未生成真实图片、未写正式 AssetIndex/pending、未改 roadmap。

## 建议独立命令

```text
npx vitest run src/assets/asset-index.test.ts src/assets/asset-slot-brief.test.ts src/assets/game-art-load.test.ts src/assets/library.test.ts src/assets/life-asset-candidate-plan.test.ts src/assets/life-asset-review-packet.test.ts src/assets/life-asset-generation-batch.test.ts scripts/ai-gen.test.mjs scripts/life-asset-generate.test.mjs games/game-simlife/asset-slots.test.ts games/game-simlife/art-consumption.test.ts
npx eslint src/assets/life-asset-generation-batch.ts src/assets/life-asset-generation-batch.test.ts src/assets/index.ts scripts/ai-gen.mjs scripts/ai-gen.test.mjs scripts/life-asset-generate.mjs scripts/life-asset-generate.test.mjs
node scripts/asset-reconcile.mjs game-simlife
npm run ledger:audit -- game-simlife --strict
node scripts/docs-ref-guard.mjs
node scripts/game-skill-audit.mjs game-simlife
node scripts/context-budget-guard.mjs
npx tsc --noEmit --pretty false
npm run build
```

## 独立结论

**PASS**。Blocker 0 / Major 0 / Minor 0。首轮独立复查曾实证发现 provider 错误码可回显完整 `OPENAI_API_KEY`（Major 1）；施工方返修后，非 2xx/坏 JSON 只输出经类型约束的 HTTP status，完全丢弃远端 error code/message/body。独立恶意回显探针现为 `gpt-image: HTTP 401`、`LEAK=false`，`providerSettings` 对 GPT 已配置态也只返回 `apiKeyMasked:'configured'`。

### 独立复跑实证

- 相关 Vitest：最终 `11 files / 167 tests passed`，exit 0；含 batch provider 选择、GPT HTTP/base64/resize、CLI、qwen/local approve、防篡改与 Little Valley 消费回归。
- ESLint：点名 7 文件，`--max-warnings 0`，exit 0、零 warning。
- `asset-reconcile game-simlife`：PASS；`ledger:audit -- game-simlife --strict`：21 行 / 21 有槽 / 0 orphan；DOCS-REF：46 Markdown / 394 路径，PASS。
- `game-skill-audit game-simlife`：未覆盖红旗 0、RATCHET PASS；仅既有黄色“零能力接入”提示。
- Little Valley 真实 21 槽 GPT plan：exit 0，21 个 `gpt-image` item、`results:[]`；正式 index SHA-256 前后均为 `16F9FBD06FF7D553488E6E2ABC490DBCBCFD44AD359FF2F68173FC8F8B17E7C2`，AI pending 前后均不存在。
- context-budget exit 1 仅既有 `galgame/requests.md`、`game-card-reveal/requests.md` 字符超限与 `playbooks/ui.md` 行数超限；需求池 10/10、24967/25000。`tsc` / build exit 1 仅命中 game-card-reveal、game-dice、game-theft 与 launcher 既有类型错误，零命中本单文件。
- 沙箱内 Vitest/vite-node 曾在启动前触发 Windows `realpath EPERM`（无测试执行）；依规则改用短生命周期沙箱外测试进程后取得上述真实结果，未放宽网络且测试仅使用 mock/stub 与 OS 临时目录。

### 独立撤修验红

- 唯一锚点 `!['qwen', 'gpt-image'].includes(provider)`：撤修前命中 1，独有 marker 0。
- 临时退回 qwen-only 并加入 `SIMLIFE_ASSET04_REVIEW_SABOTAGE` 后，GPT “大 PNG 规范化并按原 key 批准”用例精确 `1 failed / 41 skipped`。
- 同回合用 `apply_patch` 精确恢复后为 `1 passed / 41 skipped`；最终全量 167 测绿，锚点 1、marker 0，无临时复查文件或生产代码残留。

未调用 OpenAI/DashScope，未生成或批准正式图片，未写正式 game-simlife AssetIndex/pending，未启动服务、修改数据库或执行 Git/GitHub。该 PASS 仅证明 provider 与待审资产管线合同，不代表真实 API 可用性、许可证、视觉质量或新游戏试玩完成。
