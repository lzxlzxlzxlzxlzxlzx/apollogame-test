# REQ-GCI-CART-UI-BRIDGE · 共享卡带 UI/视口桥复查导航

范围仅为共享卡带宿主：严格 `presentation` 数据校验、在线与内联同运行核、固定逻辑画布、LayoutNode 只读投影及 ActionSink → InputQueue。游戏 S4 九态、原型 1:1、Owner 人门不由本单代签。

## 施工自证（2026-10-13）

- `npx vitest run src/assembly/cart-presentation.test.ts src/assembly/manifest.test.ts src/studio/cart-run-core.test.ts src/cartridge-inline-run.test.ts`：实际收集 3 文件、40/40 PASS；命令列出的 `cart-run-core.test.ts` 文件不存在，未计入通过数。
- `node scripts/cart-presentation-browser.mjs`：1440×900 UI 指针、1200×800 Canvas 指针、720×800 Tab/Enter、900×900 Tab/Space，均抵达世界结果与 HUD；另验无 `closeAction` Modal 遮罩阻断 Canvas，以及真实 GCI manifest 的茶杯→结果→关闭，六项 PASS。短时隔离 Vite 与无头浏览器已关闭。
- `npx tsc --noEmit --pretty false`、定向 ESLint、`npm run build`：exit 0。构建仅有大 chunk 警告。
- `node scripts/scoped-gate.mjs --run`：exit 1，停在 `depcruise` 的 34 条共享工作树依赖违规；其中 GCI 的 `games/game-clue-investigation/s4-ui.audit.ts` 与 `s4-interaction.test.ts` 相对导入 `library/.../manifest.json` 也在红项中。此处不得写为全库绿。

## 非施工者独立复查

首轮 FAIL 两处并实证复现：`PlayingCard.backFace` 嵌套 `Label.bind` 被静默接受；无 `closeAction` 的 Modal 遮罩让背景 Canvas 接收指针。返修后同样案例分别变为明确拒绝嵌套动态绑定、`elementFromPoint` 命中 Modal 遮罩。独立复跑定向 Vitest 29/29、六项短时浏览器旅程及 TypeScript 检查均 PASS；复查人还用唯一锚点命中的内存态撤修使 ActionSink 通路转红，未编辑共享文件。返修独立判词：**PASS，仅通用桥范围**。5716–5719 无监听残留。

## 剩余边界

本桥的 `focusTargets` 仅保证键盘焦点可见提示；Canvas 同源 alpha `object-hover` / `object-pressed` 属 Owner 另行裁决 A 的 `REQ-GCI-POINTER-PROJECTION`，其独立复查目前为 CONCERNS，不能并入本桥 PASS 或据此宣称游戏 S4 完成。

## 2026-10-13 再核验（本桥，不代替 S4 复查）

- `npx vitest run src/assembly/cart-presentation.test.ts src/assembly/manifest.test.ts src/cartridge-inline-run.test.ts src/ui/components`：71 文件、571/571 PASS，包含声明式数据拒绝、内联卡带装载、LayoutNode 合法性；默认沙箱首次因 `node_modules/vitest/dist/spy.js` realpath EPERM 未收集任何测试，获准本机重跑后通过，不把 EPERM 记作测试通过。
- `node scripts/cart-presentation-browser.mjs`：1440×900、1200×800、720×800、900×900 四视口，Modal 遮罩与真实 GCI 连续 Escape 均 PASS；额外连续 6 轮退出码均为 0。访问隔离临时 `http://localhost:5716/`，浏览器与 Vite 已关闭，5716–5719 无监听残留。此前独立指针复查曾有 1/2 轮在真实 GCI teardown 后捕获 `removeChild` pageerror，本轮未复现；该偶发项仍为风险，不能声称已修复。
- `npx depcruise --config .dependency-cruiser.cjs src/assembly/cart-presentation.ts src/assembly/manifest-core.ts src/studio/cart-run-core.ts src/studio/DataCartridgeRunner.tsx src/cartridge-inline-run.ts`：288 模块、1390 依赖、0 违规；`npx tsc --noEmit --pretty false` exit 0；`npm run build` exit 0（既有大 chunk 警告）；GCI idle `ui-audit` 重叠/硬性低对比/border-image 前提均 0。
- `node scripts/scoped-gate.mjs --run` exit 1：全库因共享工作树其它项目的 32 条 depcruise 违规而中断，且本地缺 `origin/claude/mainbranch` 比较引用；32 条均不指向本桥的施工文件。依工单全量门禁要求，公共池仍 `blocked`、不得关账或宣称全库绿。不得为本桥擅改 game-simlife、game-demon-castle 等其他项目的在途施工。

## 正式 PNG/mask 接入后的浏览器探针返修（2026-10-13）

正式 GCI 资产接入后，旧探针仍点茶杯包围盒中心，且直接 `runBlueprintInto` 未执行卡带资产桥；首次复跑在 1200×800 的 `#cart-test-feedback` 等待超时。现仅调整 `scripts/cart-presentation-browser.mjs`：测试运行核前按正式在线路径读取本地索引、绑定 mask、预载 PNG；Canvas 点击取只读 `__zcProbe.actions()` 已核实可命中的茶杯坐标；真实 GCI 旅程同时核对茶杯 PNG 已送入 Canvas `drawImage`，线索特写 `<img>` 的本地 URL 已解析、加载完成且有非零原生尺寸。未修改游戏 manifest、UI 树、共享桥语义或 Owner 人门。

- 施工复跑：定向 Vitest 3 文件 45/45、TypeScript、桥入口 depcruise 0 违规、ESLint/脚本语法、构建 exit 0；隔离短时 Edge `node scripts/cart-presentation-browser.mjs` 7/7 exit 0（1440×900 UI 指针、1200×800 Canvas 指针、720×800 Tab/Enter、900×900 Tab/Space、Modal 遮罩、alpha hover/press、真实 GCI 调查/证物/退出链）。构建仅现有大 chunk 警告。5716 等临时端口无监听。
- 非施工者 `/root/gci_ui01_probe_review` 独立判词：**PASS，仅此探针/正式资产接线范围**。独立浏览器 7/7 exit 0；两项隔离内存撤修均有精确锚点：去掉 `resolveCartSkins` 后证物 `src=asset:...`、原生尺寸 0，探针 exit 1；去掉真实 GCI 的 `loadCartArt` 后正式茶杯 `drawImage` 等待超时，exit 1。成功版 stderr 无产品告警，浏览器与临时端口已关闭。首轮复查在这两项撤修仍绿时曾判 FAIL；加强断言后复验转红，旧判词不作为最终结论。
- `node scripts/scoped-gate.mjs --run` 仍 exit 1：全工作树 32 条 depcruise 违规，集中在其它 Life/SimLife/恶魔城项目，0 条指向本桥或此脚本；另有缺失 `origin/claude/mainbranch` 比较引用与 CRLF 提示。公共池继续 `blocked`，不得据局部 PASS 宣称全库绿或关闭工单。

## 当前共享代码的非施工者复查（`/root/gci_bridge_review`，2026-10-13）

判词 **PASS，仅 UI-01 通用桥定向范围**，旧 PASS 之后 `cart-run-core.ts` 增量已纳入这次复查。复查人独立跑了 5 文件/64 测试、TypeScript exit 0、短时浏览器 7/7；真实在线 React `DataCartridgeRunner` 与真实内联 `mount` 均以 Canvas 点茶杯打开 LayoutNode 档案条，卸载后 canvas 数由 1 归 0 且 pageerror 为空。四视口、Modal 遮罩不打穿、正式 GCI 关闭特写后第二次 Escape 均通过；旧失败 `backFace > Panel > Label.bind` 现明确拒绝。撤修验红锚点 `uiActions.enqueueAction(binding.action)` 命中，隔离内存 no-op 后 HUD 不出现（`SABOTAGE_RED true`）。复查人逐条读输出，未见桥自身告警；最初在线测试 harness 的 ReactDOM CJS 导入错误纠正后产品路径 PASS。隔离浏览器/Vite 均已清理，5716/5717/5719/5720/5721 无监听。全库 `scoped-gate` 的 32 条其它项目违规仍独立阻断本池关账；此 PASS 也不代替独立 POINTER-02 复查与游戏 S4 人门。
