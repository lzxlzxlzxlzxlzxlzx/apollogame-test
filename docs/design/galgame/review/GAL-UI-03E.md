# GAL-UI-03E 独立复查单

- 复查主体：独立于施工者的 `review_gal_03e`；日期：2026-10-11。
- 判词：**局部 PASS（本票无皮 fallback 的 S4 几何及现有动作回归）**。结构、实际浏览器包围盒、深/亮主题 UI 阻断项和锚点撤修验红均有本人独立证据；不能据此签 S5 皮图裁切、S6 演出或完整 GAL。亮主题一条大字 3.57 对比度告警及无皮 fallback 的华丽度提示保留在案。

## 范围与设计基准

- 以 `docs/design/galgame/requests.md` 的 `GAL-UI-03E`、Owner 定稿 `gal-ui-complete-v2.dc.html` 为基准。原型第 15–16 行给出：对话框 x20..1420、y555..900；立绘 x675/y38/h845；选项 x365、top265、列宽710，note 后按钮最小高66。
- 当前实现限 `src/services/gal-ui/gal-ui-structure.ts` 第 74–147 行，只用 `Panel`、`Label`、`Button`、`Image` 的 LayoutNode 与具名 action；未见本票为了几何引入自由 DOM/CSS 或改 PUI 接口。由于 Owner 禁止一切 Git 命令，本复查不能用 Git diff 核范围，范围结论只针对所读的当前文件，非版本差异证明。

## 独立核证

| 项 | 本人复查结果 |
|---|---|
| 结构及闭集校验 | `node src/services/gal-ui/verify-gal-03e-structure.mjs` 退出 0：normal、choice、rechoice、long 四态 `validateLayoutNode=[]`；当前树声明对话框 `{x:20,y:555,width:1398,height:343,padding:0}`、立绘 `{x:675,y:38,width:561,height:843,padding:0}`，选项按钮列 `{x:365,y:296,width:710,gap:15}`。注意这只证明声明数据和 renderer 输出，不证明浏览器实际外框尺寸。 |
| 撤修验红 | 用 esbuild `onLoad` 只在内存中拦截 `gal-ui-structure.ts`，先断言唯一锚点 `width: 1398, height: 343` 命中 1 次，再替换成 `height: 300`，同一结构核验在 `normal dialogue ... height:300 != ... height:343` 转红；`ANCHOR_HIT=1 SABOTAGE_RED=1`。未改共享实现文件。 |
| 全库类型 | `npx tsc --noEmit` 退出 1，共 15 条诊断，位于 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx`；输出中未见 `src/services/gal-ui` 诊断。不把全库类型门说成绿。 |
| GAL 定向 Vitest | 普通沙箱先报 `EPERM realpath .../vitest/dist/spy.js` 且未收集测试；以允许只读本地测试的权限级别独立重跑最终三文件命令 `npx vitest run src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-art.test.ts`，退出 0，03E 新点名 4/4、art 6/6、host 25/25，合计 **35/35**。新测试四态逐一钉 `validateLayoutNode`、V2 声明锚点与 line/choice action 切换；art 第 101–115 行钉有图 bare/563×845 与无图 561×843；host 第 73–97 行真 DOM click 台词框→选 yes→滚轮回滚→选 no，其他项覆盖存读档、设置来源与四页锚点。 |
| 1440×900 浏览器包围盒 | 普通沙箱两次在 Edge `launchPersistentContext` 阶段崩溃；以允许短生命周期隔离无头浏览器的权限级别独立重跑 `node src/services/gal-ui/verify-gal-03e-live.mjs --transient-shots`，退出 0。原型与实际 normal/choice/rechoice/long × dark/light 八态对话框全部 `[20,555,1400,345]`、立绘全部 `[675,38,563,845]`，四轴差 0；实际 speaker 起点 `[122,625]`、line `[126,698]`、hint `[60,867]`、cue `[1312,840]` 与 CSS 静态锚点一致。choice/rechoice note `[365,265,710,16/17]`、按钮列 `[365,296,710,147]`，两者底边 443，距对话框顶 112px，未撞对话框。原型 normal line 本次量到 y705、choice y699，系 `.line` 的入场 transform 动画采样时刻不同；CSS 静态锚点为 y698，不将 7px 动画帧差记作结构漂移。 |
| UI 审计 | 以同一只读权限级别独立运行三个入口，均退出 0：`gal-ui-story-03e.audit.ts` normal-dark 定位 6、重叠/硬低对比/警告皆 0；`gal-ui-story-03e-choice.audit.ts` choice-dark 定位 7、重叠/硬低对比/警告皆 0；`gal-ui-story-03e-light.audit.ts` long-light 定位 6、重叠/`<3` 硬低对比皆 0，仅 `gal-story-speaker "澪"` 对比 3.57 的非阻断告警（23px 大字按 ≥3:1 判）。三态 border-image 前提失败皆 0。无皮 normal-dark 仍“华丽度 0、house 主题否”；choice-dark 命中 2，long-light 命中 8 且 house 是。华丽度告警是视觉精修跟踪，不挪作 S5 观感通过证据。 |
| 真实浏览器动作主链 | 独立核对脚本仅把 esbuild 临时静态页交给隔离 Edge，通过 `file:` 访问、`MemorySavePort`/`MemoryStoragePort` 驱动真 GAL World；独立运行 `node src/services/gal-ui/verify-gal-03e-action-live.mjs --transient-shots` 退出 0。日志逐帧为 `intro` story → 点击台词框到 `choice` → 真点 `yes` → 鼠标滚轮上滚到 `choice` → 真点 `no` → 点击读取进 `slots` → 返回后点击设置进 `settings`，7 次页面/ref 断言均通过；选项态对话框无 `narrative.advance` action 也已断言。该次 `--transient-shots` 不覆盖施工者已留的 7 张截图，本人以真实页面/ref 状态而非截图文件存在性为准。 |
| 截图旁证 | 人工查看现有 `review/gal-ui-03e-normal-{dark,light}.png` 和 `gal-ui-03e-choice-dark.png`：对话框落底、文字与选项可见，深/亮图均未见菜单被立绘盖掉；这是施工侧已生成图，供本复查目视交叉核对，不冒充本人截图。素材叠加后的 9-slice 裁切仍属 `GAL-ART-01A/S1`。 |

## 结论与阻点

本票无皮 fallback 的核心 S4 锚点与动作主链可签**局部 PASS**：八态真浏览器外框/立绘四轴零差，speaker/台词/提示/选项锚点吻合，按钮列不碰底框；真实浏览器七帧主链和动作单测 **35/35** 均通过，结构验证与内存撤修验红成立。normal-dark、choice-dark、long-light 三态 UI 审计阻断皆零；亮主题姓名大字有 3.57 对比度提示，满足大字 3:1 但未达普通正文 4.5:1，随 S5 精修复核。**限制**：审计不是八态全矩阵；真实素材叠加、S5 贴皮裁切、S6 动画和全库类型门均未由本票签过。

本复查未执行任何 Git/GitHub 操作、数据库或真实业务持久化写入，也未启动应用服务。成功与失败的无头 Edge 尝试均已退出，任务临时 profile 由脚本清理，未常驻；访问对象仅本地 `file:` 静态原型与临时打包页面。

## 增量复查：已登记透明立绘的有图分支

- 当前 `gal-ui-structure.ts:96-104` 在有 `portraitSrc` 时将 portrait Panel 设为 `bare:true`，Panel 与 Image 均声明 563×845；无图时仍用有边框的 561×843 内容盒，外盒仍为 563×845。该分支仍为纯 LayoutNode，不加 DOM/CSS 逃生。
- 独立复跑最终三文件 Vitest，退出 0，**35/35**。`gal-ui-art.test.ts:101-115` 现点名断言有图 `bare:true`、Panel/Image 563×845 以及无图非 bare/561×843；`gal-ui-slice-host.test.ts:73-97` 新增真 DOM 点击台词框推进、选 yes、滚轮回滚再选 no 的链。此前缺失的有图分支直接守卫已补齐并由本人复跑转绿。
- 独立复跑只读静态脚本 `node src/services/gal-ui/verify-gal-03e-art-live.mjs`，退出 0；dark/light 的有图 portrait Panel 与 Image 的真实外盒均为 `[675,38,563,845]`。本人检查脚本生成的 `review/gal-ui-03e-art-dark.png` 与 `gal-ui-03e-art-light.png`：原先遮住透明显图的实底矩形不再出现，角色与顶部菜单、选项和台词框处于原型预期叠层关系，菜单本身仍可目视识别。
- **S5 分离告警**：叠原始 dialogue skin 后外盒为 `[20,555,1398,343]`，比无皮 fallback 的目标 `1400×345` 各少 2px；speaker/text 原点分别变 `[121,624]`、`[125,697]`，较 fallback 各 -1px。两主题的原图裁切/装饰位置仍需 `GAL-ART-01A/S1` A/B 裁决。亮主题有图截图里台词、姓名与顶栏文字被背景/皮图压成明显低对比，不能借本票无皮 S4 PASS 宣称有图 S5 视觉通过。增量判词：**立绘透明承载 PASS；原图叠加观感 CONCERNS**。
- 脚本仅访问 `file:` 静态页及已登记本地图像，隔离无头浏览器和临时 profile 均由 `finally` 关闭/清理；未启动服务或执行 Git、数据库/持久化写入。
