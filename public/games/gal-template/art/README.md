# GAL 模板本地美术资产 · V2 demo 原图

本目录仅服务于通用 GAL 模板；游戏运行时应由本地 `index.json` 按稳定 asset key 解析站点绝对 URL，不读取 `docs/design/galgame/`。八张 PNG 是经 owner 于 2026-10-11 明确要求复用的现有 demo 图片，均为原字节副本（`provenance.sha256` 与设计稿源相同），没有裁切、缩放或重绘。`filled` 只表示文件存在、可解析，不等于 S5/S6 视觉、人审或发行门已通过。

| 稳定 key | URL | 原图尺寸/透明 | 消费槽 |
|---|---|---|---|
| `tex/gal-dialogue-panel` | `/games/gal-template/art/textures/ui/dialogue-panel-concept-v1.png` | 2172×724 / RGBA | `dialog.skin`；人名、台词、按键保持动态层 |
| `tex/gal-system-frame` | `/games/gal-template/art/textures/ui/panel-frame-v1.png` | 1536×1024 / RGBA | 系统页 `Panel.skin`；设置、存读档、回想、CG 共用 |
| `tex/gal-button-default` | `/games/gal-template/art/textures/ui/button-default-v1.png` | 2172×724 / RGBA | `Button.skin`；标签、禁用/悬停/按下由控件表达 |
| `tex/gal-save-slot` | `/games/gal-template/art/textures/ui/save-slot-compact-v2.png` | 1633×963 / RGBA | 4×3 存读档卡 `Panel.skin`；缩略图、元数据和选择态另叠 |
| `tex/gal-slider-knob` | `/games/gal-template/art/textures/ui/moonstone-knob-v1.png` | 1265×1243 / RGBA | `Slider.thumbSkin`；滑杆数值与位置由控件控制 |
| `tex/gal-demo-backdrop` | `/games/gal-template/art/textures/demo/moonlit-backdrop-v2.png` | 1586×992 / RGB | demo 剧情场景背景；不是首作背景 |
| `tex/gal-demo-portrait` | `/games/gal-template/art/textures/demo/demo-portrait-v2.png` | 1024×1536 / RGBA | demo 人物立绘；不是首作角色设定 |
| `tex/gal-demo-cg` | `/games/gal-template/art/textures/demo/demo-cg-v2.png` | 1672×941 / RGB | demo CG 画廊解锁项；不是首作剧情 CG |

## 审计与消费限制

- 解码检查：八件均为 PNG；五件 UI 图和立绘带 alpha，左上角 alpha=0；背景与 CG 为不透明 RGB。源图的完整尺寸、SHA-256、生成来源和已保存的提示词逐项登记于 `index.json`。没有保存具体提示词的条目明写 `promptRecord: not preserved`，没有臆造模型或生成日期。
- 所有贴图用途为 `sprite`、色彩空间为 `srgb`；不进入 sim/hash。文件仅复制到模板本地库，不进入共享 `assets/index.json`。
- 开发内使用与外部分发是两道不同许可门：本轮 owner 允许这些图片用于 GAL 模板开发；**外部发行/商用授权仍待发行前复核**。因此 `license` 不标 CC0，`distributionStatus` 保持 `unverified`。
- 五件 UI 原图尚未通过正式运行时的 1440×900 对拍与小尺寸可读性验收。特别是现有 `Panel.skinSlice`/`Button.skinSlice` 把“源图裁边像素”与“屏上边框宽度像素”锁为同一个数；定稿 V2 系统外框用源切 115、显示边宽 58，**原图无法直接用当前单参数九宫格精确复刻**。给原图硬填 115 会侵占内容，硬填 58 会切穿角饰。对话框/按钮直接 `cover` 也可能裁掉上下饰边；存档卡约 1.70:1 原比与目标 309×164（1.88:1）不完全一致；滑块原图有大片透明边，25px 盒内主体会过小。故此处不伪造可用 `skinSlice` 数值，也不把这些风险解释为原型改版。
- 真机复刻的后续裁决可在“PUI 将源裁边和目标边宽分离”或“保持设计源图不动、另制精确重采样消费副本”之间选择。消费副本必须保留从本目录原图到输出的处理记录和独立视觉复查。未裁决前，运行时可做缺图/不适配时的原有素皮回退，不能据此签 S5 视觉 1:1。
- CG 锁定态不应暴露 `tex/gal-demo-cg` 的原图 URL；只有剧情/档案授权解锁后的投影才消费该 key。背景、立绘、CG 是模板演示内容，未来每部新 GAL 须换自己的已审核资产。
