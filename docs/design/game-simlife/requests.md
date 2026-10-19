# game-simlife 当前需求单

## 当前结论

共享 Life 引擎已能以纯 JSON 生成、校验、审阅候选并由共享 Host 运行；“月影魔王城”是第二个端到端试点。共享背包、生成背包审阅、任务追踪、可生成的人物档案与可选四槽 UI skin 合同均已独立复查通过。

## 当前有效约束

- 所有 Life 游戏使用 `life-standard-v1` 视口与共享脚点合同；游戏不能用私有格尺度、相机或素材 offset 修正逻辑位置。
- 新生成内容遵循 `Generation Brief → LifeGenerationBundle → 严格校验/编译/确定性探针 → 素材审核 → 受控物化`；游戏规则、世界和剧情保持纯 JSON。
- 素材先匹配本地库；未命中才进入 AI 候选。候选未经 owner 审核不得登记 AssetIndex、写入正式素材或宣称 approved。
- 世界中的 warp 必须有可见且可交互的入口/出口语义；会改变行动选择的地表状态必须在素材与审阅中可辨，不能只靠玩家走上去试。
- 当前正式游戏仍待 owner 共享 Host Playtest；任何物化、素材审核或机器门通过均不代签该人门。

## 当前活动工单

`LIFE-DEPENDENCY-FENCE-A`：施工主体 **引擎程序 Codex/root（2026-10-16 本地领锁，in-progress）**。Owner 已裁 A：按[33 条逐项映射及迁移单](work-orders/LIFE-DEPENDENCY-FENCE-2026-10-16.md)把 Life Host 编排移到上层 assembly/host，安全迁消费者、authoring 类型入口与测试归属；完整围栏目标 0 errors/0 warnings，World/save/hash/正式数据/资产/HUD/日历不漂。各批自检、唯一锚点撤修验红和非施工者复查，不将局部绿冒充全量绿。LIFE-IMPORT-BOUNDARY-01 十条导入已有[独立局部 PASS](review/LIFE-IMPORT-BOUNDARY-01-independent.md)。UI skin 合同已有[独立复查](review/SIMLIFE-UI-SKIN-PACK-01.md)，真实皮肤审美仍待素材与 Host Playtest 人门。

## 阻塞与待 owner 裁决

- 请 owner 审核并授权生成两组新增地表候选：魔王城的月影荒地/干耕地/湿耕地，以及小山谷的可耕土/干土/湿土；规格、地图落点与来源状态见 [世界视觉语义审阅矩阵](world-visual-semantics-review.md)。批准候选及来源/许可后，才可进入正式资产与游戏物化。
- 共享 Host Playtest 待 owner 真机完成；其验收路径见 [Demon Castle Playtest](../game-demon-castle/playtest.md)。

## 证据索引

- [项目路线图](../../projects/simlife-engine/project-roadmap.json)：总体里程碑、依赖与 owner gate 的唯一状态。
- [生成流程](generation-workflow-v1.md)：串行 JSON 自检、可视化审阅与素材/物化边界。
- [Life 创作约定](life-json-authoring.md)：运行时 JSON 与 authoring 语义。
- [Bundle 与物化 SOP](life-generation-sop.md)：严格校验、候选与受控更新。
- [世界视觉语义审阅矩阵](world-visual-semantics-review.md)：入口/出口与地表状态的素材槽、位置、候选状态。

## 归档入口

此前完成的引擎、资产、宿主、输入、视口、脚点和 Bundle 工单，以及它们的施工与复查实证，已保留在 [历史需求单](archive/requests-history-through-2026-10-13.md)。该文件仅供追溯，不得作为新的施工依据。
