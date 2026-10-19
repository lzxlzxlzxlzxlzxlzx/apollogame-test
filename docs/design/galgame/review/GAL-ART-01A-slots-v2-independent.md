# GAL-ART-01A 存读档 V2 消费独立复查（2026-10-13）

结论：**局部 PASS，仅限 4×3 存读档布局、V2 有图路径的按钮/页脚皮肤消费与无图、旧切片回归；整体 S5 仍为 CONCERNS，不得提交 `media-and-final-skin` Owner 人门。** 复查者不参与施工；本次只写此报告，不改 `gal-ui-art.ts`、测试或 UI 基座。

## 四步实证

1. **独立复跑**：`npx vitest run src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1` 退出码 0，**12/12**。首次受限沙箱在 `node_modules/vitest/dist/spy.js` 的 `realpath` 报 EPERM，未执行任何测试；按正常文件权限复跑才是有效结果。`gal-ui-art.test.ts` 的 V2 槽模式断言覆盖保存/读取 124×46、顶部与翻页 ghost、footer x/y -57、无图与旧显式切片布局不变、`validateLayoutNode` 零 issue。测试模型中原有槽树 4 列×3 行，未在此把视觉 PASS 扩大成动作全链 PASS。
2. **锚点撤修验红**：内存读取 `gal-ui-art.ts`，断言精确锚点 `'gal-mode-save', 'gal-mode-load'` 只命中 **1** 次；仅在内存将 `gal-mode-save` 改成 `gal-mode-removed`，提取同一 `usesV2ArtButton` 函数执行。原版对 `gal-mode-save` 返回 `true`，突变版返回 `false`；要求 `true` 的不变量断言转红。未写回源文件。此实验验证模式皮消费测试有因果性，**不**覆盖 footer 偏移的因果性。
3. **真实画面对拍**：独立查看 1440×900 [V2 存读档原型](../gal-ui-v2-save.png) 与 [真实 GAL 暗图](gal-art-01a-slots-dark.png)、[读档亮图](gal-art-01a-slots-load-light.png)。真实暗图可见 4 列×3 行 12 卡、纹样“保存/读取”双页签、未施纹样皮的顶部/翻页导航，已填槽的实时信息未被整图盖住；底栏在框内。截图由既有隔离 `file://` 静态探针生成，本复查未启动整套 ZeroCraft 或日常浏览器。`verify-gal-art-live.mjs` 代码含图完整性、已填槽前景不被皮覆盖、34 态截屏与 finally 关闭浏览器；本次未独立重跑该探针，故不把它记作本次新增 PASS。
4. **读告警与未闭差异**：测试复跑无 Vitest 告警。真图显示槽卡编号为裸文字，而 V2 是编号胶囊；空槽预览当前为文本“空存档位”，V2 是菱形占位；底部摘要/状态文字靠近花饰，局部易拥挤；顶部全局导航在当前框内而 V2 在框上方。原型载有真实预览图，审计 fixture 内容不同，所以已填卡图像不能据此判素材 1:1。当前 `gal-art-01a-s5-diff.md` 同样保留这些未闭项；没有把测试绿灯误报成 S5 同画布归零。

## 范围判词

- V2 四列三行密度、双模式按钮类别、ghost 导航、footer 有图坐标补偿，以及无图/旧 slice 的数据路径：**局部 PASS**。
- 顶部导航、编号/占位、元数据排版、悬停和确认态，以及 S6 媒体/转场关键帧：**CONCERNS / 未复查**。整体里程碑继续 `active`，独立复查与 Owner 人门仍未满足。
- 本报告只依据本次复跑和现有截图；施工文件或素材后续变更必须重新复查。
