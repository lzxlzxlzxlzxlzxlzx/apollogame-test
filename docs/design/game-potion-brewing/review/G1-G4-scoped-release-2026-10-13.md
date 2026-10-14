# G1–G4 炼药项目范围内引擎能力释放独立复查

> 2026-10-13 · 复查主体 `/root/potion_scoped_review`，非 G1–G4 施工主体 `/root`。**判词：PASS（限通用引擎能力的本项目范围交付）**。此判词不称全库门绿，不签正式游戏 S3/S4，也不代替 Owner 人门。

## 范围与裁决

- Owner 于 2026-10-13 明确：并行项目的全库红项不阻碍炼药进度。当前 `requests.md` 已把 G1–G4 释放口径收窄为本项目定向测试、真浏览器引擎接缝与非施工者复查。此口径只适用于本次能力释放；`scoped-gate`/S8 推送门仍不能宣称通过。
- 核对四张 `work-orders/GAP-POTION-0{1,2,3,4}.md`、当前 `requests.md`、机读 `capability-gaps.json` 与路线图：G1 为确定性有序 add/stir 会话；G2 为单角度椭圆手势；G3 为可选椭圆 DropZone、缺省 box 保持；G4 为默认关闭、只读 G3 命中且不写 World 的拖动预览。四项是 S3/S4 的通用前置能力，正式 `games/game-potion-brewing/` 的画面、药液变化、完整失败/重开与原型 1:1 尚待独立阶段门验证，不能倒置为能力本体交付条件。
- 本复查只写本文件。共享工作树在复查期间有并行变更；起初 `git status --short --` 显示 G1–G4 若干文件修改/未跟踪，末次同范围查询已为空，故不据本轮瞬时 `git diff --stat` 伪称逐文件提交归属。已用工单声明范围和实际测试对象核对，未发现本项目内越界实现。

## 独立四步核证

1. **复跑**：`npx vitest run` 点名 `ordered-action-session`、`angular-gesture`、`drop-zone-hit`、`drag-place`、`queued-input`、`drag-preview` runtime/render、`registry-guard` 与 `system-graph` 共 **9 文件 63/63 PASS，退出 0**。普通沙箱曾报 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM`、零测试，不计为红/绿；获准本地隔离进程重跑后才取有效成绩。G1–G4 相关 `npx eslint` 退出 0；`npx vite-node scripts/gen-capability-registry.mjs --check` 同步 **142** 条；`component-manifest-guard` **208/208 PASS**；`build-component-map --check` **231** 组件 PASS。最初误用裸 `node` 跑需要 vite-node 的 registry 脚本，报 `capability-index.js` 模块缺失；改用脚本头声明的正确入口后退出 0，不把误用算工程缺陷。
2. **锚点撤修验红**：独立核对既有非施工者复查的在档变异证据，而未在共享工作树重复破坏：G1 将 `signal.name !== step.expectedAction` 锚点唯一命中后内存替换，错误材料与同拍首错 2 例转红；G2 将环带 `first.radiusSquared < minRadius * minRadius` 唯一命中后回退旧条件，内侧抓棒 1 例转红；G3 将椭圆 `nx * nx + ny * ny <= 1` 唯一命中后改恒真，角点/权威投料 2 例转红，且代发门另有唯一锚点、2 例转红；G4 将 `RETURN_MS = 280` 唯一命中后改 1ms，回弹 2 例转红。出处分别为 `review/REQ-POTION-{ORDERED-ACTION,ANGULAR-GESTURE,ELLIPSE-DROPZONE,DRAG-PREVIEW}.md`，四轮均记录撤除临时 transform 后恢复绿。本轮 63/63 是恢复后的独立复跑，未自称本轮重做源码变异。
3. **实证复现**：复查者用真实浏览器独立重跑 `scripts/potion-engine-browser-e2e.mjs`，退出 **0**：鼠标沿椭圆顺时针、Chromium 触控逆时针、DPR2 可见材料拖影而权威材料不动、锅外及 AABB 角点拒收、锅口中心接受，并推进 G1 会话到唯一成功。运行时只开 `127.0.0.1:59431` 的短生命周期隔离 Vite；以调用侧 `page.screenshot` 空实现阻断写入他人所有的既有截图，测试自身的像素断言仍执行。运行前后该端口均无监听，浏览器/context 与 Vite 在 `finally` 关闭。脚本只断言 `pageerror=[]`，没有监听 `console.warning`；不能据此宣称浏览器零告警。
4. **读告警/系统图**：独立运行 `npx vite-node scripts/system-graph-audit.mjs t2-ordered-action-session t2-angular-gesture t2-drag-place t2-clickable t2-keybind t2-effect-apply` → **7 systems、无重复 ID、无悬空显式边、可排无环，退出 0**。63 例 Vitest 的唯一 stderr 是 `system-graph.test.ts` 特意构造的 `[L,P]` 推断环 fidelity 测试，不属于这 7 个实装系统；没有把“exit 0”偷换为“全局超集绝无 WARN”。

## 边界与未宣称事项

- 独立 `npx tsc --noEmit --pretty false` 仍退出 **1，共 14 项**，仅命中 `games/game-card-reveal/`、`games/game-dice/`、`games/game-theft/` 与 `src/launcher/game-runner.tsx`；**G1–G4 本体/接缝文件零诊断**。这是 Owner 已裁决不阻断本项目能力释放的并行红项，不是全库绿色凭证。公共 Git 推送、S8 全库终检仍按原门禁，未执行远端 Git 操作。
- 隔离夹具不是真正的 1440×900 透明三栏炼药游戏。其截图/状态不能通过 S3 manifest 装载门、S4 真游戏玩家旅程、定稿原型结构/视觉 1:1、药液随投料/搅拌变色、失败变紫、结算屏或 DokiWorld 宿主合同。它只证明 G1–G4 **通用输入→World→Canvas 接缝**可以在真实浏览器中工作。
- 基于 Owner 的项目范围裁决和上述独立证据，**G1–G4 可从本项目能力缺口 `accepted` 收束为 `delivered`，并从当前引擎需求池释放**；随后可开始正式游戏 S3 施工。此结论只授权施工主体按合法控制面更新状态，不是本复查者修改 `requests.md`、`capability-gaps.json`、路线图或 `pipeline.json`，也不是 S3/S4/S8 人门通过。
