# SIMLIFE-ART-DIRECTION-02｜illustrated actor 地图占格比例校正

施工主体：BDM程序
状态：**已完成（独立复查 PASS，2026-10-13）**

> Owner 已明确要求：非像素三头身地图人物与小山谷 legacy 32×48 角色保持同等地图占格/比例。本单是已存 `LifeArtDirection` 能力的规格校正，不新增游戏私有逻辑。

## 范围

- 仅把 `life.illustrated-2d.v1` 的 `player` / `npc` 默认 display 从 `1.5×2 cell` 改为 `1×1.5 cell`。
- 保持 384×512 source、linear、transparent、bottom-center、contain 与零 offset 不变。
- 更新 player/npc 精确回归与必要文档，证明其等价于 legacy 32×48 / 32px 逻辑格占格。

## 验收

- player 与 npc 均精确派生 `{unit:'cell',width:1,height:1.5}`。
- legacy profile 仍精确派生 `{unit:'pixel',width:32,height:48}`，其完整 profile bytes/语义无漂移。
- renderer 以 32px 逻辑格投影 illustrated actor 为 32×48 display box，bottom-center / contain 不变。
- World、snapshot/hash/save、renderer 运动、正式游戏数据不变；包含撤修验红与独立 review 导航。

## 非目标

- 不调用图像模型，不生成、登记、批准或物化候选素材。
- 不修改 Demon Castle、Little Valley 游戏内容或正式素材。
- 不处理共享工作树其他项目错误。

## 施工结果（2026-10-13）

- `life.illustrated-2d.v1` 的 player/npc display 已精确校正为 `1×1.5 cell`；384×512 source、linear、transparent、bottom-center、contain、zero offset 均未变化。
- legacy player/npc 已以精确回归钉死为 32×48 source + 32×48 pixel display，未改任何 legacy default。
- renderer 回归证明 32px 格下 authored display box 为 32×48；384×512 source 在 contain 下实际绘制 32×42.666…，底边仍精确锚在 actor 脚点。
- 未修改逻辑格、World、snapshot/hash/save、运动系统或正式游戏数据；未调用模型、生成或物化素材。
- 施工自检见 [self-check](../self-check/SIMLIFE-ART-DIRECTION-02.md)，独立复查导航见 [review](../review/SIMLIFE-ART-DIRECTION-02.md)。
