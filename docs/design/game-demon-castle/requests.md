# game-demon-castle 当前需求与施工入口

## 1. 当前结论

- 当前阶段：UI修订02原型已重新定稿且[独立PASS](review/DEMON-CASTLE-UI-REVISION-02.md)；正式Host已接三主要视觉目标和OwnerA日历配置。
- 当前出口：[HUD独立复查](review/DEMON-CASTLE-UI-RUNTIME-02-independent.md)三核心局部PASS/整单CONCERNS，395真浏览器/792独立范围测试及六审计绿；日历/旧档兼容亦独立局部PASS。[当前差异单](self-check/DEMON-CASTLE-UI-RUNTIME-02-alignment.md)保留按钮反馈及两属性素材红项，人工64/64压力不作游戏挡板。
- 最近Owner判词：本程序会话“挺好的，可以定稿”；[版本、范围及历史来源](prototype-approval.md)。

## 2. 当前有效约束

- 新目标：丝带中文同字体单行，已批准三入口PNG无外圆框/盘；两项语义资源在左、J/I/C在右共一row，窄屏缩小/横滚不内部堆叠；左上追踪与统一右侧侧栏保留，第三资源不渲染。
- 准确中文、任务、数值、快捷键均为 DOM 文本；矢量图标明确标注为占位。
- 本单按已批准原型接共享 Host，只消费资产员登记的素材；不改规则、存档、hash、素材索引或审批。
- 同名HTML当前是02批准版，原页面候选提示保留以维持批准hash；[旧批准快照](demon-castle-ui-revision-01.approved-2026-10-15.dc.html)不变。原型定稿不等于素材、正式Host或控制台人门批准。

## 3. 当前活动工单

### DEMON-CASTLE-UI-RUNTIME-01

- 施工主体：BDM程序；状态：active（三核心及日历各局部闭环；精确反馈/素材未收束）。Life Host六文件及直接测试/import已释放写锁给引擎程序，当前迁移到assembly期间本程序不改源码/导入或运行旧路径探针。
- 目标、验收与允许/禁止边界：[正式接入施工单](work-orders/DEMON-CASTLE-UI-RUNTIME-01.md)。
- 前置：[原型结论与证据](work-orders/DEMON-CASTLE-UI-REVISION-01.md)；独立复查不由施工人自签。
- [新批自证与未决差异](self-check/DEMON-CASTLE-UI-RUNTIME-02-alignment.md)；[日历独立复查](review/DEMON-CASTLE-UI-RUNTIME-02-calendar-independent.md)；旧批实证保留在旧review中，不套新目标。

## 4. 阻塞与待 Owner 裁决

- 新版原型已获Owner直接确认与独立PASS，不重复索取同版批准；当前Host仍需独立局部/整单分别验收。
- 正式中文日历显示合同已按Owner选A完成：[裁决与范围](work-orders/DEMON-CASTLE-UI-RUNTIME-02-calendar-decision.md)。严格可选映射、旧档兼容和受控正式Host更新均已实证；不改稳定ID/World/存档格式/persistent hash。无框按钮已有能力可组合，不为去圆框另扩PUI。

- Owner 已选“图标按钮 A；资源 A”（策划会话真实 `A，资源选 A`）。[PUI合同独立PASS](review/REQ-SIMLIFE-PUI-ICON-BUTTON-01-independent.md)已交付；新版Host命中盒60/50px、实际PNG52/42px，不再等待此项Owner裁决或PUI施工。
- 输入 A 已施工并获[局部独立PASS](review/DEMON-CASTLE-UI-RUNTIME-01-keyboard-independent.md)，独立浏览器181项绿；[裁决与边界](work-orders/DEMON-CASTLE-UI-RUNTIME-01.md#新增键盘冲突owner-已选择-a)。两属性专属图仍placeholder，不能用金币/月晶/月叶冒绑；交策划/资产线。
- 精确四态外观已独立核证不一致，Owner已选A：[通用PUI固定单](work-orders/REQ-SIMLIFE-PUI-ICON-FEEDBACK-01.md)，PUI已领锁in-progress；交付后BDM只消费数据。64/64仅人工压力，已撤回改布局提问，[范围澄清](work-orders/DEMON-CASTLE-UI-RUNTIME-02-feedback-decision.md)。不改定稿/PUI，控制台Owner人门独立。
- 共享 Host Playtest 仍待 Owner：[Playtest](playtest.md)。
- 旧导航工单仍标 active，交策划核对实际状态；本单不据此修改运行时。见历史记录。

## 5. 证据索引

| 主题 | 权威文件 |
|---|---|
| 现有能力 | [能力计划](capability-plan.md) |
| 原型与历史判词 | [定稿记录](prototype-approval.md) |
| 当前原型施工 | [DEMON-CASTLE-UI-REVISION-02](work-orders/DEMON-CASTLE-UI-REVISION-02.md) |
| 项目状态 | [项目路线图](../../projects/simlife-engine/project-roadmap.json) |

## 6. 归档入口

- [历史施工记录](archive/requests-before-ui-revision-2026-10-15.md)：旧需求、已完成的 Playtest 前置修复及其实证；历史权限不作为当前依据。
