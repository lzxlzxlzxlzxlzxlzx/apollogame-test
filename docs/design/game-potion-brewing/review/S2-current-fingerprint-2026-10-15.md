# S2 当前指纹独立复查（2026-10-15）

- 复查主体：`/root/potion_current_review`，与施工主体 `Codex/root` 不同。
- 范围：S2 能力计划及其对当前正式游戏改动的适用性；`gameHash=f3d8a628bcf96ab4`。不代替 S3–S5、S6 美术或 Owner 人门。
- 判词：**PASS**。

## 按 checklist 核证

1. 范围：`git diff --stat -- games/game-potion-brewing docs/design/game-potion-brewing scripts/potion-s4-browser-probe.mjs` 无已跟踪差异；探针目前为既存未跟踪文件，未认作本次复查创建，也未改动。`requests.md:27-32` 的 S6 施工边界为本游戏表现、测试、已获批资产和自证，没有见到跨 `src/ui/**` 或其他游戏的施工差异。
2. 实名能力：`capability-plan.md:17-33` 点名的 `t2-ordered-action-session`、`t2-angular-gesture`、`t2-drag-place`、`t2-clickable`、`t2-keybind`、`t2-event-when`、`t3-flow`、`t3-timeline`、`t1-tween` 可在 `src/skills/tier1-3` 定义与 `src/assembly/capability-registry.ts:108` 的注册表找到。`DragPreviewLayer` 是 runtime 件而非假称 capability。
3. 规则解释：`blueprint.ts:42,59` 的有序会话与角度手势消费配方数据；`recipe.ts:28-34` 只生成稳定具名动作。`game-potion-brewing.ts:96-109` 读取会话做只读呈现；S6 变化集中于液面/素材和宿主视觉，不见游戏层第二套步骤判定。`node scripts/game-skill-audit.mjs game-potion-brewing` 退出 0，红旗 0、棘轮 PASS；只警告 `game-potion-brewing.ts:177` render-only `performance.now()`，不影响 S2 规则解释。
4. 例外：`capability-plan.md:43-50` 的 G1–G4 游戏层 B 路均未获批；`capability-gaps.json` 五项均 `P1/engine/delivered`。独立对机读缺口作内存撤修验红：先锚定 G5 唯一且 delivered，改副本为 open 后 `evalCapabilityGaps` 从 `ok`→`warn`，`blockingGaps(...,'S4')` 精确返回 `GAP-POTION-05`；共享文件未写入。
5. 美术：`capability-plan.md:52-56` 明确锅/药液/棒/卷轴/材料/瓶消费槽与本地 fallback；后续具体素材审批、平台逐行复核仍属 S6，不把 S2 PASS 当素材批准。

S2 机器门已由施工方在同指纹合法重跑；本复查不改 `pipeline.json` 原文。S2 Owner 既有人门不由本会话代签。

## 新指纹复核（`b3a82032ea5d0097`）

本次指纹变化来自 S3 Canvas 真手势夹具 `games/game-potion-brewing/s3-canvas-probe.json` 和 S4 验收剧本署名校正，不改变 `capability-plan.md`、`capability-gaps.json` 或 `blueprint.ts` 所述能力边界。独立复跑 `scripts/click-probe.test.mjs`、`blueprint.test.ts`、`screen.test.ts`：31/31 通过；真浏览器 `node scripts/click-probe.mjs --game game-potion-brewing` 退出 0，鼠标/触屏拖动均经 `Engine.step` 收到 `drag/drag`，可见步骤由 1/4 变 2/4，控制台 error 0。锚定 `interpretCompiledCanvasProbe` 的三重断言后，将首项输入匹配证据仅在内存中改为 false，判词由 2/2 PASS 转为 1/2 FAIL。S2 五项 checklist 复核结论维持 PASS；S3 的正式机器门与复查仍须依序另落账。

最终分域口径：后续 `blueprint.test.ts:63-77` 新增同 seed 完整 `world.snapshot()` 断言，独立 6/6；游戏 full 指纹为 `453f23a6b8e49673`、rules 域为 `f1fca8d9f97ffeb3`。并行更新 `scripts/game-pipeline.mjs` 的分域哈希口径使旧 S2 记录过期后，已重新按合法 CLI 在当前域 PASS 落账；能力计划及 G1–G5 状态并无变化。
