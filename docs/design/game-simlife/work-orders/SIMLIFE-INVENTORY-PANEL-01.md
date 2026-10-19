# SIMLIFE-INVENTORY-PANEL-01｜共享 Life 背包面板

施工主体：**BDM程序**  
状态：**施工完成，待独立复查（2026-10-14）**

> Owner 已选择 A：把当前权威的 `itemCatalog + playerInventory` 下沉为通用共享 Life Host 能力，不为魔王城写私有 UI。

## 架构判断

接受。Life 已有物品目录、背包权威态、共享 presenter/input/HUD 与 LayoutNode 闭集；缺口是严格 opt-in descriptor、稳定只读投影和通用宿主 render-local 抽屉。实现应复用这些现有边界，不新增玩法 system、不改变掉落/容量/存档/确定性，也不触碰 `src/ui/**`。

## 范围

- `LifeHostDescriptor v1` 增加严格闭集的可选背包面板配置：默认关闭；启用时声明正整数且有上限的列数及闭集 HUD label key。未知字段、非法列数和原型链输入按 JSON path 拒绝。
- presenter 生成稳定只读 `inventoryItems`，每项至少含 `id/title/kind/count/skinKey`，按已编译 `itemCatalog` 稳定顺序与当前 inventory 合成；保留旧 inventory 摘要投影。
- 共享 Host 仅用现有 LayoutNode 渲染顶栏入口及右侧不透明、可关闭的 drawer/panel；显示物品、数量、空格/容量与 `skinKey` visual 槽，无正式图时使用通用占位。
- 输入通过既有 host/UI action 接缝：`I` 切换、Escape 关闭、鼠标入口可用。开关状态只在 render-local host state；不写 World、snapshot、network hash 或 save，不清理/重置方向键，不阻塞移动和 E。
- Demon Castle descriptor opt-in，显示已有初始资源；不修改玩法 JSON，不生成、审批、导入或登记任何素材。

## 非目标

- 任务全表、角色/装备属性、底栏快捷栏、拖拽整理、消耗或装备系统。
- 新增 `src/ui/**` 控件、自由 React/DOM/CSS、任意坐标/样式/文本模板。
- 素材生成、正式素材物化、玩法 JSON 或存档协议修改。

## 验收与测试锚点

1. descriptor parser/fixture：启用、默认兼容、unknown、非法列数和原型链拒绝。
2. presenter：title/kind/count/skinKey、空背包、catalog 顺序稳定，旧 inventory 摘要不变。
3. host 行为：I/Escape/点击；面板状态不写 world/save/hash；方向键+E+背包开关无卡键或停移。
4. LayoutNode `validateLayoutNode` 零 issue；深/亮主题的重叠、对比、透明度与布局审计通过，drawer 覆盖世界标注为 intentional。
5. Life package/Host/save 定向回归、tsc、点名 lint；共享树无关红项只留证据，不越界修复。
6. 自检至少完成一次带唯一断言锚点的撤修验红；完成后写 self-check 与 review 导航单，路线图只推进到 review。

## 开工阅读证据

主 agent 已完整阅读：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/playbooks/game-requests.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/assets.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/design/game-simlife/life-generation-sop.md`、`docs/design/game-simlife/life-json-authoring.md`，以及 `module-ui`、`module-assets`、`module-save`、`simlife-generation`、`check-ui` skills。本单命中 UI、资产消费、存档隔离、Life 生成/Host 与测试生产线。
