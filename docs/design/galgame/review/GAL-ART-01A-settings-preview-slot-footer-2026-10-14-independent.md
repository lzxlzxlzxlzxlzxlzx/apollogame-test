# GAL-ART-01A · 设置预览与空槽底栏独立复查（2026-10-14）

判词：**指定增量局部 PASS**。复查人与施工者不同；本单不签完整设置页、S5/S6、素材或 Owner 人门。

## 范围与独立证据

- 复查 `src/services/gal-ui/gal-ui-settings.ts` 的 `previewSample`：仅 `home.canContinue` 且当前剧情文本非空时使用作品只读投影；无续玩点返回中性文案，不泄漏首句；文本先折叠空白再用 `Array.from` 限 40 Unicode 码点，角色名限 12 码点。该逻辑只构造 LayoutNode Label，不更改剧情状态。独立执行 `npx vitest run src/services/gal-ui/gal-ui-settings-preview.test.ts src/services/gal-ui/gal-ui-art.test.ts`，**2 文件 22/22、退出 0**，三种预览路径和 `validateLayoutNode` 零 issue 均受断言覆盖。
- 复查 `src/services/gal-ui/gal-ui-structure.ts` 的 `slotCard`：`v2Slot` 空槽左侧 `gal-slot-*-meta` 为“空存档位”；无图/旧树仍为“等待故事写入”；右侧按 `mode` 保持“可保存／不可读取”，填槽的可覆盖/可读取判断未被此改动替换。`gal-ui-art.test.ts` 点名 V2 存/读空槽和旧树，浏览器八态运行正常；这只证明本次文案与既有动作未漂，不证明整张槽卡 1:1。
- `npx tsc --noEmit` 退出 **0**。`node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slots.audit.ts` 退出 **0**：40 个绝对定位节点，重叠 0、硬对比 0、3–4.5 警告 0、border-image 前提 0，5 个 skin 命中。短时隔离静态探针 `GAL_ART_AUDIT_PAGES=slots,slots-load,settings-text,settings-display node src/services/gal-ui/verify-gal-art-live.mjs` 在深浅 **8 态退出 0**；槽页系统框 1404×830、双底栏钮 x=1096/1232、y=785.5、各 124×44。探针通过 `finally` 关闭浏览器和临时构建；未访问 `:5173` 或真实账号/存档。

## 对抗性撤修与告警

- 唯一锚点：源码中 `!model.home.canContinue || !model.story.text?.trim()` 恰好命中一次。通过 esbuild `onLoad` **仅在内存**将其变异为 `!model.story.text?.trim()`，不写施工文件或临时副本。以无续玩模型断言中性预览，变异版如期转红：`expected neutral preview; got 预览 · 澪 「打开哪一封信？月光还停在窗沿。」`；原版上方 Vitest 22/22 绿，证明防泄漏断言有牙齿。
- 首次 Vitest/UI audit 在受限沙箱中于 Vite 加载前遇 Windows `realpath EPERM`，没有采作测试失败或绿色证据；按本地短时测试权限隔离重跑后分别退出 0。独立输出未见本增量相关 WARN。既有完整 S5/S6 差异、终图批准、全库 scoped-gate 和 Owner 门不在本单覆盖内。

## 结论边界

本次增量满足“作品预览而非原型硬编码、无续玩防泄漏、40 码点限幅、V2 空槽文案且旧树不漂”的点名验收，故局部 PASS。`media-and-final-skin` 仍应保持 active；完整 S5/S6 与素材审批不得由本单推定完成。
