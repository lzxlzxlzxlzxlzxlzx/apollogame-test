# GAL-ART-01A · V2 ghost 四态 GAL 消费自证（2026-10-13）

Owner 已选 A；共享 `Button.stateColors` 的 PUI 独立局部 PASS 见 `../review/REQ-GAL-PUI-GHOST-STATE-independent.md`。GAL 只在有默认 V2 按钮皮且无旧显式 slice 的 ghost 导航填闭集数据：胶囊几何、默认半透明深蓝底/金边/浅字、hover、pressed、disabled 四态。旧 slice 与无图路径均不新增该字段。

- 定向 GAL 测试（art/read-model/package）33/33，退出 0；`npx tsc --noEmit --pretty false` 退出 0。默认沙箱曾出现 Vite `realpath EPERM`、未收集用例，隔离进程复跑才得上述绿灯。
- `verify-gal-art-live.mjs` 的 `story-normal,story-choice` 深亮四态实机页均通过：7 个 ghost 的默认底/边/字色、hover 底/字色、无主题糖果皮、中心命中与真实 ActionSink 点按；4 张 1440×900 截图另存 `../review/gal-art-01a-story-*-ghost-state-b.png`。第一次探针的 Chromium alpha 序列化断言写成 0.812，实得 0.81，修正探针后全绿；没有改产品色值。隔离浏览器已关闭。
- 施工侧目检亮主题剧情截图：顶栏已可见深底胶囊；不以此代替逐字对比度采样、完整 S5 同画布差异裁决或 S6 动画验收。

独立 GAL 消费复查另见 `../review/GAL-ART-01A-ghost-state-consumer-independent.md`，施工者不代签。
