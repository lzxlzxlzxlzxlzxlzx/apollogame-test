# SIMLIFE-ART-DIRECTION-01｜Life 非像素/高清美术方向合同与渲染消费硬门

施工主体：BDM程序
状态：**已完成（独立复查 PASS）**

> Owner 已裁定：地图仅保留方格逻辑；地块、角色、建筑与任务物可替换为精细非像素素材。本单只实现共享 authoring/asset/render formal-path 合同，不替换、生成或物化任何现有游戏素材。

## 严格边界

- Life Art Direction v1 是 authoring/asset brief 控制面数据，不进入 `LifeGamePackage`、World、snapshot/hash/save。
- 复用现有 AssetSlotBrief、LifeVisualCatalog 与 renderer；禁止第二套游戏专用 renderer、自由 CSS/URL/路径/密钥/二进制或任意 renderer code。
- 本地素材必须精确匹配 profile/style/spec；不匹配保持 `ai-required`。pending→approved、人审、来源与许可证门不变。
- formal catalog 中的 visual key 必须由显式 rule 消费；preview/placeholder 可 fail-soft，但不得静默按 legacy 像素比例消费正式高清素材。
- `life-standard-v1` 的 32px 逻辑格不因 source outputPx 改变。

## 验收

- 严格闭集 profile parser、稳定 prompt composition、冲突组合拒绝与 legacy 兼容均有测试。
- engine-owned pixel legacy / illustrated 2D 两个 profile fixture，规格集中且可验证。
- candidate planner 严格 style/spec 匹配，无精确本地命中则进入 AI 候选需求。
- catalog + renderer 证明 linear 高分 tile、bottom-center actor、placement display/anchor/fit 不走 legacy fallback。
- art direction/render metadata 不影响 Life compile blueprint、snapshot/hash/save。
- 施工自检包含唯一锚点撤修验红；独立复查由非施工人完成。

## 非目标

- 不调用外部模型，不生成候选图，不批准素材。
- 不修改或物化 Demon Castle/Little Valley 正式内容及已批准素材。
- 不改变地图 cellSize、viewport、行动合法性或模拟确定性。

## 施工结果（2026-10-13）

- 已新增严格闭集 `zerocraft.life-art-direction.v1`，提供 engine-owned `life.pixel-legacy.v1` / `life.illustrated-2d.v1` fixture、稳定 prompt 派生和逐 kind 精确规格校验。
- `AssetSlotManifest.artDirection` 保持可选以兼容 legacy；一旦启用，槽位 semanticPrompt、style、prompt、negative、outputPx、alpha、sampling、display、anchor、fit、offset 均须与 profile 一致。本地候选与 formal index 也必须精确匹配。
- formal shared Host 现在对 Life 实际引用的每个 visual key 强制存在 `LifeVisualCatalog` rule；renderer 在有 catalog 却缺 rule 时只走 semantic fallback，不能进入 legacy pixel-scale 分支。
- 高分 linear tile、bottom-center actor、building placement、Life package 隔离、snapshot/order/hash/persistent-save hash 均有真实回归；未调用模型、未生成/批准/物化任何素材，也未改动地图逻辑格。
- 施工证据见 [自检](../self-check/SIMLIFE-ART-DIRECTION-01.md)；独立复查导航见 [Review 单](../review/SIMLIFE-ART-DIRECTION-01.md)。
