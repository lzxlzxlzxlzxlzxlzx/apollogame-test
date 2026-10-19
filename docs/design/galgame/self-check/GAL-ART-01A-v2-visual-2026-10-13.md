# GAL-ART-01A · V2 第二轮视觉消费自证（2026-10-13）

范围：Owner 对确认窗、提示 cue、贴图按钮反馈三项均裁 A；共享 PUI [独立复查](../review/REQ-GAL-PUI-V2-VISUAL-independent.md)仅判通用能力局部 PASS。本单只核 GAL 有图路由的消费，不签 S5/S6 总项。

| 点 | 施工与自证 | 回退边界 |
| --- | --- | --- |
| 设置页场景 | 已解析当前 `backgroundAssetKey` 复用为 1440×900 Image 并叠闭集 Panel 暗罩；[亮态](../review/gal-art-01a-settings-text-light-scene-veil.png)/暗态真浏览器截图。 | 未解析 URL 不建 Image/暗罩，保留原条纹底；无新素材登记或审批。 |
| 确认窗 | `Modal.visual` 指定最小高 310、padding 26、标题 30 且居中，闭集 Panel 让正文/双键成组居中；[亮态](../review/gal-art-01a-confirm-new-game-light-v2-content.png)/暗态同名图。浏览器断言内框 800×310、`aria-labelledby` 指向真实标题。 | 只在已登记 V2 `systemFrame.slice=115` 的 `gal-confirm` 生效；无图/旧切片无 visual/内容组。 |
| 推进提示 | `layout.fx:[{kind:'cue',ms:1300}]`；深浅浏览器 computed 1.3s，冻结 650ms 的 opacity=.35、translateY=4px。 | 无图/旧切片不加 cue；reduced-motion 由 PUI 通用规则处理。 |
| 贴图按钮 | V2 art-button 组声明 `skinFeedback`：hover/pressed 1.32、8px `#a7b2ff99`、160ms；深浅浏览器分支键 hover 的亮度/光晕/时长为真值。 | ghost 按钮仍走四态色，无图/旧切片不加新字段；ActionSink 未改。 |

点名：`npx vitest run src/services/gal-ui` 9 文件 89/89，`validateLayoutNode` 零 issue；`verify-gal-art-live.mjs` 20 屏×深浅 40 态 exit 0，隔离浏览器自动关闭；`node tools/ui-audit.mjs src/services/gal-ui/gal-ui-art.audit.ts` 阻断项 0；`node scripts/context-budget-guard.mjs` PASS（9/10）。

全库并非绿：`node scripts/scoped-gate.mjs --run` exit 1，depcruise 32 条来自 Life 等并行域，且缺 `origin/claude/mainbranch` 本地 ref。期间 `npx tsc --noEmit` 曾因他域在途 GCI 测试 TS2352 退出 1；文件并发修复后本人重跑 `npx tsc --noEmit --pretty false` exit 0。勿将局部通过当成总门通过。

未闭：S5 终图逐件审美/来源/许可审批、存档/画廊及设置细节差异；S6 全部按钮/关键演出链逐帧比对；GAL 增量独立复查与 Owner 人门。具体见 [S5](S5-alignment.md)、[S6](S6-alignment.md)、[素材候选](../gal-art-01a-media-candidates-2026-10-13.md)。
