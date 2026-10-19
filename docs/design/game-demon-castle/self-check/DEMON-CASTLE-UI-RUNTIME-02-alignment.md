# RUNTIME-01 修订02批次｜真实Host自证与差异

2026-10-16，施工BDM程序。原型已重新定稿且[独立PASS](../review/DEMON-CASTLE-UI-REVISION-02.md)，日历A合同亦[独立局部PASS](../review/DEMON-CASTLE-UI-RUNTIME-02-calendar-independent.md)。正式HUD[独立复查](../review/DEMON-CASTLE-UI-RUNTIME-02-independent.md)终态为**三核心局部PASS / 整单CONCERNS**；另有[边界独立核证](../review/DEMON-CASTLE-UI-RUNTIME-02-boundary-independent.md)。本页不覆盖旧方向257项证据，**不宣称整单1:1或Owner Playtest通过**。

迁移协调：以上是`src/engine/host`批次的冻结实证。引擎程序现正将六个Life Host编排文件迁往`src/assembly/life-host`；本程序已释放六源码、直接测试、导入和probe锚点写锁，不再运行旧路径测试或改导入。只维护本页/当前需求/路线图的真实复查证据；迁移前PASS不得直接冒称迁移后已通过，旧hash不追改为新hash。未触PUI域。

## 阅读、判断与范围

主程序本会话已完整阅读AGENTS、onboarding、manifesto、生产线index、game-production/game-requests/game-flow-questions、UI两手册、assets/art-pipeline、testing/self-check/review-gates；本轮另实查pick-list、Life authoring约定、registry的t3-life-world/t2-life-calendar、Button catalog/types/render/validate与当前批准原型。使用module-ui/check-ui/project-roadmap；缺口遵守ask-owner，未越界src/ui。旧档兼容返修前另完整阅读module-save及save-platform。日历A的[原文/授权](../work-orders/DEMON-CASTLE-UI-RUNTIME-02-calendar-decision.md)单独记录，不以原型批准泛化授权。

接受：三视觉目标用现有闭集重组；日历名称真正缺authoring字段，Owner明确A后才新增共享可选数据。合同子施工负责strict schema/discovery，主程序负责只读投影/HUD/受控物化，非施工者独立复查不由施工者代签。无World规则/stable ID/save/hash/PUI/资产索引/审批变化；无远程Git/DB或全系统启动。

## 逐项对齐

| # | 新目标/边界 | 结论 | 实证或去向 |
|---|---|---|---|
| 1 | 以获批修订02而非旧版为目标 | ✅ | 原型SHA`4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`；真实Owner判词及独立152项/三锚点PASS |
| 2 | 三批准PNG无圆框/盘，保留原生label/焦点/键徽 | ✅ | quiet+iconOnly+borderWidth0+radius0；60/50命中盒内实际PNG52/42，计算背景透明/边0/投影none，未改PUI；三键逐一加载/Tab/Enter/Space/鼠标/快捷键/断图实测 |
| 3 | 丝带中文、同字体同一行、真数据 | ✅ | 一个默认house字体Label，精确`月影庭院 · 月相季·第1天 · 黎明`；实测T→夜晚/N→第2天，不复制演示第5天；丝带内容透明且居中，月亮留白 |
| 4 | 两真实资源在左、入口在右同row | ✅ | 六视口组边界/单行测试；仅威仪30/盟约20，◆是诚实缺图回退；不加第三资源或冒用金币/月晶/月叶 |
| 5 | 窄屏与原有键鼠/侧栏不回归 | ✅ | 1440/1920/1060/760/420/375；375真实wheel横滚、tooltip完整/长追踪与侧栏18px间距；三侧栏关闭/互斥/空态/长滚动；实际世界菜单仍优先处理Tab/Enter；UI操作hash不变 |
| 6 | 严格日历显示名与受控物化 | ✅ | unknown/悬空ID拒，旧无配置/无slot不造day、未知liveID诚实回退；正式四文件重读canonical/hash/plan/compiler/discovery，只有Host内容变化 |
| 7 | 原型精确hover/pressed演出1:1 | ❌ 待PUI合同 | 真浏览器确认hover无位移/brightness1.07、pressed下移1px/0.9；获批为-3px/1.2/光晕5及+3px/0.85。Owner已选A，见[固定PUI单](../work-orders/REQ-SIMLIFE-PUI-ICON-FEEDBACK-01.md)，未写自由DOM/CSS逃生 |
| 8 | 两属性专属素材完成 | ❌ 素材未交付 | 沿用Owner资源A，仅真实威仪/盟约且◆占位；交策划/资产线，不以本批原型批准伪造新图许可或asset approval |
| 9 | 人工64/64上限压力，不是本游戏设计要求 | ⚠ 范围复核，非本单挡板 | 375确有约5行的通用压力现象，但当前只有月相季/黎明/夜晚，没有玩法把名称变长；64是输入安全上限，不是视觉内容目标。报主程技术备注，未来真实内容触发再立单；[澄清与撤回不当提问](../work-orders/DEMON-CASTLE-UI-RUNTIME-02-feedback-decision.md)，不改定稿布局、不冒称压力已修复 |

## 真实探针与回归

- `node scripts/demon-castle-ui-runtime-02.probe.mjs`：施工自证最终**395项/exit0**、38截图，本机`http://127.0.0.1:56803/`。随后非施工者独立395项重跑使用61267并重截38图，[当前measurements](DEMON-CASTLE-UI-RUNTIME-02.measurements.json)因此绑定独立轮。均为随机端口静态构建，只挂真实正式Host、游戏JSON及AssetManager，无StoragePort/账号/日常资料/远端。finally关闭Edge、服务并校验清理任务构建目录；不占5173。
- 初轮389通过后目击760文字虽单行但落在月亮附近（Label定宽后字未居中），已改为内层row居中+Label固有宽；修窄屏皮纹徽章留白和键徽尺寸，再过389。随后加真T/N、375hover/横滚/长态，最终395。未删除既有断言；旧同名证据完全保留。
- `vitest ... life-hud-overlay/life-ui-skin/life-game-host/life-host/life-calendar-presentation/life-save/life-input-routing/life-host-descriptor/life-host-calendar-labels/life-launcher-catalog/life-launcher-integration/demon-castle-playtest-contract + src/ui/components`：最终**89files/817tests exit0**。第一次扩大回归仅旧skin test仍查已移除date子节点，改为点名验证刷新后完整单行日期/地点/时段；随后补旧档接缝回归，没有放宽业务行为。
- 定向`tsc -p scripts/tsconfig.life-ui-skin.json --noEmit` exit0；本批ESLint `--max-warnings 0` exit0。
- 六个1440×900侧栏×深浅主题`tools/ui-audit`串行均exit0：重叠/硬低对比/3–4.5警告/border-image前提均0，华丽件6–8。隔离任务Vite/Edge已退出。审计夹具不等于真实贴图逐像素可读性审美批准。

非施工者独立终态：395/395、38图逐张目击；唯一锚点三撤修4/1/4红后恢复overlay22绿；其选定范围86files/792tests、定向TS、六深浅审计均通过。792是其实际复跑范围，不冒用施工者817计数。真disabled数据态另实证opacity.4/filter none，与原型.48/grayscale.7同属反馈未完成，已在PUI固定单覆盖，不是禁用action失效。独立三端口61267/54420/56464和所有session均退出，临时审计目录不存在；完整事实及历史断链告警见其报告。

截图：[1440](shots/DEMON-CASTLE-UI-RUNTIME-02/overview-1440.png)、[760](shots/DEMON-CASTLE-UI-RUNTIME-02/overview-760.png)、[375](shots/DEMON-CASTLE-UI-RUNTIME-02/overview-375.png)、[375横滚](shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-scroll.png)、[375hover](shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-hover.png)、[375长任务](shots/DEMON-CASTLE-UI-RUNTIME-02/narrow-long.png)。不是原型插画地图，也不宣称世界美术已1:1。

[四屏原尺寸并排对照](DEMON-CASTLE-UI-RUNTIME-02-comparison.html)只引用真实截图，不裁图/不改图；明确区分原型演示第5天与真实第1天、插画地图与运行世界，以及保留的未决差异。

追加边界探针`node scripts/demon-castle-ui-runtime-02-boundary.probe.mjs`：实际57114，pageErrors0，**三项红/exit1**（hover/pressed精确反馈、合法64/64字符名称单行）。[测量](DEMON-CASTLE-UI-RUNTIME-02-boundary.measurements.json)、[长名图](shots/DEMON-CASTLE-UI-RUNTIME-02-boundary/calendar-64-64-375.png)；已目击约五行挤入丝带，不能把原395项正常旅程绿灯说成所有边界通过。只读夹具的白底无地图是故意不挂世界的mountUI压力态，不伪报正式世界渲染故障。浏览器/随机端口服务/任务临时目录均已清理。初次复用另一个feedback诊断夹具缺DOCTYPE/UTF-8而超时，标准HTML后可复现真值，该夹具问题不归咎产品。

范围更正：Owner质疑极长场景后，主程序重核实际内容，撤回把安全上限压力上升为游戏设计挡板的提问。上段原始三红证据不删；其中两项属于本单精确反馈，第三项只说明通用极限未经承诺/解决，不再据此要求改原型或等待Owner选横滚/换行。保持定稿及当前内容不变，未将Owner疑问当作新设计批准。

全量门禁另实跑：`scoped-gate --run`在找不到默认`origin/claude/mainbranch`引用时安全回退full，审计棘轮及ESLint通过，最终仍止于既有33条depcruise层向错误（exit33，含既有Host依赖面，不一概归咎别的项目）。独立`vite build`823modules/exit0，仅既有chunk-size警告。默认`docs-ref-guard`exit0；`context-budget-guard`仍只报index4953>4900字符及game-production109>100行，未增加本游戏预算问题。定向扫game-demon-castle文档另发现旧S4单的acceptance glob指向不存在目录，未借本批改写旧验收记录。全库不是全绿，未提交/push或放宽规则。

## 三锚点撤修与日历证据

`LIFE_UI_RUNTIME_SABOTAGE` + `scripts/life-ui-runtime-02.sabotage.config.ts`在测试进程内变换，不改共享源。entry-frame/status-line/hud-row每轮先断言生产锚点恰1处；实际分别4红、1红、4红，均exit1且点名对应断言。移除变换后22/22 exit0。日历core另两唯一锚点（拒危险文本/拒悬空引用）内存撤修红；presenter映射另1锚点内存打包真实依赖红，恢复4断言；独立复查另撤Host前置门/season映射精确2红恢复66绿，真实Engine推进对照hash相同。

### 旧档兼容返修：首轮绿灯并不充分

最初66项Host投影测试未走真实旧档恢复；主程序补内存旧档用例实际转红，发现新增显示名被算入descriptor fingerprint。第一修只在Host composition剥离新字段，74项虽绿，独立复查仍在公开`new LifeHostSaveAdapter(...)`路径复现`incompatible`，判Major/FAIL；这次FAIL及首轮漏验均保留在独立报告，不覆盖掉历史。

最终在`life-save.ts`的单一`descriptorFingerprint`边界仅排除本次新增的`hud.calendarLabels`；Host恢复既有uiSkin调用点策略，不新增重复calendar规范化。未配置新字段时与历史hash表达式逐字节等价，不能借此排除uiSkin或其他旧字段、放宽坏档/跨包/跨slot门。永久用例覆盖有/无既有uiSkin、名称add/change/empty/remove、list、restore、再次save、metadata/snapshot/persistent hash及输入descriptor不变；只用MemoryStoragePort，未碰真实用户存档，未迁移存档格式。

独立返修复查已将唯一终态更正为PASS：公共adapter漏洞关闭，最终四文件76项绿；中央排除锚点恰1处，测试进程撤修精确3红/37跳过（有/无legacy uiSkin的两条direct adapter list由1变0，以及Host由restored变incompatible），正常配置恢复76项全绿，无共享生产源码变换。主程序扩大回归817项；未冒用施工者计数作复查结论。生产冻结：Host`ee416cfe48b6437b13442355455d16c73618ee265617f7cbca67ea358637b283`、save`a4e0f9534a23c5d6cb31b87680c9a789b01845cb96e801f2859ca63592313957`。

## 物化与版本

先`life-materialize --plan-update`：writesPerformed=false、四gate、无冲突、精确games/game-demon-castle四文件。Owner A后使用仓库原子update入口：

- confirmation `sha256:2a9df1de4ab3f72743fe38d90d0a6d112a196c8c5026bb6643fcf70dce5e8ef1`。
- previousFilesHash `sha256:f8b7a5e65e1757584417f27cee4d7fc7077162d5852b350446dde3c273f46a4c` → filesHash `sha256:751d4f3f0bf2d38d29fd94b58d77fe747a4f747a6747d41d830b65405ebedca0`。
- 4文件原子写入成功；真实内容只Host增加三中文名，Host bytes1531、SHA`8f47f2892086276b9309679682c676d8aa4d850830d88b1677271b134af0e7d1`。World`0a3fa40b…0b1792`、slots`da569614…355c5c`、launcher`b16d7551…3bbf68`原hash不变。
- 写后再次plan：currentFilesHash等于上述新filesHash，compiler/discovery严格gate齐、无冲突。不是数据库迁移或发布。

当前消费源冻结：HUD`fed35b39c80edcaf2e12b8bc4440ccc4d918693724436dfa12558f192707b76b`，HUD test`39ef74970ca27bac41e5f52375714373f064513d0e8eb3bda452585f160c1244`，新probe`f901572b3120d64eb0f2d118d23b17418bb5aee6b6d31d9bb69663490ed62c2d`，fixture`8e94eb01a9d19d806a482da143b0a5dd43e61ad8185202762736fbc81161ff92`。独立HUD复查另落review，不以日历局部PASS代替；精确演出及素材差异未收束，整单保持活动，控制台Owner门未代签；人工上限压力仅作技术备注。
