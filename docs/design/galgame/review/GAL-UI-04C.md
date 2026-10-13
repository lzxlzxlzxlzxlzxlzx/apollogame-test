# GAL-UI-04C 独立复查：局部 PASS

复查主体：非施工者 `/root/review_gal_04c`，2026-10-11。仅签 Owner 定稿 V2 设置页 1440×900 的 S4 结构几何及本票交互回归；不签 S5/S6 视觉、完整 GAL、路线图里程碑或全库门禁。复查未执行 Git/GitHub、数据库/真实业务持久化写入，也未启动应用服务。

## 独立复跑与实证

- 首次点名测试命令误带一个不存在的结构测试路径；Vitest 仍退出 0，实际只发现并执行宿主测试 24/24，未把误写路径算作额外测试。随后独立运行 `npx vitest run src/services/gal-ui`，4 文件 47/47 通过。`gal-ui-slice-host.test.ts:719-729` 点名校验框外系统栏、导航为栏的子节点、标题/页签/底栏 61/44/51px 和四页 `validateLayoutNode` 零 issue。
- `node src/services/gal-ui/verify-gal-04c-live.mjs --transient-shots` 退出 0。该脚本在任务级临时目录静态构建，隔离 Edge/Playwright 仅打开本地 `file:` 页面与原型文件；浏览器已关闭、临时目录已清理，无服务端口。四页 shell、system bar、nav、heading、tabs、grid、两卡、footer 的原型/实机四轴差值全部 0px：框 `18,61,1404,824`，导航 `1080,16,329,39`（底 55 < 框顶 61），标题 `84,109,1272,61`，页签 `84,185,1272,44`，底栏 `84,782,1272,51`；文本/声音卡 `627×320`，画面/确认卡 `627×256`。量测与 `gal-ui-04c-structure-diff.md` 一致。
- 浏览器实际走过四页、剧情来源→设置→框外主页→确认弹窗取消仍留设置→再次确认才回标题，并检查弹窗底层导航几何不变；还走过六项独立开关、禁用的未接控件、来源返回、Auto/Skip、设置滚轮不推进剧情。复核了 `review/gal-ui-04c-prototype-text.png` 与 `review/gal-ui-04c-text.png`：布局锚点一致，按钮皮、边框、字体等观感明显未等同，正属本票未签的 S5/S6。`review/gal-ui-04c-confirm-modal.png` 显示确认层覆盖设置，框外导航处于遮罩下，未穿透。
- 八个 `gal-ui-settings-{text,audio,display,confirm}-{dark,light}.audit.ts` 各以 1440×900 独立串行复跑，8/8 退出 0；重叠、硬性低对比、border-image 前提阻断均为 0。亮主题标题在四页均提示 3.57:1：它是 36px 大字，超过大字 3:1 下限，但仍低于通用 AA 4.5:1 提示；深色四页均提示仅一件 glass 且非 house 主题。两项作为后续视觉阶段警告保留，不抹掉。
- `node scripts/docs-ref-guard.mjs docs/design/galgame` 退出 0：35 份 Markdown、336 个路径，`DOCS-REF: PASS`。仅针对 GAL 文档目录，不称全库文档或全库门禁通过。

## 对抗撤修验红

对 Vite 静态构建加入一次性内存 `transform`，只匹配 `src/services/gal-ui/gal-ui-settings.ts` 中唯一锚点 `layout: { x: 65, y: 47, width: 1272, height: 61, direction: 'row'`；命中断言 `ANCHOR_HIT=1` 后将标题高 61 撤回 52。隔离浏览器实测 `#gal-settings-heading` 高度变为 52px，与本票固定目标 61px 的断言相反，明确转红。变换未写共享源文件；浏览器关闭、临时构建清理。若锚点缺失/重复或没有变红，探针会失败。

## 边界与判词

设置页 S4 外框及主要区域几何、框外导航与交互路径，本票独立核证局部 **PASS**。原型纹样、字体、按钮皮、CG、动画时序、桌面退出和未接音频/画面/恢复默认均未完成；保留显式禁用，不冒称完整设置里程碑。`src/services/gal-ui/gal-ui-settings.ts` 仍使用 LayoutNode 闭集，未发现自由 DOM/CSS 逃生；本复查只写本 Review 单。受 Owner 禁令，未运行内含 Git 的 `scoped-gate.mjs`，亦未核对 Git 改动边界或签署远端状态。
