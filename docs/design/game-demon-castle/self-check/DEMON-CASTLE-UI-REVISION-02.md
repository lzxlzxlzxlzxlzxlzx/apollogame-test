# DEMON-CASTLE-UI-REVISION-02｜原型自检与重新定稿入口

施工：BDM程序，2026-10-16。原型自证完成，Owner已在本程序会话明确“挺好的，可以定稿”，[版本与判词](../prototype-approval.md)。**不代表正式Host或控制台人门通过**。文件名仍沿用`demon-castle-ui-revision-01.dc.html`，页面候选02提示作为版本原文保留，不为改标签而改变已批准hash。

## 版本、阅读与边界

Owner原始新目标与本地锁见[施工单](../work-orders/DEMON-CASTLE-UI-REVISION-02.md)。本会话主程序已完整读AGENTS、onboarding、生产线索引、game-production/game-requests、UI playbook/ui、assets、testing/self-check/review-gates、数据驱动宣言；本轮重读实际原型、旧自检/探针/批准记录、UI相关合同和路线图。使用module-ui/check-ui/project-roadmap约束边界与实测，接受先原型后重新确认，不直接改运行时。

- 当前定稿SHA-256：`4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`。
- [旧定稿完整快照](../demon-castle-ui-revision-01.approved-2026-10-15.dc.html)SHA仍`279f063ff3887860114909eb9202a4890dce56ced36643f75fe35e39f9a11955`。通过apply_patch保存原文，重读hash一致；位于同目录，旧相对资源仍可运行。旧自检探针只重定向到此快照，旧批准不套给当前候选。
- 本单只改authoring HTML、设计/探针/审阅证据及合法路线图。没有改共享Host、src/ui、正式四文件、资产索引/审批、World/save/hash或pipeline。原型里的自由DOM/CSS不能复制到运行时。

## 逐项对齐

| # | 目标 | 结论 | 实证 |
|---|---|---|---|
| 1 | 已批准卷轴/背包/档案PNG，无圆框/圆盘，保留命中/键徽/反馈 | ✅ | 三准确本地PNG均loaded；button与face的computed背景透明、无背景图、border0/box-shadow none；hover上移3px、press下移3px，disabled不可打开C |
| 2 | 中文、同字体同字号、单行丝带 | ✅ | 精确初始`月影庭院 · 月相季·第5天 · 黎明`；四文本节点fontFamily/size/weight/lineHeight相同、y一致、边界在丝带内；下一日仍中文同排，不显示Eclipse/Dawn/时分 |
| 3 | 两语义资源在左、三入口在右，共一水平row | ✅ | 六视口资源右边≤入口左边，资源中心与图标面中心相同；row+nowrap。威仪30/盟约20、◆明确占位，不使用金币/月晶/月叶或第三资源 |
| 4 | 更窄屏明确降级，不堆叠或重叠 | ✅ | 760缩小，420/375将整排置于任务卡上方；内部始终左右同排。375长数字实际scrollWidth>clientWidth，真实横向wheel后scrollLeft>0；任务长文时侧栏让出真实高度 |
| 5 | 三侧栏及关键路径不丢 | ✅ | 真点击J→任务追踪反馈→I物品详情→C/关系页；关闭/Escape/互斥、空态返回、24任务/60格/28属性滚动、自然Tab/Enter/Space与焦点均覆盖 |
| 6 | 新视觉方向正式定稿 | ✅ | 2026-10-16本程序会话Owner直接判词“挺好的，可以定稿”，[定稿记录](../prototype-approval.md)绑定当前hash；正式Host保持原版本，不冒认控制台审批 |

## 真浏览器与截图

```powershell
node docs/design/game-demon-castle/self-check/DEMON-CASTLE-UI-REVISION-02.probe.mjs
```

最终 **152 checks / exit0**，pageerror=[]、failedRequests=[]，[measurements](DEMON-CASTLE-UI-REVISION-02.measurements.json)。6视口：1440×900、1920×1080、1060×760、760×900、420×900、375×812。24张截图，含旧批准版before、三侧栏、追踪、空态/滚动/按钮态、五个额外总览、375横滚/长任务/hover；实际均file://本地页面，任务隔离无头Edge，无服务/5173/用户资料/存档，finally主动关闭。

原型主视口[总览](shots/DEMON-CASTLE-UI-REVISION-02/01-overview-1440.png)，[760](shots/DEMON-CASTLE-UI-REVISION-02/14-overview-760.png)，[375](shots/DEMON-CASTLE-UI-REVISION-02/14-overview-375.png)，[375横滚](shots/DEMON-CASTLE-UI-REVISION-02/15-narrow-scroll.png)，[长任务](shots/DEMON-CASTLE-UI-REVISION-02/16-narrow-long.png)。已目击桌面/760/420/375；375原先近身提示与人物标签相碰，改为更低位置；更长任务的侧栏按任务卡实际高度让位，不靠截图隐藏长文。

375横滚区保留hover提示与焦点所需padding，实际提示边界未裁切；窄屏展开侧栏时隐藏评审工具/候选页脚，避免盖住侧栏底部，F2可临时打开评审控制台。两项真实F2断言通过。评审工具与F2只存在于authoring原型，不带进正式Host。

机械布局检查覆盖舞台/丝带居中、HUD互不重叠/越界、侧栏边界与键徽安全距、地图可见、图片加载。声明实底/代表调色对比≥4.5；丝带是纹理背景，这不是完整贴图像素自动对比通过。HTML原型不是LayoutNode树，不把它记为validateLayoutNode/ui-audit/S4/S5的正式绿灯。

## 三锚点撤修

同一探针用`LIFE_UI_PROTOTYPE_MUTATION`，只在系统任务临时目录复制HTML并加原目录base，不动原型/公共截图。每处先断言锚点恰中1次，失败时也关闭Edge并校验临时目录边界后清理：

- `entry-frame`：恢复圆盘与边框，实际exit1，点名`entry faces and buttons have no disk or border`红。
- `status-wrap`：文本span改block，实际exit1，点名`single Chinese status line`红。
- `hud-column`：资源/入口改column，实际exit1，点名`resource left and entry right on one row`红。

三种撤修在149项版本分别验红，恢复后149/149；随后补充375hover与F2两项防遮挡断言，冻结版本最终 **152/152 exit0**，24图重新生成。没有以锚点未命中的假绿或删除行为断言收束；最终hash的独立撤修与恢复由非施工者另验。

## 交付与下一闸

非施工者已对最终hash完成[独立PASS](../review/DEMON-CASTLE-UI-REVISION-02.md)：首轮与恢复均152/152、24图、三唯一锚点各实红，并目击六视口/375横滚hover长态；施工人不代签。新版Owner定稿已记录，正式Host后续接线单独见[RUNTIME修订02批次](DEMON-CASTLE-UI-RUNTIME-02-alignment.md)，本原型单本身没有修改Host。两属性图审美/来源审批与原型定稿分开，不自动生成/登记任何素材。

定稿收尾再次检查：`align-count`为6✅/0⚠/0❌，`node --check`与`docs-ref-guard`退出0。全库`context-budget-guard`退出1仍为原有`playbooks/index.md`4953>4900字符、`game-production.md`109>100行，本单未改二者/放宽预算；游戏当前需求单没有新增预算问题，不声称全库全绿。

原型施工截止时的历史消费端基线：`life-hud-overlay.ts`为`59e617af90079d6e12b98f6b908d09c176778e3d1484f8c2fa423b08dcf312e7`、`life-game-host.ts`为`cc13b7839beebc2f56d21015962a73f13abd110c0975907afdff8ff1b0700a01`、正式`life-host.json`为`e5151e1bbd0a4ef703cdc9baacf6c262a590959b379a915bfa2306ce8bd84677`。当时没有以新原型批准冒称Host更新；之后Owner日历A与正式HUD接线的实际新hash见上列RUNTIME修订02批次，不把本段历史基线误作当前文件hash。
