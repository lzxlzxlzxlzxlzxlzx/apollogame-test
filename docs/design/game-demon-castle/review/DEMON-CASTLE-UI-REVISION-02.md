# DEMON-CASTLE-UI-REVISION-02｜独立原型复查

2026-10-16；施工：BDM程序；独立复查：`review_ui_prototype`。**PASS，仅修订02 authoring原型。** 当前同名入口 `demon-castle-ui-revision-01.dc.html` 的冻结SHA-256为 `4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`，独立复跑前后读取一致。

## 范围与版本

本会话已完整阅读AGENTS、onboarding、manifesto、生产线索引、game-production、game-requests、game-flow-questions、UI两手册、assets/art-pipeline、testing/self-check/review-gates。本轮完整读[新工单](../work-orders/DEMON-CASTLE-UI-REVISION-02.md)、[施工自检](../self-check/DEMON-CASTLE-UI-REVISION-02.md)、[Owner目击说明](../ui-revision-02-owner-review.md)、实际HTML及最终probe，核对批准记录与路线图。本次接受独立原型核证，不以HTML通过冒充LayoutNode或正式游戏UI门禁。

期间施工者补查375滚动容器裁hover风险，我暂停依赖候选的运行，待最终留白/F2版本冻结后才跑以下实证；未将早期 `0c5d…` 候选签成最终版。

只新增本复查证据、重跑现有只读浏览器探针；按授权将旧01独立probe的source与旧review主导航改指[批准版完整快照](../demon-castle-ui-revision-01.approved-2026-10-15.dc.html)，补历史说明。旧PASS、旧hash `279f063ff3887860114909eb9202a4890dce56ced36643f75fe35e39f9a11955` 均保留，快照字节重新核对一致。未修改新原型、正式Host、PUI、资产、正式JSON、pipeline或Owner gate，也未回退共享树变更。

## 独立实跑与三次撤修

```powershell
node docs/design/game-demon-castle/self-check/DEMON-CASTLE-UI-REVISION-02.probe.mjs
```

冻结版首轮 **152/152，exit0**。随后分别设置 `LIFE_UI_PROTOTYPE_MUTATION` 执行同一命令：

| 模式 | 唯一临时副本破坏 | 实际结果 |
|---|---|---|
| `entry-frame` | 无框face恢复圆盘/2px边框 | exit1，`1440x900: entry faces and buttons have no disk or border`失败 |
| `status-wrap` | `.status-line span`由inline改block | exit1，`1440x900: single Chinese status line`失败 |
| `hud-column` | 资源/入口row改column | exit1，`1440x900: resource left and entry right on one row`失败 |

三次日志均确认 `anchor hit exactly once; isolated copy only`。只在系统任务临时目录复制并变换HTML，截图也在临时目录；每次预期失败仍先输出浏览器关闭/副本清理，再返回实际非零码。没有修改共享原型，未以最后的“破坏稿不能成功”断言充当点名行为红灯。

每个工具进程的变换环境结束后，以普通命令再次完整执行，**恢复152/152，exit0**；重新采集24张图，`pageerror=[]`、`failedRequests=[]`，[measurements](../self-check/DEMON-CASTLE-UI-REVISION-02.measurements.json)为本复查恢复轮生成。全部浏览器仅访问本地file页面和任务临时副本，隔离Edge profile，未启动服务器/ZeroCraft、不占5173、不触及账号或存档。所有正常/预期失败轮均输出 `Prototype browser closed; isolated mutation scratch cleaned.`，临时目录在校验边界后finally清理。

## 逐项核证与目击

- 三入口精确引用已批准卷轴/背包/档案PNG，实际图片加载完成。button与face计算背景透明、无背景图、border0，face无box-shadow；无新增圆框或圆盘。真实hover/pressed分别上移/下移3px，disabled C不打开；原生Tab、焦点、Enter/Space、J/I/C和独立键徽均实际核证。
- 六视口精确初始文字均为 `月影庭院 · 月相季·第5天 · 黎明`，四个实际文字节点fontFamily/fontSize/fontWeight/lineHeight完全一致、y相同且整行在丝带内。下一日变为中文第6天及黎明，不出现英文季节/时段或墙钟。字号响应式缩小并保持单行，未靠隐藏文字通过。
- 魔王威仪30、工匠盟约20为左侧两个语义资源，三入口在右侧，资源与图标面中心同高；同一row/nowrap，六视口没有内部上下堆叠。◆明确占位，没有金币/月晶/月叶或第三资源冒绑。
- 1440×900、1920×1080、1060×760、760×900、420×900、375×812的舞台等于真实视口，HUD无非意图重叠/越界、丝带居中、侧栏在视口内且未盖键徽、地图仍有可见区域。760缩小，420/375的整条横排移到任务卡上方。
- 375宽以两条12位压力数值实际制造overflow，真实横向wheel使scrollLeft>0，内部不换行；该压力值只是UI夹具。正常375 hover名称实际opacity=1且完整位于rail内，目击未裁切。窄屏padding留足名称泡空间。
- 真点击J→追踪第二任务→I→选择影矿→C，分别得到HUD标题、物品详情和档案可见反馈；三类空态返回、已完成空态、24任务/60格/28档案滚动、×/Escape/互斥全部重走。
- 375长任务标题/正文完整，sidebar top按任务卡真实bottom+18让位；打开侧栏时authoring工具隐藏、不盖footer，F2仍能显露评审控件。该F2是原型工具，不据此添加正式游戏需求。

已逐张目击本轮六张总览，以及 `15-narrow-scroll.png`、`17-narrow-hover.png`、`16-narrow-long.png`：桌面与760新目标清楚，375横滚确实位移，hover中文完整，长卡与侧栏没有碰撞。三类侧栏/状态旅程由同次探针重截，未拿旧图冒充。

声明实底/代表色的对比计算≥4.5，正常轮无脚本/资源错误；丝带纹理的代表值不是全贴图逐像素对比证明。没有跑或宣称 `validateLayoutNode`、正式ui-audit或S4/S5机器门，因为这是authoring HTML。

## 判词边界

未发现本次原型范围需打回缺陷。最新[prototype-approval](../prototype-approval.md)已记录2026-10-16本程序会话直接用户消息“挺好的，可以定稿”，绑定上述最终4c39…hash；这与2026-10-15同文旧判词分开。本复查不以原型目标文字或旧批准代替新定稿，也不代操作控制台Owner门。页面仍保留“候选/待定稿”历史提示以保持获批字节，实际批准状态以记录为准。

本PASS只核新原型与交互目标。旧运行时复查仍是旧目标的历史证据，不代表新横排/无框/中文数据已经应用到Host；后续正式实现须遵守闭集合同、原型1:1及独立复查。两属性专属图、素材来源/许可和其他游戏阶段仍按各自工单验收。
