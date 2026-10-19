# S6 正式 PNG 接线独立复查 · 2026-10-13

复查人 `/root/s6_asset_candidate_review`，不是正式 manifest、游戏测试、自证或资产施工者。

**判词：正式 PNG 接线行为局部 PASS；当前阶段刷新未通过（S3 机器门 FAIL）。** 不代表 S6 整关完成、全库绿灯或 Owner 素材审批。S2 旧 CONCERNS 保留；S3 点击探针修复后必须复跑，S4/S5 不越前置门落账。

## 冻结范围与指纹

- 正式 `library/game-clue-investigation/manifest.json` SHA256 `c770751edcc017780ec24db86638b7ddd27c684d156d68bffb26cfdb3e003d60`。
- 流程 gameHash `12157d544b66554b`，gapsHash `da9882a2f6910af5`。
- `art/art-ledger.json` SHA256 `8bb38e7922e759d43a7e868a7bebe24d22ea5dd4696229381a2a97d69e6cf0d3`。
- 复查只拥有本文和合法review落账。临时撤修测试副本已删除，未改生产/共享源文件、GD剧本、人门或approved字段。
- 本会话已完整读 AGENTS、入门、生产/需求/资产/美术/渲染/测试/复查手册；本次补完整读 self-check、UI实操与UI接线手册、check-ui。重读现行requests、gaps、capability-plan、路线图、S6自证和正式测试/adapter/探针源码。

## 四步独立实证

### 1. 复跑（工作目录均为仓库根）

| 命令 | 独立结果 |
|---|---|
| `node scripts/game-pipeline.mjs checklist game-clue-investigation S2`（以及S3/S4/S5） | 各 exit0，按各关清单准备核证，不等于已通过 |
| `npx vitest run games/game-clue-investigation` | exit0，3文件20/20（S3 4、S4 5、S6 11），20:46:13；撤修清理后20:53:56再跑仍20/20 |
| `npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation` | exit0，GD5/5、67检查点（10/9/13/7/28），普通不推进、必需幂等、可选/完成、退出取消、两终局重开 |
| `npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs --verify` | exit0，8PNG+7mask，2,753,452像素对账；ledger8行/8唯一key/0孤儿/0缺provenance/8文件绑定/编号稳定/**0 approved** |
| `node docs/design/game-clue-investigation/self-check/s6-browser-probe.mjs --live` | exit0，真实Owner已运行5173、正式库/manifest/art，无替换这些资源的fixture；42透明/实心断言，完整主链、两终局重开、键盘/DPR2触控/reduced-motion均过 |
| `node tools/ui-audit.mjs docs/design/game-clue-investigation/self-check/s6-reveal.audit.ts --w 1440 --h 900` | 独立遍历idle/flavor/reveal/collected/completed/exit/cancelled×深/亮14轮，全部exit0；重叠、硬对比、AA警告、border-image均0；另1060×760 reveal深亮两轮也exit0 |
| `node scripts/game-skill-audit.mjs game-clue-investigation` | exit0，RATCHET PASS，无未覆盖红旗；**AUDIT WARNINGS**仍报无美术台账（见下） |

浏览器只拦截与本游戏无关的provider列表返回空，未模拟正式manifest/图/索引；新建隔离配置，无Owner日常浏览器资料。地址 `http://localhost:5173/?game=lib:game-clue-investigation`。finally已关闭浏览器；没有启动整套系统，Owner5173未停止。局部审计服务自动结束，5720/5726无监听。

### 2. 唯一锚点隔离撤修

临时测试副本 `games/game-clue-investigation/s6-formal-revocation.test.ts`：生成前断言源码插入锚点 `const artRoot = new URL` 唯一1处；运行时断言正式副本的 `object-rug.Sprite.fit` 恰为contain，再**只改内存副本**成cover。

执行单文件Vitest exit1，stdout `REVOCATION UNIQUE ANCHOR HIT: object-rug.Sprite.fit contain -> cover`；11项中10通过、1失败：`freezes authored fit, anchors, geometry and opaque color against approved prototype` 精确报 `[0.5,0.5,'cover']` 不等于contain。证明本轮新加冻结几何守卫能抓到原型fit漂移（旧候选测试仅遍历fit而不能保护配置，此缺项已补）。

副本由apply_patch删除、Test-Path=False，正式全游戏20/20复绿。未撤改共享工作树或他人现场。

### 3. 真浏览器与可见性复现

- 七件×三视口（1440×900、720×800、1920×1080）各透明与实心：21反例无hover/无弹窗，21正例出现对应物件UI。选点独立读最终PNG的alpha稳定邻域，非拿引擎自身映射作oracle。
- 实际Canvas idle/flavor均`(0,0,1440,900)`，窄屏`(0,175,720,450)`，没有档案条推挤或比例漂移。
- 收录前后Canvas自身RGBA逐字节一致，现场物件未扣除/染绿。证物Image实际加载，naturalWidth非零，场景/证物/收录同key由正式11条alpha测试约束。
- keyboard Enter/Escape、DPR2触控茶杯、完成后重开与取消后重开再调查均通过。动画no-preference=0.24s、reduce=0s；reduce档案条0s。
- 本复查实际查看本轮S6-01-idle、S6-03-lock-reveal截图：真背景/物件可见、地毯不是大矩形着色，证物为同窗锁实物。截图6原型+16正式由独立重跑更新。
- 自证抽查至少覆盖透明命中、档案条不漂移、收录保持、终局出口；S6-alignment八问/三问有具体回答，S4/S5历史单已追加本轮证据链接，不抹掉历史事实。

### 4. 告警与实际阻塞

**S3 gate真实失败（未绕过）：**

`node scripts/game-pipeline.mjs gate game-clue-investigation S3` exit1，时间2026-10-13T12:49:06.306Z：

> parse+引擎装载（load+2tick）零 error · ✓ 渲染探针过 · ✗ 点击门未过 · [click-probe] game-clue-investigation ✗ 卡带 Canvas 内无可验的 Shape+Clickable 热点（mask-only 不以包围盒假验）

实查 `scripts/click-probe.mjs:156`：`if (click.hitMaskKey) continue`，167行在候选0时拒收。正式七件全mask后不支持，而不是游戏点击失效；上述真实旅程独立复现可玩。已报主聊天/共享探针负责人修通用能力。不能添加假矩形热点或把专用旅程PASS伪装成此机器门通过。

**台账控制面误报：** 真实library台账verify通过，但`board` S6仍“无台账”；`game-skill-audit`亦同。属于共享路径识别问题，已报告；不得复制public第二份台账来骗绿。

**其他告警：** UI审计每轮house检测“否”，实际代码显式apolloOnyx/daylight条件传参，正式manifest为apolloOnyx，華丽件3–5；静态识别结果不隐瞒。当前无低对比/重叠警告。浏览器console/pageerror=0。错误定位期间读了不存在的s6-ledger.mjs、library/pipeline.json，已纠正为实际import脚本与CLI，未计作测试通过。

## 当前合法落账与不扩大结论

- S2已由本独立复查者合法`review --verdict CONCERNS`落账（12:48:47Z），12个正式capability实名/纯数据解释器/§4.5美术路径成立；旧j1-state计划与Resource实现偏差保留。
- S3机器门FAIL且旧review过期；未写S3 PASS。S4机器/复查、S5复查仍过期，未越前置门刷新。
- S6真实资产局部可审，但0approved。原型证物框裁切与正式contain完整图不同、S5 house框皮/字体/演出差异仍列两条⚠，待Owner视觉裁决。不是本复查可代签的事项。
- tsc/build/全库depcruise来自主聊天而非本复查独立跑，不能拿其报告宣称全库绿；当前本报告仅列自己执行的局部证据。
- 共享探针/控制台修复后重新跑S3与后续门，再追加真实判词；本报告当前不构成最终S3–S5刷新完成。

## 续轮：共享 mask 点击探针定向复查（22:23，本轮不刷新阶段）

游戏视觉 manifest 正在其他代理施工，主聊天明确要求暂不跑阶段门/写最终review。本轮只对共享修复作独立定向复查；此前S3失败记录保留为历史实证，不能拿本节测试绿自动抹成阶段绿。

- 读取当前共享工单 `docs/workflow/requests.md` 的REQ-GCI-CART-ART-BRIDGE续锁、`src/studio/cart-click-probe-points.ts`及测试、`scripts/click-probe.mjs`及测试、`cart-run-core.ts`接线。新增dev-only live `maskTargets()`从严格World取得mask，使用共用Sprite draw plan逆投影、真实hit/pick谓词校验可点层级，并排除透明点落在其他目标上。旧`canvasClickTargets`仍跳mask是**legacy shape分支**；runCanvasCartProbe将其与live maskTargets合并，不能误判为仍全跳mask。
- 独立 `npx vitest run scripts/click-probe.test.mjs src/studio/cart-click-probe-points.test.ts`：22:20:58 exit0，**2文件24/24**（19+5）。撤修后22:23:02再次exit0、24/24。完整stdout/stderr无WARN/循环/错误。
- 隔离撤修：复制选点源码与5项测试到相同目录的临时`*.independent-mutant.*`文件；生成前严格断言源锚点`if (solid) out.push`恰1处，导入替换锚点亦恰1处，仅临时源码改成`if (false && solid) out.push`（模拟移除新mask候选输出）。运行stdout明确`REVOCATION UNIQUE SOURCE ANCHOR HIT`，exit1：cover/contain×scaleX±1的4条双视口映射测试全部红（solid undefined），错源拒收仍过，**4失败/1通过**。两临时文件随后apply_patch删除，生产源码未变；原24项复绿。
- 共享原件SHA256：`cart-click-probe-points.ts`=`efbb1bae37043ef6a32bd28db6c97a20afddf40dd0ebbc1341c9bc06b53f8b5c`；`click-probe.mjs`=`383f69c01817de7971a9b97879d97ff780aa952f09a5f96c4c16f06c22ff030f`。
- 已读施工落盘`S3-click-gate.json`的14候选/2Signal/2透明/0errors，但**不是本复查本轮独立跑出的浏览器结果**，不将其充作独立证据。新视觉版本冻结后仍需本复查再跑真实点击门与合法S3–S5流程。

判词：**共享选点与门判据定向测试局部PASS**；真实浏览器及阶段最终新鲜度待冻结后续跑，没有新增任何人门/最终阶段review记录。

## 续轮：按钮局部返修（22:50，CONCERNS，不刷阶段）

正式manifest冻结SHA256复核为 `8a7306cb7439875b1a79b320aa66c7303b01534075a77caa0856bb19449f1a9d`，结束后再读相同。Owner已经选择GCI-S6-UI-02通用字段A、遮罩0.9；共享UI仍施工，本节不审未来字段、不把旧CONCERNS静默消除。

- 独立全游戏Vitest22:45:55 exit0，**3文件21/21**（S3=4/S4=5/S6=12）；22:50:02清理撤修后再次21/21。
- 独立reveal深亮主题1440×900审计两轮exit0，重叠/对比硬失败/AA警告/border-image均0，华丽件3、house静态检测仍否。未把施工者14轮冒充本轮全部独立重跑。
- 唯一锚点撤修：临时测试副本插入前断言源码锚点唯一，递归收集`lock-collect`严格length=1且kind=ghost，再仅内存改回hero；stdout `BUTTON UNIQUE ANCHOR HIT: lock-collect ghost -> hero`。exit1，12项中**1失败/11通过**，精确命中`uses constrained rectangular prototype buttons without changing actions or dimensions`的hero≠ghost断言。副本已删除，原21项复绿。
- `s6-browser-probe.mjs --live` 本轮独立**exit1**：`http://localhost:5173/?game=lib:game-clue-investigation` 返回 `ERR_CONNECTION_REFUSED`。未自行启动Owner系统，不能宣称本轮live PASS。
- 使用既有不带live的5726隔离模式，真浏览器顺利走完42alpha、按钮/收录/两终局/触控/动画所有行为断言，但最终console错误汇总**exit1**。只读诊断副本添加requestfailed URL输出后复现：desktop和touch各一条，均为`http://localhost:4000/api/status net::ERR_CONNECTION_REFUSED`，不是图/索引/manifest。调用来源实查`src/launcher/devtools.tsx:131`。没有过滤错误、没有伪造资源响应去掩盖故障。
- 目击该次`S6-03-lock-reveal.png`：收录按钮为完整矩形金色面，不再是hero切角发光皮。仍有旧Modal框/图裁切/字级差异，归已接受的共享UI缺口，不据此称原型1:1完成。
- 临时诊断副本和撤修副本均apply_patch删除；finally关闭浏览器，5726无监听。没有阶段gate/review/signoff/approve调用。

判词：**按钮数据与受测alpha行为局部PASS；本轮浏览器总门CONCERNS/未过**（Owner5173不可达，隔离模式受无关devtools status请求报错）。最终共享UI消费冻结后必须重新跑完整真浏览器与阶段门；可针对已确认无关status接口建立明确隔离fixture，但本轮失败不得改写为历史通过。

### 按钮轮最终隔离复跑：PASS（不等于live）

主聊天仅在非live分支的desktop/touch增加精确`http://localhost:4000/api/status`→JSON null夹具。本复查核对源码两处均位于`if (!live)`内；未过滤console/pageerror，未新增拦截游戏art。非live原有library列表/manifest夹具仍读取冻结正式文件，不能称无fixture的Owner真实服务验收。

随后本复查独立执行 `node docs/design/game-clue-investigation/self-check/s6-browser-probe.mjs`，**exit0**，URL=`http://localhost:5726/?game=lib:game-clue-investigation`。三个视口七件42个透明/实心断言、收录像素保持、两终局重开、键盘、DPR2触控、reduced-motion全部通过，console/pageerror=0；本轮6原型+16正式截图已更新。idle/flavor均`0,0,1440,900`，narrow=`0,175,720,450`。finally关闭隔离浏览器及局部Vite，5726无监听；正式manifest SHA仍为8a7306cb…19449f1a9d。

因此**按钮局部修复及隔离浏览器行为PASS**。此前5173 live拒连和无status夹具时exit1仍保留，不改写历史，不冒称live恢复；共享UI继续施工，未执行任何阶段gate/review/人门更新。
