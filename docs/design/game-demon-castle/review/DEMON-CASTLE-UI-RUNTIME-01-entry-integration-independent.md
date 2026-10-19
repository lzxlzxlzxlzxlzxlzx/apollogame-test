# DEMON-CASTLE-UI-RUNTIME-01｜最终Host入口消费端集成独立复查

2026-10-16；施工：BDM程序；独立复查：`review_ui_prototype`。**局部 verdict：PASS，仅本次Host纯图标入口及部分素材加载失败后的重绘集成。不是整单、游戏阶段或Owner人门PASS。**

## 边界与依据

复查范围：`life-hud-overlay.ts`入口的PUI `Button.iconOnly`、ENTRY_COLORS、focusRingVisual与整组Tooltip，overlay14项；`life-game-host.ts`中loadArt返回false时的登记UI槽settle/active保护/重绘与对应28项；最终257项探针、只读夹具及六份串行审计。未修改这些实现或他人在途文件，只新增本证据并运行现有探针生成证据。PUI实现、资产审批、世界规则、存档、Owner门不在本次施工/签核范围。

本会话已完整阅读的AGENTS与生产/UI/资产/测试/自证/复查手册清单见前几份局部复查；本轮完整阅读最新overlay测试、两条新Host用例、探针、审计夹具、撤修配置及[PUI独立复查](REQ-SIMLIFE-PUI-ICON-BUTTON-01-independent.md)，核对实际消费接线与AssetManager并发加载合同。路线图读取时本里程碑为active，selfCheck/review均pending、owner=required。判断接受既有PUI合同消费与受限加载接缝修复，不新增游戏独有解释器或第二份资产映射。

## 发现并闭环的问题

初审发现新部分素材用例直接使用两处 `await new Promise(setTimeout(...,0))`，与testing手册禁真实时间等待冲突。已向施工者指出精确用例；施工者改为 `vi.useFakeTimers()`、两处 `vi.advanceTimersByTimeAsync(0)`，finally恢复真实时钟。本复查重新阅读修订测试并独立复跑，不把初次测试通过视为该纪律问题不存在。无生产代码因这一项修改，问题已关闭。

## 独立单测与两个撤修

初始独立运行overlay、game-host、input-routing、ui-skin、descriptor五文件：**118/118，exit0**。假时钟修订后独立运行本次核心两文件：

```powershell
npx vitest run src/engine/host/life-hud-overlay.test.ts src/engine/host/life-game-host.test.ts
```

**42/42，exit0**（14+28）。随后分别独立运行既有进程内transform配置：

```powershell
$env:LIFE_UI_RUNTIME_SABOTAGE='entry-icon-only'
npx vitest run src/engine/host/life-hud-overlay.test.ts --config scripts/life-ui-runtime.sabotage.config.ts
```

唯一锚点 `icon, iconOnly: { size: entrySize }` 恰中1次，移除iconOnly而保留icon后，实际 **2 failed / 12 passed，exit1**；1440与760两条 `consumes … native icon-only circles` 都因缺少iconOnly失败。

```powershell
$env:LIFE_UI_RUNTIME_SABOTAGE='partial-art-ready'
npx vitest run src/engine/host/life-game-host.test.ts --config scripts/life-ui-runtime.sabotage.config.ts
```

唯一锚点 `if (loaded === false && persistent.session.descriptor.uiSkin) {` 恰中1次，改成不可进入分支后，实际 **1 failed / 27 passed，exit1**。失败为非提前dispose的partial用例：慢框皮到达后仍停留legacy，实际DOM缺 `world-status.png`。假时钟修订后又独立复跑同一撤修，仍是1红/27绿，证明没有靠旧真实等待碰巧抓住问题。

每个锚点均由配置先检查命中恰1次，变换只存在于Vitest进程，未写共享源码。退出两个变换进程后普通命令再次重跑核心两文件，**42/42，exit0**，包括提前dispose分支不复活与慢图到达后重绘分支。

## 真实Host集成核证

- `life-hud-overlay.ts:127`：只有同resolver返回实际图URL时，填写 `iconOnly:{size:60}`（760及以下42）；尺寸是PUI按钮外径，图片内尺寸由PUI的size-8合同负责。Host不重做图片加载/藏字生命周期，原action和非空中文label保留。缺resolver结果不填icon/iconOnly，仍有真实可见label和独立J/I/C键徽。
- 使用深蓝/金边四态ENTRY_COLORS，focusRingVisual为3px浅色、offset2；Tooltip包整个entry（按钮+键徽），名称泡位于组下方，避免旧按钮下方名称与键徽重叠。使用PUI正式API，未把CSS/DOM复制进Host。
- `life-game-host.ts:390`：只在loader明确返回false且descriptor有uiSkin时，收集本Host登记的slots、按 `assets.has` 过滤后 `Promise.allSettled`。AssetManager对inflight去重，正常框皮继续等待、失败图可以拒绝；settle后再检查active，再invalidate/refresh。dispose后无重绘；未对全部游戏资产无界等待，也未改World/hash。
- 独立用例先使背包图快失败、其余图等待显式Promise屏障；释放屏障后好框皮出现、背包保留文字、任务图正常，hash不变。提前dispose参数在释放后容器仍空。`[Life UI] reject:partial-art-load 1 missing UI slots; retaining available art` 已逐条读，是受控断图的预期reject而非未解释错误；正常键盘decision日志同属预期。

## 独立257项浏览器旅程

已核探针与fixture不传StoragePort，不写权威World；UI长/空状态仅只读view夹具。执行：

```powershell
node scripts/demon-castle-ui-runtime.probe.mjs
```

实际 **257/257，exit0**，地址 `http://127.0.0.1:56026/`，`failures=[]`、`pageerror=[]`，重新生成27张图及[measurements](../self-check/DEMON-CASTLE-UI-RUNTIME-01.measurements.json)。本轮不是施工者的59178批次。

1440×900、1920×1080、1060×760、760×900四视口×三入口均核：真实512px图片、精确本地三个entry URL、装饰图alt空/aria-hidden、加载后只隐藏可见label而保留原生aria-label、实际60/42圆形盒、Tab真实可达、可见3px焦点、Enter/Space各打开一次、hover出现完整中文名、独立键徽、鼠标开合/互斥/关闭。首次Tab仍从BODY无指针准备自然进入HUD，settledFocus为resource-tip-0，insideHud=true。

故意route.abort唯一 `entry-backpack.png` 后，实际背包按钮不带iconOnly、有可见“魔王行囊”和I键徽，仍能打开真实背包，Escape后World hash不变。此处网络中断是探针主动输入，不能宣称本轮“无失败网络请求”，也不能误记为未知图片错误。其他好框皮与任务/人物图仍可见，证明部分加载接缝实际生效。

真实按键移动到农田→翻土→浇水→播种菜单，再按Tab/Enter，世界菜单仍优先且HUD未误开。新等待以实际menu DOM变化/消失为条件，最长3秒；它等待rAF提交的可见反馈，不是删除旧断言。已目击 `world-menu-keyboard-priority.png` 确实显示播种子级。脚本不再把按键后的同步旧DOM当成实现失败。

已逐张目击四张overview、missing-entry-icon以及world-menu-keyboard-priority：正式纯图标圆钮已替换文字过渡钮，缺图时文字回退清晰、键徽保留；丝带透明修复未回退，地图仍可见。右上两真实数值仍用◆，这是两属性专属图未交付的既有差异，不把金币/月晶/月叶冒绑到属性。

## 六份独立串行审计与清理

主程序确认其审计全部结束后才独立串行执行，每条均使用 `--w 1440 --h 900`：

```powershell
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-quest-dark.audit.ts --w 1440 --h 900
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-inventory-dark.audit.ts --w 1440 --h 900
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-profile-dark.audit.ts --w 1440 --h 900
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-quest-light.audit.ts --w 1440 --h 900
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-inventory-light.audit.ts --w 1440 --h 900
node tools/ui-audit.mjs scripts/audits/life-ui-runtime-profile-light.audit.ts --w 1440 --h 900
```

六条全 **exit0**：重叠0、硬低对比0、3–4.5警告0、border-image缺前提0；华丽件分别10/11/9，深浅相同，house主题是。审计夹具用内存mock框皮与1px测试图，并未使用正式丝带纹理；结论只覆盖该布局/对比夹具，实际512图与丝带在上述真实Host截图核证，不以夹具替代正式素材验收。

Edge均用任务隔离profile；探针随机静态服务、浏览器与临时IIFE已finally关闭/清理，56026事后无Listen；六审计也均关闭浏览器，`.ui-audit-tmp`最终不存在。未启动整套ZeroCraft、不占5173，无远程数据库或Owner存档写入。

## 终态指纹与结论边界

本轮前后读取下列冻结SHA-256一致（测试指修正假时钟后的版本）：

| 文件 | SHA-256 |
|---|---|
| overlay | `59e617af90079d6e12b98f6b908d09c176778e3d1484f8c2fa423b08dcf312e7` |
| overlay.test | `7842a7c1dc729a54c83932d79cb1d3d3c12d0b3896567e9361a1df611b076659` |
| game-host | `cc13b7839beebc2f56d21015962a73f13abd110c0975907afdff8ff1b0700a01` |
| game-host.test | `a6b254c55bdb56a2841114cf69b252c3f7666e2ea54ee5033ce506a7b48f20ec` |
| runtime.probe | `1e3f4bb5da64b8fcf6fb250e3a32026d07895821a5c945da9fc37ca8ad23b846` |

本集成未剩需打回的局部缺陷。已发现的测试时间纪律问题已修并独立复验。没有重签PUI生产线、素材批准或整单；两属性图、时钟/其他数据差异与正式关验收仍按权威工单保留。本局部未重跑全库门禁，不能据此抹去已报告33条depcruise及域外GAL类型红灯，亦不修改这些域外文件。路线图、pipeline及Owner人门未由本复查人操作。
