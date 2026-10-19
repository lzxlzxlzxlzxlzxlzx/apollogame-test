# SIMLIFE-DEMON-S4-ACCEPTANCE-01 · 月影魔王城 S4 数据验收剧本

## 状态

`planned`。内容本身可与 `DEMON-CASTLE-UI-RUNTIME-01` 并行，且不依赖 PUI 图标按钮或两枚属性图标；但流程板目前尚未登记历史 S1 人门，故不得在正式流程板中抢跑 S4。先完成 S1 证据迁移与 Owner 人门，再领本单施工锁。

## 架构判断

接受现有能力重组：`LifeGamePackage`、`createLifeGameSession` 与通用 `acceptance-run` 已能表达真世界的操作和只读断言。不得新建游戏私有规则解释器，也不得修改共享 Host、UI、存档、资产索引或正式四文件。

## 施工主体与边界

- 施工主体：待指派的游戏生产/PE；GD 负责剧本条款。
- 允许新增：`games/game-demon-castle/acceptance-adapter.ts` 与 `docs/design/game-demon-castle/acceptance/*.scenario.jsonc`；相应的最小点名测试仅在确有必要时新增。
- 禁止：改 `src/ui/**`、`src/engine/host/**`、`public/games/**`、资产审批、素材、正式 JSON、UI 工单或 Owner gate。

## 固定适配合同

薄适配只执行下列接线：以正式 `life.json`、`life-host.json`、`asset-slots.json` 创建 `createLifeGameSession`；把剧本动作排入现有 Host input/命令队列；读回现有 World 组件。它不得直接写背包、旗标、建设状态、剧情状态或关系值，也不得含玩法条件判断。

## 三份 GD 验收剧本

每个文件首行必须是 `// author: GD`；动作名必须对应真实玩家语义，而非私有信号名。

1. `01-materials-and-throne.scenario.jsonc`
   - 从庭院进入森林、采集 4 月木；进入地下工坊、采集 3 影矿；建设王座厅。
   - 断言：两种材料数量、`flag.throne-lit=true`、王座建设项目 completed、下一任务节点 active，且无法重复建设/重复扣料。
2. `02-moonbell-and-greenhouse.scenario.jsonc`
   - 两格农田完成翻土、浇水、播种、两次日历推进/浇水、收获，再建设温室。
   - 断言：成长与收获产物、`flag.greenhouse-restored=true`、温室项目 completed、熔炉节点 active；温室在王座前不可完成。
3. `03-forge-and-chapter-feedback.scenario.jsonc`
   - 验证熔炉在温室前锁定；温室后消耗 2 影矿与 1 月木建设熔炉，推进 night，并走月井使者的最终对话选项。
   - 断言：`flag.forge-awakened=true`、三建设项目及三个章节节点 completed、三类材料归零、正确关系变化与终局对话分支可达。

## 验收

- `npx vite-node scripts/acceptance-run.mjs --game game-demon-castle`：三剧本全绿。
- `node scripts/game-pipeline.mjs gate game-demon-castle S4`：先满足该关已有前置；不得通过修改 pipeline 或伪造流水线状态绕过。
- 递归复核：对每份剧本对应的一条真实数据规则作带锚点的临时撤修，剧本必须精确转红；恢复后复绿。复查人与施工人不同。
- S4 自证仍须另做真渲染自玩、截图与对齐单；本单的机读剧本不替代可玩性目击。
