# DEMON-CASTLE-UI-RUNTIME-01｜原生键盘路由接缝局部独立复查

2026-10-16；施工：BDM程序；独立复查：`review_ui_prototype`。**局部 verdict：PASS，仅本次获授权的可选键盘路由接缝；不是PUI icon-only或正式UI整单PASS。** 未修改实现、测试、资产、pipeline或Owner gate，只落本复查证据并独立重跑现有浏览器探针。

## 依据与冻结范围

本会话完整阅读的生产/UI/测试/复查手册清单见[图标合同局部复查](DEMON-CASTLE-UI-RUNTIME-01-icons-contract-independent.md)。本轮完整读 `life-input.ts`、`life-input-routing.test.ts`、实际Host接线与对应Host用例、浏览器探针和静态夹具；重读[正式工单](../work-orders/DEMON-CASTLE-UI-RUNTIME-01.md)新增输入范围A。接受：可选安装器policy在表现层放行原生焦点按键，世界菜单优先，未向reducer添加焦点数据或新动作。

施工期间一度读到不同步的Host/input快照，未据此裁缺陷；主施工通知冻结后按下列内容重新验证。SHA-256：

| 文件 | SHA-256 |
|---|---|
| `src/engine/host/life-input.ts` | `f490e19dea5e03b3fb2e1b5f8390aba4114438b4d895cc7e2c6ae0875c08d82e` |
| `src/engine/host/life-input-routing.test.ts` | `f5968a51c98f369496f9e9cd0e7591dea9e97e3a058c406bf7b977e26a451a9f` |
| `src/engine/host/life-game-host.ts` | `593aceb7e9a1afab86902beb483d2447ee6eada1730145fd987fddb765051d9d` |
| `scripts/demon-castle-ui-runtime.probe.mjs` | `8e34a4337e71611265c0a5a1eb7596296b3ab28e86dc80850becb48291180606` |

## 独立复跑

```powershell
npx vitest run src/engine/host/life-input-routing.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-host.test.ts
node scripts/demon-castle-ui-runtime.probe.mjs
```

单测 **3 files / 68 tests，exit0**（routing11、真实Host26、旧Host31）。未采信施工者的“722项全绿”作为本复查证据，也未在本局部重复全库门禁。

真实浏览器探针独立 **exit0 / 181 checks / failures=[] / pageerror=[]**；本轮重新生成24张截图与[measurements](../self-check/DEMON-CASTLE-UI-RUNTIME-01.measurements.json)，包括真实世界菜单优先级截图。只启动随机端口静态服务 `http://127.0.0.1:58531/`，构建到任务临时目录，使用隔离无头Edge、正式descriptor/package/slots和AssetManager；夹具未传StoragePort，不触及Owner存档或远程数据库，未启动整套系统、不占5173。探针结束输出 `Probe browser/server closed; task scratch removed.`；事后该端口无Listen连接。

## 实际核证

- `life-input.ts:120`：仅可选policy存在、overlay就绪、无活动世界菜单时进入放行分支。原生可操作button/input/select/textarea在本Host焦点内才交浏览器处理Tab/Enter/Space；disabled控件、非原生role=button、外部焦点均不被本Host冒领。
- `life-input.ts:125`：无指针准备时body或本playfield canvas的首次Tab可进入HUD；真实探针 `firstTab.target=BODY`、`prevented=false`、`settledFocus=life-host-resource-tip-0`、`insideHud=true`。该项使用真实 `page.keyboard.press('Tab')`，没有先focus按钮来冒充可达。
- `life-input.ts:129`：本Host的原生Tooltip tab stop仅放行Tab/Shift-Tab离开，Enter仍走原世界confirm；点名测试核对 `[confirm]`，避免资源Tooltip卡住后面的入口。
- 四视口1440/1920/1060/760的三个入口均由真实Tab导航到达，Enter各打开一次；Space各打开一次（Space用例明确先focus，是原生激活测试，不算首次Tab证据）。鼠标、快捷键、关闭/Escape、互斥等探针仍通过。
- 真世界旅程通过真实按住A移动到农田、E翻土、E浇水、E打开播种菜单完成；世界菜单打开后，即使HUD按钮有焦点，Tab仍保留其焦点、Enter不打开HUD，并出现可见世界交互反馈。不是直接注入World信号来伪造菜单前提。
- `life-game-host.ts:219` 依据实际overlay是否返回表现树而启用policy；未选uiSkin或框皮未就绪时policy不放行，Host的absent/missing/loaded三个参数化用例独立通过。菜单关闭后动态恢复原生路由。
- held movement、keyup、blur、releaseAll、卸载后无监听残留、旧三参数安装器、两个Host的归属边界均有点名测试通过；旧Host31项仍通过。UI操作World snapshot/persistent hash不变；世界农田操作本来就是正常World动作，不冒称该旅程hash不变。

已目击本轮默认1440、任务1440、背包760、档案1060及 `world-menu-keyboard-priority.png`；当前仍是Button.icon+可见label的过渡按钮。截图不能证明PUI图标按钮视觉合同已交付。

## 单锚点撤修验红与恢复

在 `vitest/node.startVitest('test', files, {run:true,watch:false}, {plugins:[…]})` 注入 `enforce:'pre'` transform，目标仅 `src/engine/host/life-input.ts`。先断言锚点恰好出现1次：

```ts
return; // Browser owns Tab/Enter/Space; do not preventDefault or emit a World action.
```

只在测试进程内删除这条return，使分支继续落到旧世界dispatch；日志为 `INDEPENDENT-KEYBOARD-SABOTAGE: unique anchor hit`，最终 `transforms=1`。未改共享文件。独立运行 routing与game-host两个文件，实际 **exit1，6 failed / 31 passed**：

1. 原生Tab/Shift-Tab/Enter/Space放行用例变红；
2. 双Host动态菜单用例收到多余confirm；
3. 首次body/canvas Tab被preventDefault；
4. Tooltip Tab被preventDefault；
5. held movement用例多收到cycle/confirm；
6. 真实Host loaded用例的body Tab被preventDefault。

退出变换进程后，用普通命令重跑同一两个文件：**37/37，exit0**。这同时证明锚点确实影响被测行为、测试能捕获回归、共享源文件未留下破坏态。

日志逐条检查：正常轮的 `[Life keyboard] decision:native-ui Tab/Enter` 为预期decision追踪；撤修轮即使仍打该decision也会落入dispatch，行为断言准确转红，未以“有日志”当作成功。正常单测及浏览器轮无WARN或pageerror。

## 结论边界

本批输入接缝未发现需打回缺陷。旧24项键盘失败是历史实证，本次独立复跑已经181/181，不把旧红误报为当前状态；也不据此签整单或PUI合同。两张真实属性专属图仍缺，金币/月晶/月叶三图仍保留不消费，PUI icon-only仍待对应生产线交付；其他视觉/数据差异及Owner审批按原工单分别处理。

没有调用pipeline、路线图Owner decision或素材批准。局部结果交主程序合法同步路线图，未将局部PASS升级为整单完成。
