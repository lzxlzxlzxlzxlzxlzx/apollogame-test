# DEMON-CASTLE-UI-RUNTIME-02 · 正式 HUD 独立复查

复查人：review_ui_prototype（非本批施工者）  
日期：2026-10-16  
结论：**CONCERNS；三个核心布局目标局部 PASS，正式 UI 整单未通过。**

本结论绑定下列实际字节与本轮独立实跑，不采信施工者自报的 817 测试代替复跑。未修改生产源码、PUI、资产、正式 JSON、原型、存档、pipeline 或路线图；仅维护本报告及独立反馈探针。未代签 Owner、素材或控制台门。

## 阅读闸与架构判断

本会话已完整阅读 AGENTS、llm-onboarding、data-driven-manifesto、playbooks/index、game-production、game-requests、game-flow-questions、review-gates、testing、自证手册、ui 与 ui-playbook、资产/美术对应手册。本批另完整读取正式 RUNTIME-01 工单、RUNTIME-02-alignment、新原型批准记录、冻结 HUD/test、正式 fixture/probe、三锚点 sabotage config、定向 TS config，以及日历独立复查。check-ui 技能用于 LayoutNode 校验、真实包围盒与六深浅主题机械审计；不以它替代真实素材或原型 1:1。

判断：接受此次既有 LayoutNode 闭集重组与只读日历显示消费。无框入口、资源/入口横排、中文状态单行均可在既有消费端表达；精确反馈不能以游戏专属 CSS/DOM 绕过 PUI。Owner 已选通用 PUI A，并不等于该能力已交付。64/64 长名称是 schema 上限人工压力，不是魔王城当前真实文案，不新增 Owner 布局挡板。

## 字节范围

以下 SHA-256 由复查人实际重算；HUD 与 probe 在复跑后再次核对未变。

| 文件 | SHA-256 |
| --- | --- |
| src/engine/host/life-hud-overlay.ts | fed35b39c80edcaf2e12b8bc4440ccc4d918693724436dfa12558f192707b76b |
| src/engine/host/life-hud-overlay.test.ts | 39ef74970ca27bac41e5f52375714373f064513d0e8eb3bda452585f160c1244 |
| scripts/demon-castle-ui-runtime-02.probe.mjs | f901572b3120d64eb0f2d118d23b17418bb5aee6b6d31d9bb69663490ed62c2d |
| scripts/audits/demon-castle-ui-runtime-02.fixture.ts | 8e94eb01a9d19d806a482da143b0a5dd43e61ad8185202762736fbc81161ff92 |
| games/game-demon-castle/life-host.json | 8f47f2892086276b9309679682c676d8aa4d850830d88b1677271b134af0e7d1 |
| src/engine/host/life-game-host.ts | ee416cfe48b6437b13442355455d16c73618ee265617f7cbca67ea358637b283 |
| src/engine/host/life-save.ts | a4e0f9534a23c5d6cb31b87680c9a789b01845cb96e801f2859ca63592313957 |

Host 已包含日历/旧档适配后续修订，不能沿用初始 Host hash 声称整体未变。其旧档合同以 [calendar-independent](DEMON-CASTLE-UI-RUNTIME-02-calendar-independent.md) 的独立局部终态为准；本票验证正式画面消费，不重新代签该合同。批准原型为 4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415，不把 authoring HTML 当正式 UI。

## 独立复跑与撤修

1. `node scripts/demon-castle-ui-runtime-02.probe.mjs`：**395/395，exit 0**，独立 Edge，`http://127.0.0.1:61267/`，38 张截图。六视口为 1440×900、1920×1080、1060×760、760×900、420×900、375×812。重写的 [measurements](../self-check/DEMON-CASTLE-UI-RUNTIME-02.measurements.json) 地址即本次 61267，而非主程序历史端口。
2. 使用 `scripts/life-ui-runtime-02.sabotage.config.ts`，分别设置进程环境 `LIFE_UI_RUNTIME_SABOTAGE`，运行 `npx vitest run src/engine/host/life-hud-overlay.test.ts --config scripts/life-ui-runtime-02.sabotage.config.ts`。只在 Vite transform 内撤修，共享源文件从未改写；每次控制台均确认 **anchor hit exactly once**：

| 撤修 | exit | 实际结果 |
| --- | --- | --- |
| entry-frame：quiet/0 改 ghost/2 | 1 | 4 红 / 18 绿，四宽度无框断言失败 |
| status-line：首分隔符改换行 | 1 | 1 红 / 21 绿，单行精确文本断言失败 |
| hud-row：row 改 column | 1 | 4 红 / 18 绿，四宽度横排断言失败 |

3. 退出 transform 后普通配置独立复跑：`npx vitest run src/ui/components src/engine/host/life-hud-overlay.test.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-host.test.ts src/engine/host/life-calendar-presentation.test.ts src/engine/host/life-input-routing.test.ts src/authoring/life-host-descriptor.test.ts src/authoring/life-host-calendar-labels.test.ts`：**86 files / 792 tests，exit 0**。其中 overlay 恢复 **22/22**、Host 31/31。此数字是本票选择范围，不冒称全仓门禁。
4. `npx tsc -p scripts/tsconfig.life-ui-skin.json --noEmit`：exit 0。
5. 六次串行 `node tools/ui-audit.mjs scripts/audits/life-ui-runtime-<quest|inventory|profile>-<dark|light>.audit.ts --w 1440 --h 900`：全部 exit 0；各次 overlap、硬对比、3–4.5 警告、border-image 前提均 0。fixture 是明示的内存 mock 纹理，故仅证明相关数据布局/主题，不代替真实丝带 PNG 的像素验收。
6. `node scripts/docs-ref-guard.mjs`：exit 0（49 文档 / 403 路径）；单独扫描本报告亦 exit 0（1 文档 / 16 路径）。额外扩大扫描整个游戏 review 目录时 exit 1：历史 `REQ-SIMLIFE-CONSTRUCTION-01.md:59` 引用不存在的 life-relationship 测试路径；不改他人历史文件，不冒报扩大目录全绿。没有运行全库 scoped-gate，未把域外既有红项写成已解决。

## 实机与截图目击

已逐张目击六视口 overview，以及 375 hover/横滚/长追踪、任务/背包/档案侧栏、空任务、长背包、长状态、断入口图片、世界菜单截图。

- 三张批准入口 PNG 无独立外圆盘/外框；桌面外径 60、窄屏 50，内部图 52/42。键徽独立；原生 Tab、Enter、Space 和可见焦点有效；首次 body Tab 无需先 hover。故意中断 backpack 单纹理后恢复可见中文文字、键徽与打开能力，其他已加载图仍可见。
- 正式状态实际为 `月影庭院 · 月相季·第1天 · 黎明`，同一 Label/字体字号，六视口单行且留出月亮空间；不是照抄原型演示“第5天”。实际 T 后为夜晚，N 后第2天；不是新增一套 UI 日历。
- 威仪 30、盟约 20 位于入口左侧，同 row；未伪造第三个权威资源。375 长数字通过真实横向 wheel 滚动，未在 row 内竖向堆叠；375 名称气泡位于安全范围。长追踪增长后侧栏真实让位，探针验证至少 18px 间隔。
- 三侧栏互斥、关闭、Escape、空态和长内容滚动可用。实际移动→翻土→浇水→播种菜单链已走通；有菜单时 Tab/Enter 保持世界菜单优先，不打开 HUD。该断言等待真实 DOM/rAF 反馈，没有以“立即读 DOM”制造假红。
- 纯 HUD 交互、纹理中断等 hash 不变；世界行为沿正常 action 路径。fixture 长文/空态仅替换 read model，未写 World、StoragePort 或 Owner 存档。白底 fixture 图不等于正式世界背景丢失。

代表截图：[1440](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/overview-1440.png)、[760](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/overview-760.png)、[375](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/overview-375.png)、[横滚](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-scroll.png)、[hover](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-hover.png)、[长追踪](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-long.png)、[断图](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/missing-entry-icon.png)、[世界菜单](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02/world-menu-keyboard-priority.png)。

## 实证保留项：不能签整单

### 1. 精确四态外观未完成

独立运行 `node scripts/demon-castle-ui-runtime-02-boundary.probe.mjs`：端口 **54420**，exit 1，明确 3 条诊断红，pageErrors=[]；其中两条是实际按钮差异，一条是下节压力输入。独立修正并复跑 [feedback.probe](DEMON-CASTLE-UI-RUNTIME-02.feedback.probe.mjs)：端口 **56464**，exit 0，真实 read-model LayoutNode `props.disabled=true` 唯一锚点=1（不写源码），errors=[]。

| 状态 | 批准原型目标 | 独立 computed |
| --- | --- | --- |
| hover | Y -3px；brightness 1.2；drop-shadow 0 0 5px #d6b6ef | transform none；brightness 1.07；无 glow，boxShadow none |
| pressed | Y +3px；brightness .85 | matrix(1,0,0,1,0,1)，即 Y +1px；brightness .9 |
| disabled | opacity .48；图面 grayscale(.7)；无位移 | disabled=true；opacity .4；transform/filter none；图面 filter none |

该项是精确外观差异，**不是禁用语义失效**。不得用 DOM 裸 `el.disabled=true` 后 opacity=1 误报产品 bug。初版独立 feedback fixture 曾因缺 DOCTYPE/UTF-8 等待超时（session 99711，exit 1）；已修复测试页并实际复跑通过，不把该超时算 Host 缺陷。当前反馈脚本只输出诊断，不因 exit 0 宣称原型一致。Owner 已选通用 PUI A；本票不修改 PUI、不预判未来交付。

### 2. 两真实属性专属图仍缺

正式 HUD 与 profile 的 ◆ 是诚实占位，不是批准素材落地。三张 reserved resource 图本轮不冒绑为这两属性图。未补造素材批准、来源或许可。此项与按钮反馈共同阻止整单 1:1 收束。

### 人工压力备注，不新增游戏挡板

boundary 唯一锚点把 status-long 的季节和时段分别变成 64 个中文字符，在 375 宽度实得 font **8px**、lineHeight **11.2px**、width **285px**、height **56.015625px**；水平 inside=true，oneLine=false，约五行。[独立重跑测量](../self-check/DEMON-CASTLE-UI-RUNTIME-02-boundary.measurements.json) 与 [压力截图](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02-boundary/calendar-64-64-375.png) 可复现。

这是 schema 可接受极长名的通用投影边界，不能以普通 status-long 的通过宣称“所有合法长度单行”。但魔王城当前只用“月相季 / 黎明 / 夜晚”，默认六视口已单行通过；**不把人工压力改写成当前游戏真实需求、不要求 Owner 为此重新布局，也不悄改已批准原型。**

## 告警、清理与交接

实际读取测试 stdout：`reject calendar_reference` 属点名非法引用用例；`reject:partial-art-load` 属点名部分断图用例；键盘 decision 日志符合原生路由。正常 395 探针 errors=[]；边界 pageErrors=[]；六审计无额外警告。故意 abort 单图为预期回退测试，不当未知错误。

395、boundary、feedback 均记录 finally 浏览器/server/scratch 关闭清理；核对 61267、54420、56464 无监听，`.ui-audit-tmp` 不存在。所有本票执行 session 已结束，无常驻 Edge/局部服务；从未启动 5173 整套系统、未读写 Owner 浏览器资料或存档。

已核对 `simlife-engine` 路线图：runtime 项仍 active、selfCheck/review pending、owner required，符合整单未通过的事实。按本票独占写入范围，路线图由主程序接收此报告后同步真实证据；复查人不改 gate。结论仅为三个核心目标局部 PASS，**整单 CONCERNS，等待精确反馈与真实属性素材闭环及相应独立复查/Owner 人门。**
