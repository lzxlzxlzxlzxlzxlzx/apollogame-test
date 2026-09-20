# MC Fight 全量内容盘点

**本目录是技术与资源参考附件。策划讨论请优先阅读[84种单位的技能与战斗逻辑](C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/unit-gameplay-descriptions.md)，该文件按单位以文字描述玩法。新实现不受本目录的旧代码结构约束。**

日期：2026-09-11。归属S1设计资料，供重建规则、数据结构与S2验证选样使用。

**已完成84种单位的静态内容盘点。** 同时保留旧设计意图、当前配置、代码实现和素材接线；没有运行Unity逐单位战斗验收，也没有将原版数值自动批准为新版规则。

## 覆盖结果

| 项目 | 本次结果 |
|---|---|
| 单位SO / JSON条目 | 84 / 84，ID集合一一对应 |
| 商店可见 / 价格隐藏 | 78 / 6 |
| 初始飞行 / 远程属性 | 10 / 28，变身与子技能对空另记 |
| 自定义技能绑定单位 | 48；其余36走通用回退 |
| 技能实现类 | 48，包括47个已绑定类和1个未绑定NullAbility；不是48项独立技能 |
| 有SO→JSON数值覆盖差异 | 38种单位 |
| 缺少代码请求参数 | 7种单位，30个键 |
| 绑定技能未读取的参数候选 | 20种单位，共56个键 |
| 重复参数键 | 2种单位、7个重复键名，当前值相同 |
| 单位精灵引用 | 162个非空引用均解析到存在文件；6个攻击槽、84个死亡槽为空 |
| 素材文件登记 | 2142个，含第三方包库存，不能理解为全部已接入 |
| 原设计关联 | 全84种均找到ID提及；58种关联详细章节，其他关联总表/召唤表 |

## 阅读入口

1. [单位全量档案](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/units.md>)：每个单位的属性、技能行为、参数、差异、素材及旧设计出处。
2. [共享规则](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/shared-rules.md>)：调度、索敌、移动、对空、护甲、状态、弹丸、范围与游戏流程。
3. [技能实现目录](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/mechanisms.md>)：47个已使用实现的子技能与决策行为，以及空实现占位。
4. [素材接线](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/assets.md>)：单位图、特效图集/切片、公共表现、音频和缺资源情况。
5. [标签目录](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/tags.md>)：所有单位标签与代码引用情况。
6. [差异与风险](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/issues.md>)：21项静态发现、具体缺参及新版需裁定的问题。
7. [迁移建议](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/migration-map.md>)：重建的机制分组、代表单位和策划下一步。

机读证据：units.json、ability-code-evidence.json、assets.json、vfx-bindings.json、tags.json、coverage.json、source-manifest.json。units.json保留完整技能参数列表和详细旧设计原文；重复参数未被丢弃。mechanism-profiles.json是人工整理的原版行为摘要。extract_inventory.py只读取Unity源文件、输出本目录资料，不是游戏逻辑或新版配置加载器。

## 边界与使用方式

- “缺参、未读取、未接线”是基于当前文件的事实；它们对战斗的最终影响属于静态推论，需程序复现。
- 当前JSON基础属性可作为参考输入，不能把Attack列直接当作所有技能最终伤害，也不能把AttackInterval当作所有技能CD。
- 旧MonsterDesign.md包含过期和未实现意图；本次完整保留关联原文，未宣称逐条设计意图都已在Unity实现。
- 所有84种单位的新版保留/调整/延后/删除与新数值仍待裁定。全量盘点不等于首发要一次实现全部单位。
- 本轮仅更新策划文档和证据数据。S1人门未代签，S2仍未通过，不改程序已有测试结果或正式战斗代码。

核对记录见verification.md。下一步策划根据此清单冻结共享战斗规则和首批代表单位技能合同；程序继续S2完整阶段、重复CD、真实俯冲及打断清理验证。
