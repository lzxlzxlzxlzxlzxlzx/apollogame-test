# GAL-UI-03B · 非施工者独立复查

复查日期：2026-10-10。复查范围：历史只读投影/弹层、回想与 CG 目录、锁态与放大、真实浏览器链。复查人只写本 Review 单，不修改共享施工文件；未执行 Git/GitHub、数据库修改或应用服务启动。

## 判词

**局部 PASS（仅 03B 的 S4 信息结构与交互切片）。** 历史窗口/游标、滚动隔离、锁定 CG 不泄露图像 key/动作、外部 Profile 刷新、解锁回想只读、第 2 页 CG 放大返回及 03A 滚轮/槽 2 链均经独立复跑。**不签像素级结构 1:1、完整 V2 或 S5/S6**：对拍仍有网格顶约 11px 偏移、卡片略高，且正式背景/CG/框皮缺失；差异与后续去向记录于 `gal-ui-03b-structure-diff.md`，不得反改定稿原型追认。

全库 **CONCERNS**：`npx tsc --noEmit --pretty false` 独立运行退出 1，诊断在 `games/game-card-reveal`、`games/game-dice`、`games/game-simlife`、`games/game-theft`、`src/launcher/game-runner.tsx`，未见 GAL 文件。不得称全库门禁绿。

## 四步证据

1. **独立复跑。** `npx vitest run src/services/gal-ui`：3 文件 **22/22**、退出 0；以最新活动 tab 施工现场再跑 `npx vitest run src/skills/tier3/narrative-director.test.ts src/services/gal-ui`：4 文件 **52/52**、退出 0，其中真实 Director 的 512 条可见窗口/越界拒退测试通过。隔离临时测试对当前 history/gallery/cg-expanded 三态的 `buildGalSliceTree` 跑 `validateLayoutNode`：**3/3、零 issue**。`node src/services/gal-ui/verify-gal-03b-audit.mjs` 在最新带历史序号夹具上独立重跑退出 **0**，history/gallery/cg-expanded 三态各为重叠 0、硬对比失败 0、3–4.5 对比警告 0、border-image 前提失败 0。脚本只构建本地静态页并运行短生命周期 headless Edge；审计前核验 `.ui-audit-tmp` 不存在，运行后再次确认被清理。
2. **带锚点隔离撤修验红。** 复制 `gal-ui-read-model.ts` 与同伴测试为同目录临时 probe。先断言共享文件中的唯一锚点 `historyEntries.slice(0, historyCursor + 1).map` 命中 **1** 次，再仅在副本改为全量 `historyEntries.map`，验证副本原锚点不存在且 sabotage 标记恰 **1** 次。运行复制测试中的当前分支截断用例：**1 failed/7 skipped、退出 1**；期望 `['欢迎','请选择']`，实际多出 `旧未来`。共享施工源码未被撤修；所有临时 probe 经解析后的精确绝对路径核验后删除。
3. **实证复现。** `node src/services/gal-ui/verify-gal-live-gallery.mjs` 在最新版内存 Profile 夹具独立跑 **exit 0**：真实 DOM 打开历史并滚动，剧情 ref 不动；关闭后选择分支，主页进入回想/CG；已解锁回想仍无重播 action，锁定 CG 无 `data-action`、不显示 `private/cg-1` 图像 key、点击不弹放大；外部解锁 `cg-7` 后刷新，翻至第 2 页并放大，关闭仍在第 2 页；返回故事可继续上滚。额外 24 条历史静态页在真实浏览器中验证 `scrollTop` 增长。`node src/services/gal-ui/verify-gal-live-wheel.mjs` 03A 回归 **exit 0**，含滚轮、改选与槽 2 存读档。目击 `gal-ui-03b-live-history.png`、`history-scrolled.png`、`live-memories.png`、`live-cg-locked.png`、`live-cg-expanded.png`、`live-cg-return.png` 及 CG hover/pressed 图：历史 wide 弹层与 430 高列表、CG 3×2、回想 2×3、wide 放大遮罩、锁态与页码均可见。与 owner 定稿 V2 的回想/CG 图对拍，保留上述 11px/卡高差异和 S5 正式皮债。所有浏览器在 `finally` 关闭，临时构建清理，端口均为内存实现。
4. **读告警。** Vitest 与两条浏览器链无 stderr 错误；Director 512 测试仅有信息性 stdout：`512-entry history bytes=721111`。三态 UI 审计的阻断项与 AA 警告均为 0，但历史态提示“华丽件偏少且未见 house 主题皮”，gallery/expanded 也报告“house 主题：否”启发式结果；入口实传 `apolloOnyx`，正式皮图/素材仍属 S5，不能把审计 exit 0 说成视觉 1:1。全库 tsc 红项如上，独立分列 CONCERNS。

## 边界与未签事项

`readNarrativeHistory` 只给 detached 的当前会话窗口；UI 按当前 cursor 截掉旧未来，最大 512 条由 Director 测试验证。目录只把已解锁 CG 标为可开，S4 仅用“正式素材尚未入库”占位，未接未登记资产 key。回想卡即使解锁仍只读，不提供 C5b 重播。真实存档预览、四页设置、自动/快进、音视频、正式 CG 与 S5/S6 演出均不在本票判词内。
