// Protocol · 身份/关系/状态 + 战斗 / AI / 属性 / 生命周期 ─────────────────────────────
// 实体的阵营身份(Tag)、战斗状态位(Status)、逻辑关系(Relation)，加上伤害判定(Hitbox)、限时效果(OverTime)、
// 数据驱动 AI(Perception/Steering)、逐实体死亡(Mortal)、抛射(Launch)、属性分层(Stats)。
import type { Component, EntityId } from '../../core/types.js';

// ── G1 tag ── 实体属于哪些分类（bitmask，位运算 O(1)）
export interface Tag extends Component {
  readonly type: 'Tag';
  flags: number;
}

// ── Status ── 实体身上的动态状态位掩码（frozen/burning/stunned…），运行时被战斗能力置/清位。
// 与 Tag（静态身份/阵营）区分：Status 是会变的战斗状态。位语义由游戏数据定义（与 Tag 同风格）。
export interface Status extends Component {
  readonly type: 'Status';
  flags: number;
}

// ── G2 relation ── 实体跟谁有什么逻辑关系（非空间）
export interface Relation extends Component {
  readonly type: 'Relation';
  kind: string;
  targetId: EntityId;
}

// ── G3 owner ── 这个实体属于谁 / 站哪边（engine-base-tier-review-2026-09-06 A-1·owner 2026-09-08 判 A）。
// 此前同一概念在 tier 里有 5 种互不相通的编码（CardPile.owner / Controllable.playerId / Tag 位 / Relation{kind:'owner'} /
// PrefabOrigin.source），游戏侧 6 款各写一套；Relation 一实体一张且 target 槽已被五方争抢。本卡只回答归属与阵营；
// 旧编码**不迁**（owner 令：现有游戏不重写）——新游戏/新能力读这张。
export interface Owner extends Component {
  readonly type: 'Owner';
  ownerId: EntityId; // 主人实体（玩家/阵营根实体）；空串 = 无主
  team: number; // 阵营号（0 = 中立/未分队）；同 team 即友方
}

// ── G4 group ── 这个实体装着哪些实体（有序·可限容）（A-2·owner 2026-09-08 判 A）。
// 手牌/牌堆/背包/装备栏/队伍/座位圈的共同形。一实体一张（多个集合 = 多个实体，同 Timer 口径）；
// id 走全局语义 id 路由（world.byId('Group','id',…)）。成员被销毁后由 t1-group-gc 每拍摘除（防悬空 id）。
export interface Group extends Component {
  readonly type: 'Group';
  id: string; // 集合语义 id（如 "hand:p1" / "deck" / "party"）
  members: EntityId[]; // 有序成员（插入序即语义序·手牌顺序有意义）
  capacity?: number; // 上限（缺省无限）
}

// ── Hitbox ── 伤害源（攻击判定）。挂在被 ZONE_FLAG 标记的 Sensor+Shape+Transform 实体上：
// trigger-zone 先产出 Trigger{zone:hitbox, other:目标}，hitbox 能力据此对每个进入的目标——
// 若 Tag 匹配 targetMask（阵营过滤）且 Status 满足 requireMask（如碎冰要求 frozen）——
// 按 amount/fracOfMax 算伤害、以局部 ResourceModify 路由到该目标，并可置/清其 Status 位。
// AOE = 多 Trigger 自然 fan-out；逐目标 = 局部寻址；计算伤害 = fracOfMax；阵营/状态门 = mask。
export interface Hitbox extends Component {
  readonly type: 'Hitbox';
  resource: string; // 目标身上要改的 Resource id（如 'hp'）
  amount?: number; // 固定伤害（正数 = 伤害；内部按负向施加）
  fracOfMax?: number; // 计算伤害 = 目标该资源 max 的此分数（如 0.2 = 20% max）
  damageType?: string; // 伤害类型（可选）：目标 Armor.kind × 世界 DamageTable → 倍率（t2-damage-table·缺任一 ×1）
  targetMask?: number; // 仅作用于 Tag.flags 含此位的目标（阵营过滤；缺省/0 = 不限）
  requireMask?: number; // 仅作用于 Status.flags 含齐此位的目标（如碎冰要求 frozen）
  setMask?: number; // 命中后给目标 Status 置这些位（如 frozen）
  clearMask?: number; // 命中后清目标 Status 这些位（如碎冰解除 frozen）
  // ── 时间维度（D-003 over-time 集成）：命中时给目标挂 OverTime，把"瞬时命中"延展成"持续效果"。──
  statusDuration?: number; // >0：命中置 setMask 后，过 N tick 自动清这些位（定时冻结/眩晕，免手动清场）。
  dotPerTick?: number; // >0：每 dotPeriod tick 对目标 resource 造成此真伤（中毒/燃烧 DoT，挂 OverTime）。
  dotPeriod?: number; // DoT 结算周期（tick，缺省 1）。
  dotDuration?: number; // DoT 总时长（tick）。
  // 单发结算（REQ-F-044）：本拍有任一命中结算后，对自身（zone 实体）发 DestroyRequest（cascade 连挂件）。
  // 拾取品/独头弹/一次性陷阱标配——金币泵（站桩每拍重复入账）的原子解。
  consumeOnHit?: boolean;
  // 活系数乘区（REQ-F-047，REQ-023 簇最窄落点）：结算时 amount × 该全局 Resource.current（缺省=×1 零迁移）。
  // 羁绊/战斗符文 = group-count 计数 → EventWhen 阈值 → Effect 写系数资源 → 此处生效；同模板两阵营
  // 各自系数用槽位 overrides 改本字段指向各自资源 id（纯数据）。fracOfMax 部分不乘（保"按目标max"语义）。
  scaleByResource?: string;
  // ── 血量比例门 / 处决（REQ-F-061）── 命中那刻只读目标当前 hp 比例(current/max)做 gate：连续 Resource 烘不成
  // Status、C→E→E 触发层够不到命中那刻目标血量 → 真缺口。只读门，不引入伤害分型/重定向（守边界）。
  requireHpFracBelow?: number; // 仅作用于 hp 比例 < 此值的目标（残血技：target.current < max×此值）。
  requireHpFracAbove?: number; // 仅作用于 hp 比例 >= 此值的目标（满血/精英开胃技）。
  executeBelow?: number; // 命中且 hp 比例 < 此值 → 处决（清 0）；与 amount 同存 = 「低于阈值斩杀、否则常规伤害」。
  // ── 命中特效（薄缺口，2026-07-26 Lead 裁）：命中即生成——击中火花/受击特效/穿透弹每命中一喷。──
  // 缺省不填 = 零回归（现有 hitbox 行为逐字节不变）。发 SpawnRequest 在**被命中目标位置**（命中点近似），
  // 与伤害同一结算循环、同拍：穿透/AOE（一伤害区 N Trigger）→ 每个 other 各喷一个（fan-out 天然成立）。
  onHit?: { spawnTemplate: string }; // 命中（过滤门通过后）在 target 位置发 SpawnRequest{templateId:此值}。
}

// ── TimedEffect ── 一个限时/持续效果（DoT/regen/定时状态）。多个并存在 OverTime.effects 列表里。
// id：同 id 刷新（重置）而非叠加，防持续源无限叠层；不同 id 共存（燃烧 vs 冰冻 vs 毒，R14 真修 B）。
export interface TimedEffect {
  id?: string; // 效果标识（同 id 刷新、不同 id 共存）；缺省=每次都叠加一条
  resource?: string; // 周期改的资源 id（如 'hp'）；缺省 = 不改资源（纯定时状态，如定时冻结）
  amountPerTick?: number; // 每 period 改的量（负=DoT，正=regen）；缺省 0
  period: number; // 每多少 tick 结算一次（>=1）
  duration: number; // 总时长 tick（>0）；<=0 = 永久（靠外部/clearStatusOnEnd 之外的方式清）
  elapsed: number; // 已过 tick（每帧 +1，进 snapshot 可重放）
  clearStatusOnEnd?: number; // 到期时清自身 Status 的这些位（定时冻结到期解冻）
}

// ── OverTime ── 限时/持续效果容器（D-003 + R14 真修 B）：挂在受影响实体自身，持一个 TimedEffect 列表，
// 逐实体、局部寻址。每帧每个效果 elapsed+1；到 period 整数倍 → 对自身 resource 发局部 ResourceModify
// （多个效果的改值经 queueResourceMod 累加）；effect.elapsed≥duration 到期 → 清其 clearStatusOnEnd 位并从列表移除；
// 列表空 → 自销毁组件（不毁实体）。一实体可同时燃烧+冰冻+中毒（各自计时/到期），修掉"一实体一 OverTime"的缺口。
// 确定性：纯整数 tick 计数，按列表序处理（加性累加→序无关）。
export interface OverTime extends Component {
  readonly type: 'OverTime';
  effects: TimedEffect[]; // 并存的限时效果（燃烧/冰冻/毒…各自一条）
}

// ── Perception ── 数据驱动 AI 的"索敌"原子（D-001，对应周期表 auto-target/range-detect）。逐实体感知
// sightRadius 内最近的 targetTag 阵营 → 写 Relation{kind:'target', targetId}（无则清）。把"看见谁"产物化成
// 通用 Relation(target)，供 steering(朝它移动)/朝向/caster(at:'target' 复用) 等多消费者复用——不再各自重扫。
// 这是库里 ai-chase = state + spatial-query(nearest) + **relation(target)** + transform + velocity 的索敌段。
export interface Perception extends Component {
  readonly type: 'Perception';
  targetTag: number; // 感知的阵营（Tag.flags & targetTag）
  sightRadius: number; // 感知半径（<=0 = 无限视野）
  // lureTag（薄加性·REQ-SURVIVOR武器缺口 W8·零回归）：sightRadius 内若存在 Tag.flags 含此位的实体，
  // 优先选它为目标（覆盖 targetTag 默认选择；多个候选按 nearestByTag 的 id tie-break）；范围内无 lure
  // 才回落 targetTag 默认索敌。缺省 undefined = 现行为不变（诱饵/嘲讽标记通用，不限本游戏）。
  lureTag?: number;
}

// ── Steering ── 数据驱动 AI 的"转向"原子（D-001）。读自身 Relation{kind:'target'} → 朝目标 seek（到 stopRange
// 停=攻击距离）或 flee（远离）→ 写 Velocity（被 motion-apply 积分、受碰撞/摩擦介入）。无目标→停（idle）。
// 模式(seek/flee)与"巡逻↔追击↔逃跑"的转移交给 state+condition 当**数据**（库 ai-chase 的 state 段），不焊进本组件。
// 确定性：方向归一化用 IEEE sqrt/÷（Velocity 不被 Condition 读 → lockstep 安全）。
export interface Steering extends Component {
  readonly type: 'Steering';
  mode: 'seek' | 'flee'; // seek=朝 Relation(target)(到 stopRange 停)；flee=远离
  speed: number; // 移动速度（写入 Velocity 的模长，单位/tick）
  stopRange: number; // seek 到此距离内即停（攻击/保持距离）；flee 忽略
  haltStatusMask?: number; // 自身 Status 含这些位时停止行动（冻结/眩晕/定身 CC → 速度归零）；缺省不受控
  // 群体分离/局部避让（REQ-SURVIVOR群体①）：seek 时被半径内同群邻居斥开——防「敌群 follow 同一目标全挤成一点」，
  // 让 crowd 环绕目标而非塌缩（幸存者/RTS/塔防通用）。缺省无=零回归（不查邻居·纯 seek/flee）。
  separation?: {
    radius: number; // 斥力作用半径（>0 才启用；≤0/缺省=不分离）
    weight: number; // 斥力融进转向输出的强度（乘在线性衰减归一斥力上·再连同基础转向 clamp 回 speed）
    tagMask?: number; // 只与含这些 Tag.flags 位的邻居互斥（缺省=只与其它带 Steering 的群体成员互斥·不推开玩家/子弹）
  };
}

// ── PullAnchor ── 区域施加器（REQ-SURVIVOR武器缺口 W9·黑洞/吸附类武器·**重组**：不新写位移数学，
// 只批量改写"已带 Steering 的邻近实体"的 Relation(target)→自身，让 t2-steering 既有的 seek 逻辑把它们
// "拉"过来（含其 stopRange/separation 免费复用）。挂在锚点实体（需 Transform）：每 tick queryRange 半径内
// 找 Tag.flags 含 tagMask 且**已挂 Steering**的实体，把它们的 Relation 覆盖为 {kind:'target', targetId:锚点}
// （对齐 aggro 的"Relation 另作他用则让位"礼让口径）。边界：只对已有 Steering 的实体生效——不能拉玩家/
// 道具/子弹等无 Steering 的实体（那类需求超出本重组能力，见 pull-anchor.ts 文件头）。
// 确定性：queryRange/锚点均按 id 排序遍历，无随机。
export interface PullAnchor extends Component {
  readonly type: 'PullAnchor';
  radius: number; // 施加半径（queryRange 半径；>0 才生效）
  tagMask: number; // 命中筛选：目标 Tag.flags & tagMask（0 = 不限阵营，仍需持有 Steering 才会被拉）
}

// ── PathFollow ── 固定航点轨道匀速跑（REQ-PATHFOLLOW）。沿 waypoints 依次朝下个航点走，进 arriveRadius
// 算到达→游标前进（loop=回到 0，否则停在末点）→ 写 Velocity（被 motion-apply 积分）。与 steering 同链
// （先定速→motion-apply 积分），区别于它的是"固定轨道"而非"追/逃 Relation(target)"——巡逻/传送带/固定弹道路径通用。
// 确定性：方向归一化用 IEEE sqrt/÷（Math.hypot 求距，同 Steering 类安全）。
//
// queueId/minGap（REQ-CONVEYOR-CAP M1：有序不重叠占位 + 队列递进）：同 queueId 的成员按「path 进度」
// （沿 waypoints 累计弧长 − 到当前航点剩余距离，见 path-follow.ts pathProgress）排序；每个非排头成员
// 每 tick 的有效前进量夹在「前一名（进度更高者）本 tick 起点进度 − minGap」——绝不超车/叠位，排头不受限。
// 缺省 minGap=0（仍不超车，允许贴到 0 间距）；不设 queueId=完全不受本机制影响（零回归）。
export interface PathFollow extends Component {
  readonly type: 'PathFollow';
  waypoints: { x: number; y: number }[]; // 轨道航点（≥1）
  loop?: boolean; // 闭环（跑完回到航点0）；缺省 false=停在末点
  speed: number; // 写入 Velocity 模长（单位/tick）
  arriveRadius?: number; // 进入该半径算「到达」进下一航点；缺省 4
  index?: number; // 当前目标航点游标（运行时状态·缺省 0·序列化进 snapshot）
  queueId?: string; // 队列分组键（传送带/队列 id）；同 queueId 成员按 path 进度排序、互不超车
  minGap?: number; // 与「前一名」的最小 path 进度间距；缺省 0（仍不超车）
  onEnd?: { dropTemplate?: string; destroy?: boolean }; // REQ-PATHEND-DROP：非 loop 到末点时触发一次（落件/自毁）；缺省不触发
  ended?: boolean; // onEnd 是否已触发（运行时状态·fire-once 守卫·随 snapshot 存读，防重发）
}

// ── Orbit ── 圆周运动（REQ-SURVIVOR护盾绕转·VBUG-02）：绕 centerId（缺省世界原点）半径 radius 匀速环绕，
// 每 tick 写自身 Transform.x/y。**确定性/lockstep 安全**：不用每 tick sin/cos——存单位方向 (dirX,dirY) 为 rotor
// 状态，每 tick 用常量旋转步 (cosStep,sinStep) 做旋量乘 + sqrt 归一（防漂移）。四个 trig 常量为**数据**（作者
// authoring 期一次性 Math.cos/sin 算好、烤进蓝图=跨机同字节；运行时零 sin/cos）。绕转护盾/卫星/环刃/摄像机通用。
export interface Orbit extends Component {
  readonly type: 'Orbit';
  centerId?: string; // 圆心实体 id（读其 Transform）；缺省绕世界原点 (0,0)
  radius: number; // 轨道半径
  dirX: number; // 当前单位方向 x（rotor 状态·初值=起始角 cos·每 tick 步进）
  dirY: number; // 当前单位方向 y（初值=起始角 sin）
  cosStep: number; // 每 tick 旋转步 cos（数据·authoring 一次性算·免运行时 sin/cos）
  sinStep: number; // 每 tick 旋转步 sin（>0 逆时针 / <0 顺时针）
}

// ── Mortal ── 逐实体死亡/可破坏（D-001 配套）：自身 resource <= atOrBelow 即发 DestroyRequest 销毁自己。
// 补"涌现逻辑层是全局-id、表达不了 N 怪各自 hp<=0 死亡"的缺口。怪死/可破坏障碍/到期拾取物通用。
export interface Mortal extends Component {
  readonly type: 'Mortal';
  resource: string; // 监视的资源 id（如 'hp'）
  atOrBelow: number; // current <= 此值即销毁自身（通常 0）
  dropTemplate?: string; // 死亡时在原地（自身 Transform）发 SpawnRequest 展开此模板（掉落物/尸体/爆炸）
}

// ── StatModifier ── 属性修正（①，ARPG）：来自具名 source（装备/buff/光环/天赋/boon）的一条加/乘修正。
// 装备→push 一条（source=装备 id），卸下→按 source 滤除。同一 source 可有多条（改多 stat）。
export interface StatModifier {
  stat: string; // 目标 stat 名（如 'attack'、'maxHp'、'moveSpeed'）
  add?: number; // 加值（缺省 0）
  mul?: number; // 乘值（缺省 1）
  source: string; // 来源 id（按它增删，如 'ring_of_power'、'buff_haste'）
}

// ── Stats ── 属性修正系统（①）：一个组件装多 stat 的「基础值 + 修正列表 → 有效值」分层。
// 有效值 effective[s] = (base[s] + Σ mods.add) × Π mods.mul。系统 stat-apply 每帧重算 effective。
// 一组件多 stat → 绕开「一实体一组件」；下游（hitbox 伤害读 attack、steering 读 moveSpeed、maxHp→Resource.max）
// 读 effective。装备/buff/光环/天赋/Hades-boon 全是"往 mods 里增删条目"=纯数据组合，不写游戏代码。
// 确定性：纯整数/IEEE 算术，遍历按 stat 名 + 列表序（加性/乘性，序内累加）→ 录放一致。
export interface Stats extends Component {
  readonly type: 'Stats';
  base: Record<string, number>; // 基础值（裸属性）
  mods: StatModifier[]; // 当前生效的修正（来源增删）
  effective: Record<string, number>; // 折算结果（stat-apply 每帧重算；下游读这个）
}

// ── Launch ── 直线弹/抛射（②，ARPG）：发射瞬间定一次方向 → 写一次 Velocity → 自删 Launch，之后由
// motion-apply 直飞（fire-and-forget）。区别于 steering 的**持续**重定向（那是追踪弹/homing，已被 steering 覆盖）。
// toward:'target' 朝最近 targetMask 阵营（复用 spatial-query.nearestByTag）；'dir' 朝固定 (dirX,dirY)（归一化）。
// 飞弹 = prefab 模板{Transform,Shape,Sensor,Tag(ZONE),Hitbox,Velocity,Launch,Timer(life)}，caster 生成即自发射。
// 确定性：方向归一化用 IEEE sqrt/÷（与 steering 同类，安全）；nearestByTag 按 id tie-break。
export interface Launch extends Component {
  readonly type: 'Launch';
  speed: number; // 初速模长（单位/tick）
  toward: 'target' | 'dir'; // target=朝最近 targetMask 实体；dir=固定方向
  targetMask?: number; // toward:'target' 时索敌阵营（Tag.flags & targetMask）
  dirX?: number; // toward:'dir' 时方向（会归一化；缺省 0）
  dirY?: number;
  // fallbackDir（薄加性·零回归）：toward:'target' 且索敌落空时，缺省=清零速度冻结原地（fizzle）；
  // 声明此字段则改沿它发射（归一化×speed）而非冻结——弹幕/AOE 落空不哑火，仍朝一个默认方向飞出去。
  // 缺省 undefined = 现行为不变。
  fallbackDir?: { x: number; y: number };
  // bounce（薄加性·零回归·REQ-SURVIVOR武器缺口 W7）：声明"跳弹"次数与目标阵营。launch 是发射瞬间定向
  // 后即自删 Launch 的一次性组件（fire-and-forget），无法持有"命中后还能再弹几次"的运行时状态——
  // 声明本字段时，launch 系统在自删 Launch 前会把它落地成持久的 Bounce{remaining,targetTag,speed}
  // 组件（见 bounce-relay.ts），命中后的实际重定向由 t2-bounce-relay 接管。缺省 undefined = 现行为不变。
  bounce?: { times: number; targetTag: number };
}

// ── Bounce ── 跳弹的持久运行时状态（REQ-SURVIVOR武器缺口 W7）。由 launch 在声明了 Launch.bounce 的
// 抛射体自删 Launch 前一次性落地（remaining=times、speed=发射时的 Launch.speed，之后不再逐帧重算）；
// 之后由 t2-bounce-relay 在每次命中时消费：nearestByTag(targetTag, exclude=刚命中的) 找下一个目标 →
// 重定向 Velocity（保持 speed 模长）→ remaining-1。remaining<=0 或找不到新目标 → 不再弹（照常按
// Timer(life) 回收，本组件不必移除，只是从此静默）。
export interface Bounce extends Component {
  readonly type: 'Bounce';
  remaining: number; // 剩余可弹射次数（成功弹射一次 -1；未命中/无新目标不消耗）
  targetTag: number; // 弹射目标阵营（Tag.flags & targetTag，同 nearestByTag 的 tagMask 语义）
  speed: number; // 弹射后保持的速度模长（发射时的 Launch.speed，一次性抄录，不逐帧重算）
}
