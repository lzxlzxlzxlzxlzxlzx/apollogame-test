# GAL-ART-01A · V2 ghost 四态消费独立复查（2026-10-13）

**判词：局部 PASS，非 GAL S5/S6 整体放行。** 本人不是 PUI 或 GAL 此轮施工者；只写本 Review 文档，不改实现、原型、资产、工单或他人的截图。Owner 已选择 A，PUI 的通用 `Button.stateColors` 局部独立复查在档；本单验证 GAL 仅以闭集数据消费它，真实有图 V2 ghost 生效，旧显式切片/无图路径不漂移。

## 独立四步证据

1. **复跑。** `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/ui/components/button-state-colors.test.ts`：**3 文件 48/48、退出 0**。消费用例核实剧情七个工具键的 `skin:''`、`shape:'pill'`、四态数据、原生 Action、禁用及 `validateLayoutNode` 零 issue，也核实回想退出、旧 `button.slice=7` 和无图负控。此处另用独立内存调用真实 `applyGalUiArt` 复验同一 `gal-story-save`：V2 有四态；旧切片保留 `skinSlice:7` 而无四态；无图也无四态；三路 `gal.story.save` 动作均不变。
2. **唯一锚点隔离撤修验红。** 从现有 `gal-ui-art.ts` 只读加载并在内存转译；断言 `labelColor: { custom: '#e8e8f4' }, stateColors: V2_GHOST_COLORS };` **精确命中 1 次**。原版 `applyGalUiArt` 对 `gal-story-save` 的 V2 有图输入产生 hover `#535c91` 并保留 `gal.story.save`；仅把内存副本该字段改为 `stateColors: undefined` 后，相同消费断言以 `GAL V2 ghost palette absent` 转红。未撤改共享源码、测试或其他人产物。
3. **真实浏览器实证。** 将真实 GAL audit fixture 独立构建到任务级系统临时目录，使用已登记的本地有图 AssetIndex 路径，以 `file://`/headless Edge 检查剧情常态、存档、回想、设置四页 × 暗亮两主题。每页至少一个实际 V2 ghost 的默认底 `rgba(16,26,54,0.81)`、金边 `rgba(228,214,170,0.533)`、hover 底 `rgb(83,92,145)`、pressed 底 `rgb(65,75,124)` 和真实 ActionSink 均通过；浏览器将 8-bit alpha `#...5c` 规范化为 `0.36`，非施工数据改动。六个页面态还实查 disabled 为半透明指定底、`opacity:1` 且强制点击不发动作；可用键可获原生焦点。另以仓库 `verify-gal-art-live.mjs` 指定独立 `GAL_ART_AUDIT_OUTPUT` 临时目录，对 `story-normal,story-choice,slots,slots-load,gallery-memories,gallery-cg` 深亮 **12 态**复跑退出 0：剧情七个 ghost 各自默认/hover/中心命中/ActionSink 探针通过，12 张临时截图未覆盖 Review 原图，任务后已清理；浏览器及 Vite 临时 bundle 均已关闭/删除，未启动整套服务。
4. **读告警。** `node tools/ui-audit.mjs src/services/gal-ui/gal-gallery-v2-dark.audit.ts --w 1440 --h 900` 和亮主题对应入口各退出 0；每套 27 个带 id 定位元素、重叠 0、对比硬失败 0、3–4.5 对比警告 0、border-image 前提失败 0、house 命中及 4 个 skin 华丽件。该审计为静态画廊，不代替剧情纹理逐字形/逐像素对比。独立浏览器探针前两次自身断言失败分别由于 Playwright `locator().locator(':not([disabled])')` 误取子孙、以及将 Chromium alpha 序列化 `0.36` 误写成 `0.361`；修正探针后 8/8 页面通过，未改产品代码，也未把探针错误冒充产品缺陷。

## 范围边界

- V2 ghost 只在 `art.button` 存在且 `slice` 未显式给出的指定导航 ID 消费四态；默认无图、旧显式切片与其他按钮不套这组配色。现有 PUI validator 仍负责四态完整性、颜色安全和不与非空 skin 混用；本单未扩大协议。
- 真实浏览器已经验证有图页的 computed 状态颜色与交互，但尚未对复杂背景上每个半透明按钮的**逐字形最差对比度**及全部悬停关键帧作像素级 V2 1:1 裁决；存档/设置/确认/画廊其他差异和 S6 时序继续留在 S5 差异单。Owner 人门与 `media-and-final-skin` 里程碑未完成。
- `scoped-gate --run` 不可宣称全绿：现有 S5 差异单记录其受 **33 条非 GAL 依赖违规**阻断；本局部复查未重新执行整库门，数量仅作施工/项目记录引用，不冒充独立复跑。局部 PASS 不消除此阻断。
