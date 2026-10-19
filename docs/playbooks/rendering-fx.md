# 渲染与特效（2D）手册

> play-field（战场/棋盘/世界）走 **render 组件 + 引擎 2D 渲染器**（数据，非 UI 库）。动效强调走 `VisualEffect` 闭集。
> 机读真相：组件闭集 `src/assembly/component-map.ts`；渲染后端 `src/renderer/canvas-renderer.ts`（收集器 `renderable.ts`）。UI/HUD 请走 ui.md，不在这。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 画一张精灵图 | `l1-sprite`（组件 `Sprite`） | 挂 `Sprite{textureKey,anchorX,anchorY,zOrder}` + `Transform`；可选 `width+height+fit`（三者必须同在）将图按目标框等比 `cover`（裁源铺满）或 `contain`（居中留透明边）。省略三者保持源帧原生尺寸；atlas 以 Frame 源矩形为裁切边界。可选 `sampling:'smooth'` 让单张插值平滑，缺省 `nearest` 保持像素画。 |
| 拖动精灵影像、锅外回弹 | `DragPreviewLayer`（`src/runtime/drag-preview.ts`） | 宿主显式列 `entityIds`，同实例传 `CanvasRenderer({dragPreview})`；`PointerInputSource({move:true,onPointerSample:a=>preview.sample(a,world,performance.now())})`。只读 G3 `findDropZoneAt`；默认关闭、140ms 抬起/280ms 回弹，不写 World/Signal。 |
| 上色 / 透明度 | `l2-color`（组件 `Color`） | 挂 `Color{...,alpha}`；淡入淡出用 `t1-tween` 驱动 alpha |
| 多实体多段 2D 演出 | `t2-presentation-track`（`PresentationTrack`） | 轨道拥有者填 `targetEntity`、并行 `channels[{target,keyframes:[{at,value,easing?}]}]`、逐字段 `finalPose`；`play/pause/resume/reset/skip` 均由具名 Signal 驱动。固定 tick；自然播完和 skip 都落同一终态，下一拍 Resolve 发一次可消费的 `doneSignal`。同目标字段冲突稳定拒收。 |
| sprite-sheet 帧 | `l3-frame`（组件 `Frame`） | 挂 `Frame{...}`；逐帧动画用 `t1-animation`（读 Frame+TimerDone） |
| 状态切动作动画 | `t2-anim-state` | 挂 `AnimState{clips,moveClip,idleClip}`+`Frame`+`Sprite`（走/站/打/死自动切） |
| 朝移动方向翻转（左右镜像） | `t2-facing` | 挂 `Facing{mode:"velocity"}`；配 anim-state |
| 俯视有向物按方向转贴图（整体旋转，非镜像） | `t2-face-rotate` | 挂 `FaceRotate{source:"velocity"\|"target"}`；sim 写 `FaceDir{x,y}` 单位向量（零 trig），渲染器读它 atan2（`resolveRotation2D`，render-only）；碰撞仍 AABB 不随转 |
| 世界文字 / 数字条 | `l6-text`（组件 `Text`）/`t2-text-binding` | `Text` + `TextBinding{resourceId}` 绑资源实时数字 |
| 血条/蓝条/读条 | `t2-gauge` | 宿主加子实体 `Hierarchy`+`Shape`+`Color`+`Gauge`（随资源实时变化） |
| 相机跟随/取景 | `t2-camera-follow`（组件 `Camera`） | 目标挂 `CameraTarget`，相机挂 `Camera`（合作相机取 AABB 中点+偏移，先 fit zoom）；可选 `followDeadZone:{left,right,top,bottom}` 以 `[0,0.5)` 视口比例声明逐轴安全区，区内保持、越界只追对应轴，最后由相机实体的 `Bounds` 钳制；省略仍逐帧居中。通用 Camera 沿用世界/像素单位，Life package 的 camera 用格单位并仅在 Life renderer 投影一次成像素 |
| 页面满幅响应式世界 | `mountHost({viewportMode:'responsive'})` + `CanvasRenderer({viewport:{mode:'responsive',cameraFit:'cover'}})` | 显式 opt-in 后 Canvas 以 play-field CSS px 为逻辑尺寸、DPR 为 backing；render-local cover 只缩放投影且同步 WorldUI2D，不回写 Camera/World；省略配置仍为历史定尺信箱 |
| 2D 世界实体旁 UI | `l8-world-ui2d`（组件 `WorldUI2D`） | 稳定世界表现挂 `Transform + WorldUI2D{text\|node,offsetX/Y}`；纯宿主菜单可传只读 `worldUi2D.source()` descriptor（`entityId + transform + node`），严禁为开关 UI 直写 World。CanvasRenderer 需显式 `worldUi2D.host`，按当前 Camera 投影并用 `mountUI` 挂 LayoutNode；descriptor 可 opt-in `keepInViewport:{padding}`，以 mount 后逻辑 CSS 尺寸夹住左右边并在顶边翻到锚点下方。Life renderer 的偏移为格单位且只做一次格→像素转换；宿主产出 `data-entity-anchor`，可被 `Float/Connector` 的 entity anchor 消费 |
| 数据卡带 Canvas 实形热点反馈 | `presentation.focusTargets` + `pointerFeedback:{tone,pressedMs}`（opt-in） | `tone` 仅 cyan/gold/jade，`pressedMs` 为 1–300；键盘标签与 pointer hover/press 同用 focusTargets。宿主只读 `collectClickableTargets`/`pickClickableTarget`，与 `t2-clickable` 共用 hit-mask、Sprite cover/contain、zOrder/id、onlyFlag 及 fail-closed；CanvasRenderer 画轮廓，不发额外 move Signal、不写 World/hash。省略字段的旧卡带不装监听/画层。 |
| 动效强调（呼吸/抖/发光/闪） | `VisualEffect`（`EffectKind` 闭集） | 闭集 pulse/float/shake/pop/glow/sheen/flash/fade；`color` 取语义令牌 |

## ② 样例指针

- `EffectKind`/`VisualEffect`/`EffectColor` 语义令牌闭集：`src/ui/components/types.ts`（防注入·主题令牌解析）。
- 真实用法：`games/game-i/fx-lab.ts`（特效台）、`anim-lab.ts`（动画台）、`spawn-lab.ts`。
- 主题令牌（语义色 danger/gold/jade…→ 主题）：`src/ui/components/types.ts` 的 `UITheme`。

## ③ 本线红线

- 单段单字段用 `t1-tween`；多段多字段/多实体并行且需统一跳过终态时用 `t2-presentation-track`，不要在游戏层写逐帧控制器。两者都只用于表现，禁止把插值值接入玩法 Condition。
- **快照/hash 精确边界**：`Transform` 被现有 sim 使用，不能全局排除 hash。`PresentationTrack`/`PresentationPlayback` 与 `Tween` 一样保留在快照/hash，以保证整数 tick 回放和恢复；本能力的目标字段写入也可观察、可复现。纯渲染后端状态（如 GPU 纹理）才属 `NON_DETERMINISTIC`。
- 颜色用**语义令牌闭集**（EffectColor/EdgeColor），play-field Color 用值但**不收自由注入**。
- HUD/菜单**不用** render 组件手搭——那是 UI 库 LayoutNode 的活（ui.md）。
- `Sprite` 的 fit 只是在渲染后端从已解析的 texture/frame 生成 draw plan：不创建临时 Canvas/纹理、不读 URL、不改 World。`Sprite` 既有字段仍按现有快照口径保存，不能为了 fit 改动而擅自整体加入 `NON_DETERMINISTIC`。
- `WorldUI2D` 只负责世界锚点与投影；内容仍必须是 LayoutNode，写世界仍经 ActionSink 信号。渲染层不得据按钮内容改 World。

## ③b 大规模同屏实体（性能）

- 缺省后端 `canvas-renderer.ts`（增量①已去每实体 save/restore·数百实体够用）。
- **上千同类实体**（弹幕/幸存者百敌/大群）→ WebGL2 实例化批渲后端原型 `src/renderer/webgl/`（`?renderer=webgl2` opt-in·manifest-game 动态挂）：相邻同纹理实体并成一批 `drawArraysInstanced`，N 实体→少数几 draw（规划纯函数 `sprite-batch.ts` 可单测·`webgl-batch-bench.mjs` 量化）。**零数据改动**——照旧摆 Sprite/Shape 实体，换的是后端。
- **原型边界**：只批精灵+实心方/圆；文本/多边形/瓦片走 canvas（planner 记 `skipped`）。真图集打包/文本支持=后续增量（REQ-3D-RENDER-EFFICIENCY 增量②）。目击 `node scripts/webgl-proto-shot.mjs`（540 实体→1 draw）。

## ④ 正样例 / 反面教材

- ✅ `games/game-i/fx-lab.ts`：VisualEffect 闭集纯数据驱动。
- ✖ 游戏层自写 canvas 绘制 / 自由 CSS 动画 / 收 raw hex 破语义令牌。

## ⑤ 查不到怎么办

需要的动效/渲染表现闭集里没有 → `docs/workflow/requests.md` 提缺口（先看能否用现有 EffectKind + tween 重组）。3D 渲染进 `requests-3d.md`（见 3d.md）。**不手写渲染逃生。**
# Life render-only 世界语义

Life renderer 从 host 持有的 `LifeWorldVisualCatalog` 读取 warp landmark binding 与农务 surface keys；该 catalog 不进入 World。绑定地标可见时不画通用 warp marker，缺失/legacy/error 时才画 fallback。农务绘制顺序固定为 soil surface → crop stage，规则合法性仍由 simulation 的 `LifeActivityContext` 决定。
