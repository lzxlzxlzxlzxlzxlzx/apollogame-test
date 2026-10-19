# DEMON-CASTLE-UI-RUNTIME-01｜透明状态丝带返修独立复查

2026-10-16；施工：BDM程序；独立复查：`review_ui_prototype`。**局部 verdict：PASS，仅透明丝带、列宽和窄屏月亮留白返修；不是整单或PUI入口集成通过。**

## 范围和判断

本轮只检查 `life-hud-overlay.ts` 的status内容分组、受限文字列宽/字号和窄屏安全留白，`life-hud-overlay.test.ts`新增桌面/窄屏透明性测试，现有runtime探针新增12条透明/文字边界检查，静态夹具的status-long与长档案HUD隔离，以及ribbon-backing撤修模式。只写本证据、不改实现或他人在途文件；未修改原型、素材、人门或pipeline。

本会话已完整读过AGENTS、onboarding、manifesto、生产线索引、生产/需求/流程问题/UI/资产/测试/自证/复查手册，清单见同目录前两份局部复查。本轮重读实际变更、最新自证与路线图相关里程碑。判断接受：Owner实机指出的独立深蓝矩形可用既有 `Panel{bare:true}` 和受限LayoutNode布局修正，无须新控件或自由CSS。原先为审计添加的深色实底不能因此被当作已获准视觉变更。

## 独立机器实证

```powershell
npx vitest run src/engine/host/life-hud-overlay.test.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-host.test.ts
```

修复终态、撤修前独立 **3 files / 52 tests，exit0**（overlay11、skin10、旧Host31）。两条新断言分别覆盖1440/760：status-ink本身及内层所有Panel都必须bare，地点/日历列宽为正，内容宽度+偏移不超外框。

独立撤修命令：

```powershell
$env:LIFE_UI_RUNTIME_SABOTAGE='ribbon-backing'
npx vitest run src/engine/host/life-hud-overlay.test.ts --config scripts/life-ui-runtime.sabotage.config.ts
```

配置只做测试进程内transform，先断言锚点 `id: 'life-host-status-ink', props: { bare: true }` 恰中1次，再替成 `props: { bg: NIGHT }`；不写共享源码。实际 **exit1 / 2 failed / 9 passed**，正是1440与760的 `ribbon text transparent and width-bounded` 两条，失败实值为 `{bg:{custom:'#192238'}}`、期望为 `{bare:true}`。日志确认 `anchor hit exactly once`。

退出该PowerShell/测试进程后撤去变换，普通命令独立重跑 `npx vitest run src/engine/host/life-hud-overlay.test.ts -t 'ribbon text transparent'`：**2 passed / exit0**。当时主程序已并发追加入口集成用例，整文件变成14条，另12条被名称过滤明确skip；未冒称该轮14条全跑。此恢复轮只证明本返修两条重新转绿，不审入口施工。

## 最终留白版本的真实浏览器

已阅读探针及夹具，确认只用本地正式文件、未传StoragePort。独立执行：

```powershell
node scripts/demon-castle-ui-runtime.probe.mjs
```

在主程序最后一次微调窄屏留白后重建临时IIFE，实际 **exit0 / 193 checks / failures=[] / pageerror=[]**；地址为 `http://127.0.0.1:58197/`，不是上轮62141。新增12条=四视口×透明/边界两条，加1440/760长状态×透明/边界两条。没有以旧193截图或施工者输出代替本次重跑。

四视口实测 `life-host-status-ink`、`life-host-calendar` 均为 computed `backgroundColor=rgba(0,0,0,0)`、`backgroundImage=none`，不是把同一块矩形换了颜色。外层丝带自己的图与安全底保留，透明的是文字分组。

| 宽度 | 地点实际x/右边界 | 日期/时段实际x/右边界 | 透明/边界断言 |
|---|---|---|---|
| 1440 | 536.39 / 698.39 | 719.39 / 943.58 | 全过 |
| 1920 | 710 / 926 | 947 / 1250 | 全过 |
| 1060 | 360 / 512 | 533 / 740 | 全过 |
| 760 | 122 / 352 | 364 / 698 | 全过 |

三个文字节点的scrollWidth均≤clientWidth+1，实际上下左右均在丝带框内；长状态同样逐节点过界检查。状态内容采用桌面x90/窄屏x110，内宽为丝带宽减140/160，地点约40%、日历分配余宽；正常中文换行，长地点使用已有受限字号。

已亲自目击这轮 `overview-1440.png`、`overview-760.png`、`long-status-1440.png`、`long-status-760.png`：深蓝独立矩形真正消失，底下连续丝带纹样可见；760的月亮没有被文字盖住，1440长地点换成两行、760长地点与第999日仍在框内。长状态图白底是fixture主动dispose真实Host后重挂只读UI的结果，不拿它当正式地图截图。

夹具独立核对：status-long只构造只读view中的长地点/日期/时段；28条长档案保留原属性，其余新行仅 `surfaces:['profile']`，没有把28个属性复制到HUD，也未写World或正式数据。截图右上仍只有两个真实属性数值，不把夹具冒称新增资源。

探针输出 `Probe browser/server closed; task scratch removed.`；隔离Edge和随机端口静态服务均已finally关闭，58197事后无Listen。未启动ZeroCraft系统、不占5173，不接Owner存档/远程数据库。正常单测和本次浏览器轮无WARN/pageerror；撤修的红是预期行为，不吞掉。

## 并发及证据版本边界

本轮临时build建立时入口仍是已知文字过渡钮；主程序随后在同文件的entry片段接入PUI交付、追加测试与新版probe。我已通知主程序本轮截图/measurements采集及目击完成，允许其串行重跑后续入口版本，避免同时覆盖公共证据路径。本结论不把过渡钮算作丝带缺陷，也不冒称已复查后续入口集成。

临时build建立前源快照SHA-256：overlay `b88d035718a6033b3aa61157746e6e315a2da3902d6cdbf85ea29ce65e08afbe`；overlay.test `25574a21295ea6f7f3a91185958075cffd41fe73ede68fadd115b135966891c1`；probe `dcdf3b2da6ae4e40b0908f70f2a02a1342d5488498765f91856b06c3047aed56`；fixture `a61264455bf33663e772375819e2b17e37b4620ce11affebf143cc4b90cf5a28`；撤修config `9f38ecba7b5c5c0d0d00600af600d18e1993bc127bfc98a9abde83e77b280e92`。后续同文件entry变化不在这些整文件快照签核内，公共截图若由更新probe重截，应结合本报告的端口/193计数识别批次。

入口并发施工后再次读取 `const ribbonWidth` 到 `const resources` 之间的状态/布局片段，SHA-256为 `2162feea850cc42578041a70b89aea1b2e6ed4c14ff943b986fc7c0f90e320bf`；核对该片段仍使用上述bare、列宽和x110窄屏留白。整文件hash不拿来混同入口批次。

未发现本返修范围需打回缺陷。整单仍需后续入口集成、其他未决差异及对应独立验收；路线图/Owner gate未由复查人修改。
