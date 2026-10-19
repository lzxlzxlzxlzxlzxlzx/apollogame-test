# DEMON-CASTLE-UI-ASSET-IMPORT-01 · 资产自检

施工范围：仅月影魔王城游戏本地 UI 纹理与其索引/审批记录；不改 `src/ui/**`、Life Host、模拟规则、存档或 hash。

## 已读与判断

已读 AGENTS、数据驱动宣言、资产管线评审、资产/美术/测试生产线手册、`resource-manager` 与 `module-assets` 技能、当前本地索引及审批账本、`ui-asset-import-plan-2026-10-15.md` 和图标候选记录。接受：当前 `uiSkin`/LayoutNode 消费合同可承载追踪框，但尚没有 HUD 三资源或 J/I/C 图标映射字段；因此资产只登记已锁定的下一消费者，绝不伪造为已接线。

## 物化与溯源

- 从批准图集裁取 `tracked-quest-frame.png`，矩形 `(27,209,562,197)`，SHA-256 `b398b53ceacc922f23f46ee6db596a2ab4cafce69d33780b5567e204a565cdc1`，与预登记哈希一致。
- 从批准的 1536×1024 图标 sheet 按 2×3 固定 512px 网格裁出金币、月晶、月叶、任务卷轴、背包和档案图标；每项来源哈希、裁切矩形、产物哈希、许可和 Owner 2026-10-15 批准均写入本地索引与审批账本。
- `hudChrome` 未导入：现有 `Panel.skin` 槽无法表达整条多区顶栏，硬塞会裁掉端部与月徽。

## 自检结果

- JSON 解析：`art/index.json`、`approval-ledger.json`、候选审阅 JSON 均可解析；本地索引 38 个唯一 id。
- 逐文件：7 个本轮目标 PNG 均存在、尺寸与登记相符且采样到透明 alpha。
- 定向：`npm.cmd exec vitest run -- src/assets/asset-index.test.ts` 通过（36 tests）。
- `src/authoring/demon-castle-playtest-contract.test.ts` 在索引加载与闭包检查后按预期暴露合同漂移：它仍把 index 数量硬钉为 31，当前为 38。此项不是资产解析失败；必须由 `DEMON-CASTLE-UI-RUNTIME-01` 同步更新正式消费者和合同测试后复跑。

结论：**资产物化 PASS；正式视觉接线 BLOCKED**，等待运行时工单消费 `trackedQuestFrame` 和上述六个已锁定 key。
