# G1–G4 隔离浏览器引擎接缝独立复查

> 2026-10-13 · 复查主体 `/root/potion_engine_browser_review`，非施工者 `/root`。判词：**CONCERNS**。真实浏览器中的通用引擎接缝 PASS；这不是正式炼药游戏 S4 目击，也不足以释放 G2–G4 公共池工单。

## 范围与方法

- 已独立读取本会话 `AGENTS.md`、`llm-onboarding.md`、生产/需求/测试/复查/自证总线，以及运动、事件、渲染、随机、底库手册和项目路线图。接受本次短时隔离浏览器核验；拒绝把夹具截图等同于定稿原型的结构或正式游戏的视觉验收。
- 只读审查 `scripts/potion-engine-browser-e2e.mjs`、`scripts/fixtures/potion-engine-browser.{html,ts}`、G2–G4 源码与既有独立复查；本复查只写此单，不修改生产代码、测试或其它项目。脚本使用 `configFile:false`、`publicDir:false`、`127.0.0.1:59431` 严格端口、独立 Playwright context/DPR=2/触控，`finally` 关闭浏览器和 Vite（`potion-engine-browser-e2e.mjs:17-30,112-114`），不是整套 ZeroCraft。

## 独立实跑与对抗核证

1. 运行前 `Get-NetTCPConnection -LocalPort 59431 -State Listen` 无监听。普通沙箱首跑在 `browserType.launch` 因 Edge 临时 profile 写入权限失败，退出 1，未进入玩法断言；`finally` 后该端口仍无监听。使用获准的短生命周期隔离浏览器提权复跑 `node scripts/potion-engine-browser-e2e.mjs`，退出 **0**，输出 `POTION-ENGINE-BROWSER: PASS · mouse clockwise · touch counterclockwise · visible preview · ellipse reject/accept · ordered session success`。复跑后 59431 无监听；浏览器 context 显式关闭，Node 正常退出，未见常驻进程/服务。
2. G2：脚本用 Playwright 真实鼠标沿椭圆八段顺时针移动，再由 Chromium CDP `Input.dispatchTouchEvent` 送真实浏览器触控事件沿相反方向八段移动（`potion-engine-browser-e2e.mjs:47-70`），不是直接往 World 注入 RawInput。夹具的 `PointerInputSource`、`applyCommands`、`World.tick` 与 `CanvasRenderer.sync` 构成实际输入→权威世界→绘制链（`potion-engine-browser.ts:54-69`）。步骤从 0 推进到 2，逆时针后会话仍 `active`；但脚本只断言棒最终回到 0°，没有中途棒轨迹截图或入水遮挡断言。
3. G4：鼠标真实拖动材料到锅外，`preview.x>500`、目标像素 alpha>0，权威材料 `Transform.x===100`，释放后 `preview===null`、无 drop、会话仍 `active`（`potion-engine-browser-e2e.mjs:72-92`）。独立查看 `self-check/g2-g4-browser-held.png`：画布外侧确有可见的黄色材料预览，原材料仍在原位。此处是缺图 fallback 方块，不是正式材质验收。取消、blur、reduced-motion 等由原 G4 定向测试覆盖，本浏览器脚本未逐项复跑。
4. G3→G1：同一真实鼠标拖放在 AABB 角点 `(470,210)` 被椭圆拒绝、会话保持 active；投到中心 `(380,160)` 后 `lastAction=brew.add.silver`、有序动作会话到 `success`（`potion-engine-browser-e2e.mjs:94-107`）。独立查看 `self-check/g2-g4-browser-drop.png`：结算状态文本显示 `step=3 status=success`，画布有落点影像。这证成**夹具**中的 G1–G4 顺序链，不证明正式游戏的配方表、坩埚、药液变色或结算屏。
5. 反例路径直接在同一浏览器链中执行：锅外释放和椭圆 AABB 角点都须保持 `drop=null` 且 `status=active`；若一律接受落点，点名断言会红。源码级锚点撤修验红已由不同的 G2/G3/G4 独立复查分别记录在 `REQ-POTION-ANGULAR-GESTURE.md`、`REQ-POTION-ELLIPSE-DROPZONE.md`、`REQ-POTION-DRAG-PREVIEW.md`；本轮没有再改共享生产文件或伪称做了新的源码变异。复查输出仅一行 PASS，未见浏览器 pageerror；脚本没有监听 console warning，因此“无 console warning”不作结论。

## 假阳性边界与释放结论

- 夹具直接装配三个 capability 和最小世界，不是 `games/game-potion-brewing/` 正式 manifest/宿主；画面是矩形锅口与圆点棒，截图既非 1440×900 定稿原型 1:1 对照，也无卷轴/材料架/药液变化/完整失败与重开。`potion-engine-browser.ts:13-52`、`potion-engine-browser.html:8-13`。**不得据此通过 S3/S4 机器门、复查门或 Owner 人门。**
- 夹具 `clockwiseSeen/counterclockwiseSeen` 从 G1 `stepIndex` 推导（`potion-engine-browser.ts:75-76`），能够证明当前最小配置确实推进，但不直接对独立 Signal trace 或可见搅拌中间帧逐帧核对；浏览器 `initialHash/hash` 只暴露未作断言（`:71,83-84`）。这些是证据覆盖边界，不是已复现的生产故障。
- 本次补足先前 G2/G3/G4 复查所缺的**通用引擎真实鼠标/触控/可见预览/椭圆投放**证据，适合将三单“浏览器接缝未测”改述为“隔离夹具已测；正式游戏尚未测”。但全库 TypeScript/scoped gate 仍红，正式游戏尚无 S4 对齐与真实玩家链，原独立单判词仍为 CONCERNS；**G2/G3/G4 暂不释放、不将缺口标 `delivered`**。本复查不修改路线图或人门。
