# GAL-ART-01A 设置、确认弹窗与 S6 入场独立复查（2026-10-13）

结论：**局部 CONCERNS**。`Toggle.visual.showLabel:false` 的 GAL 消费和文字/选项入场时长已实证成立，但确认弹窗内框与标题仍显著偏离 V2 原型；推进提示动效未施工、待 Owner A/B，分支按钮 hover 也未完成 S6 视觉/时序 1:1。本报告不签整个 S5/S6、Owner 人门或资产审美审批。复查人不是施工者；仅写此 Review 文档，未改产品代码。

## 独立四步实证

1. **复跑**：最终源码下 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts --maxWorkers=1 --minWorkers=1`，3 文件 **55/55**、退出 0；UI 基座连同前三套独立复跑 73 文件 **596/596**、退出 0；`npx tsc --noEmit --pretty false` 退出 0，无诊断。`gal-ui-art.test.ts:103-151,290-310,408-425` 检查 V2/Fallback/旧切片、Toggle、Modal、动画及 LayoutNode 校验。此前同会话沙箱运行 Vitest 曾遇 `realpath EPERM`，本轮在受控环境运行并以实际退出码计证据。
2. **撤修验红**：读取 `src/services/gal-ui/gal-ui-art.ts:147` 唯一锚点 `showLabel: false,`，在内存 esbuild 插件中仅将其改为 `showLabel: true,`，原版/突变版均编译同一设置树。原版 `gal-setting-unread-skip-control.props.visual.showLabel === false`，撤修版变为 `true`，目标断言转红；未改共享源码。`src/ui/components/render.ts:590-601` 会据此省略内文标签，并给隐藏 checkbox 保留 aria-label。
3. **真浏览器与原型对照**：短生命周期隔离 Edge 分别实渲设置四页签、确认三态、普通/分支剧情的深亮两态；现有 `verify-gal-art-live.mjs` 独立执行全选定页退出 0，所有图片加载成功，脚本断言台词 `apollo-flyIn 0.24s`、分支按钮 `0.25s` 且第二项 `0.09s` 延迟。另以独立数据 URL 探针测 computed style 和元素内框，console/pageerror 为 0。V2 原型为 `docs/design/galgame/gal-ui-complete-v2.dc.html:15-21`，在同一 1440×900 浏览器真实打开并量测。
4. **读告警**：顺序跑设置 text/audio/display/confirm 的 light/dark 及 confirm 静态 UI 审计共 9 套，全部退出 0、重叠/硬对比/border-image 缺项均 0。但四个 light 设置审计均报 `gal-settings-title` 对比 **3.57:1**（低于 4.5 AA，非阻断）；四个 dark 设置及 confirm 审计报华丽件仅 1、house 主题检测否的非阻断提示。不能以退出 0 抹掉这些告警；真素材深亮实渲与静态审计入口不同。`git diff` 有 LF→CRLF 提示，非功能告警。

## 对齐判定

| 项 | V2 原型/合同 | 当前 GAL 真浏览器 | 判定 |
| --- | --- | --- | --- |
| 设置 Toggle | 75×31 轨道；标签在行左侧 | `V2_TOGGLE_VISUAL.showLabel=false`；设置截图内无重复“允许”等标签，外侧行名可见；文本页四开关轨道目检约 75×31 | 本次增量局部 PASS；未代签全部交互态 |
| 确认弹窗内框 | `[x=320,y=295,w=800,h=310]`；标题 30px | light `[320,339,800,222]`、dark `[320,337.5,800,225]`；标题均 15px。`#gal-confirm` 的 1440×900 是遮罩，不是内框 | **S5 差异**：高短 88/85px、顶下移 44/42.5px、标题小 15px；虽已用 36px 框边，几何仍未对齐 |
| 台词/选项入场 | 台词 240ms、Y +7px；选项 250ms、第二项 +90ms | computed `apollo-flyIn` 分别 0.24s / 0.25s / 0.09s，LayoutNode `animDist:7`；无旧切片强加动效 | 此局部时序 PASS；不等于全部 S6 |
| 推进提示 | 1300ms pulse，50% 透明度降至 `.35` 且 Y +4px | `src/services/gal-ui/gal-ui-art.ts` 已撤掉不等价的通用 pulse 消费；深亮两态真浏览器中 `gal-story-advance` 均存在，但 computed animation=`none`、duration=`0s` | **S6 未施工，待 Owner A/B**；不可再记作部分对齐 |
| 分支钮 hover | `filter 0.16s, transform 0.16s`；`brightness(1.32)` + 8px 蓝光 | `transform 0.07s, filter 0.12s, box-shadow 0.12s`；`brightness(1.08)`、无该蓝光；点击仍发 `narrative.choose` | 动作 PASS，S6 hover 强度/节奏 CONCERNS |

局部截图亦目检：设置文本亮态不再有重复 Toggle 内文，确认弹窗框皮完整但整体明显比原型扁；其他页仍有“待接入”文字/按钮，未把占位当正式能力。`gal-ui-settings.ts` 保留既有 LayoutNode/具名 action 路线，没有手写 DOM 逃生。真浏览器均已关闭；本次隔离截图目录已核对后删除，仓库既有截图仅作导航，不当作独立测量替身。

## 撤修后补核（同日）

施工者指出通用 `apollo-pulse` 的相位为 0/100% opacity `.55`、50% opacity `1`，恰与 V2 的 0/100% opacity `1`、50% opacity `.35` 且 `translateY(4px)` 不等价，遂撤掉 GAL 对该动效的声明及断言。我独立核对 `gal-ui-art.ts` 仅保留台词/选项 `flyIn`，`gal-ui-art.test.ts` 不再声称 cue pulse；重跑点名测试 **16/16**、退出 0。隔离 Edge 重渲普通剧情：亮、暗两态 `gal-story-advance` 均存在，computed `animationName=none`、`animationDuration=0s`、`transform=none`，pageerror 0，浏览器已关闭。表格与总判词据此从“部分对齐”更正为“未施工”；具体实现路径交 Owner A/B 裁决，不以反相 pulse 伪造 V2 收敛。

后续若要关闭本报告的 CONCERNS，需由相应施工域将 Modal 内框/标题和 S6 动效与定稿 V2 合同对齐，或按原型优先变更流程取得 Owner 新裁决，再由不同复查人实测复跑。此处不把未闭差异转成阶段 PASS。
