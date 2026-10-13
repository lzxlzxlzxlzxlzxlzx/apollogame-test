# game-simlife 当前需求单

## 当前结论

共享 Life 引擎已能以纯 JSON 生成、校验、审阅候选并由共享 Host 运行；“月影魔王城”是第二个端到端试点。当前唯一施工目标是把世界的可见导航和可交互地表状态纳入生成与素材覆盖硬门，杜绝用通用占位标记或临时颜色让玩家猜测功能。

## 当前有效约束

- 所有 Life 游戏使用 `life-standard-v1` 视口与共享脚点合同；游戏不能用私有格尺度、相机或素材 offset 修正逻辑位置。
- 新生成内容遵循 `Generation Brief → LifeGenerationBundle → 严格校验/编译/确定性探针 → 素材审核 → 受控物化`；游戏规则、世界和剧情保持纯 JSON。
- 素材先匹配本地库；未命中才进入 AI 候选。候选未经 owner 审核不得登记 AssetIndex、写入正式素材或宣称 approved。
- 世界中的 warp 必须有可见且可交互的入口/出口语义；会改变行动选择的地表状态必须在素材与审阅中可辨，不能只靠玩家走上去试。
- 当前正式游戏仍待 owner 共享 Host Playtest；任何物化、素材审核或机器门通过均不代签该人门。

## 当前活动工单

### SIMLIFE-WORLD-VISUAL-SEMANTICS-01｜世界视觉语义与素材覆盖硬门

- 状态：active
- 施工主体：BDM程序（2026-10-13 本地锁）
- 目标：为 warp landmark 与行动地表 surface 建立 render-only、纯 JSON 的通用合同，并接入严格校验、Bundle、素材槽闭包、地图/素材审阅与两试点候选迁移。
- 验收：无 landmark 的 warp、缺地表视觉槽、或非等价行动状态静默共用 visual key 均被稳定拒收；Demon Castle 和 Little Valley 候选遵循新合同；新图片只形成可审候选批，不写正式 AssetIndex 或游戏素材。
- 边界：共享 Life protocol/authoring/compiler/renderer/资产槽消费与相关文档、测试、候选审阅物；不写游戏私有 TypeScript、自由 DOM/CSS、远端 API、正式素材或 Owner 人门。
- 详细规格：[SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md](work-orders/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md)

## 阻塞与待 owner 裁决

- 新的门、阶梯、传送阵和农务地表素材完成候选计划后，须由 owner 审核具体候选及来源/许可，才可进入正式资产与游戏物化。
- 共享 Host Playtest 待 owner 真机完成；其验收路径见 [Demon Castle Playtest](../game-demon-castle/playtest.md)。

## 证据索引

- [项目路线图](../../projects/simlife-engine/project-roadmap.json)：总体里程碑、依赖与 owner gate 的唯一状态。
- [生成流程](generation-workflow-v1.md)：串行 JSON 自检、可视化审阅与素材/物化边界。
- [Life 创作约定](life-json-authoring.md)：运行时 JSON 与 authoring 语义。
- [Bundle 与物化 SOP](life-generation-sop.md)：严格校验、候选与受控更新。
- [当前世界视觉语义施工单](work-orders/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md)：详细范围、验收与证据落点。

## 归档入口

此前完成的引擎、资产、宿主、输入、视口、脚点和 Bundle 工单，以及它们的施工与复查实证，已保留在 [历史需求单](archive/requests-history-through-2026-10-13.md)。该文件仅供追溯，不得作为新的施工依据。
