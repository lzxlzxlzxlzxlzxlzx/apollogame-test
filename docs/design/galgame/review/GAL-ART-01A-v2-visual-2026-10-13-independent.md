# GAL-ART-01A V2 视觉增量独立复查（2026-10-13）

结论：**本轮四项消费局部 PASS；S5/S6 整体仍 CONCERNS。** 复查人与施工人不同；只写本 Review，不改产品代码、资产索引或路线图，也不代签 Owner 人门、素材审批与整页 1:1。

## 四步实证

1. **独立复跑**：当前落盘版执行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/ui/components/v2-visual.test.ts --maxWorkers=1 --minWorkers=1`，4 文件 **60/60**、退出 0；`npx tsc --noEmit` 退出 0、无诊断。点名测试覆盖有图/无 URL 设置回退、V2/无 V2 Modal 子组、skinFeedback、cue 及 LayoutNode 合法性（`gal-ui-art.test.ts:154-172,324-329,437-464`）。曾遇并发的非 GAL `gci-s6-visual.test.ts:55` 类型错误，当前独立重跑已经消失；不以先前错误冒充当前阻断。
2. **锚点撤修验红**：在独立 esbuild 内存副本核对 `gal-ui-art.ts` 唯一锚点 `layout = { ...layout, fx: [{ kind: 'cue', ms: 1300 }] };` 命中 **1** 次。原版 `gal-story-advance.layout.fx[0]` 为 `{kind:'cue',ms:1300}`；仅在该副本撤掉声明后，目标断言得到 `fx === undefined`，转红。未覆盖或还原共享文件。
3. **真浏览器实证与原型对照**：短生命周期隔离浏览器自行重跑 `verify-gal-art-live.mjs` 的 settings-text、confirm-new-game、story-normal、story-choice，各深/亮两态共 **8 画面**，退出 0；脚本独立断言确认内框 800×310、标题 30px、cue 1.3s 且 650ms 时 opacity `.35`/Y `4px`、分支钮 hover `brightness(1.32)`/8px glow/160ms。截图目检确认新 `gal-confirm-content` 子组位于内框中部；与定稿 V2 截图 `gal-ui-v2-confirm-exit-live.png` 对照，外框约 x320/y295、800×310 对齐，文案因确认场景不同不作逐字比较。此前独立数据 URL 浏览器探针测到设置有 URL 时图片与暗罩存在、罩色 `rgba(5,8,22,0.78)`，无 URL 时二者均不存在，深亮相同且无 pageerror；无 URL 的条纹回退另由点名测试证实。浏览器已关闭。
4. **读告警**：独立重跑 `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-settings-text-light.audit.ts`，退出 0、重叠/硬对比/border-image 前提缺项均 0；仍报 `gal-settings-title` 对比 **3.57:1**，低于 AA 4.5（非阻断，不能因绿灯略去）。V2 基座静态审计此前独立重跑无 WARN。没有把施工方全 20 屏×深浅的自陈当作本复查数据。

## 局部对齐与边界

| 项 | 独立核验 | 判定 |
| --- | --- | --- |
| 设置背景/暗罩/缺图 | `gal-ui-settings.ts:111-124` 只在 `backgroundSrc` 存在时接全画布 Image 与暗罩，`gal-ui-structure.ts:441-442` 只传已解析 URL；无 URL 走既有 `ink-deep`/`stripe`。真浏览器与测试均核到上述分支。 | 局部 PASS；未声明损坏网络 URL 也会回退。 |
| 确认窗 V2 Modal | `gal-ui-art.ts:302-311` 消费 `Modal.visual` 与 36px 框边，并以闭集 `Panel` 包住消息/操作区；真浏览器内框/标题达到原型 800×310/30px。无 V2 art 时无 `visual`、无额外子组，旧包路径仍可渲。 | 局部 PASS。 |
| 推进 cue | `gal-ui-art.ts:317-318` 为正常剧情提示挂 `fx: cue/1300`；实机中点 opacity `.35` 与 Y+4px，非先前相位相反的通用 pulse。 | 局部 PASS。 |
| skinned Button | `gal-ui-art.ts:193-197` 的 V2 `skinFeedback` 由 GAL 分支钮与确认动作消费；实机 hover 亮度、glow、160ms 与 V2 数值相符；无 V2 art 不强加。 | 局部 PASS。 |

仍不能签 S5/S6：当前确认截图的首页底图与 V2 原型明显不同；设置页虽然已有当前场景图，卡片描边、滑块等细节仍有视觉差异，若干“待接入”仍为占位。`public/games/gal-template/art/index.json` 的 `tex/gal-demo-backdrop` 自述仅为模板演示占位，首作剧情审美与对外分发许可未批准；本轮没有代批素材。上述均应保留在阶段对齐单/Owner 门，不因四项局部 PASS 被吞并。静态审计标题对比 WARN 也保留。
