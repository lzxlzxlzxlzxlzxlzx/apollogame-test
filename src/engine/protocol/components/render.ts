// Protocol · 表现层（渲染 / 动画 / 音 / 相机 / 文字 / 缓动）─────────────────────────────
// 每帧驱动 UI/渲染的"软逻辑"组件：可见性、精灵图层、颜色、帧、血条、动画状态机、朝向、声音、相机、文字、Tween。
// 红线：表现层只表现，**绝不驱动逻辑、绝不被 Condition 读**（Tween 浮点插值不喂逻辑数值，防跨端 1-ULP 漂移）。
import type { Component } from '../../core/types.js';
// 仅类型（erased·无运行时环）：WorldUI3D / Diegetic3D 的富内容 = LayoutNode（UI 铁律）。
// ⚠ **直接取 types.js，不走桶文件 index.js**（P3a 机器围栏逼出来的）：桶文件会把重度依赖 DOM 的
// `server.ts` 一起拖进类型图，于是 protocol 这一层在「无 DOM」的 tsconfig 下编译不过——
// 而 protocol 是 sim 的契约层，本就不该认识浏览器。types.ts 自身只依赖 ./emoji.js，是干净的。
import type { LayoutNode } from '@ui/components/types.js';

// ── H1 visibility ── 是否可见 / 是否参与系统运算
export interface Visibility extends Component {
  readonly type: 'Visibility';
  visible: boolean;
  active: boolean;
}

// ── L1 sprite ── 实体用什么图、渲染层级
export interface Sprite extends Component {
  readonly type: 'Sprite';
  textureKey: string;
  anchorX: number;
  anchorY: number;
  zOrder: number;
}

// ── Mesh3D（render-only，通用「3D 物件即数据」原语）── 一个有体积/双面、可翻面的 3D 物体（牌/骰/棋子）。
// 本件是**引擎通用「3D 物件」原语**（非某游戏私货的手写 Three.js）——任意实体挂上
// 即被 3D 后端渲成一个 box/plane，与 2D Renderable **同场混排**（per-object opt-in 3D，不是整场景 3D）。
// 「3D JSON」= 这些 Mesh3D 的数据描述（类比 UILayout 之于 2D UI），游戏只**描述**、引擎**解释**渲染，
// 不再每游戏手写 Three.js。3D 位姿取同实体 Transform：x,y→位置；rotation→绕 flipAxis 的**翻面角**
// （0=正面朝镜头、π=反面）。红线：表现层组件，**绝不被 Condition 读、绝不进 sim 逻辑/hash**。
// 纹理/导入/骨骼/动画不在此（那是各游戏私货 or action 方向，触发方向漂移预警）。
// 骰面（render-only·程序化 pip 贴图）：一面的元素色底 + 点数。复刻美术设计案 3D 命运骰（原型 dieFaceTex）。
export interface DieFace { color: number; pip: number; emissive?: number; src?: string } // color/emissive=0xRRGGBB；pip=1..6；src=手绘面贴图 URL(在场则替代程序化 pip 贴图)

// 体素表面程序化贴图（render-only·复刻美术设计案「带精美贴图的体素」·原型 topTex/sideTex/wallTex）。
// 在场 → 渲染器给 box 的顶面刷 topTex（格纹 + 颗粒 + 勾缝）、四周刷 sideTex；wall:true → 全面用侧墙纹。
// 纯色 tint 表达不了这层网格质感 → 这是体素世界的通用美术能力（下沉到 3D 基座·全体素物件共用）。
export interface VoxelTex {
  top: number;              // 顶面主色 0xRRGGBB
  side: number;             // 侧面主色 0xRRGGBB
  top2?: number;            // 顶面点缀色（缺省=top 微调）
  side2?: number;           // 侧面点缀色（缺省=side 微调）
  trim?: number;            // 墙顶饰条色（wall 用）
  pattern?: 'grass' | 'stone' | 'crystal' | 'plain'; // 顶面纹样母题（草叶/石纹/晶裂/纯颗粒）
  wall?: boolean;           // true=墙体（六面同侧墙纹 + 顶饰条），false=地台（顶面网格 + 侧面）
  tile?: number;            // 一格世界尺寸（缺省 2·据物体尺寸算重复次数出网格）
  topSrc?: string;          // 顶面**手绘贴图 URL**（在场则替代程序化 topTex·Cloud Design 素材）
  sideSrc?: string;         // 侧面/墙体手绘贴图 URL（在场则替代程序化 sideTex）
}

export interface Mesh3D extends Component {
  readonly type: 'Mesh3D';
  // box=有厚度·正反两面可分色；plane=双面薄片（单色）；sphere/cylinder/cone/capsule/torus=圆润单材质图元（three 内建·单色）。
  shape: 'box' | 'plane' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus';
  width: number; // 物体宽（世界单位，与 Transform.x/y 同尺；相机自适配取景）。sphere/cylinder/cone/capsule/torus：直径
  height: number; // 物体高。sphere：忽略（取 width 作直径·正球）；cylinder/cone/capsule：柱/锥高；torus：忽略
  depth?: number; // box 厚度；缺省=短边*薄板比（下限 1）。plane/圆润图元忽略
  tube?: number; // torus 专用·管半径占主半径的比例（缺省 0.35）；其它图元忽略
  frontTint: number; // 正/反面主色 0xRRGGBB（作用面由 faceAxis 定·缺省 +z）
  backTint?: number; // 反面色；缺省=frontTint
  edgeTint?: number; // box 其余四面色；缺省深灰
  /** box 正反分色作用在哪条轴的两面（REQ-3D-CARD-FACE-AXIS·render-only·缺省 'z'=+z/−z·零回归）。
   *  'y' → frontTint=+y(顶)/backTint=−y(底)·edgeTint=其余四面：薄牌沿 Y 薄时天然躺平 + 顶底分色（配 RigidBody3D
   *  cylinder 原生 Y 轴圆盘刚体·可靠躺平）；'x' → +x/−x 两面。通用于卡牌/瓷砖/硬币/招牌等薄片类物件。 */
  faceAxis?: 'x' | 'y' | 'z';
  flipAxis?: 'x' | 'y'; // Transform.rotation 作为绕此轴的翻面角；缺省 'x'（前后翻）
  /** 六面 pip 骰子（render-only·程序化贴图·复刻美术设计案 3D 命运骰）。在场 → box 建成 6 面元素色 + 白点材质，
   *  替代 frontTint/backTint 纯色（size 取 width）。面序 = BoxGeometry [右,左,顶,底,前,后]。骰盅/掷骰/战利品/Title 共用。 */
  dieFaces?: DieFace[];
  /** 玻璃骰（render-only·配合 dieFaces·owner 2026-07-01 近观概念定）：六面改用**透明玻璃材质**（MeshPhysical·transmission），
   *  骰面圆角 pip 贴图作**贴花**浮于其上——贴花外的四角 + 立方体棱(楞)是**通透玻璃**（可透见背景/背面），呈高级透玻璃感。 */
  dieGlass?: boolean;
  /** 体素表面程序化贴图（render-only·复刻「带精美贴图的体素」）。在场 → 顶面网格纹 + 侧面纹，替代纯色 tint。地台/墙/基座共用。 */
  voxelTex?: VoxelTex;
}

// ── Glow3D（render-only·加性辉光精灵·复刻美术设计案原型 glowSprite）──────────────────────────────
// 一个始终朝镜头的**径向渐变加性光晕**，挂在实体的 Transform3D 位置上（火盆/灯笼/门/宝石/元素物的暖光）。
// 纯表现（NON_DETERMINISTIC）：颜色 + 尺寸 + 透明度。渲染器建 THREE.Sprite（AdditiveBlending·depthWrite:false）。
// 体素世界靠它出「自发光暖光晕」——纯色 emissive + bloom 表达不了这种柔光扩散，是通用氛围能力（全 3D 场景共用）。
export interface Glow3D extends Component {
  readonly type: 'Glow3D';
  color: number;    // 光晕色 0xRRGGBB
  scale: number;    // 直径（世界单位）
  opacity?: number; // 基础不透明度（缺省 0.6·可被脉动改·此处静态基值）
}

// ── Reflector3D（render-only·平面反射镜面·REQ-3D-PLANAR-REFLECT）─────────────────────────────────
// 一块**镜面平面**：渲染器每帧把场景从镜像相机渲进一张贴图 → 平面上照出真实倒影（three.Reflector·RTT）。
// 比 SSR 干净（无屏幕空间噪声/掠射漏光）·适合**平地板/水面/冰面/casino 镜面大堂**。位姿走同实体 Transform3D。
// 纯表现（NON_DETERMINISTIC）：绝不进 sim/hash。挂 Reflector3D + Transform3D 即成镜面（不需 Mesh3D）。
export interface Reflector3D extends Component {
  readonly type: 'Reflector3D';
  width: number;   // 镜面宽（世界单位）
  height: number;  // 镜面高/进深（floor 时=Z 向进深·世界单位）
  color?: number;  // 反射染色 0xRRGGBB（缺省冷银 0x8892a0·casino 可染金/蓝·blendOverlay 叠加）
  opacity?: number;// 反射不透明度 0..1（缺省 1=纯镜；<1 让下方底色/平台透出=半反射湿地板）
  orientation?: 'floor' | 'wall'; // floor=水平镜(法线+Y·缺省)·wall=竖直镜(法线+Z·由 Transform3D.rotY 转向)
  quality?: number; // 反射贴图边长（像素·缺省 512·越大越清越贵）
}

// ── Model3D（render-only，导入式 3D 模型 · glTF）──────────────────────────────────────────────
// Mesh3D 的 box/plane 原语表达不了圆润模型（蘑菇人、道具、生物…）→ 用真模型：渲染器据 modelKey 从
// AssetManager 取 glTF 字节、解析成 three 场景显示。位姿走同实体 Transform3D（盒庭真三维）或 2D Transform
// （盒庭模式落地面），与 Mesh3D 同套位姿路径（per-object opt-in 3D，不是整场景 3D）。资产走 key
// （sim 持 key 保纯·同 sprite 先例），蓝图**绝不塞 URL/二进制**（导入铁律）。
// 红线：纯表现，**绝不被 Condition 读、绝不进 sim 逻辑/hash**（已入 determinism NON_DETERMINISTIC）。
export interface Model3D extends Component {
  readonly type: 'Model3D';
  modelKey: string; // 资产 key → glTF 模型（AssetManager 解析；蓝图只持 key·不塞 URL/二进制）
  scale?: number; // 等比缩放覆盖（缺省 1；与 Transform3D.scale 叠乘）
  tint?: number; // 可选整体染色 0xRRGGBB（缺省用模型自带材质）
}

// ── AnimState3D（render-only，骨骼动画播放 · 3D 后端）──────────────────────────────────────
// 让导入式 glTF 模型播它自带的动画 clip（骨骼/蒙皮）。挂在带 Model3D 的实体上：渲染器据此建 three AnimationMixer
// 播指定 clip（按名）。换 clip 名 = 切动作（idle↔run·渲染器淡入过渡）。speed=播放倍速·loop=循环。
// 红线：纯表现，绝不进 sim/hash（render-only·入 NON_DETERMINISTIC）。弱 LLM 只填 clip 名 + 倍速·填不了骨骼矩阵。
export interface AnimState3D extends Component {
  readonly type: 'AnimState3D';
  clip: string; // 动画名（glTF clip·如 'Run'/'Walk'）
  speed?: number; // 播放倍速·缺省 1
  loop?: boolean; // 循环·缺省 true（false=播一遍停在末帧）
}

// ── Anim3D（render-only，程序化位姿动画驱动 · 3D 后端）────────────────────────────────────────
// **底层程序化动画方法集**（owner 2026-07-06）：让实体的 Transform3D 分量按**数据描述的运动通道**随壁钟自动演化——
// 把「自转 / 浮动 / 摆动 / 入场弹出 / 有机漂移」这类动画从游戏层手写逐帧改分量（绕基座）**下沉成纯数据**（可组合）。
// 两类通道：**循环(loop·随壁钟持续)** = spin/bob/osc/noise（绕作者初值演化）；**一次性(once·播一遍保持终值)** = ease（入场/强调）。
//   同 field 多通道**叠加(compose)** → 组合出复杂运动（如 x/z 两 osc 相位差 π/2 = 环绕；spin+bob 同 rotY = 变速自转）。
// 红线：**纯表现**——绝不进 sim/hash（render-only·入 NON_DETERMINISTIC）。弱 LLM 只填 field/波形/标量·填不了插值代码。
// scale=等比三轴；scaleX/scaleY/scaleZ=**分轴缩放**（挤压拉伸 squash&stretch·超休闲第一 juice 原语：落地 y↓x↑ 保体积）。
export type Anim3DField = 'x' | 'y' | 'z' | 'rotX' | 'rotY' | 'rotZ' | 'scale' | 'scaleX' | 'scaleY' | 'scaleZ';
export type Anim3DWave = 'sine' | 'triangle' | 'saw' | 'square'; // osc 周期波形（皆归一 [-1,1]）
export type Anim3DCurve = 'linear' | 'cubicOut' | 'outBack'; // ease 缓动曲线（outBack=带回弹过冲·弹出感）
export type Anim3DChannel =
  // ── 循环通道（loop·绕作者初值·t=经过秒）──
  | { kind: 'spin'; field: 'rotX' | 'rotY' | 'rotZ'; rate: number } // 初值 + rate(rad/秒)·t —— 匀速自转
  | { kind: 'bob'; field: Anim3DField; amp: number; freq: number; phase?: number } // 初值 + amp·sin(t·freq+phase) —— 正弦浮动（= osc sine 简写）
  | { kind: 'osc'; field: Anim3DField; wave: Anim3DWave; amp: number; freq: number; phase?: number } // 初值 + amp·wave(t·freq+phase) —— 通用周期振荡（摆动/机械/闪烁）
  | { kind: 'noise'; field: Anim3DField; amp: number; freq: number; seed?: number } // 初值 + amp·noise(t·freq+seed) —— 确定性噪声漂移（有机游走·神经质待机）
  // ── 一次性通道（once·播一遍→保持终值·入场/强调）──
  | { kind: 'ease'; field: Anim3DField; from: number; to: number; dur: number; curve?: Anim3DCurve; delay?: number } // from→to 经 dur 秒（delay 后起·curve 缺省 cubicOut）·**绝对值**（不绕初值）
  | { kind: 'spring'; field: Anim3DField; to: number; from?: number; freq?: number; damping?: number }; // 解析阻尼弹簧：from(缺省初值)→to·欠阻尼带过冲回弹（spawn 弹跳/吸附 juice）·freq 频率·damping 阻尼比 0.05..1(小=弹久·缺省 0.35)
export interface Anim3D extends Component {
  readonly type: 'Anim3D';
  channels: Anim3DChannel[]; // 多通道叠加（loop 绕初值加·ease 覆写绝对值·同 field 求和）
}

// ── Path3D（render-only·不进 hash·休闲通用路径跟随）── 让实体 Transform3D 沿一串控制点定义的路径按壁钟匀速走。
// 移动平台/巡逻/金币抛物线/传送带物件/相机轨道 dolly。linear=折线·smooth=Catmull-Rom 平滑；loop=none(停)/loop(闭环)/pingpong(往复)。
// 「按绝对经过秒算」→ 帧率无关无漂移。与 Anim3D 正交（Anim3D=绕初值周期振荡；Path3D=沿空间路径行进）。纯表现·只写 Transform3D。
export interface Path3D extends Component {
  readonly type: 'Path3D';
  points: ReadonlyArray<readonly [number, number, number]>; // 控制点（世界坐标·≥2）
  duration: number; // 走完全程秒数
  loop?: 'none' | 'loop' | 'pingpong'; // 到头行为（缺省 loop·闭环首尾相接）
  mode?: 'linear' | 'smooth'; // 折线 or Catmull-Rom 平滑（缺省 smooth）
  faceDir?: boolean; // 朝运动切线方向（写 rotY·缺省 false）
  delay?: number; // 起步延迟秒（缺省 0）
}

// ── Pivot3D（render-only，3D 父合成/层级）──────────────────────────────────────────────────────
// 让一组子实体的 Transform3D 位姿在渲染前**合成到本实体（pivot）的变换下**——即把「整座竞技场 + 骰壳 + 柔光」
// 当作**一个单元**一起转/缩/移（Cloud Design 骰钟转场 §F：旧场裹进骰壳、整体螺旋升走换层）。
// 我方 Transform3D 是逐实体世界位姿·无 3D 父子层级（Hierarchy 是 2D 的）→ 这是那个真缺口的下沉。
// 合成：childWorld = T(pivot 平移)·T(center)·R(pivot 欧拉)·S(pivot scale)·T(-center)·childLocal
//   （绕 center 转/缩·再叠 pivot 自身平移；pivot 无变换时 = 恒等·子实体位姿不变·向后兼容）。
// pivot 自身的变换 = 本实体的 Transform3D（可被 Anim3D 或运行时胶水驱动）。渲染器 collect 后据此改子实体最终位姿。
// 红线：**纯表现**——绝不进 sim/hash（render-only·入 NON_DETERMINISTIC）。弱 LLM 只填 children 列表 + center 标量。
export interface Pivot3D extends Component {
  readonly type: 'Pivot3D';
  children: string[]; // 受本 pivot 变换合成的子实体 id（它们的 Transform3D 视为 pivot 局部坐标）
  centerX?: number; // 旋转/缩放的中心（世界坐标·缺省 0）——竞技场螺旋应设成场中心
  centerY?: number;
  centerZ?: number;
}

// ── Transform3D（render-only，真三维位姿 · 3D 后端专用）─────────────────────────────────────
// 给实体一份**完整三维位姿**（x 右 / y 上=高度 / z 朝镜头 · 世界单位），让盒庭/积木场景真正立体堆叠。
// 区别于 2D Transform（x,y 在屏幕平面 + zOrder 微分层 = 2.5D billboard）：挂了本件的实体，3D 后端用它定位姿
// （地面=XZ 平面、Y=高度），不再走 2D 投影；2D 后端退化画其 (x,y) 正面（per-object opt-in，同 Mesh3D）。
// 「3D 盒庭 = Transform3D + Mesh3D 的纯数据」——游戏只描述，引擎解释渲染，不每游戏手写 Three.js。
// 红线：纯表现，**绝不被 Condition 读、绝不进 sim 逻辑/hash**（已入 determinism NON_DETERMINISTIC）。
export interface Transform3D extends Component {
  readonly type: 'Transform3D';
  x: number; // 右(+)
  y: number; // 上(+)=高度（地面 y=0，物体下沿坐地）
  z: number; // 朝镜头(+)=景深近
  rotX?: number; // 欧拉角(弧度)·缺省 0
  rotY?: number;
  rotZ?: number;
  scale?: number; // 等比缩放·缺省 1
  scaleX?: number; // 分轴缩放（挤压拉伸 squash&stretch）·缺省=等比 scale。x/y/z 独立 → 落地压扁(y↓x↑保体积)、拉伸弹跳。
  scaleY?: number;
  scaleZ?: number;
  quat?: readonly [number, number, number, number]; // 可选四元数(x,y,z,w)·在场则覆盖欧拉角（物理翻滚等需无万向锁的旋转·render-only）
}

// ── Pickable3D（render-only，3D 对象拾取标记 · 输入层）──────────────────────────────────────────
// 标记一个实体「可被指针拾取」。渲染器 `pick(clientX,clientY)` 对所有 Pickable3D 实体的**世界包围盒**做射线求交，
// 命中最近者返回其实体 id + 信号名。命中结果由游戏输入胶水经 `ActionSink.enqueueAction(signal,{arg:entityId})` 入队
// → keybind 产 `Signal{name:signal,arg:entityId}` → sim 能力按名消费（照 2D `t2-clickable` 先例；但 3D raycast 在
// **输入层**做——与鼠标点击同类外源输入·本地合法·**不碰 sim 确定性**）。红线：纯表现标记，**绝不被 Condition 读、绝不进 hash**。
export interface Pickable3D extends Component {
  readonly type: 'Pickable3D';
  signal: string; // 指针拾取(click)命中时游戏应发的信号名（arg=命中实体 id）
  hover?: string; // 可选·指针悬停命中时的信号名（游戏在 pointermove 调 pick 时用）
}

// ── PhysicsWorld3D（render-only·场景级单例·物理世界配置·REQ-3D-TOWER-STACK）───────────────────────
// 给 cannon 物理世界一条**按游戏/场景可配的数据路**（挂任一实体即生效·取第一个）。缺省=渲染器现行硬编码值
// （gravity -42 / restitution 0.4 / friction 0.35 / solverIterations 默认 10）——**不挂本组件 = 行为逐位不变**
// （护 game-d 掷骰「色子下落干脆」的 -42 刻意调参 + game102 碎片）。
// 多层刚体堆叠（叠叠乐/积木/多米诺）要求相反参数：实测 gravity≈-10 + restitution≈0 + solverIterations≥40 才稳。
// 红线：render-only（cannon 物理本就不进 hash·仅表现）。弱 LLM 只填几个标量。
export interface PhysicsWorld3D extends Component {
  readonly type: 'PhysicsWorld3D';
  gravity?: number; // 竖直重力加速度（缺省 -42·堆叠场景用 ≈-9.82）
  restitution?: number; // 默认接触弹性 0..1（缺省 0.4·堆叠用 0）
  friction?: number; // 默认接触摩擦（缺省 0.35）
  solverIterations?: number; // 求解器迭代次数（缺省 cannon 10·堆叠需 ≥40 防求解器蠕变塌陷）
}

// ── RigidBody3D（render-only，表现物理 · TA）──────────────────────────────────────────────
// 真物理刚体（cannon-es 驱动·**纯表现**：滚色子/掉落/翻滚·**不进 sim/hash·不为联机同步**·owner 2026-06-30「为表现非同步」）。
// 渲染侧物理子系统每帧步进 → 把结果(位置+四元数)写回同实体 Transform3D（render-only）→ 渲染器照常画。
// 体形/尺寸默认取同实体 Mesh3D（box→半尺寸·sphere→半径）；mass=0=静态。红线：render-only 自由区，可用随机/时间。
export interface RigidBody3D extends Component {
  readonly type: 'RigidBody3D';
  // 碰撞形（缺省取 Mesh3D.shape）：box/sphere/cylinder(桶/冰球) · capsule(角色·Y向圆柱+两端半球) · convex(不规则凸包·须给 hull) · heightfield(地形网格·须给 heights·恒静态)。
  shape?: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'convex' | 'heightfield';
  heights?: ReadonlyArray<ReadonlyArray<number>>; // heightfield 高度网格 [i][j]（世界 Y 高度·≥2×2）
  elementSize?: number; // heightfield 网格点间距（缺省 1）
  hull?: ReadonlyArray<readonly [number, number, number]>; // convex 凸包顶点（局部坐标·≥4·渲染器算凸面）
  mass?: number; // 质量·缺省 1（0=静态不动）
  restitution?: number; // 弹性 0..1·缺省 0.3
  friction?: number; // 摩擦·缺省 0.4
  vx?: number; vy?: number; vz?: number; // 初速度
  avx?: number; avy?: number; avz?: number; // 初角速度（翻滚）
  // 角约束/锁转轴（REQ-3D-RB-ANGFACTOR·opt-in·缺省 [1,1,1]=现行自由翻）：各轴角响应 0..1（0=锁该轴不转）。
  //   `[0,1,0]`=只准绕竖轴平旋·永不翻倒（硬币/筹码/冰球/圆盘·根治「立边」）；`[0,0,0]`=完全锁转（稳态骰面/招牌不晃）。
  angularFactor?: readonly [number, number, number];
  // 物理事件出口（REQ-3D-SETTLE-SIGNAL·opt-in）：刚体「落定/失稳」经**与 Pickable3D 完全相同的通路**发信号
  //   （渲染器 drainPhysicsSignals → 游戏输入胶水 enqueueAction(signal,{arg:entityId}) → keybind → Signal → sim）。
  //   本地合法外源输入·**不碰确定性**（物理仍 render-only 不进 hash·只把「已发生的事」告诉 sim·同用户点击）。
  settleSignal?: string; // 刚体入睡（落定停稳）发一次；睡醒再动再落定重发。掷骰读点数/碎片回收/落子判定。
  toppleSignal?: string; // 倾角超阈值（失稳/倒下）发一次；回正后再倒重发。叠叠乐判负/多米诺。
  toppleTilt?: number; // topple 倾角阈值（弧度·本体竖轴偏离世界竖直超此即算倒·缺省 ~0.6≈34°）
}

// ── Joint3D（render-only·不进 hash·物理关节/约束）── 在两个 RigidBody3D 之间（或本体↔世界固定锚）建 cannon 约束：绳/秋千/吊桥/布娃娃/铰链门。
// 挂在**本体（bodyA）**实体上（须带 RigidBody3D）。bodyB 指另一实体（须带 RigidBody3D）；缺省则连到世界固定锚点 anchor。
// kind：point=球铰（绳结/摆锤·最常用）·hinge=铰链绕轴（门/轮）·distance=定距（绳段/连杆）·lock=完全固连（刚性拼接）·cone=锥摆（布娃娃关节）。纯表现物理·不进 sim/hash。
export interface Joint3D extends Component {
  readonly type: 'Joint3D';
  kind: 'point' | 'hinge' | 'distance' | 'lock' | 'cone';
  bodyB?: string; // 连接的另一实体 id（须带 RigidBody3D）；缺省=连世界固定锚点 anchor
  pivotA?: readonly [number, number, number]; // 本体上的连接点（局部坐标·缺省 0,0,0）
  pivotB?: readonly [number, number, number]; // bodyB 上的连接点（局部坐标·缺省 0,0,0）
  anchor?: readonly [number, number, number]; // 无 bodyB 时的世界固定锚点（缺省本体当前位）
  axis?: readonly [number, number, number]; // hinge/cone 的转轴（缺省 0,1,0）
  distance?: number; // distance 约束的目标距离（缺省=建时两连接点距）
  maxForce?: number; // 约束最大力（缺省 1e6·越小越"软"易被拉断/拉伸）
}

// ── Impulse3D（render-only·不进 hash·运行时施力）── 给同实体 RigidBody3D 施加一次冲量/速度（弹/射/跳/击退/风）。
// **nonce 触发范式**（同 Camera3D.shake / Post3D.flash）：游戏在要施力时 **bump `trigger`**（任意变化数）→ 物理系统据 x/y/z
// 施一次线性冲量（mode:'impulse'·缺省·Δv=J/m）或直接设速度（mode:'velocity'·发射固定初速）+ 可选 torque 角冲量。
// 不 bump 不施力（缺省）。这是「运行时施力 = 数据触发」的可复用原语——弹球/敲击/跳跃/击退全用它，无需游戏层碰物理引擎。
// 输入时算出方向的弹射（拖拽甩球）另有渲染器 `applyImpulse(id,...)` 命令式接口（同 roll/pick 输入胶水先例）。
export interface Impulse3D extends Component {
  readonly type: 'Impulse3D';
  trigger: number; // bump 即施加一次（nonce）
  x?: number; y?: number; z?: number; // 线性冲量/速度（世界向量·缺省 0）
  torque?: readonly [number, number, number]; // 角冲量（叠加进角速度·翻滚/旋转·可选）
  mode?: 'impulse' | 'velocity'; // impulse=叠加冲量(缺省)；velocity=直接设速度（发射固定初速·如跳跃钳定 y 速）
}

// ── Camera3D（render-only，3D 盒庭轨道相机 · 单例）─────────────────────────────────────────
// 3D 后端的取景：绕场景中心(或 pivot)的轨道相机。yaw/pitch 定观察角(弧度)，distance 定远近(缺省=自适配包围盒)。
// 挂一个带 Camera3D 的实体即进「盒庭模式」：相机不再强制俯视，而是按角度环绕、开柔和阴影（Captain Toad 风）。
// 无 Camera3D → 退回原俯视自适配（向后兼容 · three-lab 不受影响）。pitch 正=俯视，等距盒庭约 0.6。
// 红线：纯表现，绝不进 hash（同 2D Camera · 已入 NON_DETERMINISTIC）。
// REQ-3D-Camera（owner 2026-06-28）：相机 = **数据(语义参数) + 固定解释器(渲染器算矩阵)**——游戏永不调相机方法、
// 永不持矩阵，只填这些语义参数；渲染器据此 lookAt / 算正交·透视 / 跟随。多模式用 `mode` 枚举，绝不放 4×4 矩阵。
export interface Camera3D extends Component {
  readonly type: 'Camera3D';
  yaw: number; // 绕 Y 轴方位角(弧度)·0=正前、正=向右环绕
  pitch: number; // 俯仰角(弧度)·正=俯视，等距约 0.6
  distance?: number; // 相机到 pivot 距离(世界单位)·缺省=自适配框住包围盒
  pivotX?: number; // 注视点·缺省=场景包围盒中心（mode:'follow' 时由 target 实体位覆盖）
  pivotY?: number;
  pivotZ?: number;
  projection?: 'perspective' | 'ortho'; // 投影·缺省 perspective；ortho=等距微缩盒庭
  fov?: number; // 透视视场角(度)·缺省=渲染器构造默认（per-scene 数据，不再写死在 option）
  orthoSize?: number; // 正交半高(世界单位)·缺省=场景包围盒半径
  near?: number; // 近裁面·缺省 1（配 W1-C 深度收紧）
  far?: number; // 远裁面·缺省=distance+天空盒半径余量
  mode?: 'orbit' | 'follow'; // orbit=绕 pivot 环绕(缺省)；follow=注视/环绕 target 实体（随它走）
  target?: string; // follow 模式注视/环绕的实体 id
  // 跟随柔化（follow 模式·render-only·超休闲跟随手感）：lag=平滑时间常数(秒·越大越"拖"·缺省 0=硬贴)；
  //   lookAhead=按 target 速度朝运动方向预读的秒数(缺省 0)。渲染器持平滑态指数逼近·帧率无关·未收敛时持续重渲·收敛回省帧。
  follow?: { lag?: number; lookAhead?: number };
  // 运镜过渡（render-only·平滑切机位）：游戏把 Camera3D 设成目标机位并 **bump `trigger`** → 渲染器把**当前**取景（眼位+注视点·
  //   世界空间·已含 auto 距离/pivot 解析）在 `dur` 秒内 ease 到目标机位（intro flyby / 聚焦物件 / 过场）。不 bump=硬切（缺省）。
  tween?: { trigger: number; dur?: number; ease?: 'linear' | 'cubicOut' | 'inOut' };
  pitchMin?: number; // 俯仰夹角下/上限(弧度)·缺省不夹（行为层运镜 + 解释器都按此夹）
  pitchMax?: number;
  // 震屏（camera shake·trauma 模型·render-only·超休闲通用打击反馈）：游戏在撞击/得分/失败时 **bump `trigger`**（任意变化的数）
  //   → 渲染器注入一次 trauma=1、按 decay 随壁钟衰减、以 amp·trauma² 幅度沿相机局部右/上轴平滑抖动镜头（不碰矩阵数据·不进 hash）。
  //   不设 trigger 则不抖（缺省）。trauma 归零自动回正（省帧）。
  shake?: { trigger?: number; amp?: number; freq?: number; decay?: number };
}

// ── Sky3D（render-only，天空盒 · 单例）──────────────────────────────────────────────────────
// 最简天空盒：内面朝里的大球，画一张「天顶→地平线渐变 + 程序化云朵」的画布纹理裹住盒庭。
// clouds=叠程序化云团（云色 cloudTint）；scroll=云缓慢飘动（render-only·绕 Y 微转）。无图片资产、纯程序化。
// 红线：纯表现，绝不进 hash（已入 NON_DETERMINISTIC）。
export interface Sky3D extends Component {
  readonly type: 'Sky3D';
  top: number; // 天顶色 0xRRGGBB
  bottom: number; // 地平线色 0xRRGGBB
  clouds?: boolean; // 叠程序化云团
  cloudTint?: number; // 云色·缺省白
  scroll?: number; // 云飘速度（0=不动·render-only）
  env?: number; // 环境光照(IBL)强度·>0 时渲染器装环境贴图 → PBR 金属/玻璃才有反射可照（缺省 0=不装·向后兼容）
  // 真环境贴图（REQ-3D ⑤·= texture/HDRI 资产 key·equirect .hdr 字节）：在场且就绪 → RGBELoader+PMREM 真反射；
  // 缺省 / 未就绪 → 回退程序化中性影室（RoomEnvironment）。env(强度) 仍生效。包体预算：建议 ≤2k 分辨率（掌机 cartridge）。
  envMap?: string;
}

// ── L2 color ── 实体当前的颜色/透明度
// ── Light3D（render-only，数据化光照 · 3D 盒庭）──────────────────────────────────────────────
// 把写死在渲染器 init 里的灯搬进数据：游戏蓝图声明灯，引擎解释。可挂多盏（sun + ambient + 补光）。
// kind:'directional' = 平行光（太阳·dir 为光的去向）；'ambient' = 环境光（无方向·整体补亮）。
// 第一盏带 castShadow 的平行光当主阴影灯（盒庭模式自动框场景投软影）。无任何 Light3D → 退回引擎默认
// 暖主光 + 冷补光（向后兼容·three-lab/现有游戏不受影响）。红线：纯表现，绝不进 sim/hash（NON_DETERMINISTIC）。
export interface Light3D extends Component {
  readonly type: 'Light3D';
  kind: 'directional' | 'ambient' | 'point' | 'spot'; // point/spot = TA Phase 2 动态局部光
  color: number; // 0xRRGGBB
  intensity: number;
  dirX?: number; // directional 去向 / spot 朝向（渲染器归一化·缺省盒庭暖侧光向）。ambient/point 忽略。
  dirY?: number;
  dirZ?: number;
  castShadow?: boolean; // 是否投影：directional=当主阴影灯（盒庭一盏·缺省取首盏平行光）；point/spot=局部光投影（REQ-3D-LOCAL-SHADOW·预算内·point 立方阴影 6× 贵/spot 单张·缺省不投）。
  // ── point / spot（局部光·**可移动**：缺省读同实体 Transform3D，否则 2D Transform(x→X,y→Z)+baseY；
  //     把 Light3D 挂在移动实体上 → 光随之走）。预算：渲染器限同时 2 盏动态 point/spot。
  x?: number; y?: number; z?: number; // 显式世界位（优先）
  baseY?: number; // 2D Transform 情形的离地高度
  range?: number; // 衰减距离（0=无限·建议给值做局部光）
  decay?: number; // 衰减指数（缺省 2·物理）
  angle?: number; // spot 锥半角(弧度)
  penumbra?: number; // spot 半影柔边 0..1
}

// ── Post3D（render-only，后处理管线 · 3D 盒庭微缩感）─────────────────────────────────────────
// 数据化后处理：移轴景深（tilt-shift·Captain Toad 招牌「微缩模型」感·清晰带外上下渐糊）+ 泛光（bloom）。
// 挂一个 Post3D 单例即开 EffectComposer 管线渲染；无则直接渲染（向后兼容）。纯表现·不进 hash。
export interface Post3D extends Component {
  readonly type: 'Post3D';
  // 移轴景深：focus=清晰带的屏幕纵向位置(0 底~1 顶·缺省 0.5)；intensity=模糊强度(缺省 ~3)。
  tiltShift?: { focus?: number; intensity?: number };
  // 泛光：strength=强度·radius=扩散·threshold=亮度阈值。
  bloom?: { strength?: number; radius?: number; threshold?: number };
  // 环境光遮蔽（AO·GTAO 地面真值·TA Phase 4）：缝隙/接触处压暗 → 箱庭玩具感的「厚度/接地」。
  // intensity=AO 叠加强度(缺省 1)；radius=采样世界半径(缺省随场景尺度·盒庭 ~4)；scale=衰减(缺省 1)。
  ao?: { intensity?: number; radius?: number; scale?: number };
  // 色彩分级（TA Phase 4·绘本调色板）：exposure=曝光×、contrast=对比(1=原)、saturation=饱和(1=原)、
  // brightness=亮度+、tint=整体染色 0xRRGGBB(×·缺省白不变)。
  grade?: { exposure?: number; contrast?: number; saturation?: number; brightness?: number; tint?: number };
  // 抗锯齿（TA Phase 4·SMAA·清 toon 硬边锯齿）。
  aa?: boolean;
  // 暗角（vignette·超休闲聚焦感）：intensity=边缘压暗强度 0..1(缺省 0)·smoothness=渐变起点半径 0..1(越小暗角越大·缺省 0.5)·
  //   color=边缘趋向色 0xRRGGBB(缺省黑)。静态·并入色彩分级 pass（零额外开销）。
  vignette?: { intensity?: number; smoothness?: number; color?: number };
  // 命中闪白（hit flash·超休闲打击/得分/失败全屏瞬闪）：游戏 bump `trigger` → 渲染器注入 amount=1·按 decay(/秒·缺省 3)衰减·
  //   全屏朝 color(缺省白)混合。trauma 式·折进 renderSig 持续重渲直至归零。不设 trigger 则不闪。
  flash?: { trigger?: number; color?: number; decay?: number };
}

// ── Material3D（render-only·TA Phase 5）── 物件 PBR 材质：从**封闭预设集**（assets/pbr-materials）选一种 + 微调。
// preset=预设名（matte/steel/gold/glass/rock/dirt/wood…·闭集·拼错回退 matte）；可覆盖 color/roughness/metalness/emissive。
// 挂在 Mesh3D 实体上 → 渲染器用物理材质渲（金属反光/玻璃透射/岩石哑光…）。不进 hash。带 Material3D 的物件走单 mesh
// （不进哑光实例化批）：特征物件用·量大同款仍用默认哑光实例化。
export interface Material3D extends Component {
  readonly type: 'Material3D';
  preset: string; // PBR 预设名（闭集·见 assets/pbr-materials）；materialRef 在场时作后备（材质资源无 preset 才用它）
  // 着色模型（超休闲平涂观感·缺省 PBR 物理）：'toon'=分段卡通(MeshToonMaterial·gradientMap 阶梯明暗·cel 描边观感)；
  //   'flat'=无光平涂(MeshBasicMaterial·完全不受光·纯亮色·Helix/超休闲招牌观感)。preset 仍供基色·着色模型只换光照算法。
  shading?: 'toon' | 'flat';
  toonSteps?: number; // toon 明暗阶数（缺省 3·越大越接近平滑·越小越硬卡通）
  // 卡通描边（inverted-hull·完整 toon 观感的另一半）：沿法线外扩的背面壳 → 物体轮廓一圈实色边。配 shading:'toon' 即经典卡通；
  //   也可单独给任意材质加描边。width=边宽(世界单位·缺省 0.03)·color=边色(缺省黑)。凸形/常规道具效果最好（超休闲主体）。
  outline?: { width?: number; color?: number };
  // 材质数据资产引用（REQ-Resource ④·render-only·= 索引 type:'material' 条目 id）：渲染器据它从材质目录
  // （buildMaterialCatalog）查 MaterialSpec 作基底，下面的 inline 字段（已定义者）覆盖之 → 合成有效材质。
  // 缺省或查无 → 纯用 inline preset/参数（向后兼容）。材质 = 引 texture key 的数据·非硬编码预设。
  materialRef?: string;
  color?: number; // 覆盖基色 0xRRGGBB
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  surface?: SurfaceDetail; // 程序化表面细节（normal/roughness 贴图·渲染器据参数生成·见下）
  // 真实贴图（REQ-Resource ①·render-only·= texture 资产 id·字段名照 THREE 标准）：渲染器据 key 从 AssetManager 取
  // THREE.Texture 挂材质，**按用途设色彩空间**（map=albedo→sRGB·normal/roughness/ao→线性·法线误设 sRGB 会渲染错）。
  // 显式 map 覆盖同通道的程序化 surface；缺省回退 surface/纯色（共存·向后兼容）。
  map?: string; // 反照率贴图（albedo·sRGB）
  normalMap?: string; // 法线贴图（线性）
  roughnessMap?: string; // 粗糙度贴图（线性）
  aoMap?: string; // 环境光遮蔽贴图（线性）
  // REQ-3D 贴图槽补齐 ④（render-only·= texture 资产 id）：
  metalnessMap?: string; // 金属度贴图（线性）
  emissiveMap?: string; // 自发光贴图（sRGB·= texture 资产 id·配 emissive 色 + emissiveIntensity）
  ormMap?: string; // ORM 打包图（一图三通道 R=AO/G=Roughness/B=Metalness·线性）→ 同图挂 ao/rough/metal 三槽（three 惯例）；显式单图覆盖对应通道
  // UV 平铺（render-only）：repeat=各轴重复次数（缺省 1）；offset=[x,y] UV 偏移。作用于本材质所有贴图槽。
  tiling?: { repeat?: number; offset?: readonly [number, number] };
  // UV 动画（render-only·壁钟驱动·休闲通用）：让贴图随时间动——scroll=UV 匀速滚动（水面/岩浆/传送带/瀑布/能量条）；
  //   flipbook=序列帧（sprite-sheet·cols×rows 网格·按 fps 逐格播·动态自发光/爆炸/传送门）。渲染器给本材质**克隆**独立贴图
  //   逐帧改 offset/repeat（不影响共享同图的其他物件）。scroll 与 flipbook 二选一（同时给则 flipbook 优先）。
  uvAnim?: {
    scrollX?: number; scrollY?: number; // UV 每秒滚动速度（scroll 模式·作用于本材质所有贴图槽）
    fps?: number; cols?: number; rows?: number; // 序列帧（flipbook 模式·fps>0 且 cols/rows≥1 启用·逐格循环）
  };
  // 透明贴图路（REQ-3D-MAT-ALPHA·opt-in·缺省=现行不透明）：让 map 的 alpha 通道生效（透明底 PNG 不再渲成黑）。
  //   alphaTest=cutout 阈值 0..1（透明像素 discard·硬边·无排序问题·最适合桌面透明角/贴花/树叶）；
  //   transparent=软混合（配 opacity·有排序·适合渐隐）。二者独立·可只给 alphaTest（推荐·无排序坑）。
  alphaTest?: number; // 透明度裁剪阈值（>0 启用 cutout）
  transparent?: boolean; // 软透明混合（缺省 false）
  // 溶解消散（REQ-3D-DISSOLVE·render-only·opt-in）：物品消失/角色倒下/技能收尾的通用材质效果。渲染器给材质注入
  //   一段 shader（onBeforeCompile·同 outline 先例）：**屏幕空间**算距离场（图案 pattern·形状 shape），按 progress
  //   阈值 discard 溶解，边缘飘一条**发光条带**。voronoi 图案 = 动画种子点 → 边缘星星点点「光点消散」（shader 算·省真粒子）。
  //   自由 GLSL 只活在引擎解释器·游戏只填这几个标量/枚举（数据驱动·最弱 LLM 也填得了）。
  dissolve?: {
    progress?: number;   // 溶解进度 0..1（0=完好·1=全消散）。显式给（外部/游戏驱动）；或用 trigger 让引擎自播。
    trigger?: number;    // bump（任意变化数）→ 引擎自播溶解（render-only 时间驱动·同 flash/shake 先例）。
    dur?: number;        // 自播时长秒（缺省 1.2）
    direction?: 'out' | 'in'; // out=消散 0→1（缺省）·in=重现 1→0
    pattern?: 'noise' | 'voronoi'; // 距离场图案（缺省 voronoi=光点/晶格消散·noise=平滑噪声溶解）
    shape?: 'euclid' | 'manhattan' | 'chebyshev' | 'star'; // voronoi 距离度量 → 溶解形状（缺省 euclid 圆点）
    scale?: number;      // 晶格/噪声尺度（屏幕像素·缺省 44·越小格越密）
    speed?: number;      // 种子点动画速度（缺省 1·voronoi 光点浮动）
    edge?: number;       // 边缘发光条带宽 0..1（缺省 0.1）
    edgeColor?: number;  // 边缘发光色 0xRRGGBB（缺省暖橙 0xffa030）
    glow?: number;       // 边缘发光强度（缺省 1.6）
    // 增量②·纹理化碎片溶解（羽毛/花瓣/星屑·REQ-3D-DISSOLVE 增量②）：给 tex 则每个 voronoi 格用一枚**碎片贴图**
    //   代替纯阈值——碎片随进度**变小飘散**（局部坐标缩放）、按种子随机旋转、9-tap 邻格叠加防切边、textureGrad 修 mip。
    tex?: string;        // 碎片贴图 key（AssetManager·带 alpha·在场则启纹理化溶解·cutout 硬边·软混合留增量③）
    spread?: number;     // 碎片消散错峰 0..1（缺省 0.35·越大越像「前沿推进」·0=整体同时变小）
    cutoff?: number;     // 碎片 alpha 裁剪阈值 0..1（缺省 0.4·tex 模式用）
  };
  // ── 进阶物理波瓣（REQ-3D-PBR-LOBES·render-only·三 native·任一在场→MeshPhysical·需 Sky3D.env IBL 才显）──
  //   预设也可带（carpaint/pearl/soap/velvet/brushed）；此处 per-object 覆盖（同 color/roughness 覆盖语义）。
  clearcoat?: number;           // 清漆层 0..1（车漆/糖衣/上釉·罩一层镜面高光）
  clearcoatRoughness?: number;  // 清漆粗糙 0..1（缺省 0=镜面）
  sheen?: number;               // 绒光 0..1（天鹅绒/绸缎·边缘掠射回光）
  sheenColor?: number;          // 绒光色 0xRRGGBB（缺省白）
  sheenRoughness?: number;      // 绒光粗糙 0..1（缺省 1）
  iridescence?: number;         // 彩虹薄膜 0..1（肥皂泡/油膜/珠光·随视角变彩）
  iridescenceIor?: number;      // 薄膜折射率（缺省 1.3）
  iridescenceThickness?: number;// 薄膜厚度上限 nm（缺省 400）
  anisotropy?: number;          // 各向异性 0..1（拉丝金属/唱片·高光拉长）
  anisotropyRotation?: number;  // 各向异性方向（弧度·缺省 0）
}

// 程序化表面细节（render-only·TA Phase 5）：渲染器据参数生成 normal + roughness 贴图（DataTexture）—— **不需美术贴图文件**，
// 闭集 pattern + 几个标量（弱 LLM 能填）。同「天空盒按 Sky3D 数据程序化生成纹理」先例。red 线：render-only·不进 hash。
export interface SurfaceDetail {
  pattern: 'bumps' | 'noise' | 'scratches'; // 凸点/噪声/划痕（闭集程序化图案）
  tiles?: number; // UV 重复次数（缺省 3·越大纹理越密）
  normal?: number; // 法线强度（→ material.normalScale·缺省 1·0=平）
  rough?: number; // 粗糙度起伏幅度 0..1（凸处更光/凹处更哑·缺省 0.3）
  scale?: number; // 特征频率（缺省 1·越大颗粒越细）
}

// ── Fog3D（render-only·TA Phase 4）── 距离雾（scene.fog 线性）：远处柔化 + 盒庭「装在玻璃盒里」的纵深。
// color=雾色(常取天色)·near=起雾相机距离·far=全雾距离。挂一个即开；天空盒材质 fog:false 不受影响。
export interface Fog3D extends Component {
  readonly type: 'Fog3D';
  color: number; // 0xRRGGBB
  near: number;
  far: number;
}

// ── WorldUI3D（TA Phase 3·render-only·不进 hash）── 世界空间 UI（头顶飘字/血条/名字）。
// 锚在**自身实体**上（读其 Transform3D / 2D Transform），offsetY 抬到头顶。渲染器把锚点投影到屏幕，
// 在该处用引擎 UI 库 `mountUI` 挂一棵 **LayoutNode**（**UI 铁律**：仍是 LayoutNode·经真 UI 库渲染·不手写 DOM）。
// v1 = 静态文字 Label（头顶飘字）；动态绑定（HP/名字变量）后续。**渲染线只做世界锚 + 投影**，控件本体归主程 UI 库。
export interface WorldUI3D extends Component {
  readonly type: 'WorldUI3D';
  text?: string; // 头顶文字（简写·单 Label·node 缺省时用）
  // 富世界空间 UI（REQ-3D-世界空间 UI·owner 2026-07-07「3D UI 表达」）：挂**任意 LayoutNode**（面板/血条/名牌/多行·
  // 走引擎 UI 库渲染·UI 铁律）→ 锚世界点投影到屏幕·随实体每帧跟随（血条跟单位·背相机/出屏自动隐）。在场则替代 text。
  // 这是「世界空间 UI = LayoutNode 锚到世界物件屏幕投影点」的 screen-overlay billboard 路（非贴到 3D 面片的 diegetic·那另论）。
  node?: LayoutNode;
  offsetY?: number; // 锚点之上的高度（缺省 6）
  size?: 'xs' | 'sm' | 'md' | 'lg'; // Label 字号（text 简写用·缺省 sm）
  color?: string; // Label 颜色（text 简写用·UI 库语义色·缺省默认）
  glow?: boolean; // 发光（text 简写用）
}

// ── Diegetic3D（render-only·不进 hash·UI 贴进 3D 空间）── 把一棵 **LayoutNode** 作为**真 DOM 面片**放进 3D 场景
// （in-world 屏幕/告示牌/机台面板/仪表盘）：定位在实体 Transform3D、按其欧拉角朝向、随相机投影旋转/透视。经 CSS3DRenderer 叠层渲染
// （真 DOM·文字锐利·Chromium 稳；区别贴图路线——foreignObject 栅格在 Chromium 渲空白故不用）。**代价**：DOM 叠层不进 WebGL 深度
// → 不被 3D 物体遮挡、不吃后处理（适合"给人看的"面板）。**UI 铁律**：仍是 LayoutNode 经真 UI 库渲染（不手写 DOM）。无需 Mesh3D。
export interface Diegetic3D extends Component {
  readonly type: 'Diegetic3D';
  node: LayoutNode; // 面片上的 UI 树（走引擎 UI 库渲染）
  pxWidth?: number; // DOM 像素宽（决定清晰度·缺省 512）
  pxHeight?: number; // DOM 像素高（缺省 512）
  worldWidth?: number; // 世界宽（缺省 8·DOM 按 worldWidth/pxWidth 缩放到世界尺度）
  worldHeight?: number; // 世界高（缺省=worldWidth·pxHeight/pxWidth·保像素比）
  bg?: string; // 面片底色（CSS 色·缺省透明）
}

// ── TA 地基（Phase 0）：曲线 / 渐变（render-only 值类型·随寿命/时间演化的 TA 通用原语）──────────────
// 关键点按 t∈[0,1] 排好；曲线给标量、渐变给颜色+透明。供 VFX(size/color over life)、灯闪烁、材质 ramp 复用。
export interface Curve { keys: Array<{ t: number; v: number }>; mode?: 'linear' | 'step' | 'smooth'; }
export interface Gradient { stops: Array<{ t: number; color: number; alpha?: number }>; } // color=0xRRGGBB

// ── Vfx3D（TA Phase 1·render-only·不进 hash）── 数据驱动粒子发射器（Niagara-lite 闭集模块）。
// 渲染器 VfxSystem 读它 + 实体世界位（Transform3D / 2D Transform / 显式 x,y,z）→ 池化 Points 粒子 CPU 模拟。
// render-only → 可用时间/随机自由（不碰 sim·不进 hash）。预算：每发射器 max 上限 + 渲染器全局 cap。
export interface Vfx3D extends Component {
  readonly type: 'Vfx3D';
  // 发射
  rate?: number; // 每秒持续发射数（缺省 0）
  lifetime: number; // 粒子寿命(秒)
  lifeVar?: number; // 寿命随机幅度(秒)
  max?: number; // 本发射器粒子上限（缺省 256·预算）
  // 形状（发射初速方向）：point=四散、cone=绕 +Y 锥、sphere=球内
  shape?: 'point' | 'cone' | 'sphere';
  coneAngle?: number; // cone 半角(弧度·缺省 0.4)
  emitRadius?: number; // sphere 发射半径 / 初始位置抖动（缺省 0）
  speed?: number; // 初速(单位/秒·缺省 4)
  speedVar?: number; // 初速随机幅度
  // 力
  gravity?: number; // -Y 加速度(单位/秒²·缺省 0)
  drag?: number; // 阻尼(每秒比例 0..n·缺省 0)
  attractor?: { x: number; y: number; z: number; strength: number }; // 点吸引力场：对每颗粒子施弹簧力 F=strength·(target−pos)。
  // 配 drag 阻尼 = 阻尼弹簧 = 缓入缓出（趋近时力变小·自然加减速·不夸张）。典型用法：粒子跟随鼠标聚集（游戏每帧把光标 unproject 的世界点写进 x/y/z）。缺省无 = 不施力。
  // 外观
  size?: number; // 基础粒子尺寸(世界尺度·缺省 1)
  sizeCurve?: Curve; // size-over-life（0..1 乘 size·缺省恒 1）
  color?: number; // 单色(0xRRGGBB·无 gradient 时)
  colorGradient?: Gradient; // color-over-life（覆盖 color）
  blend?: 'add' | 'alpha'; // 混合（add=发光/魔法·alpha=烟尘·缺省 add）
  // 发射器世界位（缺省读同实体 Transform3D，否则 2D Transform(x→X,y→Z)+baseY）
  x?: number; y?: number; z?: number;
  baseY?: number; // 2D Transform 情形的离地高度
}

// ── Trail3D（render-only·不进 hash·超休闲拖尾）── 运动拖尾/丝带：挂在移动实体上 → 渲染器记录其近 N 帧世界位、
// 连成一条**朝相机的带状**（头端满宽满不透明·尾端按 fade 收窄淡出）。球滚拖尾/滑动划过/冲刺残影。
// 采样：位移超 minDist 才落一个节点（静止不堆点）。TrailSystem 持位置历史·据相机每帧重建带几何。**纯表现**。
export interface Trail3D extends Component {
  readonly type: 'Trail3D';
  segments?: number; // 拖尾节点上限（缺省 20·越大越长）
  width?: number; // 带宽（世界单位·缺省 0.3）
  color?: number; // 拖尾色 0xRRGGBB（缺省白 0xffffff）
  minDist?: number; // 采样最小位移（世界单位·缺省 0.05·避免静止堆点）
  fade?: number; // 尾端不透明度 0..1（缺省 0=尾端全透明淡出；1=尾端也不淡）
  blend?: 'add' | 'alpha'; // 混合（add=发光残影·alpha=实体拖尾·缺省 alpha）
}

// ── Line3D（render-only·不进 hash·休闲通用世界折线）── 把一串**给定世界点**连成一条**朝相机的带状线**（有宽度·区别 THREE 线 1px）：
// 瞄准抛物线预览（弹弓/台球/打砖块·游戏算好弹道点填进来）、牵引绳/连接线、关卡路径指示、画线预览。区别 Trail3D（那是运动残影·自动记轨迹）。
// dash>0 → 虚线（实段 dash·空段 gap）；否则实线。closed 首尾相接。渲染器每帧据相机重建带（朝相机）。纯表现·不进 sim/hash。
export interface Line3D extends Component {
  readonly type: 'Line3D';
  points: ReadonlyArray<readonly [number, number, number]>; // 世界点（≥2）
  width?: number; // 线宽（世界单位·缺省 0.3）
  color?: number; // 颜色 0xRRGGBB（缺省白）
  opacity?: number; // 不透明度 0..1（缺省 1）
  dash?: number; // 虚线实段长（世界单位·>0 启用虚线·缺省 0=实线）
  gap?: number; // 虚线空段长（缺省=dash）
  closed?: boolean; // 首尾相接（缺省 false）
  blend?: 'add' | 'alpha'; // add=发光线（瞄准/能量）·alpha=实体线（缺省 alpha）
}

// ── Decal3D（render-only·不进 hash·休闲通用地面贴花）── 在实体地面投影处铺一张水平贴片·随实体 XZ 跟随。
// 两条贴图路（皆平贴无光·透明·贴地防 z-fight·跟随 XZ）：
//   ① 程序化 kind（零美术文件）：'blob'=软阴影(接触阴影·真阴影关了也有立体感)·'ring'=空心环(选中/目标)·'disc'=实心圆(高亮/落点 splat)；
//   ② 自定义贴图 `tex`（美术图·= texture 资产 id·带 alpha 透明）：下注线/地面 logo/路面标线/桌面图形/脚印/splat 美术图。
// 有 tex 时用真图（alpha 走贴图自带通道·color 可染色·缺省白显原色）；无 tex 时按 kind 生成 alpha 遮罩染 color。**纯表现**。
export interface Decal3D extends Component {
  readonly type: 'Decal3D';
  kind?: 'blob' | 'ring' | 'disc'; // 程序化遮罩（缺省 blob·tex 在场时忽略）
  tex?: string; // 自定义贴图 key（AssetManager·= texture 资产 id·带 alpha·在场则替代程序化遮罩·异步就绪前暂隐）
  radius?: number; // 半径（世界单位·缺省 3·等比方贴片）
  width?: number; height?: number; // 非等比尺寸（世界单位·覆盖 radius·长条下注线/矩形标线用）
  rotation?: number; // 地面内 Y 轴朝向（弧度·缺省 0·把长条/有向图对准座位/行进方向；程序化 kind 径向对称无影响）
  color?: number; // 颜色 0xRRGGBB（遮罩=染色·缺省 blob 黑/ring·disc 白；tex=染色·缺省白显原色）
  opacity?: number; // 不透明度 0..1（缺省 blob=0.35·ring/disc/tex=0.7... tex 缺省 1）
  y?: number; // 贴地高度（缺省 0.05·防 z-fighting）
}

// ── Billboard3D（render-only·不进 hash·休闲通用）── 实体世界位放一张**始终朝相机的贴图 quad**（金币/拾取物/浮空图标/emoji/impostor）。
// 区别 WorldUI3D（DOM 叠层·永在最上）——广告牌**在场景里·参与深度排序·会被 3D 物体遮挡**。贴图走 asset key（异步就绪前显纯色）。
export interface Billboard3D extends Component {
  readonly type: 'Billboard3D';
  tex?: string; // 贴图 key（AssetManager·无则纯色 quad）
  size?: number; // 等尺寸（世界单位·缺省 2）
  width?: number; height?: number; // 非等比（覆盖 size）
  color?: number; // 染色/纯色 0xRRGGBB（缺省白·有 tex 时染色贴图）
  opacity?: number; // 不透明度 0..1（缺省 1）
  blend?: 'add' | 'alpha'; // add=发光图标/能量·alpha=实体（缺省 alpha）
  x?: number; y?: number; z?: number; // 显式世界位（缺省读 Transform3D，否则 2D Transform(x→X,y→Z)+baseY）
  baseY?: number; // 2D Transform 情形的离地高度
}

export interface Color extends Component {
  readonly type: 'Color';
  tint: number;
  alpha: number;
}

// ── L3 frame ── 精灵的当前帧
export interface Frame extends Component {
  readonly type: 'Frame';
  index: number;
  total: number;
}

// ── gauge（REQ-F-029）── Resource 比例 → 条形 Shape 投影（血条/蓝条/读条/护盾；gauge 系统每 tick 写）。
// 条实体 = 宿主的 Hierarchy 子体：gauge 写自身 Shape.width = 比例*width、Hierarchy.localX = leftX + 现宽/2
// （左锚：左端钉死在 leftX，从右端缩——血条惯例）。跟随靠 hierarchy-resolve、随宿主销毁靠 hierarchy-cascade。
// 载体特意不用 Transform.scaleX：hierarchy-resolve(PostResolve) 每帧重写子 Transform（双 writer 打架），
// 且渲染 box 以中心为 pivot、缩放只能对称收缩，锚不了左。
export interface Gauge extends Component {
  readonly type: 'Gauge';
  resourceId: string; // 跟踪的 Resource.id
  fromParent?: boolean; // true=读 Hierarchy.parentId 宿主实体上的 Resource（共享 id 'hp' 场景，全局取会取错单位）；缺省=先自身后全局首个同 id（R11 auto 同款）
  width: number; // 满值时条宽(px)
  leftX?: number; // 条左端相对宿主的固定 x 偏移（左锚）。缺省 -width/2（满条时居中于宿主）
}

// ── anim-state ── 动作动画状态机的 clip 与状态机（表现层；动画只表现、绝不驱动逻辑）。
// 一个 clip = sprite-sheet 的一段帧区间 [from, from+count) + 节奏(fps=每帧 tick)/是否循环 + 可选 sheet(切贴图)。
export interface AnimClip {
  sheet?: string; // 此 clip 用哪张 sprite-sheet（缺省=保持当前 Sprite.textureKey）
  from: number; // 起始帧索引
  count: number; // 帧数
  fps: number; // 每帧停留 tick 数（越大越慢；<1 视为 1）
  loop: boolean; // 循环 or 播到末帧停
}
export interface AnimState extends Component {
  readonly type: 'AnimState';
  clips: Record<string, AnimClip>; // 状态名 → clip
  fsmId?: string; // 设了就读 State{fsmId}.current 当 clip 名；否则按 Velocity 自动 move/idle
  moveClip: string; // 自动模式：移动时的 clip 名
  idleClip: string; // 自动模式：静止时的 clip 名
  attackClip?: string; // 自动模式：站定且有 Relation(target)（追到目标身边）时的 clip 名；缺省=站立播 idle
  current: string; // 内部：当前 clip 名
  elapsed: number; // 内部：当前帧已播 tick
}

// ── facing ── 朝向翻转（表现层）：按移动方向(velocity)或目标方向(Relation target)把实体水平翻转
// （Transform.scaleX 取正=朝右 / 取负=朝左镜像；碰撞/命中已对 scaleX 取绝对值，翻转安全）。静止时保持上次朝向不抖。
export interface Facing extends Component {
  readonly type: 'Facing';
  mode: 'velocity' | 'target'; // 按移动方向 or 按 Relation(target) 方向定朝向
}

// ── FaceDir / face-rotate（REQ-FACE-ROTATE）── 俯视有向物按方向旋转贴图，sim 侧零三角函数。
// 铁律：sim 跨机不保证 sin/cos/atan2 逐位一致（lockstep 危险，同 orbit-motion 避 per-tick trig 的先例）→
// sim 只写**单位方向向量**（sqrt 归一，IEEE 确定性类，可安全进 hash）；渲染器读它自己算 atan2 转视觉旋转角
// （render-only，绝不进 sim/hash）。FaceDir = 输出（表现层，每帧由 face-rotate 系统写）；
// FaceRotate = 配置（挂在实体上声明朝向来源），仿 Facing.mode 的取向口径。
export interface FaceDir extends Component {
  readonly type: 'FaceDir';
  x: number; // 单位方向向量 x（|FaceDir|≈1；sqrt 归一，零 trig）
  y: number; // 单位方向向量 y
}
export interface FaceRotate extends Component {
  readonly type: 'FaceRotate';
  source: 'velocity' | 'target'; // 按移动方向(velocity) or 按 Relation(target) 方向(target) 取朝向
}

// ── L4 sound ── 播放什么声音
export interface Sound extends Component {
  readonly type: 'Sound';
  clipId: string;
  volume: number;
  loop: boolean;
}

// ── L5 camera ── 观察窗口参数（世界→屏幕映射基准）
export interface Camera extends Component {
  readonly type: 'Camera';
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  viewportW: number;
  viewportH: number;
}

// ── camera-follow ── 标记：相机要跟随的目标（合作相机取所有目标的 AABB 中点）。空 marker。
export interface CameraTarget extends Component {
  readonly type: 'CameraTarget';
}

// ── L6 text ── 显示什么文字
export interface Text extends Component {
  readonly type: 'Text';
  content: string;
  fontSize: number;
  fontFamily: string;
  anchor: string;
  lineSpacing: number;
  // 可选：按此像素宽度自动换行（多行）。<=0 或缺省 = 不自动换行（仍按 \n 硬换行）。
  maxWidth?: number;
}

// ── tween ── 数值随时间朝目标缓动（B 轴"连续"柱）。定步长：elapsed 每帧 +1，单位=tick。
// 缓动用多项式（不碰 sin/cos）。**只驱动不被 Condition 读的"表现/软逻辑"字段**（Transform/Color）：
// 浮点插值与现有物理同属 IEEE +/-/* 确定性类，但绝不喂给 Condition 比较的逻辑数值（如 Resource.current），
// 以免跨端 1 ULP 差异造成阈值触发帧错位（Gemini Q6）。逻辑数值渐变请用整数分步（timer + ResourceModify）。
export type TweenTarget =
  | 'Transform.x'
  | 'Transform.y'
  | 'Transform.rotation'
  | 'Transform.scaleX'
  | 'Transform.scaleY'
  | 'Color.alpha';

export type TweenEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

// 到点后的循环模式（REQ-004）：none=停（默认，向后兼容）；restart=归零重跑（from→to 往复）；
// pingpong=交换 from/to 再归零（来回往复，如巡逻台/呼吸立绘）。纯数据、snapshot 友好、确定性不变。
export type TweenLoop = 'none' | 'restart' | 'pingpong';

export interface Tween extends Component {
  readonly type: 'Tween';
  target: TweenTarget; // 驱动同实体上的哪个组件字段
  from: number;
  to: number;
  elapsed: number; // 已过 tick 数（每帧 +1）
  duration: number; // 总 tick 数（<=0 视为立即到 to）
  easing: TweenEasing;
  done: boolean; // elapsed>=duration 后置 true（snapshot 友好）
  loop?: TweenLoop; // 到点后的循环模式（缺省 none）
  loops?: number; // 循环程数（restart/pingpong 有效）；缺省=无限。每完成一程递减，到 1 后停在终值
  // 重放保留（REQ-F-057 落子 juice）：true=到点后**不移除组件**、停在终值置 done（done 实体每帧零开销跳过），
  // 供运行时倒带重放（drag-place 落子把 elapsed=0/done=false → 压扁回弹再播一次）。缺省=到点移除（原语义）。
  keep?: boolean;
}

// ── text-binding（REQ-F-043）── Resource 数字 → Text 投影（gauge 的姊妹件；HUD 金币/回合/等级/楼层）。
// text-binding 系统(PostResolve)每拍把目标 Resource.current 写成自身 Text.content = prefix+值+suffix。
// 寻址同 gauge：fromParent=读 Hierarchy.parentId 宿主；缺省先自身后全局首个同 id（R11 auto）。
export interface TextBinding extends Component {
  readonly type: 'TextBinding';
  resourceId: string; // 跟踪的 Resource.id
  fromParent?: boolean; // true=读宿主实体 Resource（共享 id 场景）；缺省=先自身后全局
  prefix?: string; // 文案前缀（如「金币 」）
  suffix?: string; // 文案后缀（如「 金」）
}

// ── Coachmark（REQ-ARCH-COACH · render-only 新手引导高亮）── 一步引导的表现数据：把某个 UI 元素（data-anchor 键）
// 高亮出来——全屏半透明遮罩 + 锚点处镂空 + 一句话气泡。OnboardingOverlay 解释器读它渲染。红线：**纯表现**——
// 绝不进 hash/sim、不被 Condition 读、不回灌 gameplay（高亮各端可不同，同 outcome-first）。可见性由 visibleWhen
// 绑的 Flag（如当前 step 的 coach_active）驱动——流程/「看过不再弹」用现有 flow+flag+save 重组，本组件只管「画高亮」。
export interface Coachmark extends Component {
  readonly type: 'Coachmark';
  anchor: string; // 目标 UI 元素的 data-anchor 键（GameShell UINode.anchor 或手写 DOM 的 data-anchor 属性）
  text: string; // 气泡文案（一句话）
  shape?: 'rect' | 'circle'; // 镂空形（缺省 rect）
  pad?: number; // 镂空外扩像素（缺省 8）
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'; // 气泡相对锚点位置（缺省 auto：择空间大的一侧）
  arrow?: boolean; // 气泡指向箭头（缺省 true）
  dimColor?: number; // 遮罩色 0xRRGGBB（缺省 0x000000）
  dimAlpha?: number; // 遮罩透明度 [0,1]（缺省 0.6）
  visibleWhen?: string; // 绑定 Flag id：该 Flag active 才显示（缺省=总显示）。流程把当前 step 的 flag 置真即亮对应 mark
}
