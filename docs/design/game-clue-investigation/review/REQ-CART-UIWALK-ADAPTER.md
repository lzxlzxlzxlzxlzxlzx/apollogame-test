# REQ-CART-UIWALK-ADAPTER · 通用卡带真界面走查复查导航

Owner 选择 A。范围仅共享 dev-only 只读动作口、通用走查探针和隔离浏览器验证；不代签 GCI S4 或 Owner 人门。卡带动作必须由真实 Canvas/DOM 手势驱动，不能直接注入 Signal。

## 施工自证（2026-10-13）

- `src/studio/cart-run-core.ts` 为有 `presentation` 的卡带提供 `__zcProbe.actions()`；focusTargets 坐标经同源 `collectClickableTargets`/`pickClickableTarget` 检查，LayoutNode 动作读活体 DOM。无 presentation 报 `supported:false` 与原因；卸载删除读口；生产 build 不安装。
- `scripts/ui-walkthrough-probe.mjs` 给卡带挂本仓只读 fixture，每剧本重装独立初态，Canvas 用 `page.mouse.click`、LayoutNode 用 ElementHandle.click，`waitUntil` 不再误计 signal，按下一玩家动作可达作有界等待并明示世界条件未核。动作口缺失/不支持或卡带 0/N 不再 `ok:true`；失败也覆盖旧绿产物。
- 真 GCI 深链 `http://localhost:5700/?game=lib:game-clue-investigation`（实际端口由隔离 Vite 选择）从旧 0/91 假绿变为 **42/42 真实动作、49 个 waitUntil、18 个未核世界断言**，exit 0，控制台/pageerror 0；前后三轮验证，最后一轮 42/42。产物 `public/games/game-clue-investigation/probe/S4-uiwalk.json`。
- `node scripts/cart-presentation-browser.mjs` 7/7 PASS，另断言真 GCI dev 动作口含 Canvas 物件、无 presentation 明确不支持、两次卸载均删读口。隔离浏览器/Vite 已关闭，5700、5716–5719 无 LISTEN。
- 独立复查首轮抓到 Windows `stopDevServer` 的负 PID 清理不适用：读口函数虽返 42/42，Node 进程却不自然退出。探针改用 Windows 直接终止本次 Vite 子进程，其它平台保留原 helper；施工者与复查人分别直接调用 `runWalkthrough`（不靠 CLI `process.exit`），均 42/42 且约 22 秒自然退出，5700/5716 无监听残留。
- 定向 Vitest 64/64、TypeScript、ESLint、生产构建 PASS；只涉及的依赖图 0 违规，构建有既有大 chunk 警告。默认沙箱的 Vitest/build realpath EPERM 未收集/未构建，获准在真实本机环境重跑后通过。
- 锚点撤修验红：`assessWalkResult` 的卡带 `0/N` 判红条件唯一命中；仅内存把它替换为 `if (false)`，同一输入由 `ok:false` 转成假 `ok:true`，未改工作树。
- 全库 `node scripts/scoped-gate.mjs --run` exit 1：33 条其它项目 depcruise 违规及缺 `origin/claude/mainbranch` 比较引用；不得写为全库绿。

## 非施工者独立复查（`/root/cart_uiwalk_review`）

判词 **PASS，仅共享适配器范围**。独立定向 Vitest 5 组 70/70；GCI `runWalkthrough` 5 剧本 42/42 真 Canvas/DOM 手势，49 个 waitUntil 不入分母、18 个 expect 明示未核，console/pageerror 0，约 21.6 秒自然退出。`cart-presentation-browser` 7/7，含无 presentation `supported:false`+reason 与两次卸载清口；5700/5716 无监听。旧 compiled `game-a` 8 剧本只读回归 exit 0，0/19 如实报告，未对旧形态引入卡带零驱动阈值。

复查人锚点唯一命中 `assessWalkResult` 的卡带 0/N 守卫，内存撤修后点名断言实际抛出 `true !== false`，工作树未动。首轮发现 Windows 临时 Vite 清理不完全，施工修复后复查人独立重跑已闭。读告警：当前共享工作树全局 TypeScript 因其它在途 `src/skills/tier2/ordered-action-session.test.ts` 六条 TS2353 exit 1；全库 depcruise 仍有其它项目 33 条违规，不能宣称全量门禁绿。生产 build/dev-only 边界复查人静查并跑离线单测，未独立重建 dist。本判词不代替 GCI S4 或 Owner 人门。

## Owner 需求池结案裁决（2026-10-16）

Owner 选择按单项能力复查结案，允许将域外全库 gate 红项与本适配器完成状态分开记账。公共需求 `REQ-CART-UIWALK-ADAPTER` 已从活动池释放；本结案不表示全库门禁、GCI S4 或任何 Owner 人门通过。
