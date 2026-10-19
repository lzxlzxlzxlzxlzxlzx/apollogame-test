# GAL-ART-01A · 存读档 V2 四入口局部独立复查

日期：2026-10-13。判词：**局部 PASS；完整 S5/S6 仍为 CONCERNS**。复查人只核“主页／剧情／回想 CG／设置”四个入口及既有 fallback，不代签整个 `media-and-final-skin`、游戏阶段或 Owner 人门。

## 范围与阅读

- 已完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`docs/design/ui-playbook.md`、`ui.md`、`events-logic.md`、`assets.md`、`art-pipeline.md`、`testing.md`、`self-check.md`、`review-gates.md`；对应技能为 `module-ui`、`check-ui`、`module-art`、`module-assets`、`module-events`、`project-roadmap`。命中 UI／事件／美术资产／测试／复查线。
- 先核对当前 `requests.md` 与路线图：GAL-ART-01A 由 GAL 主程施工、`media-and-final-skin` 为 active，S5/S6 与 Owner 门均未通过。本复查只写本报告；未修改实现、PUI 基座、素材索引、冻结原型或其他项目文件。共享工作树的其他在途改动未归因也未回退。
- 代码范围：`gal-ui-structure.ts:295-316` 仅 V2 已加载画框和整图槽皮构造四个具名 `Button`；`gal-ui-art.ts:124-150` 将同一动作组移动到 Screen 顶层并给四项 ghost 皮；`gal-ui-slice-host.ts:362-377` 只在槽页消费 `gal.slot.nav`；`gal-ui-slice-host.ts:134-139` 把可续剧情投影给禁用态。无图及旧显式切片继续是“设置／返回剧情”。

## 独立四步证据

1. **复跑**：`npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`，独立退出 0，2 文件 38/38。`gal-ui-art.test.ts:146-173,235-268` 钉住四项 ID/actionArg、V2 顶层位置、无重复节点、无图/缺槽/旧切片 fallback 与 `validateLayoutNode` 零 issue；`gal-ui-slice-host.test.ts:707-729` 钉住剧情来源进入回想返回、回标题确认/取消/关政策与无效页动作。首次受限沙箱内 Vite 读取 `node_modules/vitest/dist/spy.js` 报 EPERM、0 测试；同命令在获准隔离执行后 38/38，未把前者当业务红灯。
2. **真浏览器**：设置 `GAL_ART_AUDIT_OUTPUT=C:\Users\24652\AppData\Local\Temp\gal-four-nav-independent-20261013` 独立运行 `node src/services/gal-ui/verify-gal-art-live.mjs`，退出 0；34 个深／亮静态文件状态，无资产破图。存／读档四态框为 `x18 y60 1404×830`；脚本对四入口逐一真实 DOM 点击并检查 ActionSink 信号（共 16 次），同时检查导航在框上方；无槽图深／亮两态保留原框内按钮。真截图复核了暗／亮、保存／读取与无图路径；临时 Chromium 由脚本 `finally` 关闭，未访问 5173、远程服务或 Owner 日常浏览器资料。首次沙箱内 Vite 解析 GAL audit fixture 报 EPERM；获准隔离重跑才取得退出 0。
3. **锚点撤修验红**：只在内存读取 `gal-ui-art.ts`，精确断言 `if (node.type === 'Screen' && art.systemFrame?.slice === 115 && art.slot && art.slot.slice === undefined) {` 命中 **1** 次；TypeScript 转译并在隔离 VM 调 `applyGalUiArt`。正常 V2 最小树得 `{top:1,nested:0}`；内存把这一分支替换成 `if (false) {` 后，同一顶层导航不变量如预告转红。现场文件没有被改动；这是针对框外重排的局部撤修，不冒充四项业务路由全部覆盖。
4. **告警与视觉差异**：受限沙箱 EPERM 是工具文件访问，获准执行无 GAL 错误。1440×900 真截图顶部确有四个可读入口，位置在框上方；与 [冻结 V2 图](../gal-ui-v2-save.png) 相比，正式 ghost 的胶囊描边、背景纹样、存档元信息/已填预览仍不 1:1。真浏览器 audit 验证发出的 action 名，但未逐次核 `actionArg`；该参数由点名数据测试核证。局部截图检查不能代替整页 `ui-audit` 四关或 S6 动画关键帧。此次没有复跑全库门禁，也没有把其他项目的失败称为修复。

## 结论

四入口的 V2 条件构造、上框定位、ActionSink 可点击性、槽页来源路由及无图 fallback 在本局部范围 **PASS**。`media-and-final-skin` 继续 active；S5 视觉细节、S6 时序和 Owner 人门继续 **CONCERNS／待验**。项目控制台应由施工主体按这份局部证据同步，不能把局部 PASS 写成里程碑 done。
