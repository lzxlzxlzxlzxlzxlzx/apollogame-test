# S3 当前指纹独立复查（2026-10-15）

- 复查主体：`/root/potion_current_review`；与通用 Canvas 门施工主体不同。
- 指纹：`b3a82032ea5d0097`。范围仅为 S3 骨架与其新增真手势门；不代签 Owner，也不替代 S4/S5。
- 判词：**PASS**。

## 四步复查

1. **独立复跑**：`npx vitest run scripts/click-probe.test.mjs games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts` 退出 0，31/31。`node scripts/click-probe.mjs --game game-potion-brewing` 退出 0；独立探针 JSON 的 mouse/touch 两项均 `reachable=true,inputMatched=true,visibleChanged=true`，真实 `Engine.step` 输入 `drag/drag`，配方可见文本均从第 1/4 步到第 2/4 步，浏览器 console error 0。短时 Vite/Chromium 由探针 finally 关闭。
2. **锚点撤修验红**：先断言 `scripts/click-probe.mjs` 存在三重判据 `!g.reachable || !g.inputMatched || !g.visibleChanged`，断言夹具恰有两项且首项期望 `drag`；将独立探针结果首项 `inputMatched` 仅在内存副本改为 false，`interpretCompiledCanvasProbe` 由 2/2 exit 0 转成 1/2 exit 1。未改共享源文件。该验红仅证明判词防线；第一步真浏览器证明运行时接线。
3. **实证复现**：先前 S3 点击门因活体 DOM 没有 `[data-action]` 明确失败。通用 `s3-canvas-probe.json` 现使用已定稿逻辑画布 1440×900 的材料拖动坐标；`scripts/click-probe.mjs:203-254` 真发 mouse/touch 事件，检查 canvas 可命中、引擎输入及可见进度，并非给游戏 slug 加豁免。`blueprint.ts` 的 OrderedActionSession/AngularGesture 仍为原规则解释路径；编译期游戏免 manifest JSON 校验有流程板明确口径。
4. **读告警**：Vitest 与真浏览器探针无错误；游戏能力审计另有 render-only `performance.now()` 建议警告，不属 S3 输入/骨架阻断。S3 board 显示历史“乱序放行”注记，系既有 Owner S1/S2 先经项目控制台通过的事实说明，不是本次伪造人门。

新增通用门文件 `scripts/click-probe.mjs` 与对应 21 项测试、游戏数据夹具均属 S3 真手势缺口范围；未把工作树中大量并行项目改动算作本任务产物。`public/games/game-potion-brewing/probe/S3-click-gate.json` 是探针生成证据，不是人工拼接绿灯。

最终分域口径：`full=453f23a6b8e49673`、`rules=f1fca8d9f97ffeb3`。新增 `blueprint.test.ts` 的同 seed 回归不改变骨架/Canvas 夹具；在新指纹下再独立运行真浏览器 mouse/touch 2/2、0 console error，S3 机器门与合法独立 review 均 PASS。以上早期 `b3a82032ea5d0097` 只保留为审计轨迹，不是当前有效指纹。
