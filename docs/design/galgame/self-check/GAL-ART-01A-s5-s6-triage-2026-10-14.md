# GAL V2 · S5/S6 未决项提问闸分类（2026-10-14）

定稿依据：`../gal-ui-complete-v2.dc.html`、`../gal-ui-complete-v2.md`、`S5-alignment.md`、`S6-alignment.md`。按 `ask-owner` 先分“自己答 / 必须问 Owner”。`align-count` 退出 0 只表示所有 ⚠ 有去向，不等于 1:1 通过。

| 对齐单项 | 现状与实证 | 分类 / 去向 |
| --- | --- | --- |
| S5-1 独立背景/立绘/CG、终图 | 现有 demo 场景、立绘、CG 有独立 key 与缺图降级；回想 01–06、锁态剪影、CG 02–06 无逐件候选及许可，见 `../gal-art-01a-media-candidates-2026-10-13.md`。 | **Owner 独占**：终图审美、来源、许可和发行范围。没有具体候选前不伪报批准，也不生成/登记新图。 |
| S5-3 存读档、回想/CG | 4×3、2×3、3×2 及导航已有局部复查；存档底部文字靠近花饰、卡片四态和同内容缩略图未做最终对拍。 | **可自行收敛**：使用现有 LayoutNode/图槽继续核几何、对比和交互；**Owner 独占**仅在缺终图的纹理/分镜最终验收。原型存档元数据本身也与花饰靠近，不应擅自改其锚点。 |
| S5-4 四页设置 | 八张暗亮实图已出；卡/滑轨已数据化。36px 标题实测 3.57:1，满足大字 ≥3:1，但通用审计仍按正文 4.5:1 报 WARN。恢复默认尚禁用：`persistGalPreferencesReset` 已有，但其契约写明“所有设置有真实消费者后才暴露”，当前输入/显示若干控件仍只读。 | **可自行收敛**：右上说明、页签、底栏的同画布差异和真实可用控件继续验证；标题 WARN 记录判据，不把它冒充阻断。**Owner 产品取舍**：要做齐全部设置消费者后开放恢复默认，还是先经 Owner 重确认原型中的可用态。不得擅自启用空操作。 |
| S5-7 首页 | 已有独立标题背景、无 URL 回退，首键 y≈368 对原型 y≈365。真实模板声明替代原型演示文案，宿主退出键禁用且当前没有出口端口；原型浏览器只反馈、桌面宿主真退出。 | **可自行收敛**：其他五键四态/锚点；**Owner 产品取舍**：确定宿主退出/预览反馈的分阶段语义，并对文案差异是否改原型作明确重确认。不得把禁用键伪称为可执行。 |
| S6-4 全按钮四态与关键链 | `verify-gal-art-live.mjs` 隔离浏览器覆盖 20 屏×深浅：40 页实例、374 个 button 实例，270 个可见可点按钮的 hover 与 pressed 均有视觉变化；44 个禁用被记录、60 个模态下按钮仅按中心点 hit test 判为遮挡。逐屏 JSON 与六类全屏 hover/pressed 截图在 `../review/`，探针退出 0。剧情台词 0/120/240/650/1300ms、选项 0/120/250/340ms 关键帧截图并读 `opacity/transform`；120ms 时第二选项确实落后第一项。 | **可自行收敛**：这只是静态夹具的 hover/pressed 局部证明，不能称为全按钮四态；真实宿主跨页动作链、焦点/键盘、全部模态出口未证。完整 S6 暂不签。 |
| S6 补漏：提示 2200ms、自动 2700ms | 定稿文档明确这两项。现已消费 PUI 既有 `showToast`：宿主反馈保留 2200ms 后自消，禁用/错误文本不再常驻 LayoutNode；定点测试含 2199/2200ms 与同一句到期后再次触发重显。自动播放沿用偏好值与已有调度器；偏好设 2700 时 2699ms 不推进、2700ms 推进的测试通过。独立复查首次发现重显缺陷，修复后复查人以唯一锚点内存撤修验红、基线再绿，局部 PASS。 | **可自行收敛**；没有新通用能力缺口。2700 是定稿演示参数，不应覆盖作品包自带的合法偏好或伪造运行时当前值。真浏览器跨页动作链仍待验证。 |

能力实查：`npx vite-node scripts/dump-capability-catalog.mjs` 退出 0；`docs/playbooks/pick-list.md` 的剧情/VN 分支指向 `dialogue`/`t3-narrative-director` 与闭集 UI；`docs/playbooks/ui.md`、`src/ui/components/catalog.ts`/`server.ts` 已有 Button/Slider/Panel/Toast。此次 2200ms 与四态均能重组表达，**无新增通用能力 A/B 请求**。宿主退出是产品/平台接缝而非把 `gal.unavailable` 改名就能解决；恢复默认函数已存在，缺的是其他真实设置消费者和阶段取舍。

限制：本轮全库 `scoped-gate --run` 退出 1：当前共享树有 33 条非 GAL 的 Life 等 depcruise 违规，且缺失本地 `origin/claude/mainbranch` 参照；不改他域在途。不生成新素材、改定稿原型、代签 Owner 人门或宣称 S5/S6 完成。

本轮复验：Toast 重显修复后 `npx vitest run src/services/gal-ui src/ui/components` 为 **83 文件、653/653**；`npx tsc --noEmit --pretty false` 退出 0。开启硬断言后的 20 屏×深浅逐键浏览器探针最终退出 0，临时构建与浏览器已关闭/清理。`S5-alignment.md` 计数 ✅3/⚠4/❌0，`S6-alignment.md` ✅5/⚠1/❌0，两个 `align-count` 均退出 0，含义仅是警告去向完整。独立报告见 `../review/GAL-ART-01A-s5-s6-triage-2026-10-14-independent.md`，Toast 重显修复局部 PASS，总体仍 CONCERNS。
