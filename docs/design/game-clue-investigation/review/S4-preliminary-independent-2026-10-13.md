# S4 独立复查导航（2026-10-13）

复查人：`/root/s4_independent_audit`，非 S4 游戏/共享桥施工者。日期：2026-10-13。初判 **CONCERNS** 于 07:03:30 UTC 合法落账，`gameHash=a96dcb6bf2a87bb7`；以下保留该轮历史证据。共享适配器和指针能力新复查后，本复查人再独立重验，最新判词见文末“复核升级”，以最新合法流程板落账为准。Owner 人门始终未代签。

## 独立复跑与告警

| 核验 | 实际结果 |
|---|---|
| `npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation` | exit 0；GD 5/5 剧本、10+9+13+7+28=67 检查点。五本首行均为 `// author: GD`；动作词 `investigate.*`、`clue.collect`、`investigation.*` 可在 `manifest.json` 的 `Clickable`/`KeyBinding`/LayoutNode 动作核对。 |
| `npx vitest run games/game-clue-investigation/s3-skeleton.test.ts games/game-clue-investigation/s4-interaction.test.ts` | exit 0；2 文件 9/9。包括世界坐标指针、弹层抢点、重复收录、同轨 hash、LayoutNode schema。 |
| `Get-Content library/game-clue-investigation/manifest.json -Raw \| npx vite-node scripts/manifest-check.mjs` | exit 0；`warnings:[]`，显式 11 个 capabilities。 |
| 同一 manifest → `scripts/bench-manifest.mjs` | exit 0；95/100，五轴分别 15/15/20/20/25；Structure 唯一注记“缺：相机”，静态现场未用相机，但它仍是输出告警，非满分。 |
| `node tools/ui-audit.mjs docs/design/game-clue-investigation/self-check/s4-ui.audit.ts --w 1440 --h 900` | exit 0；重叠 0、硬低对比 0、对比警告 0、border-image 前提 0、华丽件 4。审计报 `house 主题：否`，而 `manifest.json:8` 确为 `apolloOnyx`；这是审计入口未识别数据卡带主题的局部盲区，不冒称工具已验证 house 主题。 |
| `node scripts/game-skill-audit.mjs game-clue-investigation` | exit 0，`RATCHET: PASS`；但总体 `AUDIT: WARNINGS`，黄色“无美术台账”属 S6 待核，不能转写成全绿。 |
| `node scripts/align-count.mjs --game game-clue-investigation --stage S4` | exit 0；对齐单 8 ✅、3 ⚠且 0 条缺裁决去向、0 ❌。 |

另复读 S4 机器门产物 `public/games/game-clue-investigation/probe/S4-uiwalk.json`：`ok:true`，但 `signalSteps=91`、`drivenSteps=0`、`uiDrivableRate=0`，每步标注 `__zcProbe 缺失`。源码 `scripts/ui-walkthrough-probe.mjs:156-158` 在缺少 `window.__zcProbe` 时仅记录未驱动并继续，`:245-247` 说明该口只在 GameRunner dev 域；本游戏数据卡带真 UI 通过独立 Edge 鼠标/触屏已证明关键路径可点。这是通用走查对卡带宿主的**机读盲区**，不是游戏 91 步已真点击成功；`ok:true`/机器门绿不得被转述为 UI 91/91。Owner 已就 `REQ-CART-UIWALK-ADAPTER` 裁 A 补通用真手势走查；截至本判词该共享能力未施工/复查，不能提前借未来修复销掉本关注项。

默认受限沙箱首次并行执行 acceptance/Vitest/UI audit 均在 Vite `realpath` 报 `EPERM`（0 测试收集），并非产品断言失败，也不能计作 PASS；后经本机只读隔离执行上述命令均为实得 exit 0。未改测试、manifest 或任何共享源码。

## 真浏览器与原型抽查

独立短时 `http://localhost:5736/?game=lib:game-clue-investigation`、无头 Edge、隔离 context，API 只读 fixture 取当前正式 manifest。真实鼠标移入茶杯后 `data-pointer-feedback-state=hover`、按下为 `pressed`（按下帧截图在内存中 30,725 bytes），松开有可见茶杯档案条；Canvas idle/flavor 均 `(0,0,1440,900)`。真点窗锁收录、湿脚印收录后出现 2/2 完成 Modal；点完成唯一出口重开到 0/2 后窗锁仍可打开。特写 Escape 关闭后连续再按 Escape 出现退出确认；确认取消、取消唯一出口重开后窗锁仍可打开。完成帧内存截图 60,957 bytes，`pageerror/console.error` 均 0。另起 `http://localhost:5737/`、`hasTouch:true` 真 `touchscreen.tap` 茶杯，档案条可见，Canvas 前后矩形相同，浏览器错误 0。两个 Edge 与 Vite 均在 `finally` 关闭；端口 5736、5737 复测无监听。

从自证 21 张图中独立目视至少抽查定稿/正式 idle、flavor、reveal、exit 四对，另看正式 hover、completed、touch：布局锚位、顶部进度、底部条、证物卡的“标题→影像→描述→动作”和退出确认路径同构；正式 scene/evidence 仍是灰盒，原型的雨夜房间与真实物件不存在于正式运行时。`S4-alignment.md` 行 3 把正式 PNG、alpha 形状与材质交 S6；行 5 把透明洞同源实拍交 S6 PNG 接线和 POINTER-02 独立复查；行 11 把纹理/字体/演出时序交 S5/S6。三条 ⚠ 均有可执行去向，不把灰盒图说成 PNG alpha 已实拍。行 1（场景不漂移）、行 6（普通反馈）、行 8/9（完成/取消重开）已由本次独立浏览器复走。窄屏 `S4-11-narrow.png` 为现存施工截图，本次未独立复测窄屏，不以其充作我的浏览器实证。

## 带唯一锚点的撤修验红与对抗复现

零落盘内存撤修：先从当前 `manifest.json` 精确筛选 `id=effect-lock-count` 且 `Effect.onSignal=clue.collect.lock`、`targetId=required-collected`、`value=1`，**唯一锚点命中数 1**（源码 `manifest.json:324`）。程序装载正式 manifest 后，另断言真实 World 上该 Effect 值为 1，仅在隔离 World 内将该组件 `value` 改 0，不改文件。GD 第 02 剧本基线 PASS→撤修 FAIL，步骤 5/9/12 的进度期望 1 实得 0；第 03 剧本基线 PASS→撤修 FAIL，步骤 10/12 期望 1 实得 0，步骤 16 期望 2 实得 1，步骤 17 期望 `completed` 实得 `scene-idle`。因此这些断言并非常量假绿；进程退出即恢复。此递归只覆盖“窗锁首次计数→完成”条款，**不冒称所有 GDD 条款零裸奔**。

额外零落盘对抗探针使用真实 adapter/World：在 idle 发非法 `clue.collect`、非法 `investigation.restart` 均保持 idle/0；打开窗锁特写后抢发 `investigate.prints` 仍留 `clue-reveal`、`selected-object=1`、计数 0。它补证 S4 复查清单的拒收/失败路径，但尚非点名持久化测试。

## 玩家八问与好玩三问复核

八问：① 0/2 与目标位于顶部，结构上核心信息醒目；② 茶杯 hover/press→档案条与收录→进度都有即时确认；③ 2/2 完成 Modal、取消 Modal 能区分结果；④ 0/1/2 进度条与完成态有视觉层级，首版无其他数值比较；⑤ 无倒计时/回合，状态由档案条、特写、完成/取消文案显示；⑥ 文字按钮可理解，但灰盒未悬停前物件身份/可发现性弱，S6 素材关必须复验；⑦ 七个 `focusTargets` 与七个 `Clickable` 动作同名，浏览器复走关键路径，其余由 GD 剧本覆盖；⑧ 无对手归属，当前线索与本局进度在收录/重开后即时更新，未见上一局残留。传统 `ui-inventory.mjs` 对纯数据卡带不适配，施工对齐单已诚实标注，不能记它 PASS。

好玩三问：目前灰盒虽然可闭环，但重复探索欲弱；可见反馈已足够让玩家辨认点击/收录/完成，不足以评价正式 PNG 的透明轮廓；浏览器链未见超过 1 秒的无事可做窗口，真正困惑是灰盒初始身份弱。上述是 S4 结构预审，不为 S5/S6 的观感、时序或素材代签。

## 范围、阻断与结论

- S4 领工声明位于 `requests.md:3-10`。`git status --short` 所见游戏测试/adapter、验收剧本、自证与 review 文件均在声明范围；`s4-ui-map.md` 是声明中“必要本游戏局部 UI 数据与审计文件”的结构映射，可按该类理解，不把未逐字列名当越界 FAIL。共享 UI/POINTER/流程 CLI 各有独立施工锁，不能归入游戏施工者的越界写入。
- `manifest.json:9` opt-in 共享 POINTER 投影在灰盒茶杯上实测可见，但 **POINTER-02 共享能力现有独立判词 CONCERNS**；本次未用正式 PNG/透明洞验证同源 mask，不把它算闭环 PASS。正式 PNG/资产槽/美术台账仍属 S6。
- S2 能力计划列 `j1-state`，实际 S4 用 `selected-object` Resource，已有 S2 stale 独立判词 CONCERNS；本次未改其 Owner 冻结合同或替它销债。
- 当前复读 `board` 已确认 S3 机器/异人复查/既有 Owner 人门均绿、S4 机器门绿；`checklist S4` 独立打印 exit 0。S4 独立复查 CONCERNS 已由合法 CLI 落账，Owner 人门仍未签。项目路线图如仍写旧 stale，须按真实流程板同步，但本复查人不代改其他控制面。

因此：定向玩法、结构、拒收、撤修与浏览器路径均有独立正证；**CONCERNS** 的原因是通用 UI 走查 0/91 机读盲区、灰盒素材/PNG-alpha 尚属 S6、共享 POINTER-02 在本次落账时仍有独立关注项。它们不抹去本次实测的关键 UI 可玩性，也不允许宣称 S4 整关 PASS。共享 POINTER 若随后更新，须按最新事实重新核对本判词与哈希；Owner 人门只由 Owner 决定。

## 2026-10-13 共享能力到位后的独立复核升级

本节覆盖上文初判的时态，不删改旧轮证据。先独立复读共享导航 `REQ-CART-UIWALK-ADAPTER.md` 与 `REQ-GCI-POINTER-PROJECTION.md`：二者均有**非施工者 PASS，仅各自共享范围**；我没有拿它们直接替代游戏 S4。复读 `board` 为 S4 机器门 08:17 UTC exit 0、bench 95、GD 5 场景绿、UI 可驱动率 100%，仍是 `gameHash=a96dcb6bf2a87bb7`；复读本作 `S4-uiwalk.json` 为 5 剧本、42/42 玩家信号由真手势驱动、49 个 `waitUntil` 不入动作分母、18 个 `expect` 明示“世界态未核”。故 UI 探针只证真实操作路径，世界条件由另一路 GD runner 查，不混称 42/42 世界断言。

独立复跑 `runWalkthrough('game-clue-investigation')`，**直接调用返回而非 CLI 写产物**：exit 0，5 剧本 42/42，`consoleErrors=0`、`pageErrors=0`，短时隔离 Edge/Vite 的 5700 端口事后确认无监听。受限沙箱第一次 Edge `browserType.launch` 因临时 profile 的权限错误 exit 1、没有走查结果，真实本机隔离复跑才获得上述 PASS，未吞第一次失败。独立 `npx vitest run` 本游戏 S3/S4 两文件及走查测试一文件 **3 文件 45/45**；默认沙箱首轮 `realpath EPERM`、0 收集，不计 PASS，真实环境复跑 exit 0。独立 `acceptance-run` 再获 GD 5/5、67 检查点 exit 0；`align-count S4` 8 ✅/3 ⚠且每条有去向/0 ❌ exit 0。正式游戏 PNG/透明洞仍归 S6，不将灰盒提前宣称视觉 1:1。

本轮追加零落盘撤修验红：从 `scripts/ui-walkthrough-probe.mjs` 精确命中卡带 `0/N` 判红条件**唯一锚点 1**；基线 `assessWalkResult('cart',{signalSteps:42,drivenSteps:0},[],[],[])` 返回 `ok:false`，仅在内存函数体把该条件改为 `if(false)` 后同输入误返 `ok:true`，锚点断言与红转绿断言都通过，工作树未改。上文 effect-lock-count 的唯一锚点 GD 红转绿测试仍保留为玩法侧撤修证据。

读告警：独立 `npx tsc --noEmit --pretty false` **exit 1**，只有 `src/skills/tier2/ordered-action-session.test.ts:128,129,166,167,169,170` 六条 `TS2353 completedSignal`（其它共享在途文件），不得冒称全库 TypeScript 绿；共享审计另有其它项目 33 条 depcruise 违规，亦不冒称全库门禁绿。UI 探针的 18 个世界断言未核仍是工具边界，但本作独立 GD runner 的 67 检查点与前述非法输入对抗路径覆盖玩法判定。本轮未改游戏或共享实现，未代 Owner 人门。

复核结论：初判 `CONCERNS` 的两项 S4 实质原因（卡带 0/91 假绿、POINTER-02 未闭）已有新的独立实证消除；剩余 PNG 美术、透明洞与演出精修有明确 S5/S6 去向，按 S4 结构关范围不作拦截。**本复查人已于 08:27:59 UTC 经合法 review CLI 更新 S4 复查为 PASS**，回执 `gameHash=a96dcb6bf2a87bb7`；这仅属 S4 玩法/结构范围，不是 S5/S6/全库 PASS，也不是 Owner 人门。
