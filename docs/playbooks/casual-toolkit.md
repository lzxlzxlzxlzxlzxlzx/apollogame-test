# 超休闲 / 休闲 game UI 工具箱（Casual Toolkit · 唯一速查）

> 2026-07-15 立 · 主程维护。**做超休闲/休闲游戏的 UI 与观感前，先来这里按「你要做什么」找能力。**
> 定位：把本引擎为「超休闲/休闲」攒齐的 2D UI + 3D 能力**汇到一处**（散在 `ui.md`/`3d.md`/`rendering-fx.md` 的接线图这里做导航）。
> **字段实名/默认/枚举一律以机读真相为准**（`buildCapabilityCatalog()` 3D · `catalog.ts` 2D UI · registry describe/examples），本页只做「要 X → 用谁 → 活范例在哪 → 红线」的索引，不手抄字段表。
> 活范例：**game-i**（`?game=game-i`）——2D 走「🎛 UI 控件」tab（含 `🧊 3D UI` 子 tab + `🎉 Juice` 段）；3D 走「🧊 3D 能力」hub。

## 一、Juice / 反馈（爽感层 · 2D UI · render-only）
| 要做 | 用 | 备注 |
|---|---|---|
| 通关撒纸屑 / 领奖金币雨 / 星光爆 / 环境微光 | `Particles{kind:confetti/coins/stars/sparkle,count?,loop?}` | UI 层发射器（世界层对等=`Vfx3D`）·铺满父容器 |
| 桌面微尘 / 粒子跟随光标 | `Particles{kind:'sparkle',follow:'cursor',count?}` | 收成小簇随光标流动（软遮罩+screen 混色不挡字·JS 缓动·离场淡出）·render-only·活范例 game-i 🎉Juice |
| 数值滚动 / +N 收益飘字 | `Label.tween{from,to,ms}` · `layout.anim:'floatUp'`（循环升冒） | 配 `Label.format` 一起用 |
| 大数缩写 / 计时 / 百分比 | `Label.format`：compact（1.2K/3.4M/1.5B）/ time（mm:ss）/ percent（75%）/ int | 作用于 tween 每帧值 + 数字 text |
| 奖励飞向钱包 / 卡飞进牌库 | `layout.flyTo{to,ms?,arc?,delay?}`（沿弧飞到目标元素 id·mountUI 量 rect） | 多个挂不同 delay=拖尾成串 |
| 滚动公告条 | `layout.anim:'marquee'`（横向匀速滚动·放 overflow 容器里） | |
| 点按涟漪（触屏触感） | `layout.fx:[{kind:'ripple'}]`（:active 中心扩散一圈波） | 与 press3d 互补 |
| 打击 / 强调 / 受击反馈 | `layout.fx:[{kind}]`：pulse/pop/glow/shake/flash | 可叠加（glow+shake）·闭集 EffectKind |
| 按钮按下反馈（触屏） | `layout.press3d:true`（:active 沉 Z + 底唇·糖果厚按钮） | tilt3d 只 hover=桌面 |
| 稀有 / 高级感 | `fx:'holo'`（彩虹箔）· `fx:'sheen'`（流光斜扫）· `Label.stroke`（描边爆字·配 font 艺术字） | |
| 退场 / 消除 | `anim:'fadeOut'`/`'popOut'`（一次性·both 停末态）· `fx:'fade'`（纯 opacity） | 入场：fadeIn/slideUp/pop/dealIn/flyIn |
| 环形进度 / 冷却 / 每日目标 | `ProgressBar.shape:'ring'`（+`size`·conic 弧 + 中心值） | 线性条=缺省 shape:'bar' |

## 一·五、选关 / 进度屏（2D UI）
- 关卡地图：`LevelPath{nodes:[{label,state:done/current/locked,stars,action}],cols?,tone?}`——蛇形蜿蜒路径 + 连接线 + 状态节点（Candy Crush 式选关屏·点节点选关）。
- 环形进度：`ProgressBar.shape:'ring'`（见一）。星级：`Rating`。
- 三消棋盘玩法：`MatchBoard`（t3-match3-board·config 驱动确定性相位机）——交换/找连/消除产料 + 特殊糖（4 连条纹随 `stripedOrientation`·L/T 包装·5 连彩球·`comboTable` 组合）+ 格层（`jelly` 果冻/`blockers` 障碍/石块）+ 步数目标（`movesResource`/`jellyResource`/`blockerResource` 写 ResourceModify→现成 Condition 判胜负）；视图格 `BoardCell`+Clickable。缺口走 requests.md，勿手写消除逻辑。

## 二、3D UI 表达（CSS-3D · 2D LayoutNode · 非世界空间）
- 变换：`layout.rotateX/rotateY/rotate/z/perspective`（真 3D 合成 preserve-3d·自动补透视）。
- 交互：`tilt3d`（悬停立体抬起·桌面）· `press3d`（按压·触屏）· `PlayingCard.flipped`（state/点按真 3D 翻面·触屏）/ `flipOnHover`（桌面悬停翻）+ `backFace`。
- 循环：`anim:'spin'`（匀速自旋·配 `rotate` → 幸运转盘/加载环/自旋徽章）。
- 件：3D 卡牌 cover-flow（`rotateY+z`+父 perspective）· `CoinFlip`（3D 币）· 异形按钮 `Button.shape`（8 形）· 贴图皮 `Button.skin`+`skinSlice`（9-slice）· 透明贴图 `bg:'transparent'`+`bgTexture`。
- 活范例：game-i `🧊 3D UI` 子 tab（旋转木马 / 翻面 / 透视 HUD / 景深 / 转盘·spinner / tap 翻面 / press3d / 🎉 Juice 段）。

## 三、卡通盒庭观感（3D 渲染 · P3D 域 · 见 `3d.md`）
- 平涂招牌：`Material3D.shading:'toon'`（阶梯明暗·`toonSteps`）+ `outline`（inverted-hull 描边）/ `'flat'`（无光平涂）。
- 体：`Mesh3D`（box/plane/sphere/cylinder/cone/capsule/torus 7 形）· `Model3D`（glTF 真模型）· `Billboard3D`（朝相机贴图 quad）。
- 氛围：`Sky3D`（+HDRI `envMap`）· `Fog3D`（距离雾）· `Post3D`（bloom/tiltShift/ao/grade/aa）· `Light3D`（dir/point/spot）· `Glow3D`（辉光）。
- 材质：`Material3D` PBR 预设 + 贴图槽（map/normal/orm/…）+ `uvAnim`（滚动/序列帧·水面/传送带/岩浆）+ `surface`（程序化凹凸）。

## 四、手感 / 运动（3D · render-only）
- 弹 / 呼吸 / 挤压拉伸：`Anim3D` 通道（spring 阻尼回弹 · bob/osc/noise 循环 · ease 一次性 · `Transform3D.scaleX/Y/Z` squash&stretch）。
- 沿路径走：`Path3D`（巡逻 / 轨道 / 传送带 / 移动平台 · linear/smooth · faceDir · loop/pingpong）。
- 相机手感：`Camera3D` follow（`lag` 跟随柔化 / `lookAhead` 预读）· `tween`（运镜过场）· `shake`（trauma 震屏打击反馈）。
- 拖尾：`Trail3D`（运动残影）。

## 五、物理玩具（3D · 表现物理 · 不进 sim/hash · 可用随机）
- 刚体：`RigidBody3D{shape:box/sphere/capsule/cylinder/convex/heightfield}`——掉落 / 翻滚 / 堆叠 / 掷骰。体形由 `RigidBody3D.shape` 自带（缺省取同实体 `Mesh3D`）·**render-only 物理线无独立 Collider3D 组件**（2026-08-04 回填 + Lead 校注：原文误列；⚠ sim 侧另有**同名**确定性组件 `Collider3D`（`protocol/components/spatial.ts`·进 hash·`overlap-detect-3d` 消费）——那是逻辑碰撞线，与本节表现物理是两条线，勿混用；细则以 `playbooks/3d.md` 物理行为准）。
- 运行时施力：`Impulse3D`（bump `trigger` → 弹 / 射 / 跳 / 击退 / 风 · 或渲染器 `applyImpulse` 命令式）。
- 关节约束：`Joint3D`（cannon 约束·绳 / 秋千 / 吊桥 / 布娃娃）。
- 拾取：`Pickable3D`（射线拾取 → 信号入队·同鼠标点击类外源输入）。

## 六、拾取物 / 世界空间 UI（3D）
- 世界飘 UI：`WorldUI3D{text | node:LayoutNode}`——头顶名牌 / 血条（Label+ProgressBar）· 屏幕投影随单位跟随 · 背相机/出屏自动隐。
- diegetic UI：`Diegetic3D`（LayoutNode→CanvasTexture→贴 3D 面片·控制台屏 / 桌上卡牌·透视正确可遮挡）。
- 地面标记：`Decal3D`（blob 软阴影 / ring 目标环 / disc 落点 splat）。
- 广告牌：`Billboard3D`（金币 / 图标 / 拾取物·始终朝相机·参与深度排序会被遮挡）。

## 七、阅读 / 翻页滚轮（2D UI）
- 剧情、画廊等非滚动面：`Panel.wheel:{upAction?,downAction?}`——真实 `WheelEvent` 由 `mountUI` 统一归一化后经 `ActionSink` 入队；内层 `Panel.scroll`/`VirtualList` 优先，模态框会挡住背景面。禁游戏层自挂 wheel DOM 监听；活范例=game-i `t-wheel`。

## 红线 & 缺口怎么办
- **纯数据**：以上全是 LayoutNode / 组件数据，写世界靠 `action` 信号（handler 绝不塞自由逻辑/CSS/DOM）；3D render-only 组件绝不被 Condition 读、不进 hash。
- **游戏层禁**：裸 `Math.random`（用引擎种子 PRNG）· `innerHTML`/`createElement` 手写 DOM（走 LayoutNode）· 手写 Three.js（走 3D 组件数据）。
- **查不到 ≠ 自造**：2D UI 缺口 → `docs/workflow/requests.md`；3D 缺口 → `docs/workflow/requests-3d.md`。等主程裁决（重组/下沉/回驳），落地同提交回填本页 + 对应线手册。
- **已知缺口（超休闲·待拉动）**：跑马灯已补(marquee)；tap 涟漪已补(fx:ripple)；数字格式化/飞向/关卡地图已补。剩余次要：needle 指针仪表盘(ring 已覆盖弧)、2D 全屏震屏(fx:shake 近似)——用得少，需要再提 requests。
