# REQ-POTION-ROD-GRAB-01 独立复查（2026-10-14）

复查主体：`Codex /root/potion_rod_review`，非施工主体 `Codex/root`。范围限通用 `AngularGesture.grabSegment` 及炼药棒身消费；不代签 Owner 人门，不代表 S6 整关验收。

## 判词

**PASS（限本通用工单）**。首轮复查查出满圈提交后的快照恢复哈希分叉，当时判 FAIL；施工者随后把发射实体 ID 改为快照内稳定的 `emittedTurns` 序号，并补了旧环与可选棒身的满圈恢复点名测试。本复查人重拷修复后的三个文件到隔离 worktree，独立复跑 13/13 绿，另做两处带唯一锚点的撤修验红，均转红且复原后再绿。此判词不代表 S6 视觉整关、全库门禁或 Owner 人门通过。

## 四步实证

| 项 | 独立核证与结果 |
|---|---|
| 范围 | `git diff` 显示通用改动在 `src/engine/protocol/components/input.ts:54`、`src/skills/tier2/angular-gesture.ts:77,100,129,185`，游戏消费在 `games/game-potion-brewing/blueprint.ts:63`；共享树大量其他项目并行脏改动不归此单，未触碰。 |
| 独立复跑 | 共享树 `npx vitest run src/skills/tier2/angular-gesture.test.ts`：12/12、退出 0；无测试 stderr 告警。首次沙箱尝试因 `node_modules/vitest/dist/spy.js` realpath EPERM 且 0 tests，故不计绿；随后仅为本地测试获准非沙箱复跑。 |
| 真浏览器复现 | 短时隔离 Vite `http://localhost:5702/?game=game-potion-brewing` + headless Chromium，真实 `page.mouse.down/up` 分别按可见棒头、中段、入水端（线段比率 0/0.5/1）。三处均 `held='player'`，按下前后 `angleMilliDegrees=0`，页面错误 `[]`。测试浏览器已关闭，端口 5702 无监听；未启动整套工作台。此项只证明三处起握和不瞬移，不代替整局视觉 1:1 验收。 |
| 隔离撤修验红 | 在独立临时 worktree `C:\Users\24652\AppData\Local\Temp\potion-rod-review-20261014` 复制本单三份当前源/测试；先 12/12 绿。将唯一锚点 `const shaftHit = onGrabSegment(gesture, transform, action);` 改为 `false && onGrabSegment(...)`，程序断言锚点命中恰好 1 次且原句已不存在；复跑 2 红、10 绿（`angular-gesture.test.ts:101,123`）；复原后 12/12 绿。共享工作树实现文件从未修改。 |
| 告警读取 | 定向测试仅有普通通过/断言输出；无额外系统定序 WARN。撤修后的两红为预期，非环境误报。 |

## 首轮阻断问题：满圈后的恢复哈希分叉（现已修复）

在隔离 worktree 添加仅供复查的 `expectRestoreContinues` 用例：配置与 `blueprint.ts:63` 同一 `grabSegment`，棒头 `down`、移到轨道 0° 后快照；恢复新世界，双方同样继续 `move 0,45,...,360`。快照当下哈希相等，后续终态却为 `ac63d4b0` vs `6f5d0d04`，测试退出 1。作为归因对照，**不配置** `grabSegment` 的旧环路径，`down 0° → move 45° → 快照 → move 90°...360°` 亦分叉：`4cae65d0` vs `46c8d86a`。因此这是存量 AngularGesture 满圈恢复问题，不是胶囊几何特有；但工单明确要求「确定性快照不漂」，仍构成关单阻断。

最小复现（已被修复版收为正式测试）：在 `angular-gesture.test.ts` 的 `describe` 内添加 `expectRestoreContinues(() => make(), w => { send(w,event('down',0)); send(w,event('move',45)); }, w => { for(let s=2;s<=8;s++) send(w,event('move',s*45)); });`，再运行 `npx vitest run src/skills/tier2/angular-gesture.test.ts -t '<该测试名>'`。修复前 12 条正式测试仅续行到未满圈，因此漏了发射后的状态；修复后见 `angular-gesture.test.ts:185-201` 的点名覆盖。

根因定位：初版 `angular-gesture.ts` 把 `world.getVersion()` 同时用于一拍重复提交闸、`Signal` 实体 ID 和持久化的 `lastEmitTick`；`World.restore()` 在 `src/engine/core/world.ts:432-468` 按设计只递增本地 version，不恢复原世界 tick/version。恢复后两世界经历同样后续指针输入，所发 Signal ID 与 `lastEmitTick` 仍可不同，进入快照哈希。上述哈希/失败输出是**修复前**证据，不是当前状态。

## 修复后独立复跑

- 修复后 `src/skills/tier2/angular-gesture.ts` 在共享树与隔离 worktree 的 SHA-256 均为 `D53FB7BA86DB0F82C54D37028A33FFC5B44CB0FB2357B9F1BA28EE17C45BE97C`；`input.ts` 和正式测试亦从共享树重新复制。未在共享树修改实现或测试。
- 稳定发射序号写入 `AngularGesture.emittedTurns`（`src/engine/protocol/components/input.ts:69`），信号 ID 由序号形成（`angular-gesture.ts:223-230`），同一 system run 防重复发射；`World.restore()` 不需改动。正式测试 `angular-gesture.test.ts:185-201` 对旧环及胶囊分别在满圈前快照并继续，独立隔离复跑 **13/13 PASS**，共享树再与 `blueprint.test.ts` 同跑 **18/18 PASS**，无 stderr 告警。蓝图实际配置仍在 `games/game-potion-brewing/blueprint.ts:63`，真引擎装载两份配方均通过。
- **撤稳定 ID 验红**：隔离 worktree 把 `Signal` 实体 ID 中唯一的 `nextTurn` 锚点改回 `world.getVersion()`，先断言改写锚点恰好命中 1 次且原句不存在，再仅跑「满圈前快照恢复」；**1 红**（`angular-gesture.test.ts:187`，`48bd4c65` vs `d7e88136`）。
- **撤棒身命中验红**：复原稳定 ID 后，把唯一锚点 `const shaftHit = onGrabSegment(...)` 改为 `false && onGrabSegment(...)`，同样确认锚点恰好 1 次；全定向套件 **2 红 / 11 绿**（棒头/中段/入水端与棒头起握整圈两条断言）。再复原，隔离套件 **13/13 PASS**。这说明新测试确实看护两个不同语义，不是仅看静态常量。
- 真浏览器三处握持见上表；此次确定性修复只替换发射 ID/持久计数，没有触碰 `onGrabSegment` 几何或 Pointer→World 投影；未冒称浏览器完成了快照恢复验收（该项由真引擎测试覆盖）。

## 已验证边界 / 未覆盖

- `grabSegment` 未配置时 `onGrabSegment` 返回 false，仍走旧环范围判断（`angular-gesture.ts:129-131,181-193`）；原有环命中/死区/短弧/多指针测试包含于修复后的 13/13 绿。起握胶囊优先时不重置轨道角，浏览器与单测均见无瞬移。
- 新段的确定性**同构建双跑**与满圈快照恢复均通过。初版失败不是随机性或浏览器渲染问题，修复后已由点名测试守住。
- 本单未运行全库门禁，也未验全局 S6 UI/素材；公共池释放仍须施工主体按工单流程收口，不据此宣称游戏完成。
