# game-loot-chest｜固定三段锁芯 QTE 对齐单

基准：`capability-plan.md` 与本轮 owner 结论——不设计难度、不接受宿主 QTE 参数，只在既有确定性宝箱上增加固定小游戏。

| # | GDD 承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 初始宝箱仍使用包内审定关闭图，标题来自既有 `chest.name` | ✅ | `shots/QTE-01-ready.png` |
| 2 | 点击、触屏或空格开始；QTE 期间空格与点击提交同一具名动作 | ✅ | `tools/loot-chest-walkthrough.mjs` 用空格开始并走一次失误；后续点击命中 |
| 3 | 指针在固定 tick 周期内旋转，金色区域是命中窗口；判定主体必须醒目且与宝箱机械风格一致 | ✅ | `shots/QTE-AI-dial.png`、`shots/QTE-03-hit-1.png`；圆盘为 264px，命中区是嵌入珐琅轨道的窄金弧，AI 金属指针独立旋转；规则测试钉死 48–62 tick |
| 4 | 失误只重试当前锁，不清除已点亮锁印 | ✅ | `tests/qte.test.ts` 的 miss 路径；`shots/QTE-02-miss.png` |
| 5 | 连续失误三次扩大判定区，避免玩家卡死 | ✅ | `tests/qte.test.ts` 在普通窗外、辅助窗内命中，且命中后连续失误归零 |
| 6 | 每次命中点亮一枚锁印，三枚全部点亮后进入开箱 | ✅ | `shots/QTE-03-hit-1.png` 至 `shots/QTE-05-hit-3.png` |
| 7 | 开箱演出与 QTE 规则分离，固定演出节拍后揭示奖励 | ✅ | `shots/QTE-06-opening.png`、`shots/QTE-07-revealed.png` |
| 8 | QTE 不改变宿主 seed、掉落树或奖励结果 | ✅ | `chest.ts` 未改结算；原 10 条掉落合同测试与新增 QTE 测试全部通过 |
| 9 | SDK 继续使用 `doki.game.chest-input/2 → doki.game.chest-result/2` | ✅ | manifest、SDK lifecycle 与合同测试通过；无 QTE 输入字段 |
| 10 | 终局唯一出口“全部领取”可点击并进入完成态 | ✅ | `shots/QTE-07-revealed.png` → `shots/QTE-08-claimed.png`；走查断言文字变为“预览完成” |
| 11 | UI 使用 LayoutNode 闭集、无自由玩法 DOM/CSS；提示必须位于宝箱下方的不透明高对比信息板；奖励按实际列数居中 | ✅ | 23 条测试通过；两档 ui-audit 的重叠、硬对比、border-image 问题均为 0；`shots/QTE-AI-narrow-810x506.png` 中视口与 scrollHeight 同为 506，操作提示底边 477.5px；奖励网格宽度与 `cols` 由实际奖励数确定 |
| 12 | 圆盘与指针使用符合宝箱风格的独立 AI 透明素材，且继续保持动态判定区与指针旋转 | ✅ | owner 已批准；两张素材带完整 provenance 登记至正式 AssetIndex，通过 `CHEST_SKIN_KEYS`/`CHEST_SKIN_MAP` 消费；构建闭包 `assetEntries=4`、`assetFiles=4`，待审清单已清空 |

## 迭代记录

- 第 1 轮：真浏览器发现 `Panel action` 样式接缝吞掉高度，游戏层以无副作用 `margin:0` 数据规避；共享缺陷登记 `requests.md#REQ-CHEST-PUI-01`。
- 第 2 轮：锁环从 116px 缩至 92px，去掉锁印重复旋转；重走空格失败、三次命中、开箱、领取，全流程通过。
- 第 3 轮：根据 owner 目击反馈，将 92px 锁环重构为 176px 主视觉，方形色块指针改为 34px 三角刻度，标题/主指令/键位提示分别提升到 38/24/17px；首次窄屏复验发现底部提示溢出 21px，整体上移后 810×506 的 `scrollHeight=506`，提示底边 500.5px，完整留在视口内。21 条测试、两档 UI 审计及全流程重新通过。
- 第 4 轮：owner 仍判 QTE 偏小且要求 AI 圆盘/指针；QTE 主体继续扩大到 244px，提示改为深色不透明信息板与 28/20px 白字，命中/失误反馈移入信息板，揭示态不再残留空面板；奖励网格按实际奖励列数收窄后围绕屏幕中心。两张 AI 透明图已生成并进入 M2.5 待审区，正式接线等待 owner 对具体成品批准。22 条测试及 1060×760、810×506 UI 审计通过；最终常驻服务试玩因 5173 当前无响应尚未复跑。
- 第 5 轮：owner 批准两张 AI 素材；素材经 M2.5 从 pending 转入正式本地 AssetIndex，并把构建资产源收回 `dokiworld/game-loot-chest/assets/`，不再反向依赖 public 预览目录。QTE 重构为 264px AI 鎏金圆盘 + 180px 深蓝轨道 + 中心盖板遮出的窄金弧 + 82×142px AI 机械指针；辅助模式以金弧变长表达，不再变绿。构建文件模式完整试玩失误、三次命中、开箱、领取全部通过；23 条测试、两档 UI 审计与 810×506 无溢出复验通过。
- 第 6 轮：修正 AI 指针素材的径向朝向。素材原始构图为圆形轴心在上、箭头尖在下，接入转子后会表现为箭头朝向圆心；现通过 LayoutNode 的 `rotate: 180` 在转子内部翻转贴图，使轴心贴住圆盘中心、箭头尖朝外指向刻度。规则计时、命中窗口及转子角度保持不变，并由屏幕结构测试钉死该朝向校正。
- 第 7 轮：修复鼠标判定丢失。真浏览器探针证明鼠标按下的最上层节点是逐帧替换的 `qte-needle`，两帧后转子及按下目标 DOM 身份均已改变，导致真实玩家的 `pointerdown → mouseup` 无法合成 `click`；键盘 `keydown` 不经过该路径所以正常。现用既有 LayoutNode 重组：动态圆盘只负责表现，最末层增加固定 `qte-hit-area` 透明交互面并独占 `chest.qte.attempt`，结构测试钉死外层无 action、命中层置顶且覆盖 264×264 全盘。
