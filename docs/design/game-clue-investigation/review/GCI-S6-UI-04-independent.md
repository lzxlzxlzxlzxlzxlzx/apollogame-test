# GCI-S6-UI-04 · 共享外观字段独立复查

2026-10-14。复查主体：`/root/gci_ui04_independent_review`，非施工者。**局部 PASS**：共享 UI-04 合同经修复后可供纯数据消费；这不是 GCI 正式 manifest 已接线、S6 整关通过或全库门禁通过的判词。仅写本证据单，未改正式游戏、素材、World/hash、路线图、人门或远端。

## 范围与独立复跑

- 对照施工导航 `review/GCI-S6-UI-04.md`、`self-check/S6-final-visual-preflight.md` 与 `S6-ui02-formal-freeze.md`；本单仅审 `src/ui/components/{types,catalog,validate,render,server}.ts`、`src/assembly/cart-presentation.ts`、`src/studio/cart-run-core.ts` 和 `src/renderer/pointer-feedback2d.ts` 的受限视觉字段。未将共享工作树中大量其它改动归为本单。
- 首轮点名 4 文件/36 测试 PASS；发现下述缺陷、施工者修复后重新独立跑同组 36/36 PASS。扩大到 `src/ui/components`、presentation、renderer 与 `games/game-i/game-i.test.ts`：78 文件/602 测试，exit 0。普通沙箱先因 `node_modules/vitest/dist/spy.js` 的 Windows `realpath EPERM` 在 0 测试处退出；以上数字来自获准的本机短时命令，非该假失败。
- `/check-ui`：深、亮 `tools/audits/gci-s6-ui04{,-light}.audit.ts` 各 exit 0，均为重叠 0、硬低对比 0、3–4.5 警告 0、border-image 前提 0。`[华丽度]0/house:false` 是功能夹具使用 SHELL 的非阻断提醒，不可代替正式游戏视觉验收。两轮审计浏览器已退出、根 `.ui-audit-tmp` 已释放。

## 实证复现与修复复验

1. 首轮发现真实消费问题：正式 `completed-restart` 用 `skin:""` 关掉 house 皮；原 `validate.ts:165` 用 `props.skin !== undefined` 拒 `borderWidth:2`，而 `render.ts:382,400` 把空串当无皮。内存夹具带完整 UI-04 字段时，正式卡带页面的 `#case-heading` 30 秒未出现。即时通知施工者后，他把校验改成仅拒非空皮，并补同字段测试；我重跑上述测试及隔离浏览器：保持正式 `skin:""`，页面正常载入，真实 lock hover→pressed→reveal 可走，非空 skin 仍被测试拒绝。该缺陷已修，不留作当前 FAIL。
2. 浏览器地址 `http://localhost:5754/?game=lib:game-clue-investigation`，短时隔离 Vite + 无头 Chromium，API 只读路由用内存中的正式 manifest 副本叠 UI-04 字段，不写正式文件。CDP `CSS.getPlatformFontsForNode(#evidence-lock-title)` 返回 `MicrosoftYaHei-Bold`、4 glyph、`isCustomFont:false`，确证本机字体实用而非只看 `font-family` 声明；闭集入口见 `cart-presentation.ts:115`、`cart-run-core.ts:58`。
3. `Modal.visual.outerRing/enter`：真浏览器 clue-reveal 初始 transform 为 `.94` 与 y44、opacity 0、`animationDuration:0.24s`，300ms 后 transform 归 1、opacity 1；完成框为 `0.6s`，700ms 后归终态。12px 外环 computed 为 `rgba(210,165,76,.133)`；两态 scrim 均 `animation:none/transform:none`。`reducedMotion:'reduce'` 的揭示/完成框均 `duration:0s`、transform 1、opacity 1，scrim 仍静止。对应渲染 `render.ts:947-961`、降动态 `server.ts:301-303`。
4. Button 2px + 青色外焦点环：独立 UI-04 审计夹具真浏览器 `#ui04-restart` 的 computed border `2px`，原生键盘 `Tab` 后 `:focus-visible=true`、outline `rgb(46,175,190) solid 3px`、offset `3px`；没有用 `focusRing:false` 关闭无障碍环。它验证共享字段夹具，不冒称已完成正式 GCI 终局按钮全旅程；正式空 skin 接线可解析已按第 1 条复验。对应 `render.ts:392-402`、`server.ts:284,288`。
5. Canvas 反馈：真实 lock 目标 `data-pointer-feedback-state` 走 `hover→pressed`；1440×900 canvas 中区域 `(150,300,200,250)` 的 RGB 总和依次为 idle `[1325594,1606258,2170123]`、hover `[1440421,1692196,2196848]`、pressed `[1625790,1894592,2273342]`，画面实际改变。精确三色、alpha、glow、pressedBrightness 及旧默认由 `pointer-feedback2d-visual.test.ts` 独立 2/2 PASS；其范围收口在 `cart-presentation.ts:229-250`，渲染计算在 `pointer-feedback2d.ts:35,74,97`。像素汇总只证明反馈确实呈现和按压增强，不单靠它声称逐像素与原型全等。

## 撤修验红与告警

- 不碰共享文件：读取当前 `validate.ts`，锚点 `props.borderWidth > 8 || (typeof props.skin === 'string' && props.skin.length > 0) || props.skinSlice` 命中**恰 1 次**；在内存中改回旧 `props.skin !== undefined`，将原版与破坏版分别经 esbuild 内存打包执行同一 `Button{skin:'',borderWidth:2}`。原版 0 issue，破坏版 1 issue（`Button.borderWidth 仅无皮按钮可用`）：预告的回归点确实转红，且共享文件未改。
- 两轮 ui-audit 的唯一提醒是测试夹具华丽度 0；构建 >500kB chunk、全库 `scoped-gate --run` 的其它项目 32 条 depcruise 违规，以及扩大 game-i 时 `dialogue-world.test.ts:30` 的好感 8≠14，均不能被此局部 PASS 覆盖。未代签 S6、人门或宣称全库绿。

结论：UI-04 共享字段及上述验收点**独立局部 PASS**；正式 GCI 纯数据消费、整套九态视觉对齐和 S6 总门由游戏侧另行核证。隔离 5754 服务与浏览器已在每轮 `finally` 关闭；未启动 owner 5173 系统。
