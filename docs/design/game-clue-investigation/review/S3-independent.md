# S3 纯数据骨架 · 非施工者独立复查

日期：2026-10-12  
复查人：`/root`（未参与 S3 施工）  
纯数据层结论：**PASS（Critical 0 / Major 0 / Minor 0）**；**正式 S3 流程门 FAIL，S3 不得据此判完成**。

本判词只覆盖 S3 的纯数据 manifest、真实装载与 2 tick 空跑，不覆盖 S4 玩法链、正式 UI、美术、音频、DokiWorld parser/manifest、dist 或 Owner 人门。

## 独立复跑

- `Get-Content -Raw -Encoding utf8 library/game-clue-investigation/manifest.json | npx vite-node scripts/manifest-check.mjs`：exit 0，`ok:true`、`inferredCapabilities:false`、8 个实名 capability、`warnings:[]`。
- `npx vitest run games/game-clue-investigation/s3-skeleton.test.ts --reporter=verbose`：**1 file / 4 tests PASS**，exit 0；覆盖严格解析、真实 `Engine.load`、2 tick 空跑、七对象/1440×900 骨架、计数器/初态和双实例 hash 确定性。
- `npx eslint games/game-clue-investigation/s3-skeleton.test.ts`：exit 0。
- `node scripts/docs-ref-guard.mjs`：46 docs / 396 refs，`DOCS-REF: PASS`。
- `node scripts/game-skill-audit.mjs game-clue-investigation`：exit 0，`RATCHET: PASS`，无红旗。审计仍提示“零能力接入”和“无美术台账”两项黄色防线；前者来自该审计只统计 `games/**` TypeScript 能力导入、不会读取本阶段 `library/**/manifest.json`，后者属于 S6，均未冒称全绿。

沙箱内首次运行 Vite/Vitest 因 Windows `realpath` EPERM 未执行测试；该结果未采信。随后在允许的短生命周期环境以同一命令独立复跑，未启动应用服务。

## 撤修验红

- 唯一锚点：`library/game-clue-investigation/manifest.json` 中唯一一处 `"current": "scene-idle"`（`rg -F` 命中 1 次）。
- 临时撤修：将该值改为不存在的 `s3-review-missing-state`。
- 预期且实际结果：定向 Vitest exit 1，**2 failed / 2 passed**；解析告警精确指出 `investigation-flow.GameFlow.current` 引用了不存在的流程状态，初态断言同时从 `scene-idle` 转红。
- 已恢复锚点并用相同命令复跑：**4/4 PASS**，exit 0。

## 结构与阶段边界

- 运行时唯一游戏真相位于 `library/game-clue-investigation/manifest.json`；`meta.json` 明确标注仅为 S3 骨架。
- manifest 显式声明 8 个 capability，没有推断接入；背景、流程、两个 Resource、七个对象与 viewed/collected Flag 均为闭集数据。
- 本阶段的 `Shape + Clickable` 仅用于灰盒装载骨架；尚未宣称定稿 PNG 实形命中、完整调查/收录/重复点击幂等或完成链已经实现。
- 未发现游戏层自由 system、DOM/CSS/Canvas 复制、裸随机或 S4 结果接线。

## 首轮发现与关闭

1. **Minor：能力计划仍声称 S2 未获 Owner 签核。** 已将 `capability-plan.md` 的阶段说明、例外裁决、S7 parser 归属和评审记录同步为 S1/S2 已批准、S3 已解锁；文档守卫复跑通过。

## 正式流程门追加证据（2026-10-13）

- 经合法流程 CLI 执行 S3 gate（使用有理由的 `--out-of-order`；没有代签仍为 dim 的 S1/S2 流程板人门）：解析/真实装载/2 tick 通过，渲染探针报 PASS，点击探针 **FAIL**，exit 1。
- `public/games/game-clue-investigation/probe/S3-click-gate.json`：`controls:0`、`changed:0`、`exit:1`，告警为活体 DOM 无 `[data-action]`。当前卡带由 Canvas 承载，DOM 枚举不构成其输入验收。
- `public/games/game-clue-investigation/probe/S3-render.png` 实图是启动器，不是调查游戏；对应 JSON 的 `ok:true`、方差 489.95 是**假绿**。代码路径：`?game=lib:<slug>` 要求 `/api/library` 返回该卡带，探针却将此路由固定为 `[]`，导致 `DataCartridgeRunner` 未挂载。截图不能采信为游戏渲染证据。
- 共用 `REQ-S3CLICK` 已有 Owner A 判词，但当前写死规格只覆盖 DOM `[data-action]`，施工锁属于另一 session；本复查不改共享探针，不私加豁免。临时测试服务已关闭，无 5700–5702 监听。

因此本页先前 PASS **仅限纯数据 manifest/装载层**。正式 S3 尚未通过，S4 不得据此解锁；项目路线图中的 S3–S4 合并里程碑保持 `active`、三门保持未通过。
