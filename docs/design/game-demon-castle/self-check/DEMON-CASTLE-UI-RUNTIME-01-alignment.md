# DEMON-CASTLE-UI-RUNTIME-01｜施工自证与未决差异

施工：BDM程序，2026-10-15～16。**本次丝带/入口两处实机返修均已独立局部PASS；整单尚未完工，两属性专属素材仍缺且保留待裁差异，不宣称 S4/S5/S6 或整游戏通过。**

版本提示：下表与截图记录修订01旧目标。2026-10-16修订02已获Owner重新定稿（无圆框/中文同字体单行/资源左入口右同排），并已另批接入正式Host；旧表绿灯不得当作新方向完成。最新状态以[修订02自证与未决差异](DEMON-CASTLE-UI-RUNTIME-02-alignment.md)为准。

## 阅读、判断与范围

完整阅读清单见 [领工声明](../work-orders/DEMON-CASTLE-UI-RUNTIME-01.md)；另读随机、base-lib、艺术平台历史快照及如建现状、物化 SOP 相关合同。接受现有能力重组；使用 module-ui/module-assets/module-art/module-baselib/check-ui/align-check/project-roadmap，遇到真缺口按 ask-owner 留证。没有修改 `src/ui`、规则/World或存档；初批未改输入，后续Owner输入A明确授权的安装器接缝另记于下节，纯reducer未改。原型由非施工者独立复查 PASS，证据见 [原型复查](../review/DEMON-CASTLE-UI-REVISION-01.md)，不代签控制台人门。

## 原型与真实 Host 对照

同为1440×900：[定稿原型](shots/DEMON-CASTLE-UI-REVISION-01/01-overview-1440.png) / [真实Host](shots/DEMON-CASTLE-UI-RUNTIME-01/overview-1440.png)；[原型任务侧栏](shots/DEMON-CASTLE-UI-REVISION-01/02-quests.png) / [真实任务侧栏](shots/DEMON-CASTLE-UI-RUNTIME-01/quest-1440.png)。真实世界仍是其原有地图，不把原型单张插画误说成运行时场景。

[四屏同画布并排对照页](DEMON-CASTLE-UI-RUNTIME-01-comparison.html)使用上述真实截图，明确列出未完成差异；不是游戏入口或验收通过记录。

| # | GDD / 工单承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 动态左上羊皮追踪卡、标题、下一目标完整可读 | ✅ | 严格 tracker key 已绑定；真实图片与文字分离，长文夹具截图 long-quest.png；不复制演示任务值 |
| 2 | 居中可读状态丝带，不再挤进资源行 | ✅ | 1440/1920高104px、760高92px；真实Scene/日期/时段；Owner返修后内文bare透明、月亮留白及长文边界独立193项核证，见ribbon-independent |
| 3 | 原型20:40连续时钟 | ⚠ 待裁决 | 正式Calendar仅dawn/night，无时分；保持真数据，不造墙钟。已报 owner（经策划会话），后续连续时钟另单定义权威语义 |
| 4 | 图标数字资源，无常驻属性名 | ❌ 专属图标未交付 | Owner 资源 A 已确认仅威仪/盟约两个权威来源、第三格不渲染；数值与tooltip正确，专属两图仍placeholder（当前◆安全回退）。已批准金币/月晶/月叶保留不消费，不能冒绑属性或伪造consumer。素材差异交策划/资产线，不能因此批准未审图 |
| 5 | J/I/C圆形图标按钮、独立键徽、Tab/Enter可用 | ✅ | PUI合同独立PASS后消费原生iconOnly：60/42px、已批准三严格key/准确本地PNG、加载后隐字、aria及Tooltip中文名、独立键徽、可见焦点环。消费端亦获独立局部PASS：真Host257项含4视口/自然Tab/Enter/Space/世界菜单优先及断图安全回退，不冒称整单通过 |
| 6 | 统一右侧羊皮侧栏，不全屏遮地图 | ✅ | 三类复用Panel/frame/paper/body/footer骨架；无Drawer全屏遮罩。真实quest/inventory/profile各四视口截图 |
| 7 | 关闭/Escape、互斥、不污染World/save/hash与持续输入 | ✅ | 真Host110项探针及现有Host回归；关闭后可重开，Canvas空白区指针穿透；hash不变 |
| 8 | 空态和长内容滚动 | ✅ | 独立UI夹具：24任务/60物品/28属性均真实滚动；empty/long系列不冒称正式游玩数据 |
| 9 | 筛选页签、背包点选详情与320ms追踪反馈 | ✅ | 原生Button组合本地筛选；查看真实物品标题/数量、档案分组；追踪修订号驱动一次320ms flash。指针+本地状态测试确认零World队列/快照/hash改动 |
| 10 | 侧栏200ms、22px右入场 | ✅ | 现有flyIn/animMs/animFrom/animDist；减动策略由基座处理，探针等真实动画结束再量边界 |
| 11 | 原型“城堡”页签及示例物品描述 | ⚠ 数据等价范围待裁 | 当前无独立城堡档案或物品说明字段，第三页称“属性”并只投影已有值；详情只显示真实标题/数量。报 owner（经策划）确认数据范围，不虚构新文案/规则 |

## 实跑与退出码

- `node scripts/demon-castle-ui-runtime.probe.mjs`：最终 **exit0、116项**。静态测试入口构建临时IIFE，本机临时端口（最终一次 `http://127.0.0.1:53923/`），正式descriptor/package/slots、真实AssetManager加载；无StoragePort，不接远端或Owner存档。原型探针由独立复查人另跑。
- 真实Host 4视口×4状态16张，另1张真实背包详情；6张空态/长内容夹具，共23张。没有pageerror；所有浏览器与临时静态服务均finally关闭，临时构建目录已清理，不占5173。空态断言逐项检查实际提示文字可见，不只查空容器存在。
- `vitest run src/engine/host/life-hud-overlay.test.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-game-host.test.ts src/authoring/life-host-descriptor.test.ts src/ui/components`：最终 **664/664，exit0**。新增Host交互测试明确非空背包夹具，真实点击分类/物品/任务追踪/档案页签，确认enqueueAction未被调用，World snapshot与persistent hash不变。
- 三类侧栏×Onyx深/Starter浅主题，`node tools/ui-audit.mjs scripts/audits/life-ui-runtime-<kind>-<theme>.audit.ts --w 1440 --h 900`：最终六次 **exit0**，重叠/硬低对比/3–4.5警告/border-image缺前提均0，华丽件9–11处。夹具贴图只用于审计，真实图另有上述浏览器截图；不把贴图背景的像素对比冒称已全量自动审计。原四槽对照入口改为识别新Panel侧栏；串行重跑避免工具固定临时目录争用。浅色贴图夹具又暴露状态文字缺明确实底，已补独立深色内承载面，而非豁免审计；原入口深/浅最终分别exit0。
- 定向 `tsc -p scripts/tsconfig.life-ui-skin.json --noEmit`：**exit0**。全库tsc：**exit1**，独立于本单的 `src/authoring/gal-character-library.ts:89` union→NarrativeBible错误；未修改该面或放宽配置。
- `node scripts/scoped-gate.mjs --run`：**exit1**；默认远程基线不存在，安全回退为full；audit棘轮PASS、eslint成功，止于既有33条depcruise层向错误，未触及全量vitest/build。不能声称全库门禁绿。
- 历史魔王城合同计数失败现由精确38项key清单及6个真实UI consumer关闭；三张资源图明确不消费，World31slots和两条placeholder missing_asset诊断保留，未以改数量掩盖语义缺图。

## 锚点撤修验红

`scripts/life-ui-runtime.sabotage.config.ts`仅测试进程内transform，绝不改共享源文件；每个锚点严格断言命中一次。原实现先90项绿；单点故意打坏后：ribbon-height（104/92→24/20）4条红；legacy-only（提前返回旧树）8条红；opaque-paper（纸面改深底）4条红。三次vitest都exit1，外层汇总按预期exit0；撤去transform后90项复绿。对错不靠测试常绿。

## 受控正式物化

仅增加已批准 `art:game-demon-castle:ui:tracked-quest-frame` 消费。plan-update先确认四道gate、conflicts=[]、exact四文件无symlink；旧组hash `0baf1bfcb4096113b12c6b65f1117172fe389bc39e21f7677d5eda905040e5af`，confirmation `b957ab5fe9ee657f82bb4a66ff9885aa5d6ed89e6967e5a7039a45e738461169`。严格update原子替换四文件成功，再重读磁盘、SHA256与plan/discovery：currentFilesHash等于新filesHash `1e1459ecf2cd188c22ee0f77f10aa4d9e1517db3c6c147ab91801e2a9fcd5f3b`，零冲突。只有Host字节变化：`ac2bcfff4d9f07970616b404ac4a46458af794650a8f0ec19be573b9b3dbc493`；life/slots/launcher保持更新前字节。未登记素材、未代签批准。

## 迭代与玩家视角

第一轮真截图发现丝带错误沿用原型未裁图300%缩放、框皮中心透明导致标题透底；改为已裁正式图100%尺寸与不透明内纸面。深主题审计再发现关闭键、任务状态与进度说明低对比，统一受限四态按钮及深字说明，六审计归零。后续补齐真实追踪框、文字按钮安全回退、键徽实底及200ms入场；110项复跑。最后补任务/物品/档案本地筛选、真实背包详情与追踪反馈，新增非空夹具防止“没有物品所以跳过”假绿，116项/664测试及六审计复绿。

八问：任务目标位于左上主信息层；追踪文字由权威投影更新；当前资源值只显示当前角色的真实值；日期/时段常驻；键徽及中文原生按钮可发现；面板开合与唯一关闭出口可真点；所有显示属本局；不硬编码前局/演示值。未评判整游戏乐趣或终局，当前仅UI施工；没有新引入>1秒干等窗口。完整视觉/交互仍有上表未决项，align-count保持红灯，不把“已能渲染”当作完成。

## 2026-10-16：Owner 两项 A 后续施工

- 新增严格可选 `questIcon/inventoryIcon/profileIcon`，同一已加载纹理resolver接原生Button.icon；缺失/未加载/atlas不填icon，保留真实label、动作及键徽；旧无uiSkin树不变。三个槽均有合法/空值/跨游戏/URL/路径/slice拒收测试。PUI合同未交付前不伪造icon-only字段。
- 定向6files/104tests exit0（含正式launcher、严格descriptor、Host与精确38key资产合同）；随后扩至UI组件及旧Host回归共708项，首次1条旧测试误要求部分皮就绪时无纸面frame，已改成点名验证不透明纸面存在且无missing skin/slice/URL，修后70项exit0；最终扩大回归 **83files/708tests exit0**。ESLint与定向tsc exit0；预算池10/10、24395/25000字，仍仅旧index超53字和game-production超9行两项红。
- 再跑六个深浅侧栏审计全部exit0，重叠、低对比、3–4.5警告和border-image问题均0；这只验证布局/可读性，不替代键盘验收。
- 新增真Tab/Enter/Space探针后 **176项、152通过/24失败，exit1**。失败精确为4视口×3入口×Tab不可达/Enter未开；Space、真实图加载、真实两数值、鼠标开合、互斥、滚动、hash等其余检查通过，零pageerror。测试地址 `http://127.0.0.1:55014/`，23图与measurements已按当前正式数据重截。浏览器/静态服务已关闭，临时构建目录已删除，不占5173、不使用StoragePort或个人资料。
- 根因原文：`life-input.ts` operation表把 `Tab` 固定映射 `next/previous`、`Enter` 固定映射 `confirm`；dispatch中 `if (result.preventDefault) keyboardEvent?.preventDefault()` 全局执行，所有UI按钮同受影响。提出范围裁决：[工单键盘冲突](../work-orders/DEMON-CASTLE-UI-RUNTIME-01.md#新增键盘冲突owner-已选择-a)。当时未获范围确认前保留真实红；后续Owner输入A施工见下节，不删失败历史或强行focus冒称首Tab通过。
- 正式更新：plan零冲突后使用confirmation `d13ddae4ecf6d81f44cfd46ee6bc1d0ab1a621e7e932525dffb820bc405ff8b5`、旧组 `1e1459ecf2cd188c22ee0f77f10aa4d9e1517db3c6c147ab91801e2a9fcd5f3b`，严格原子update成功。只Host字节变为 `e5151e1bbd0a4ef703cdc9baacf6c262a590959b379a915bfa2306ce8bd84677`；四文件逐字重读hash与再次plan核对，新组/current `f8b7a5e65e1757584417f27cee4d7fc7077162d5852b350446dde3c273f46a4c`，冲突0、四道gate通过。世界/slots/launcher字节仍等于上轮；无资产或审批写入。

## Owner 输入 A 施工终态（2026-10-16）

接受既有单必要接缝；新增 `LifeNativeUiKeyboardPolicy` 仅安装器可选参数，纯reducer不改。Host实际overlay帧就绪才启用；world互动菜单open时保持旧路由，无皮/全缺图也保持旧路由。首次body/本canvas Tab走原生序列，控件内Tab/Enter/Space走原生；资源Tooltip原生tab stop只放Tab，避免序列在第一个资源上卡死，不把伪role=button当原生按钮。

- `life-input-routing.test.ts` 11项；真实Host新增 absent/missing/loaded 3项，覆盖真实E菜单的Tab/Enter优先与关闭后恢复；持续方向keyup/blur/releaseAll/dispose回归。扩大回归 **84files/722tests exit0**，定向tsc与ESLint exit0。
- 真浏览器 **181/181 exit0**，`http://127.0.0.1:64870/`；首Tab从body无指针/无focus设置自然进入HUD（measurements.firstTab）；4视口三入口真Tab/Enter/Space、真实图、关闭/互斥、hash不变；另真实方向键移动到农田→E翻土→E浇水→E播种菜单，再验证世界Tab/Enter优先，留下第24张 `world-menu-keyboard-priority.png`。后半段是真实隔离玩法前置，不冒称World未变；UI-only hash不变检查仍在其前独立覆盖。浏览器、静态服务与临时构建目录均finally关闭/删除，无StoragePort、远端或个人资料。
- 首次修后探针仍红，实查发现Tooltip自带tabindex=0且不是原生按钮；补闭集Tooltip的Tab放行后转绿，不靠焦点强跳避过。世界菜单探针初稿只E翻土为直接动作并无菜单，已补真实浇水→播种前置，拒绝把无菜单当菜单验收。
- 唯一锚点撤修：`keyboard-native` 进程内transform移除安装器放行处return，锚点恰中一次，**6 failed/31 passed、vitest exit1**；不修改共享源文件。撤去transform后 **37/37 exit0**。非施工者复查另落keyboard-independent，当前不代签。
- 三入口key/缺图合同已由非施工者独立局部 **PASS**：[独立证据](../review/DEMON-CASTLE-UI-RUNTIME-01-icons-contract-independent.md)。其自行复跑119项、单锚点移除resolver后4红/6绿、撤变换后122项绿，并独立核对全部缺皮exactlegacy与部分缺panel保留不透明纸面的区别。不将此局部PASS冒称PUI模式、输入接缝或整单通过；输入独立复查仍单列。

## 输入接缝独立复查收束

非施工者 `review_ui_prototype` 已交[键盘接缝独立证据](../review/DEMON-CASTLE-UI-RUNTIME-01-keyboard-independent.md)，局部 **PASS**。其独立复跑68项；唯一return锚点进程内撤修触发6红/31绿，退出变换后37项复绿。真实隔离Edge探针另跑 **181/181**，重新生成24张截图和measurements；本次端口58531，首Tab从body自然进入HUD与真实播种菜单优先均核证，零pageerror，结束后浏览器/服务关闭、临时构建清理且端口无Listen。此结果只关闭输入接缝复查，不关闭PUI纯图标、两属性专属图或整单对齐/人门。

## Owner 实机返修：透明状态丝带（2026-10-16）

原先为对比审计加上的 `status-ink` 深色实底遮住已批准纹样，Owner指出后已目击其原始截图并与旧overview复现；此前表内“居中可读”不代表该视觉错误已获准。恢复定稿要求，不修改原型SHA或新增视觉方向：仅内布局改 `bare:true`，地点/日期/时段设受限列宽、长地点名降低既有字号并正常换行，给两端/月亮留白，未加新控件或自由CSS。

新增桌面/窄屏断言先 **2红/9绿**，修后与skin/旧Host共 **52/52绿**。唯一 `ribbon-backing` 锚点测试进程内恢复深底，命中一次后 **2红/9绿、exit1**；退出变换后11/11绿。定向tsc及ESLint exit0。真实隔离Edge首次 **193/193**（旧181项+透明/文字边界及长状态），62141已关闭、任务临时目录清理；截图目击后增大760窄屏月亮留白，由非施工者复跑当前最终版。长档案夹具仍28行，但仅保留原两条HUD属性，其余仅profile，避免人工构造28个资源条污染截图。新增 `long-status-1440/760.png`，明确为只读UI夹具、不是新增权威地点/日期。

本批独立复查交 `review_ui_prototype`，另落ribbon-independent证据；PUI纯图标仍待专职交付，不把紫色文字过渡钮当成定稿完成。

## PUI交付后：真实入口集成与断图收束

上述“PUI待交”是交付前历史；现已读[本票PUI独立PASS](../review/REQ-SIMLIFE-PUI-ICON-BUTTON-01-independent.md)和引擎程序交回合同，`iconOnly.size`为按钮外径（24..64），Host取60/42，内部图由PUI按size-8。使用同一已加载纹理resolver，绝无asset key当URL、重新生成、emoji或新增索引。ENTRY_COLORS复原深蓝金边四态，focusRingVisual提供3px浅色外环；Tooltip包完整入口，悬停/焦点名称不遮J/I/C键徽；没有图则常规中文按钮，图显示失败由PUI恢复文字。

- 原消费断言先2红；实现后overlay14项绿。`entry-icon-only`唯一锚点移除字段后 **2红/12绿、exit1**，恢复14/14绿。全回归扩大到85files，最终计数见下。
- 断开已批准背包纹理的真网络测试先卡在框皮未出现：共享批量加载会快失败，Host那次重绘早于其余框皮完成。新增快失败/慢框皮/卸载夹具，修正夹具名称与等早失败前置后确实1红/27绿；只在loader返回false且uiSkin有登记槽时等这些槽的allSettled，再检查active并重绘，不改资产加载器/索引或World。最多补一次已登记UI槽加载，不引入轮询；`reject:partial-art-load`摘要记录缺槽数。`partial-art-ready`唯一锚点撤去等待后 **1红/27绿、exit1**；恢复Host28项及overlay14项 **42/42绿**，卸载不复活。
- 第一次完整257项轮仅世界菜单“立即DOM反馈”红，截图已显示真实播种子级；断言读取早于rAF。改为最多3秒等待实际菜单DOM变化/关闭，再验证HUD未开，未改互动代码或降低行为标准。
- 最终真实隔离Edge **257/257、exit0**，端口 **59178**。三入口逐一实测准确本地512px图、图片loaded后才隐字、60/42圆盒、原生可访问名称、自然Tab/可见焦点/Enter/Space/hover全名/鼠标/JIC/关闭互斥、Worldhash不变；另中断背包单纹理，保留已好框皮与其他图、文字回退还能开关背包、hash不变。27图（旧24+长状态2+断图1）和measurements已更新。真实玩法菜单优先另经实际移动/翻土/浇水前置；零pageerror。浏览器、临时静态服务及任务构建目录finally清理，不占5173，无StoragePort、用户资料或远端写入。
- 透明丝带由非施工者独立 **193/193**（58197已关闭）、唯一锚点2红恢复，见[局部证据](../review/DEMON-CASTLE-UI-RUNTIME-01-ribbon-independent.md)。该报告按status片段冻结，不签后续入口；入口最终复查另派同一非施工者，不能引用PUI或施工自证充当Host独立结论。
- 正式四文件再次零写入plan-update：conflicts=[]、四gate通过、current/new同为`f8b7a5e65e1757584417f27cee4d7fc7077162d5852b350446dde3c273f46a4c`，本次仅代码修复，无须再物化或改图批准。原型SHA仍`279f063f…1955`不变。
- 最终扩大回归 **85files/733tests exit0**；定向tsc与本批ESLint exit0。最终六个1440×900深浅侧栏审计串行重跑全exit0，重叠/硬低对比/3–4.5告警/border-image问题均0，华丽件9～11；夹具仅用内存mock PNG接图标槽，不冒称正式图审批。真实批准图的实际尺寸/加载/视觉另由上述257探针与截图核证。全库scoped-gate仍exit1止于原33depcruise（包括既有Host层向与测试JSON跨层），没有称它们全属其他项目；未放宽门禁。
- 最终独立复查先指出新增两条夹具用了真实setTimeout(0)，违反testing.md；已接受并改为用例级vi.useFakeTimers/advanceTimersByTimeAsync(0)，finally归还真实时钟。生产代码/探针没有改；修订后Host28+overlay14再次42绿，扩大85files733项也重新exit0。独立复查仍需按修订测试复验，不以施工人重跑代签。

## 两处实机返修的最终局部独立判词

[入口消费端独立证据](../review/DEMON-CASTLE-UI-RUNTIME-01-entry-integration-independent.md)已由非施工者落 **PASS**：独立118项初跑、修订假时钟后42项绿；两个唯一锚点分别2红/12绿、1红/27绿，修订后重新撤修仍红，最后42项恢复绿。另独立真实Edge **257/257**，端口 **56026**，27图重新生成并目击四视口/断图/实际世界菜单；六深浅审计独立串行均零issue，预期reject1已解释。前后冻结的5文件SHA一致，未剩本集成缺陷。浏览器、56026服务和临时构建/审计目录均已关闭清理。公共measurements/截图现以此独立批次为最新，而非施工59178批次。

本次Owner指出的两处返修可据此局部交接；整体对齐仍 **8✅、2⚠有去向、1❌**（两属性专属图），完整UI单/正式阶段/全库门禁与Owner人门均未签通过。路线图通过合法入口同步实证，整体仍active且selfCheck/review pending、owner required。
