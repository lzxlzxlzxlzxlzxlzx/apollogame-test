# R1 全量复原数据交接 v1.0

日期：2026-09-15。用途：给R2程序Agent直接读取旧版事实、生成新版装配草案。不是运行时平衡表，也不是把旧Unity行为原样批准为新版规则。

## 1. 已完成的R1事实库

| 工件 | 用途 | 覆盖 |
|---|---|---:|
| [原版单位事实库](inventory/units.json) | 旧单位属性、参数、实现绑定、源码出处、精灵引用 | 84/84 |
| [R2单位复原卡](r1-unit-cards-v1.json) | 按旧ID合并事实索引、技能装配建议、决策、素材路径与风险 | 84/84 |
| [全量复原矩阵](full-restoration-matrix.json) | 每单位事实完整度、冲突、素材和R2—S6状态 | 84/84 |
| [单位玩法描述](unit-gameplay-descriptions.md) | 新版应保留的玩家可观察技能和行为 | 84/84 |
| [技能装配建议](unit-skill-loadouts-v0.1.md) | 旧行为到共享技能模板的初步映射 | 84/84 |
| [机制档案](inventory/mechanism-profiles.json) | 旧能力类、参数读取、时序与副作用证据 | 48类 |
| [素材库](inventory/assets.json) | 图片、VFX、音频等资源的路径、GUID及单位引用 | 2142项 |

`r1-unit-cards-v1.json` 是R2的入口数据；它的 `legacyUnitIndex` 精确连接到 `units.json` 同索引项。旧版事实库和复原矩阵是R2唯一允许读取的“旧版数值源”。不得从Unity脚本散落常量、截图或记忆中再引入未登记的数值。

## 2. 程序读取合同

对每个 `monsterId`：

| 新版需要的事实 | `units.json`字段 | 处理规则 |
|---|---|---|
| 名称与旧ID | `displayName`、`monsterId` | 新版保留旧ID作为溯源ID；运行时可另有简短ID |
| 旧价格、生命、攻击、护甲、移速、射程、间隔、半径 | `effectiveAttributes` | 这是已记录的旧版静态有效值；必须先做单位换算，不可直接放进新版世界 |
| 属性来源冲突 | `attributeOverrides`、`sourceSO`、`sourceConfigEntry` | 存在冲突时，新版表记录旧有效值和冲突详情；不得静默挑另一项 |
| 旧能力结构 | `resolvedAbility`、`declaredAbilityType`、`bindingRoute` | 仅用于溯源和映射，不得把旧能力类名当成新版系统名 |
| 旧技能参数 | `abilityParams`、`firstWinsParams`、`requestedParams`、`missingParams` | `firstWinsParams`表示旧实现的首值覆盖结果；只有同时确认被旧能力读取时才可作为数值候选 |
| 旧行为证据 | `oldDesignSection`、`oldDesignMentions` | 详细原文优先；只有总表提及时，行为须标为“待策划补述” |
| 旧移动/攻击分类 | `moveType`、`attackType`、`tags`、`declaredOnHitEffects` | 映射为新版标签与目标资格；不等于新版最终AI |
| 单位主体图 | `sprites.idleSprite` | 84/84存在，是S6身份表现候选 |
| 攻击/死亡图 | `sprites.attackSprite`、`sprites.deadSprite` | 攻击图只有单姿态候选，不能当作完整动作；死亡图84/84缺失 |

## 3. 新旧数据隔离

R2创建的新版内容目录必须保存三层字段：

```text
source      = { legacyId, legacyFactsRef, legacyAssetRefs }
adoption    = { status, approvedBy, rationale, unresolvedIds }
gameplay    = { new unit definition, loadouts, decision profile, presentation slots }
```

- `source` 只读，完整保留旧证据引用。
- `adoption` 说明每项旧值是保留、换算、重建或待裁定。
- `gameplay` 才是引擎实际消费的新版数值和装配。

旧版像素距离、像素速度和旧帧率不得直接混进 `gameplay`。每个换算必须集中使用一份新版单位比例和时间比例表，并可由测试复算。

## 4. 已知事实风险，程序不得自行猜值

- 38个单位存在SO与JSON属性覆盖差异，详见各单位 `attributeOverrides`。
- 7个单位有旧能力请求但无可用参数：珊瑚傀儡、珊瑚巨像、深海术士、炽燃狂战士、炽燃亡魂、苦力怕、米诺菇。
- 20个单位有56项“旧配置存在但旧能力未直接读取”的参数候选；这些只能作为设计参考。
- 58个单位有旧设计详细章节，26个只有旧设计总表提及。
- 6个单位没有旧攻击图；全部84个单位没有旧死亡图；现有78张攻击图都是单姿态候选，不是连续动作。
- 一个旧VFX资源 `lava_circle` 缺失；不得在新版配置中假定其存在。

## 5. R2施工顺序

1. 读取矩阵中 `r2Definition=pending` 的单位，按旧ID创建新版定义草案。
2. 用单位玩法描述和技能装配建议确定技能模板；无法映射的旧能力按机制族登记，不创建单位专属解释器。
3. 写入旧属性的换算结果和 `adoption` 理由；有冲突/缺参的项保持 `pending-design`。
4. 为每个技能填 PresentationProfile 槽，但素材状态只引用矩阵，不能将占位标为绑定完成。
5. 运行引用检查，更新矩阵对应的 `r2Definition`、`r2Loadout` 状态。
6. 进入R3前，为每个单位写一项身份验收场景；基础模板单位可共用机制场景但必须有本单位装配断言。

## 6. R1完成判据

- 84个单位均有旧ID、名称、旧静态属性、能力类、至少一个行为证据入口和主体素材状态。
- 每个冲突、缺参、未消费参数和空素材槽均以机读字段保留。
- 新版尚未批准的值明确处于 `pending`，没有伪造“已复原”状态。
- 程序可以通过 `monsterId` 直接定位旧事实、行为说明、映射建议和表现资源。

## 7. 给程序的直接指令

> R2从 `docs/design/game-mcfight/r1-unit-cards-v1.json` 遍历84张单位卡，再用卡上的 `legacyUnitIndex` 读取 `inventory/units.json` 原始事实。进度写回 `full-restoration-matrix.json`。新版运行数据另建目录并保留 source/adoption/gameplay 三层。不得直接导入旧像素数值、旧能力类或单姿态素材作为新版运行行为。遇到 `missingParams`、`attributeOverrides` 或未消费参数时，把该字段保持待裁定并报告，不要用单位专属代码填补。
