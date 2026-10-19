# S7 视觉品质独立评分（2026-10-15）

评分人：`/root/potion_s7_score`，非 S6 游戏施工者。按 `docs/playbooks/visual-scorecard.md` 的 **2D 线**；`game-pipeline.mjs board` 本轮重读确认 S2–S5 当前分域机器/复查有效、S6 台账 8/8 复核显示绿。S7 只落评分卡，不代签 Owner 人门。

| 维度 | 分 | 独立依据与判词 |
|---|---:|---|
| 艺术方向 | 2 | `self-check/shots/S6-01-start.png`、`S6-05-success.png`、`S6-06-failure.png`：深棕/暖金卷轴木架、古铜锅与青蓝汤/瓶在三态中保持统一；成功框的奶油色属于同一暖色系。统一达标，尚未证明超出定稿原型的独特风格创新。 |
| 主角面 | 3 | `public/games/game-potion-brewing/art/art-ledger.json` `art-01`/`art-02` 与本地 `art/index.json`：锅和瓶均为 Owner 批准的真实透明 PNG，非程序几何；`S6-01-start.png` 的雕刻星月古铜锅和 `S6-05-success.png` 的青蓝金饰瓶辨识度强。 |
| 世界密度 | 1 | `S6-01-start.png` 与定稿 `ui-refs/29-transparent-fixed-recipe.png`：卷轴、锅、材料架三组对象有内容，但对象间及边缘是大面积无遮饰的透明宿主舞台；未达到 2D 底线“台面/背景 ≥3 层且无大片裸色空地”。透明背景为 Owner 明确设计约束，不将其误判为渲染故障，也**不自行豁免评分维度**。 |
| 材质 | 2 | `S6-01-start.png`：锅有金属刻纹/高光，卷轴有暖纸渐变、卷边描边与内侧阴影，材料卡有描边和投影；跨主要表面至少两项手法一致，非整屏纯色块。 |
| 渲染管线 | 2 | `S6-01-start.png` 锅沿和汤面明亮、左右面板与空区压暗；`S6-05-success.png`/`S6-06-failure.png` 的遮罩有明确焦点压暗，形成全屏层级，不是等亮度铺平。无独立的更复杂后处理证据，故不打 3。 |
| VFX | 2 | `self-check/shots/S6-02a-add-fade-start.png`→`S6-02b-add-fade-middle.png`→`S6-02-add.png`：投料汤色 750ms 交叠、汤内光环渐亮渐灭；`S6-03-stir.png` 搅拌再触发汤内反馈；`S6-06-purple-before-result.png` 错误紫汤先于失败框呈现，成功以瓶图结算。三关键时刻可辨而锅体不乱发光；快速连续输入 <180ms 边界仍未点名，故不打 3。 |
| UI 美术 | 2 | `S6-01-start.png` 左卷轴、右木架、底部步骤牌均与古铜锅同暖金/深木配色；`S6-05-success.png` 成功框展示批准瓶图，未用默认灰控件裸摆。`S5` 当前机器门仍报“无 golden-shot 标准照基准，未比对”，独立 UI 复查 PASS 不等于像素 golden 已覆盖；故不打 3。 |
| 性能证据 | 2 | 独立短时 Edge 在 Owner 已运行 `http://localhost:5173/?game=game-potion-brewing`、1440×900 DPR1、各 240 个 rAF 间隔：开局 median/p95/p99/max = **5.9/6.1/6.5/6.6ms**，DOM 104/Canvas 1；真鼠标投料触发过渡后为 **17.5/18.1/18.5/19.0ms**，cue 存在 54 帧，DOM 115/Canvas 1，pageerror 0。探针只在本机无头浏览器测一次，不外推低端设备/长时压力，故不打 3。完整采集条件见 `review/S7-visual-preflight-2026-10-15.md`，浏览器均在 `finally` 关闭；未启动/停止 Owner 服务。 |

**VISUAL: 16/24 · PREMIUM: NO**。短板为世界密度 1/3；它与透明宿主合约有意冲突，若未来希望 premium，须由 Owner/Lead 决定是否在保持透明的前提下增加有层次的台面/装饰或正式裁定该维适配问题，复查者不能自放宽底线。本评分不阻止如实继续非 premium 流程，但不得用 premium 宣传。

告警/控制面披露：`public/games/game-potion-brewing/art/art-ledger.json` 的 `art-08` `provenance.humanArtPlatformReview` 仍写 `pending`，`self-check/S6-alignment.md` 旧文也称 Owner 逐行未执行；流程板当前却示 S6 8/8 复核。两者不一致，不能只凭本评分推断素材审批已完整。S5 的 golden-shot 缺基准仅为 WARN，未被本评分冒充为已跑过像素回归。
