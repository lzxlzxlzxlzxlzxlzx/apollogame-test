# DEMON-CASTLE-UI-REVISION-01｜独立原型复查

历史导航说明（2026-10-16）：本报告判词与SHA只覆盖[2026-10-15批准版完整快照](../demon-castle-ui-revision-01.approved-2026-10-15.dc.html)。原同名入口现用于修订02，不能套用本报告；独立探针source导航已改读旧快照。以下原判词/hash保留。

Verdict：**PASS（仅本张 S1-P 原型修订单）**。复查时间：2026-10-15。施工：BDM程序；独立复查：`review_ui_prototype`，不是施工主体。

基准：[施工单](../work-orders/DEMON-CASTLE-UI-REVISION-01.md)六项验收与[原型批准快照](../demon-castle-ui-revision-01.approved-2026-10-15.dc.html)。复查前后 SHA-256 均为 `279f063ff3887860114909eb9202a4890dce56ced36643f75fe35e39f9a11955`。施工自检只用于导航，以下结果均独立重跑、重新采图及目击。

## 阅读与范围

完整阅读：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`game-flow-questions.md`、`review-gates.md`、`testing.md`、`self-check.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`assets.md`、`art-pipeline.md`；另读当前工单、自检、定稿记录、探针、原型和 simlife-engine 路线图对应里程碑。

判断接受：这是 authoring HTML 原型复查，不是正式 LayoutNode/S5 机器门。未调用 pipeline signoff、owner_decide 或素材批准。只改本复查证据并重跑截图；未改共享原型、runtime、`src/ui`、资产或正式游戏 JSON。全局 `git diff --stat` 有大量并发改动，不能把它们归入本原型工单或声称已全面复查；本结论绑定上述精确原型 hash。

## 独立实跑

```powershell
node docs/design/game-demon-castle/self-check/DEMON-CASTLE-UI-REVISION-01.probe.mjs
node docs/design/game-demon-castle/review/DEMON-CASTLE-UI-REVISION-01.independent.probe.mjs
```

两条最终均 **exit 0**。第一条独立重跑 **69 checks PASS、19 张截图**，`pageerror=[]`、`failedRequests=[]`；量测重新落在[measurements](../self-check/DEMON-CASTLE-UI-REVISION-01.measurements.json)。第二条完成 3 个带唯一锚点断言的撤修案例，并补拍 5 张[独立截图](DEMON-CASTLE-UI-REVISION-01-shots/)。浏览器访问 `file:///C:/Users/24652/Desktop/projects/games/ApolloGame-complete/ApolloGame-claude-mainbranch/docs/design/game-demon-castle/demon-castle-ui-revision-01.dc.html` 及测试临时副本；未启动系统或占用 5173。

初次默认沙箱运行在 Edge 启动期 exit 1，尚未访问原型；日志是命名管道/临时 SiteList 权限错误，随后浏览器进程 exit 0 且临时目录清理。经工具沙箱升级重跑成功；成功两轮均 `await browser.close()`，撤修副本在 `finally` 清理。未把启动权限问题解释成原型缺陷，也未忽略该错误。

## 六项验收核证

| 验收 | 独立证据及结论 |
|---|---|
| 追踪纸卡、徽记、下一目标、长文 | PASS。真点击第二项追踪后标题变为“温室的裂纹”；1440 与 1060/760 长文截图完整，正文无裁切。原型 `:11` 样式、`:95` 投影、`:99` 追踪。 |
| 连续居中世界状态且高度≥56px | PASS。1440/1920/1060 高104px，760宽高92px；几何中心偏差<2px。地点、季节、天数、时钟为独立 DOM 文本。原型 `:12`、`:17`、`:107-108`。 |
| 三枚图标+动态数字 pill | PASS。默认 `2,480 / 36 / 12`，真点资源变化后 `2,495 / 39 / 14`；名称只在 title/aria，无常驻标签。原型 `:13`、`:52-55`、`:107`。 |
| 独立 J/I/C 与四态 | PASS。目击默认、hover、pressed、disabled 截图；真实 hover/press 位移分别 -3px/+3px；禁用 C 的键盘输入不打开面板。原型 `:14`、`:59-61`、`:97`、`:106`。 |
| 同骨架三侧栏、互斥、关闭、空态、长内容 | PASS。真点 J→追踪→I→选择影矿→C；一个 aside 切内容。×与Escape、已完成空态返回、三类空态返回、24任务/60背包格/28档案长内容滚动均实际核证。原型 `:66-71`、`:96-103`。 |
| 地图可见、无常驻底栏、精确信息不烤图 | PASS。侧栏保持右侧，world 的左侧可见点实测仍命中 world；精确文字/数值/快捷键为文本，左下是明确注明的原型评审工具。原型 `:36-42`、`:76-83`。 |

已逐张目击本轮主视口默认、任务/背包/档案、任务空态、任务/背包长内容、任务长文、hover/press/disabled、1060/760 默认，以及独立补拍的 1060 侧栏和 760 长文/侧栏。1060 入口组 bottom=290px、侧栏 top=310px，安全间距20px；760 长文保持完整，侧栏内正文独立滚动。

声明色代表对比值复算：纸卡/侧栏11.53:1，丝带代表底14.10:1，资源13.17:1；截图目击清楚。丝带采用贴图，上述代表值不等于全贴图逐像素或最终素材验收，本结论不将其冒充正式 `/check-ui`。

## 撤修验红

隔离方式：脚本在系统临时目录创建测试副本，仅重写副本的引用地址和点名锚点；共享原型始终未修改。每个锚点先断言恰好命中1处；先验证正常副本绿，再确认同一行为断言在破坏副本红。

| 撤掉哪处修复 | 实际变红证据 |
|---|---|
| 原型 `:20`，1320断点 top310→286 | 正常 bottom290≤top310；撤修为 bottom290>top286，重现4px入口覆盖，`1060: sidebar does not cover entry keys` 断言失败。 |
| 原型 `:99`，追踪 `i%3`→写死0 | 点击第二任务后仍显示“点亮王座厅”，预期“温室的裂纹”的断言失败。 |
| 原型 `:97`，移除 `if(trigger.disabled)return;` | 禁用 C 后键盘仍能打开，`sidebarHidden=false`，应为 true 的断言失败。 |

三条破坏均被捕获，测试退出0代表撤修检测成功，不代表破坏版通过。副本与临时浏览器均已清理。

## 结论边界与控制台

未发现需打回的本单缺陷。原型中的资源/入口图标为明确标注的 SVG 占位，未引用新图标候选目录；现有参考皮肤/地图/人物只承担 authoring 目标。演示第三资源、档案值不是正式规则或账本。

已核对[定稿记录](../prototype-approval.md)分别记载程序会话“挺好的，可以定稿”与策划会话“原型通过、图标候选通过”，不再沿用旧导航里的 pending 字样。本复查不重批素材、也不把聊天判词代写控制台 Owner 人门。

路线图读取时 `demon-castle-ui-revision-01` 为 `review`、selfCheck=pass、review=pending、owner=required。本复查证据已落盘；路线图同步由主程序通过合法保存入口处理，本复查人未写控制台或人门。PASS 仅覆盖本原型修订单，正式 Host/runtime 的结构与视觉1:1、LayoutNode审计、素材闭包和Playtest仍分别验收。
