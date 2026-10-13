# GAL 当前需求与施工入口

> 本文件只保留当前控制面；历史施工单已归档于 [2026-10-12 快照](archive/requests-through-2026-10-12.md)。项目级状态以 [路线图](../../projects/galgame-generation-engine/project-roadmap.json) 为准，局部证据见 `review/`。

## 1. 当前结论

- 当前阶段：通用 GAL 引擎的 `media-and-final-skin` 仍为 active；创作产线并行推进。
- 当前出口：完成定稿 V2 的逐屏同画布视觉与演出对齐，独立复查后才申请 Owner 人门。
- 最近有效 Owner 判词：允许使用当前 demo 素材；设置能力选通用实现；1440×900 V2 顶栏可见“↻ 语音”按钮已确认。聊天判词不代替控制台人门。

## 2. 当前有效约束

- 产品边界：新 GAL 只替换人物、剧本、分支和已审核素材，不另写框架；demo 素材不等于发行许可。
- 输入/输出合同：剧情、Profile、存档、已读、回想和资源引用走现有闭集；历史最多 512 句，回滚跨分支可重新选择；单窗口是正式保证。
- 冻结原型/画布/时序：[V2 可运行原型](gal-ui-complete-v2.dc.html)，1440×900，改视觉或时序须先修原型并由 Owner 重确认。
- 禁止：GAL 不改 `src/ui/**`、不写自由 DOM/CSS/JS、不代签独立复查或 Owner 人门、不把局部 PASS 冒充完整 S5/S6。

## 3. 当前活动工单

### GAL-ART-01A · V2 demo 素材与 S5/S6 对齐

- 状态：active
- 施工主体：GAL 主程 `/root`；PUI 专属缺口另派，不由 GAL 越界施工。
- 目标：用现有素材和 LayoutNode 闭集，使主页、剧情/选项、4×3 存读档、四页设置、历史、回想/CG 和确认窗对齐 V2 深亮两主题。
- 验收判据：同画布逐屏/关键帧差异归零或有 Owner 裁决；UI 审计、真实交互、点名测试与独立撤修验红通过；S5 视觉和 S6 演出分别验收。
- 允许改动：`src/services/gal-ui/` 的 GAL 消费数据、点名测试、本票自证与差异单。
- 禁止改动：PUI 基座、素材索引、已冻结原型、其他游戏、禁用功能的真实能力状态。
- 证据：[S5 差异单](gal-art-01a-s5-diff.md)、`review/GAL-ART-01A-settings-controls-independent.md`、`review/GAL-ART-01A-slots-v2-independent.md`；两项局部 PASS 不代替完整 S5。

### GAL-UI-04B-1 · 文字逐字与画面设置闭环

- 状态：blocked
- 施工主体：PUI 负责通用接口；GAL 负责接口到位后的消费。
- 目标：逐字完成/立即显全通知绑定 StoryRef token；底纹独立透明度及画面设置拥有真实消费者。
- 验收判据：点击显全、自动/快进、回滚改选、读档已读判定；Profile 迁移、跨包隔离、深亮主题与失败回退；恢复默认只在全部消费者接通后启用。
- 允许改动：PUI 经裁决的闭集接口及 GAL Profile/UI 消费各归本域。
- 禁止改动：GAL 自建打字机或 DOM 特例、没有消费者却启用开关。
- 证据：[缺口实查与裁决](gal-ui-04b-settings-gap.md)、[历史票](archive/requests-through-2026-10-12.md)。

### GAL-PIPE-01 · 创作产线后继阶段

- 状态：active
- 施工主体：GAL 产线；写作项目适配待获得真实接口。
- 目标：审核可信存储/权限与并发边界、写作适配、素材人审、确定性装配、首作与发行。
- 验收判据：每阶段真实证据及独立复查；模型只能产候选，不能自批；P0–P4 草稿局部 PASS 不算完整产线。
- 允许改动：对应产线合同、验证器、测试及经授权的本地工程文件。
- 禁止改动：猜写作项目协议、跳过人审、写远程数据库或推送远程 Git。
- 证据：`review/GAL-PIPE-01A.md`、[P1 研究](creation-p1-spec-research.md)、[路线图](../../projects/galgame-generation-engine/project-roadmap.json)。

## 4. 阻塞与待 Owner 裁决

- 04B-1 等待 PUI 通用闭集接口；具体缺口与 A/B 代价见 [设置缺口单](gal-ui-04b-settings-gap.md)。既有 Owner “通用能力”判词不代表 PUI 接口已实现。
- `media-and-final-skin` 尚有 [S5 差异](gal-art-01a-s5-diff.md)，未到控制台 Owner 人门。

## 5. 证据索引

| 主题 | 权威文件 |
| --- | --- |
| 原型 | [V2](gal-ui-complete-v2.dc.html) |
| S5 视觉差异 | [差异单](gal-art-01a-s5-diff.md) |
| 设置局部复查 | `review/GAL-ART-01A-settings-controls-independent.md` |
| 存读档局部复查 | `review/GAL-ART-01A-slots-v2-independent.md` |
| 包/回滚/存档阶段 | `review/GAL-ENG-*.md` |
| 创作产线 P0–P4 | `review/GAL-PIPE-01A.md` |
| 项目状态 | [控制台路线图](../../projects/galgame-generation-engine/project-roadmap.json) |

## 6. 归档入口

- [旧需求与施工单全文](archive/requests-through-2026-10-12.md)仅供追溯，不作为当前施工授权；完成票的结论以各自独立复查报告为准。
