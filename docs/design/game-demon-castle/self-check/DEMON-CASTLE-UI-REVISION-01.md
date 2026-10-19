# DEMON-CASTLE-UI-REVISION-01｜原型施工自检

历史版本说明（2026-10-16）：本证据的69项/19图及旧批准只绑定279f063f…1955版，完整HTML已保存为[旧定稿快照](../demon-castle-ui-revision-01.approved-2026-10-15.dc.html)，本自检探针仅重定向读取此快照、逻辑未改。同名当前入口已进入02待审候选，不能复用本单绿灯；新自检另列。

施工：BDM程序，2026-10-15。结论：原型与自证完成；Owner 在程序会话明确回复 **“挺好的，可以定稿”**，另在策划会话回复 **“原型通过、图标候选通过”**，已分别记录 [判词来源及定稿版本](../prototype-approval.md)。独立复查不由施工人自签。

## 范围与基线

只新增 `demon-castle-ui-revision-01.dc.html` 和设计目录证据，更新本游戏当前需求/候选说明与合法路线图。共享 Host/runtime、src/ui、正式游戏 JSON、素材索引、候选素材、流程板和人门均未因本单修改。

已读当前 AGENTS、llm-onboarding、playbooks/index、game-production、game-requests、UI playbook、assets/testing/self-check/review-gates，以及 prototype-approval、旧 demo、life-hud 与路线图。判断接受原型修订；现有 Panel.skin、Button.icon、Badge.icon、Image 可作为后续闭集映射，当前不写正式接线或申请新能力。

原稿 `demon-castle-ui-demo.html` 保留，SHA-256 `084b97b51efcded864dadb835ff895d2263560edf7a0809ff7ae255ef7de827d`；修订候选 SHA-256 `279f063ff3887860114909eb9202a4890dce56ced36643f75fe35e39f9a11955`。开工前已真渲染并目击旧稿，截图 `00-before-1440.png`。旧稿中地图 background 声明含无效 linear-gradient(ellipse...)，新候选使用合法渐变与相同已有参考图。

## 六项逐条对齐

| 目标 | 结果 | 目击证据 |
|---|---|---|
| 羊皮纸追踪卡：徽记、标题、下一目标、长文 | ✅ 默认标题22px/正文16px；长文自然换行，无省略或裁切 | 01、03、07 |
| 居中连续世界状态，最小56px | ✅ 主视口104px，760px宽时92px；地点24px、时钟25px；季节/天数独立文本 | 01、14 系列 |
| 三枚 pill 只显示图标+动态数字 | ✅ 3 个 output；无常驻属性名称；tooltip/aria 提供解释，控制台可改变数值 | 01、05 |
| 三个独立 J/I/C，图标上/键徽下，hover/pressed/disabled | ✅ 60px 圆形图标面+键徽；真实鼠标反馈及固定展示态可操作 | 11、12、13 |
| 同一套右侧羊皮纸骨架，任务/背包/档案、空态与长内容 | ✅ 一个 aside 切换内容，追踪/选择详情/分类/空态返回可见；24任务/60格/28档案长内容可滚 | 02、04、05、06、08、09、10 |
| 地图保持可见，无常驻底部快捷栏，文字不烤图 | ✅ 无全屏 scrim；J/I/C/关闭/Escape 真点击；所有准确中文、数字与快捷键为 DOM；左下仅折叠的评审控制台 | 全序列 |

资源和入口图标为内联 SVG **占位**，没有使用未审批的资源/属性图集或图标候选。参考图只沿用旧原型已在用的地图与空白框皮；演示数字不进入 World，也不代表三项真实资源已存在。

## 实际验证

```powershell
node docs/design/game-demon-castle/self-check/DEMON-CASTLE-UI-REVISION-01.probe.mjs
```

最终 exit 0：**69 checks PASS**，19 张本轮截图；无 pageerror、无失败本地资源请求。量测见 [measurements](DEMON-CASTLE-UI-REVISION-01.measurements.json)。

- 主验 1440×900，另验 1920×1080、1060×760、760×900；stage 等于真实视口，状态丝带中心偏差 <2px，三个主要 HUD 组无非意图重叠或越界。
- 三类入口/互斥侧栏、关闭/重开/Escape、追踪 HUD 更新、背包详情选择、已完成任务空态返回、各面板空态返回、滚动、动态资源/日期、禁用 C 均通过。
- 无头 Edge 使用任务隔离 profile，只访问 file:// 本地 HTML；未启动任何服务或占用5173。每次（包括失败轮）由 finally 关闭；最终进程退出0。
- 声明调色代表值：任务深字/纸底 11.53:1、状态浅字/夜色代表底 14.10:1、资源字/实底13.17:1、侧栏深字/纸底11.53:1。状态背景是图片，代表色计算不能取代完整贴图像素或最终素材的对比验收；截图已人工目击。
- 原型为 authoring HTML，不是 LayoutNode 运行树，不把它通过等同于共享 Host 的 S4/S5 或整游戏验收。
- `node --check` 探针语法与本单文档 `git diff --check` 均通过。全库 context-budget guard 仍 FAIL 于非本单的 playbooks/index.md 4953/4900 字符、game-production.md 109/100 行；本单未修改这些手册或放宽基线，当前魔王城 requests 已按模板收敛并保留历史归档。

## 演出与迭代

关键链：J 打开侧栏（200ms，右移22px→0并显现）→点追踪（DOM文字立即更新、任务卡320ms金边确认）→I换内容→选择物品（详情立即反馈）→C档案→关闭（立即）。三枚资源数字同时更新，260ms轻抬反馈；hover/press为120ms。reduced-motion 时关闭动画/过渡，状态变化保留。

第一轮探针61项，760px宽时把进场动画中间帧误当最终边界判失败；改为等待真实动画结束后量测。目击又修正了玩家标签换行及1060px视口侧栏与入口键徽的4px相交：侧栏安全顶距增至310px，并加入点名断言。最终69项全绿、19张截图重新生成。

## 玩家视角复核

任务目标与下一步在左上连续可读；追踪操作有立即文字与金边反馈；资源与日期变化有文字确认；地点/时令/时钟始终可见。J/I/C 有键徽、hover名称和 aria 名称，空态有明确返回按钮。所有数据明确属于月影城主的当前演示状态；没有上一局残留或正式规则声称。长内容有独立滚动区和“向下滚动查看更多”提示。

这是界面原型，不评判完整游戏是否好玩；本轮互动反馈无必须干等窗口。地图始终留有可见区域，参考场景与角色只承担构图定位，不作为最终美术通过证据。

## Owner 复核门

入口：[六步复核说明](../ui-revision-01-owner-review.md)。Owner 已于 2026-10-15 在程序会话回复“挺好的，可以定稿”，策划会话另有“原型通过、图标候选通过”；两处直接用户消息均已核对，不能互换来源。原型 hash 未变。本原型可作为后续正式 Host/runtime 工单基准；具体图标授权只按策划会话展示的候选处理，不通过本单替代其他素材批准、旧存档迁移或 Playtest 人门。

路线图已通过合法保存入口更新并重读：`demon-castle-ui-revision-01=review`、selfCheck=pass、review=pending、owner=required；没有提交 done 或调用 Owner decision。
