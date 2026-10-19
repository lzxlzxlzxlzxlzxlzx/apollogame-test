# GAL V2 · S5 同画布自证对齐单（2026-10-13）

定稿基准：`../gal-ui-complete-v2.dc.html`，1440×900；真浏览器以隔离 `file://` 审计夹具打开，暗亮图在 `../review/`，浏览器已关闭。当前是第 1 轮增量自检，不声称 S5 结案。

| # | GDD 承诺 | 结论 | 证据 / 说明 |
| --- | --- | --- | --- |
| 1 | 【V2】主视觉背景、立绘、CG 为彼此独立内容图，UI 框皮无烘焙文本 | ⚠ 待 Owner 素材审批 | 当前使用已登记 demo 图，数据槽和失败降级存在；最终角色、场景、CG 及锁态剪影尚无逐件审美/来源/许可决定。去向：`../gal-art-01a-media-candidates-2026-10-13.md`，报 owner 逐件裁定。 |
| 2 | 【V2】对话框/选项在 1440×900 保留目标锚点，暗亮主题可读 | ✅ | `../review/gal-art-01a-story-normal-light-motion-v2.png`、`../review/gal-art-01a-story-choice-dark-motion-v2.png`；局部尺寸/动作证据见 `../gal-art-01a-s5-diff.md`。不代表逐像素完成。 |
| 3 | 【V2】4×3 存读档与回想/CG 双栏/三栏布局和导航 | ⚠ 待细节收敛 | 结构和动作有局部独立 PASS；元数据仍靠近花饰、锁态/CG 终图未批。去向：`../gal-art-01a-s5-diff.md` 的存档/画廊行；报主程收敛排版、报 owner 审批终图。 |
| 4 | 【V2】四页设置的深靛卡、金标题、行分隔、75×31 开关及具名交互 | ⚠ 待细节收敛 | `../review/gal-art-01a-settings-text-light-v2-rail-1014.png` 及四页签暗亮 8 图；已按当前场景图加暗罩，缺图回退条纹底，卡片半透明深靛金边、滑轨按真实值投影。PUI Toggle.visual 独立局部 PASS；右上说明、底栏和页签未逐像素签，`ui-audit` 标题仍有 3.57:1 警告。去向：报主程继续同画布收敛，详见 `../gal-art-01a-s5-diff.md` 设置行。 |
| 5 | 【V2】确认窗 800×至少310、30px 居中标题、正文/双键居中 | ✅ 局部 | Owner 选 A 后的 PUI `Modal.visual` 已独立局部 PASS；GAL V2 有图路由消费后，深浅浏览器确认内框 800×310、标题 30px 且 `aria-labelledby`、正文与双键居中：`../review/gal-art-01a-confirm-new-game-light-v2-content.png` 及暗态同名图。无图/旧切片保持旧布局；GAL [增量独立复查](../review/GAL-ART-01A-v2-visual-2026-10-13-independent.md)局部 PASS，不等于 S5 完成。 |
| 6 | 【V2】资产缺失/禁用状态不伪造成可用 | ✅ | 画廊锁态保密、剧情 CG 缺图提示、设置禁用控件、无图及旧切片回退有点名测试和真浏览器图；详见 `../gal-art-01a-s5-diff.md`。 |
| 7 | 【V2】首页使用独立标题场景图，六键菜单与底部说明对应定稿布局 | ⚠ 待细节收敛 | `GalUiSpec.titleBackground` 现经索引解析到 [首页实渲](../review/gal-art-01a-home-light-v2-home-final-1014.png)，无 URL 保留条纹回退；首键约 y368 对原型 y365，说明锚点 y785 但文案改成真实素材审核提示，四态逐帧未签。去向：报主程收敛按钮四态，原型或终图要变则报 owner 重确认；详见 `../gal-art-01a-s5-diff.md` 首页行。 |

第 2 轮：设置场景暗罩和确认窗 V2 几何已在深浅真浏览器验证。第 3 轮：首页标题场景接入、设置卡/滑轨闭集数据调整，四设置页签暗亮共 8 图；当前 ⚠ 4（终图审批、存档/画廊、设置、首页细节）。`S5` 不可宣称完成或请求 Owner 人门。S6 时序另见 `S6-alignment.md`，不能把本单的视觉行替代逐帧验收。
