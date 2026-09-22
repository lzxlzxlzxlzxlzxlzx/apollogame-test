// Protocol · 离散逻辑核心（B 轴枢纽）─────────────────────────────
// 资源/标志/计时/状态这些"被条件读、被效果写"的逻辑数值，加上 Condition→Event→Effect 三段式、
// 经济配方、流程状态机、self/group 寻址轴。游戏的"玩法逻辑"几乎全部在此层用纯数据表达。
import type { Component, EntityId } from '../../core/types.js';

// ── F1 resource ── 某种有上下限的数值 (hp / mp / stamina ...)
export interface Resource extends Component {
  readonly type: 'Resource';
  id: string;
  current: number;
  min: number;
  max: number;
}

// ── F1 resource ── 修改某资源的事件 (read-then-consume)
export interface ResourceModify extends Component {
  readonly type: 'ResourceModify';
  resourceId: string;
  amount: number;
  // 运算（REQ-ENGINEAUDIT 根因①·owner 2026-08-16 判 C）：'add'（缺省·存量零变）= current+amount；
  // 'set' = 直接置为 amount（仍钳 [min,max]）。set 的要害：写「目标值」不需要先读当前值——
  // 清零/置满这类操作从此不必读 Resource，产出方（如 matrix-duel 结算）不再被迫加读面成环。
  // 词表对齐 FlowAction.op / Effect modify-resource 的 op 既有口径，不另造。
  op?: 'set' | 'add';
  // 寻址作用域（防"变量遮蔽"，Gemini Q4）：'local'=仅同实体；'global'=强制按 id 全局路由（不被同名局部资源静默抢走）；
  // 'source'=按本实体的 PrefabOrigin.source 找发起者实体（REQ-SPENDONFIRE：per-shot 扣发射源资源，如子弹耗
  // 发射炮自己的 ammo，N 炮各自计数）——本实体无 PrefabOrigin/无 source/源已销毁/源无该资源 → 静默跳过
  // （不崩、不误扣同名全局资源；口径复用 hitbox.findScaleResource 的"源自身或同次展开复合兄弟"查找，见
  // engine/core/query.ts 的 findSourceResource）。
  // 缺省=auto（同实体匹配优先，否则全局）。改全局态时显式写 'global' 更稳。
  scope?: 'local' | 'global' | 'source';
}

// ── F2 flag ── 某个条件开还是关
export interface Flag extends Component {
  readonly type: 'Flag';
  id: string;
  active: boolean;
}

// ── E1 timer ── 倒计时/间隔（按 tick 计数，World 无 dt）
export interface Timer extends Component {
  readonly type: 'Timer';
  id: string;
  elapsed: number;
  duration: number;
  loop: boolean;
}

// ── E1 timer ── 计时完成事件（read-then-consume，由下游系统消费）
export interface TimerDone extends Component {
  readonly type: 'TimerDone';
  timerId: string;
}

// ── J1 state ── 实体在某状态机的当前离散状态
export interface State extends Component {
  readonly type: 'State';
  fsmId: string;
  current: string;
  previous: string;
}

// ── J1 state ── 状态切换事件（read-then-consume）
export interface StateChanged extends Component {
  readonly type: 'StateChanged';
  fsmId: string;
  from: string;
  to: string;
}

// ── 逻辑：Condition → Event（B 轴枢纽，离散逻辑层）─────────────────────────────
// 比较算子（确定性：只比较数/字符串/bool，不碰浮点超越函数）。
export type CmpOp = 'lt' | 'lte' | 'eq' | 'ne' | 'gte' | 'gt';

// 布尔条件树：and/or/not 组合在「按语义 id 读世界值」的比较叶子上。纯 POD，
// structuredClone 友好 → 自动进 world.snapshot()。threshold/状态判定/机关门控都是它的特例。
export type ConditionExpr =
  | { readonly kind: 'always' } // 恒真（flow 线性瀑布转移；数据可读）
  | { readonly kind: 'and'; readonly of: ConditionExpr[] }
  | { readonly kind: 'or'; readonly of: ConditionExpr[] }
  | { readonly kind: 'not'; readonly of: ConditionExpr }
  // resource 叶子：与静态 value 比；或（REQ-017）与另一资源 vsResource.current 比（动态阈值，如 round_score≥blind）。
  // vsResource 在场时优先（value 退化为缺资源时的回退）。是 REQ-013 valueFrom 在"条件读侧"的对称扩展。
  | { readonly kind: 'resource'; readonly id: string; readonly cmp: CmpOp; readonly value: number; readonly vsResource?: string }
  | { readonly kind: 'flag'; readonly id: string; readonly equals?: boolean }
  | { readonly kind: 'state'; readonly fsmId: string; readonly equals: string }
  | { readonly kind: 'timer'; readonly id: string; readonly cmp: CmpOp; readonly value: number }
  | { readonly kind: 'string'; readonly id: string; readonly equals: string }
  | { readonly kind: 'cooldown'; readonly id: string; readonly ready?: boolean }; // t2-cooldown 槽就绪（缺省判 ready=true·无此槽视为就绪）

// ── event-when ── 条件成立时发信号。逻辑核心层，不直接产生效果(Effect 后置)。
export interface EventWhen extends Component {
  readonly type: 'EventWhen';
  signal: string; // 触发时产出的信号名
  when: ConditionExpr; // 布尔条件树
  mode: 'edge' | 'level'; // edge=上升沿触发一次(迟滞)；level=条件为真时每帧持续触发
  armed: boolean; // 边沿检测内部状态：true=已在本轮触发、等条件回落后复位
  // 代发（REQ-108-ENG-05·owner 2026-08-07 判 A·与 `KeyBinding.source`(ENG-04) 逐字对称）：
  // 产出的 `Signal.source` 填这个实体，而不是挂本组件的实体。
  // 治的病同 ENG-04：**按 source 认人**的消费方（如 t2-matrix-duel 出招接缝按侧认人）碰上
  // 「一规则一个专属实体」的范式，source 永远是那个规则实体、不是行为主体；而一实体一组件
  // 又不许把多份 EventWhen 挤到主体上。**玩家能代发、AI 不能，这种不对称本身就是缺陷面。**
  // 缺省=挂本组件的实体（**零回归**）。空串 = 数据错，硬抛。
  source?: EntityId;
}

// ── event-when 产出 ── 信号事件：某 EventWhen 这帧触发了。每帧先清后标。
export interface Signal extends Component {
  readonly type: 'Signal';
  name: string; // 信号名（= EventWhen.signal）
  source: EntityId; // 发出该信号的 EventWhen 实体 id
  arg?: string; // 可选参数载荷（带参动作用·如「买哪件」card_42）：keybind 从 InputQueue 动作的 arg 透传。无参动作不挂此字段（旧内容形状/hash 不变）。
}

// ── effect-apply ── Condition→Event→**Effect** 的 Effect 侧：信号在场时施加一个声明式效果。
// 跑在 Commit 阶段（晚于产信号的 event-when=Update），其对 Flag/State/Resource 的写入由下一 tick 的
// 条件读到（标准离散反馈：一拍延迟）。"信号→置 flag→下帧条件读 flag" 即让多步机制涌现。
export interface Effect extends Component {
  readonly type: 'Effect';
  onSignal: string; // 当本 tick 存在此名 Signal 时触发
  // destroy-tagged（REQ-F-032 清场）：value=Tag 掩码，命中者全部发自销毁请求（运行时展开的实例
  // id 装配期不可知，单 targetEntity 寻址不可用——批量按 Tag 是唯一的数据寻址方式）。
  // set-flag-tagged（订单轮换姊妹条·批量 tag 域解锁）：tagMask 命中的实体里，Flag.id===targetId 者
  // 把 Flag.active 设为 value（set-flag 的批量版——一整片区域各自的 Flag 逐个置位，而非全局单点）。
  kind: 'set-flag' | 'set-flag-tagged' | 'modify-resource' | 'set-state' | 'set-sensor' | 'set-visible' | 'set-visible-tagged' | 'destroy' | 'destroy-tagged' | 'reset-timer';
  targetId: string; // 逻辑 kind：set-flag/set-flag-tagged→Flag.id；modify-resource→Resource.id；set-state→State.fsmId（按 id 全局/tag 批量定位）
  // 物理 kind（set-sensor/set-visible/destroy，REQ-008）：要改动的目标实体 id（按实体定位，不走全局 id 路由）。
  // 哨兵 '@signal-source'（REQ-F-041）：作用于触发本 onSignal 的 Signal.source 实体（可多个，同拍点两个席位
  // 各自生效）——「点谁卖谁/点谁选谁」的指针标配寻址；运行时实例 id 装配期不可知，信号源是唯一数据可达句柄。
  targetEntity?: EntityId;
  // set-visible-tagged（REQ-F-056，destroy-tagged 的可见性孪生）：tagMask=Tag 掩码，命中者全部把 Visibility.visible
  // 设为 value（布尔）。运行时实例 id 装配期不可知 → 单 targetEntity 寻址不可用，按 Tag 批量是唯一数据寻址；
  // 用于「阶段性显隐」：备战占位 token / 编辑模式 gizmo / 相位 UI 只在某 Flag/相位显示（区别于 destroy-tagged 的不可逆销毁）。
  // set-flag-tagged 复用同一字段：tagMask 挑实体、targetId 指名 Flag.id、value 设布尔——三卡（destroy/
  // visible/flag 的 tagged 批量版）共享同一套字段布局，零新增。
  tagMask?: number;
  // destroy-tagged 的保额（REQ-F-048①）：设了则不全清——按 PrefabOrigin.seq 升序（无戳者排最后）保留
  // 前 N 个（N=该全局 Resource.current），只清多余=**入场逆序**（超员自动卖/波次限额）。缺省=全清（原语义）。
  keepResource?: string;
  value: number | string | boolean; // modify-resource=数值增量；set-flag/set-flag-tagged/set-sensor/set-visible/set-visible-tagged=布尔；set-state=目标状态名
  // modify-resource 的运算（REQ-012，让「×倍率」成为数据）：'add'=current+value / 'mul'=current*value / 'set'=value。
  // 缺省 'add'（老数据零改动）；结算后照常钳进 [min,max]。Balatro 小丑的 ×mult、伤害倍率、属性乘区皆用此。
  op?: 'add' | 'mul' | 'set';
  // 结算顺序（REQ-012）：同信号命中的多个 Effect 按 order **升序**依次结算（乘法引入顺序依赖，顺序须是显式数据）。
  // 缺省 0；并列再按 Effect 所在实体 id 升序 tie-break → 确定、可审计、录放安全。
  order?: number;
  // 值取自资源/计数（REQ-013 + REQ-E-023①）：有则 modify-resource 的 v = base × factor，
  //   base = countOf != null ? 「Tag.flags & countOf 命中的实体数」 : resource[resourceId].current；
  //   factor = timesResourceId ? resource[timesResourceId].current : (coeff ?? 1)。
  // 否则用静态 value（老数据零改动）。countOf=按 Tag 掩码数实体（"每个 tagged 物 +X"：每小丑/每张牌/每钢铁牌…，
  // 纯整数计数、自描述零游戏侧记账，过弱-LLM 尺子）。解 score += chips×mult（timesResourceId）、Bull 每$1+2c（coeff）、
  // 星球升级 chips += level×增量、abstract 每小丑 +3 倍（countOf）。确定性同 op:mul（IEEE 乘）/ 纯计数。
  valueFrom?: { resourceId?: string; coeff?: number; timesResourceId?: string; countOf?: number };
  // 概率门（REQ-E-023②）：在场则命中 onSignal 后再掷世界 RandomSeed，nextRandom < num/den 才施用（否则跳过、roll 仍推进 RNG）。
  // 确定性：引擎种子 PRNG（同 random 原子，lockstep/录放安全），绝不 Math.random；无 RandomSeed→不施用（fail-closed）。
  chance?: { num: number; den: number };
}

// ── craft-recipe ── 配方/经济：信号到达且所有 costs 可负担时，**原子地**扣全部料 + 产出 gains + 置 flag/state。
// 「可负担才成交，否则整单不动」(REQ-C-003 主动合成/商店/建造) + 「一次原子改多项资源」(R14 选项批量改值)
// 归一为一个经济/批量改值 capability。effect-apply 的 modify-resource 是无条件单项加减；本能力是它的
// 条件化、原子化、多项化超集。跑在 Commit 阶段（消费 Update 产的 Signal）。确定性：只读/写确定数值。
export interface CraftRecipe extends Component {
  readonly type: 'CraftRecipe';
  onSignal: string; // 触发信号名（通常来自 clickable / event-when）
  costs: ReadonlyArray<{ id: string; amount: number }>; // 需扣除的资源（amount>0=消耗量）；空数组=无成本（纯批量产出）
  gains?: ReadonlyArray<{ id: string; amount: number }>; // 成交时同时增加的资源（可选；批量改值/合成产物）
  grantsFlag?: string; // 成交时置 true 的 Flag id（可选）
  grantsState?: { fsmId: string; value: string }; // 成交时设置的 State（可选）
}

// ── string-variable ── 命名字符串容器（周期表 X3：对话/换装/结局标识刚需）。
export interface StringVar extends Component {
  readonly type: 'StringVar';
  id: string; // 语义标识（如 "story-node"、"ending"、"player-name"）
  value: string;
}

// ── string-variable 写事件 ── 一次性设置 id=X 的字符串变量（全局按 id 路由，执行后被消费）。
export interface StringSet extends Component {
  readonly type: 'StringSet';
  id: string;
  value: string;
  // 同 ResourceModify.scope：'local'/'global'/缺省 auto。防变量遮蔽（Gemini Q4）。
  scope?: 'local' | 'global';
}

// ── game-flow（REQ-020）── 声明式状态机解释器：游戏流程 = 一份「状态 + 带 when 条件的转移」数据，
// 读起来像线性瀑布脚本，本质是数据（闭语法、固定解释器跑）。消解"散落的 EventWhen/Effect 实体"，
// 让最弱 LLM 也能一致产出流程（不变量②）。与 dialogue 同构（图遍历解释器），跨所有游戏复用（通关/场景/回合/波次/ante）。
// 红线：when 复用 ConditionExpr、do/onEnter 复用 Effect 动词子集——**不接受自由代码字符串**。
export interface FlowAction {
  kind: 'set-flag' | 'set-state' | 'modify-resource'; // 复用 Effect 动词（流程相关子集）
  targetId: string; // Flag.id / State.fsmId / Resource.id（按 id 全局定位）
  value?: number | boolean | string;
  op?: 'add' | 'set'; // modify-resource：add(默认) | set；钳 [min,max]
}
export interface FlowTransition {
  when?: ConditionExpr; // 满足即转移（复用现有条件树；缺省=always 恒真，线性瀑布用）
  after?: number; // 时序门（Matinee/sequence "wait"）：进入当前状态满 after 个 tick 才允许转移；与 when 是「与」
  to: string; // 目标状态 id
  do?: FlowAction[]; // 转移时一次性动作
}
export interface FlowState {
  id: string;
  onEnter?: FlowAction[]; // 进入该状态时一次性动作（edge）
  transitions?: FlowTransition[]; // 按数组序求值，首个 (when 成立 且 满 after) 者转移
}
export interface GameFlow extends Component {
  readonly type: 'GameFlow';
  id: string; // flow 标识（多 flow 区分）
  current: string; // 当前状态 id
  states: FlowState[]; // 状态机（声明式数据）
  entered?: boolean; // 内部：当前状态 onEnter 是否已跑（转移后置 false → 次拍跑新状态 onEnter）
  elapsed?: number; // 内部：进入当前状态后经过的 tick 数（驱动 after 时序门；转移时归零）
}

// ── self-rule（REQ-021）── 逻辑链的「实体本地(self)」作用域：对**每个挂 SelfRule 的实体**，用其**自身组件**
// 求 when 条件、对**自身**施 do 动作。补上引擎从没压过的"实体寻址轴"——前 5 游戏逻辑只碰全局单例(按 id 路由)，
// 自走棋等"动态多实体各自治"(prefab 展开的同模板单位、唯一 id 烘不进去)第一次需要它。mortal(自身≤阈值→死)、
// over-time 是它的特例；self-rule 是通用化。复用 ConditionExpr（但按 self 实体的组件求值，非全局 id）。
// 确定性：每实体只读/写**自身**组件 → 跨实体无干扰、与遍历序无关。
export interface SelfAction {
  kind: 'set-flag' | 'modify-resource' | 'set-state' | 'destroy' | 'spawn'; // 施于自身
  value?: number | boolean | string;
  op?: 'add' | 'set'; // modify-resource：add(默认) | set
  // kind:'spawn'（REQ-021 扩展，self 轴的 caster 对偶）：自身条件触发自身生成——
  // 发 SpawnRequest{templateId:template} 由 prefab-spawn 展开。位置 at:'self'=自身 Transform、
  // 'target'=自身 Relation(target) 的 Transform（无目标则不生成 → 目标存在性天然当作战斗门）。
  // 解 caster「全局信号」表达不了的"每单位各自按自身节拍生成"（三星合体/prefab 同模板多实例共用一份数据）。
  template?: string; // 模板 id（PrefabLibrary）
  at?: 'self' | 'target'; // 生成位置（缺省 'self'）
}
export interface SelfRule extends Component {
  readonly type: 'SelfRule';
  when: ConditionExpr; // 对**自身**组件求值（resource/flag/state/timer/string 读自身那一份；非全局 id 路由）
  do: SelfAction[]; // 条件成立时对自身施加
  once?: boolean; // true=上升沿只施一次（armed 迟滞，回落复位）；缺省=条件成立每拍施（level）
  armed?: boolean; // 内部（once 用）
  // 全局阶段门(REQ-F-035)：按**全局** id 求值的附加条件，与 when 取 AND（先求 whenGlobal，false 即整条跳过）。
  // 「实体自治但受全局相位约束」的标配：备战/结算不动手(in_combat)、回合制行动门、全场暂停、波次冻结。
  // 缺省不设=零迁移。同帧新鲜：flow 改相位 flag 当拍即被看见（self-rule runsAfter flow）。
  whenGlobal?: ConditionExpr;
}

// ── group-count（REQ-022）── 集合读：按 Tag 位掩码数全场实体 → 把数量写进一个 Resource（按 id 全局路由）。
// 实体寻址轴的「集合计数」端（self-rule 是 self 端）。羁绊层数/波次存活数/人口/阵营兵力全用它产数值；
// 越阈值发信号**不在本组件**——那是 event-when{resource cmp, mode:edge} 已有的语义（manifesto §4 先重组）。
// requiredTag 语义=「含齐」(ALL-bits，(flags&mask)===mask，与 Status.requireMask 同款)：单 bit=按类数（战士），
// 多 bit=交集（P1 的战士）——owner 维度即「再加一个归属 bit」，无需独立 owner 字段。缺省/0=数所有带 Tag 实体。
// 确定性：纯计数（与遍历序无关）+ set 写入钳 [min,max]。
export interface GroupCount extends Component {
  readonly type: 'GroupCount';
  countResource: string; // 计数写入的 Resource id（按 id 全局定位；每 tick set+钳限）
  requiredTag?: number; // Tag.flags 须含齐此掩码（ALL-bits）；缺省/0 = 所有带 Tag 的实体
  // 上板过滤（REQ-F-052）：true=只数带 HexPos 者（在板）；false=只数不带者（在席）；缺省=不过滤。
  // 「席/板分账」（自走棋备战席空余、在板人口）这类按放置状态分组的数量事实由此表达。
  // 专字段而非通用 with/withoutComponent——动态组件名读无法静态申报，同 F-049 申报纪律。
  onBoard?: boolean;
}

// ── modifier-stack（REQ-CAP 下沉）── 修正聚合栈：一张「字段表 + 每字段合并策略 + 条件门控」的通用聚合器。
// t2-stats 是它的**实体属性特例**（只做 (base+Σadd)×Πmul、无门控、无 max/or/floor 字段策略）；
// 修正栈把 game-e 小丑计分（add/mul chips/mult/money + countTag + 门控）、game-g 天罡 TengangFx（add/max）、
// game-g 地煞 DishaFx（sum/max/or 逐字段策略）这类「一堆声明式贡献 → 一张聚合总表」统一为纯数据。
//
// ModifierSource = **一条**修正行（一实体一条；系统收集全场所有 ModifierSource 聚合成一张 ModifierTotals）。
// gate 复用 ConditionExpr（读 Resource/Flag/State…全局值）；valueFrom 让贡献量取自某 Resource（× scale）。
// 应用序铁律（对齐 clash-resolve pEff：base+Σadd → ×Πmul → floor → clamp）：**add → mul → max → min → or → floor**，
// 组内先 order 升序、再 id 升序（乘性非交换 → 必须定序）→ 确定/录放安全。
export type ModifierOp = 'add' | 'mul' | 'max' | 'min' | 'or' | 'floor';
export interface ModifierSource extends Component {
  readonly type: 'ModifierSource';
  id: string; // 该修正行的稳定标识（同 order 时 id 升序 tie-break → 确定聚合序）
  target: string; // 作用的字段 id（如 'mult' / 'powerAll' / 'homeHp'）；聚合结果按 target 归入 ModifierTotals.totals
  op: ModifierOp; // 合并算子：add 累加 / mul 累乘 / max 取大 / min 取小 / or 布尔或 / floor 末端下限钳
  value?: number; // 静态贡献量（缺省 0；op:'or' 缺省视作 true，value=0 视作 false）
  valueFrom?: { resourceId: string; scale?: number }; // 动态量：value = Resource(resourceId).current × (scale ?? 1)（如「每 $1 +2 筹」）
  gate?: ConditionExpr; // 门控：条件不成立则本行不参与聚合（复用 condition 求值器，读全局 Resource/Flag/State…）
  order?: number; // 聚合序（缺省 0；同 op 相位内按 order 升序、再 id 升序）
}
// ── modifier-stack 产出 ── 聚合总表（系统每 tick 从全场 ModifierSource 重算写入）。
// 数值字段起点 = base（消费方可注入，缺省 0；纯 mul 场景由消费方 seed base 后 ×）；纯 or 字段起点 false。
export interface ModifierTotals extends Component {
  readonly type: 'ModifierTotals';
  totals: Record<string, number | boolean>; // target → 聚合值（消费方读取后与自身 base 结合）
}

// ── stat-bind（REQ-SURVIVOR被动轴）── 属性桥/投影器：把 ModifierTotals(世界单例聚合值) 或 Stats(本实体
// effective 值) 按 key 取出，投影到本实体**任意其它组件**的某个字段（如 Controllable.speed、Shape.radius、
// Timer.duration、Resource.max）。modifier-stack/stats 各自只产出「一张总表 / 一份 effective」，谁都不知道
// 该写回哪个具体组件字段——这道「聚合值 → 具体组件字段」的接线，此前无处表达（游戏层只能手写 system 抄字段）。
// 一条 binding = 一次接线：source 选读源（ModifierTotals 全局单例 或 Stats 本实体）、key 选源里的字段、
// component+field 选投影目的地。
//
// ⚠️ 幂等投影铁律：目标字段 = binding.base（**不是**当前字段值）与源值按 op 组合，每 tick 从 base 重算。
// 绝不 `c[field] = c[field] * v` 这类读当前字段再改——那样每 tick 复利滚雪球，几拍就爆、破确定性
// （同 modifier-stack/stats 的"每帧从源头全量重算"纪律，见 aggregateModifiers/computeEffective 注释）。
// op：set(=v) / mul(=base×v) / add(=base+v) / div(=base÷v，防除零回退 base；攻速→冷却的逆映射专用)。
//
// 定序：读 ModifierTotals/Stats 必须排在 modifier-stack/stat-apply 之后（消费它们的产出）；同时因
// modifier-stack 自身也读 Resource/Timer（valueFrom/gate），而 stat-bind 又写 Resource/Timer 等目标组件，
// 三者会连成 resource-apply→modifier-stack→stat-bind→resource-apply 的传递环——见 stat-bind.ts 系统声明
// 的 runsAfter 注释（第二坑：撞环，非本文件关注点，此处只声明数据形状）。
export interface StatBind extends Component {
  readonly type: 'StatBind';
  bindings: {
    source: 'ModifierTotals' | 'Stats'; // ModifierTotals=读世界单例聚合表 totals[key]；Stats=读本实体 Stats.effective[key]
    key: string; // 源里取哪个字段（如 'moveSpeed'/'range'/'attackSpeed'/'maxHp'）
    component: string; // 投影到本实体哪个组件（如 'Controllable'/'Steering'/'Shape'/'Timer'/'Resource'）
    field: string; // 组件的哪个字段（如 'speed'/'radius'/'duration'/'max'）
    op?: 'set' | 'mul' | 'add' | 'div'; // 合并算子，缺省 'set'
    base?: number; // mul/add/div 的基数（幂等投影的锚点，见上）；set 不用
  }[];
}

// ── timeline（REQ-CAP 下沉）── 演出时间线：sim 侧**确定性 tick 调度器**（绝不走墙钟 → lockstep 红线）。
// 「何时发生什么」= 一份 cue 数据（at:tick + do:闭集动作）；表现层（UI/渲染）订阅 cue 发的信号自行演。
// 分工铁律：**timeline 管「何时」、tween 管「怎么动」**，互不越权——cue 只发信号/写 Flag/写 Resource/发
// SpawnRequest 四种闭集动作，绝不在 handler 里塞自由演出逻辑（信号铁律）。
// cue 的四种 do（闭集）：
//   signal → 发 Signal{name,arg?}（表现层/caster/effect-apply 订阅）· flag → 写 Flag(按 id 全局路由)
//   resource → 写 Resource(op:add/set·钳 [min,max]) · spawn → 发 SpawnRequest{templateId,x,y}（prefab 展开）
export type TimelineCueDo =
  | { readonly kind: 'signal'; readonly signal: string; readonly arg?: string }
  | { readonly kind: 'flag'; readonly flagId: string; readonly value: boolean }
  | { readonly kind: 'resource'; readonly resourceId: string; readonly amount: number; readonly op?: 'add' | 'set' }
  | { readonly kind: 'spawn'; readonly templateId: string; readonly x: number; readonly y: number };
export interface TimelineCue {
  readonly at: number; // 触发 tick（相对播放起点；系统内按 at 升序、同 at 按书写序 tie-break → 确定）
  readonly do: TimelineCueDo;
}
export interface Timeline extends Component {
  readonly type: 'Timeline';
  id: string; // 时间线标识（播完发 `timeline:done:<id>` 信号）
  cues: TimelineCue[]; // 演出编排（数据）
  playOnSignal: string; // 收到此名 Signal → 从头播放（t=0）
  skipOnSignal?: string; // 收到此名 Signal → 确定性快进：一次 tick 内按序补发全部剩余 cue（回放安全·终态与逐 tick 一致）
  speed?: number; // 每 tick 游标推进量（缺省 1；>1 一 tick 内可跨多个 cue）
  loop?: boolean; // 播完是否回到 t=0 重播（缺省 false）
}
// ── timeline 运行态 ── 系统写；随 snapshot 走 → lockstep/录放确定。
export interface TimelinePlayback extends Component {
  readonly type: 'TimelinePlayback';
  t: number; // 播放游标（tick）
  playing: boolean; // 是否在播
  cursor: number; // 下一个待发 cue 的（排序后）下标
  seq: number; // 瞬时发射实体唯一 id 计数器（单调；避免 id 复用冲突）
  emitted: string[]; // 上一 tick 发射的瞬时实体 id（signal/spawn）；下一 tick 开头销毁 → 无泄漏
}

// ── debug-trace（owner 2026-08-06 立·全库日志基准守则）──────────────────────
// 「逻辑写到哪，trace 记到哪」的落点：**opt-in 单例**——世界里挂了 DebugTrace 才记，没挂全程 no-op
// （零开销·零污染），同 ScoreTrace 先例。默认不开；出 bug 时挂上它跑一遍即可重建判定路径。
// **必须排除出 hashSnapshot**（`src/net/determinism.ts` 的 NON_DETERMINISTIC）——否则"开日志"本身
// 就改 hash，lockstep 当场误报 desync（Mesh3D/Coachmark 漏登记的旧案，见该文件注释）。
// 时间戳一律用 tick 序号，**禁墙钟**（Date.now 会让回放对不上）。
export interface TraceEvent {
  readonly seq: number; // append 序（= 记录时的数组长度，确定性）
  readonly tick: number; // 第几拍（**禁墙钟**：回放要对得上）
  readonly system: string; // 哪个系统记的（= System.id）
  // 四类闭集（守则写死·别的一律不记）：
  //   decision  = 若干条路里选了哪一条（查表命中 / 条件真假 / 优先级裁决 / 随机抽取结果）
  //   transition= 状态跳转（FSM/相位/回合）：what 写 "from→to"
  //   reject    = 拒收或降级（落盘门拒 / 退化成缺省 / 守卫跳过 / 找不到目标 no-op）
  //               —— **凡是「什么都没发生」的分支必须记一条**，它在外部完全不可见
  //   commit    = 对世界的实际写入摘要（改了哪个 id、增量多少、落在哪个实体）
  readonly kind: 'decision' | 'transition' | 'reject' | 'commit';
  readonly what: string; // 发生了什么（标量文本·禁 dump 大对象）
  readonly why?: string; // 依据的关键输入（可选·标量文本）
}
export interface DebugTrace extends Component {
  readonly type: 'DebugTrace';
  events: TraceEvent[];
  max?: number; // 环形上限（缺省 2000）：超了丢最旧的，防长跑撑爆内存
  // 当前拍号：**由宿主 run loop 显式推进**（`bumpTraceTick`），不设专职系统——
  // 相位内先后无法保证，专职系统会让同一拍的记录拿到错位的号；而宿主才真正知道帧号。
  // 宿主不推进也无妨：全为 0，只是失去按拍分组，seq 仍给出全序。**禁墙钟**（Date.now 会让回放对不上）。
  tick?: number;
}
