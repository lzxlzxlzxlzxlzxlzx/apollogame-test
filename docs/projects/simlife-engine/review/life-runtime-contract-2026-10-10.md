# Life 通用运行时与数据契约独立复查

日期：2026-10-10  
复查范围：`life-runtime-contract` 路线图里程碑  
复查人：Lead（非原施工人）

## 结论

**通过，推进至 `review`。** 未发现把 Little Valley 玩法写进游戏私有 system、绕过严格包解析，或将 UI/输入/素材状态带入确定性存档的证据。

此结论不等于 Little Valley 的体验验收、素材生产管线完成或第二款游戏已生成；这些仍由各自里程碑处理。

## 独立实证

- 重新阅读 [能力计划](../../../design/game-simlife/capability-plan.md)：内容包由 `LifeGamePackage` 描述，世界解释走既有 capability；Little Valley 只给数据、描述符和薄入口。
- 复核 `src/engine/host/life-game-host.ts`：先严格解析 host descriptor、Life package 和 asset-slot manifest，确认 slug 一致后才创建 DOM；共享 Host 负责 host、输入、renderer、交互、存档生命周期。
- 复核 `src/engine/host/life-save.ts`：存档白名单只含权威进展；视觉、相机、速度、输入、HUD、菜单和素材元数据不进入 payload；恢复在隔离世界校验后一次替换。
- 独立回归：29 个文件、241 项测试通过，覆盖 package/compile、农耕、资源、日历、NPC 日程、关系、任务、对话、连续输入、host、save、Little Valley 世界互动和队列输入。
- 文档引用守卫通过。`game-skill-audit game-simlife` 无红旗、棘轮通过，但有既有黄项：它静态看不到共享 Life Host 内的 capability 消费，因此报“零能力接入”。该项不是 runtime 缺陷，但应在后续改善审计可观测性。
- 撤修验红：临时禁用 `parseHostInput()` 的 `assetSlots.game !== descriptor.slug` 唯一身份守卫，点名测试 `rejects every authoring boundary before mutating the mount container` 精确失败；恢复后 `life-game-host.test.ts` 9/9 通过，撤修标记为零。

## 复查后的边界

- 通过：作为共享、数据驱动 Life runtime 的基础契约。
- 未通过/未声称：实际素材库检索与 AI 素材生产、复杂多线剧情生成、第二款生成游戏、通用桌面发行。
