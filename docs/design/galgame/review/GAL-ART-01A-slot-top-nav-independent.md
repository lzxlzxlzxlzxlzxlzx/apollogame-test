# GAL-ART-01A 存读档 V2 顶栏导航局部独立复查（2026-10-13）

判词：**局部 PASS；整页 S5 仍为 CONCERNS**。复查人仅核导航从系统框内移至框外这一局部，不代签 S5/S6 或 Owner 人门。

## 边界与阅读

- 已完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`docs/design/ui-playbook.md`、`ui.md`、`testing.md`、`self-check.md`、`review-gates.md`；命中 UI、测试、自证与独立复查线。
- 实现仅在 `src/services/gal-ui/gal-ui-art.ts:129-143` 处理已加载 V2 图路径，把原 `gal-slots-header-actions` 从框内 Header 移到 Screen 直系子节点；不是复制动作节点。无图 fallback、缺 `slot` 的 partial art 与旧显式切片不走该分支。未触碰 PUI、素材索引、原型或其他项目文件。
- 共享工作树有大量其他项目在途修改，`git status --short` 确认但不归因/还原。复查只写此报告。项目控制台同步由施工主体处理。

## 四步实证

1. **独立复跑**：`npx vitest run src/services/gal-ui/gal-ui-art.test.ts` 退出 0，12/12；缺槽增量后再次独立复跑仍为 12/12。`gal-ui-art.test.ts:244-257` 点名断言 V2 Screen 顶层锚点 `x1080/y16/330×40`、框内唯一节点移除、动作节点计数 1、fallback 及缺 `slot` partial art 留在原 Header、`validateLayoutNode` 零 issue。首次沙箱内运行因读取 `node_modules/vitest/dist/spy.js` 出 `EPERM`（0 测试）；获准隔离执行后正常 12/12，不能把首次输出算业务红灯。
2. **真浏览器实证**：设置 `GAL_ART_AUDIT_OUTPUT` 为独立系统临时目录，运行 `node src/services/gal-ui/verify-gal-art-live.mjs`，退出 0；34 个深/亮静态状态完成。`slots` 与 `slots-load` 深/亮共 4 态均断言两个导航动作框外（`button.bottom <= frame.top`），且真 DOM 点击 `gal-slots-settings`、`gal-slots-back` 分别发出 `gal.settings.open`、`gal.slot.back`，共 8 次点击/动作。框顶实测 `y=60`、系统框 `1404×830`。浏览器与临时目录均由脚本/命令关闭清理；未访问 5173 或真实用户浏览器资料。
3. **锚点撤修验红**：缺槽增量后，内存读取 `gal-ui-art.ts`，精确匹配 `if (node.type === 'Screen' && art.systemFrame?.slice === 115 && art.slot && art.slot.slice === undefined) {`，命中数严格为 1；仅在内存撤掉 `art.slot` 防护，TypeScript 转译后用缺 `slot` 的最小 LayoutNode 树运行 `applyGalUiArt`。原版 `{top:0,nested:1}`，撤修版 `{top:1,nested:0}`；“缺槽时顶层必须为 0”断言在撤修版变红。先前针对整个外移分支的内存撤修亦曾观察 V2 `{top:1,nested:0}` → `{top:0,nested:1}`；本次未修改现场源文件，也未声称覆盖全页视觉。
4. **读告警/差异**：浏览器日志无 GAL 错误；Vitest 首次 `EPERM` 已如实记录。此次没有重跑全库门禁；此前全库 32 项非 GAL depcruise 红项不能据此视为修复。当前 V2 原型顶栏有四个导航入口，实际 GAL 存读档只有设置和返回剧情两项，尚不能签整页 1:1；元数据拥挤、ghost 细节、已填预览同内容对账与 S6 动画时序仍在 `gal-art-01a-s5-diff.md`。

## 结论范围

这一局部修复满足“已有两项导航在框外、可点击、动作不变、无重复、无图及缺槽 fallback 不漂移”。整项 `media-and-final-skin` 保持 active；S5/S6 与 Owner 人门不可因本局部 PASS 收束。
