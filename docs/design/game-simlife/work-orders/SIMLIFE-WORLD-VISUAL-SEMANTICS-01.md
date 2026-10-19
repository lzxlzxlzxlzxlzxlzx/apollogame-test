# SIMLIFE-WORLD-VISUAL-SEMANTICS-01｜世界视觉语义与素材覆盖硬门

> 当前施工依据。Owner 已选择 A：共享 Life 引擎/生成合同下沉；不得以魔王城私有补丁替代。

施工主体：BDM程序
状态：**完成；施工自检 PASS，非施工人独立复查 PASS（Blocker/Major/Minor 均为 0）。**

## 目标合同

### Warp landmark

- 每条新候选 warp 必须引用同 scene 的一个可见 placement 作为门、阶梯或传送阵地标。
- 地标必须有 `art:` skinKey、面向玩家的目的地文案，并与 warp 格满足可审计的覆盖或邻接关系。
- 共享 renderer 的 generic exit marker 只作 legacy/error fallback；新 Generation Bundle 与迁移后的试点不得依赖 fallback 过门。
- 传送仍只由显式 `life.warp` 请求触发；同格反向 warp 不自动反弹，并允许 E/鼠标立即返回。

### Action surface

- 作者必须显式描述玩家可辨的 surface visual，不得让 zone/terrain tag 暗中决定表现。
- 至少覆盖：普通不可耕地、可耕荒地、已翻干土、已浇湿土、播种、生长、成熟作物。
- 每个状态必须引用 `art:` 消费 key 或可审计的同一 approved slot；只有行动集合等价时才允许同 key 复用。
- `plantable` 与普通不可耕地、`tilled` 与 `watered` 不得静默共用 visual key。
- 这些字段只供 authoring/renderer；`LifeActivityContext` 仍是行动合法性的唯一来源，视觉元数据不得进入 snapshot/hash/save。

## 机器门

- strict validator/compiler/Generation Bundle/asset-slot closure 路径级拒绝：缺地标、跨 scene/不可见/无 skin 地标、空间关系不成立、缺目的地文案，以及互动地表缺 surface visual/槽位或非法共享 visual key。
- Brief/prompt packets/SOP/authoring skill 将 world visual semantics 列为 World/Assets 必填。
- World review 增加 `warp → landmark → destination` 与 `surface → actions → asset slot` 矩阵；Assets review 显示地图落点、尺寸、锚点、候选状态。

## 试点与素材边界

- Demon Castle：森林门、地下阶梯、全部回程入口绑定真实 landmark；庭院农务区声明可区分 surface slots。
- Little Valley：至少完成 candidate/validator migration，不保留新候选绕过基线。
- 现有 approved 素材只有严格匹配 slot 才能记 `local-review`；否则只产带尺寸、锚点、描述、位置与来源策略的 pending 候选，不调用模型、不写正式 index/ledger/assets。
- Demon 正式四文件只做 candidate 与 `life-materialize --plan-update`；素材人审未通过时禁止 `--update`。

## 验收证据

- 点名测试覆盖：撤 warp-landmark、删除湿土 visual、让 plantable 与不可耕 terrain 静默同 key。
- 相关 schema/compiler/bundle/renderer/asset-slot/host/navigation/farming 回归全绿。
- 施工自检包含 review artifact、候选清单、唯一锚点撤修验红与 warning 裁决。
- 非施工人完成独立复跑、撤修验红、实证复现和 warning 阅读。

## 施工证据

- 自检：`../self-check/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md`
- 世界矩阵：`../world-visual-semantics-review.md`
- 独立复查：`../review/SIMLIFE-WORLD-VISUAL-SEMANTICS-01.md`
