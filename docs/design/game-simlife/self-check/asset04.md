# SIMLIFE-ASSET-04 施工自检｜GPT Image provider

日期：2026-10-11  
施工主体：Codex/root  
结论：施工自检通过，待非施工人独立复查。

## 架构与边界

- 接受为既有 authoring-time 资产旁路扩写；没有新增 gameplay capability、system、phase、World component、Life runtime、renderer 或 UI 分支。
- `LifeAsset2dProvider` 闭集为 `qwen|gpt-image`，默认仍为 qwen；调用方可整批选择，纯 API 可按 slotId 覆盖。选择只存在于执行计划，不进入 AssetSlotBrief、World、snapshot、hash 或 save。
- `gpt-image` 使用官方 `POST /v1/images/generations` HTTP 端点、显式 `gpt-image-2`、`OPENAI_API_KEY` 与明确 license/provenance。key 只进入 Authorization header，不进入 request body、batch、pending workflow、review、错误消息或文档。
- Codex 内置 imagegen 未伪装成 Node provider；人工生成文件只能另走 asset-manager 手工导入、人审和登记。

## 行为证据

- 无 `--generate` 时真实 Little Valley 21 槽 GPT plan：exit 0，21 items，provider 全为 `gpt-image`，results 0；正式 index SHA-256 不变，AI pending 前后均不存在。
- mock 生成只进入 game-local `art/ai/pending/`；生成阶段不创建 AssetIndex。GPT HTTP 合同测试只用 stubbed fetch/base64 PNG，没有外部网络或付费调用。
- GPT 返回 PNG 先确定性缩放到槽位 `outputPx`，随后复用既有尺寸/alpha/spec/anchor/fingerprint/current manifest 审批门；批准只以原 `art:` key 登记，reject 只清候选。qwen 默认与既有审批链保持回归覆盖。
- 无显式 real permission、无 `OPENAI_API_KEY`、坏 provider、未知 override slot、坏 HTTP/JSON/base64/PNG、provider binding 篡改均 fail-closed，首个 pending 写入前返回。

## 机器检查

- 相关 Vitest：`11 files / 167 tests passed`，exit 0。
- 相关 ESLint：exit 0，零 warning。
- `asset-reconcile game-simlife`：PASS；`ledger-audit game-simlife --strict`：21/21 有槽、0 orphan；`DOCS-REF`：PASS；game audit：未覆盖红旗 0、RATCHET PASS，仅既有薄宿主“零能力接入”黄项。
- context budget：共享池 10/10、24757/25000；仍由既有 `galgame/requests.md`、`game-card-reveal/requests.md`、`ui.md` 超限阻断，本单未新增超限面。
- `tsc --noEmit` 与 `npm run build` 均只命中既有 game-card-reveal、game-dice、game-theft、launcher 与 gal-ui 类型错误，输出零命中本单文件；build 在 tsc 阶段停止。

## 撤修验红

- 承重锚点 `['qwen', 'gpt-image'].includes(provider)` 初始命中 1，独有 sabotage marker 初始为 0。
- 临时把审批 provider 闭集退回仅 qwen 后，GPT “返回大 PNG → 槽位规范化 → 原 key 批准”点名用例精确 `1 failed / 41 skipped`；失败发生在 approve 应成功而被 provider binding 拒绝。
- 同回合恢复后精确 `1 passed / 41 skipped`；最终锚点 1、marker 0，并重新进入完整相关回归。

## 未执行事项与真实 provider 配置

本单没有调用真实 OpenAI/DashScope API，没有生成真实游戏图片，没有执行 generate/approve 到工作区，也没有修改正式 game-simlife AssetIndex/pending。未来 owner 决定真实调用时，需在执行进程环境提供 `OPENAI_API_KEY`，并显式运行：

```powershell
$env:OPENAI_API_KEY = '<owner-provided-secret>'
npm run life-asset-generate -- <asset-slots.json> --provider gpt-image --generate --real-provider --json
```

该命令只产生待审候选；仍须人工审阅后另走带当前 AssetSlot manifest 的 approve。不要把真实 key 写入命令历史、JSON、日志或评审文档。
