// ═══════════════════════════════════════════════════════════════
//  Protocol Layer — 外部决策者（LLM / 远端 AI）与确定性 sim 之间的**共享契约**
//  （REQ-111-AINPC · game111 framework.md §1.2 · §2）
//
//  架构基石一句话：**LLM 不是解释器，LLM 是输入源。** 一个 LLM 驱动的 NPC 在架构上与一个
//  远端人类玩家完全同构——都只能吐「意图」，都走同一条 `InputSource → 排序 → 应用` 的路。
//  世界层因此保持确定性：录的是**意图流**不是模型，重放不调模型即 bit 一致。
//
//  为什么这两个形状落在 protocol 而不是落在端口或 barrier 里：
//  生产者在 `src/services/npc-agent`（sim 外·异步·可失败），消费者在 `src/skills/tier2/intent-barrier`
//  （sim 内·确定性）。形状若归任一侧，另一侧就得跨层依赖；归 protocol 则两侧都只依赖最底层。
//  这也是 Lead 批 game111 capability-plan §4 第二条例外时写死的条件：**AgentContext 的形状归引擎，
//  游戏层只负责填**——否则第二个 AI 游戏来的时候不是「下沉一个 helper」，而是「两套不兼容格式二选一」。
// ═══════════════════════════════════════════════════════════════

/**
 * 一条意图 —— 外部决策者唯一允许的输出形状（闭集动词 + 定长标量参数）。
 *
 * 三条红线（framework §2.2）：
 * ① **闭集**：`verb` 必须在数据表声明的动词表内，参数个数必须对得上；不合的由 barrier 当场拒收并记 `reject`。
 * ② **无自由文本入世界结构**：模型吐的 JSON 绝不直接反序列化成组件；只有校验过的 Intent 进世界。
 * ③ **标量参数**：`args` 只放字符串/数字（进 hash 要可规范化序列化），不放对象/数组/undefined。
 */
export interface Intent {
  /** 产生该意图的 NPC 实体 id（= barrier 的排序键，全序由它决定）。 */
  readonly npcId: string;
  /** 动词（闭集成员，如 'move_to' / 'talk_to' / 'rest'）。 */
  readonly verb: string;
  /** 该动词的定长标量参数（缺省 = 无参动词）。 */
  readonly args?: readonly (string | number)[];
  /** 产生该意图时的回合号（整数·**禁墙钟**）。 */
  readonly turn: number;
}

/** 动词闭集的一条声明（纯数据·由游戏的 manifest 给）。 */
export interface IntentVerbSpec {
  readonly verb: string;
  /** 参数个数（定长）。缺省 0 = 无参动词。 */
  readonly arity?: number;
}

/** 一条检索到的记忆（给端口看的**扁平切片**，不是 `Memory` 组件本身——端口不碰世界）。 */
export interface AgentMemoryView {
  readonly id: string;
  readonly subject: string;
  readonly object?: string;
  readonly turn: number;
  readonly strength: number;
  readonly tags: readonly string[];
  /** 这条记忆从哪来（玩家某次发言 / 某个事件 / `share:<fromId>`）——链式影响的可观测落点。 */
  readonly source: string;
}

/**
 * 决策入参 —— 世界的一份**只读扁平切片**。
 *
 * 刻意不传 `IWorld`：端口在 sim 之外，给它世界句柄就等于给它写世界的能力，
 * 而「端口不写世界」是本件的边界（game111 requests.md REQ-111-ENG-01 原文）。
 * 字段全部 POD + readonly，可直接 `JSON.stringify` 发给后端。
 */
export interface AgentContext {
  /** 决策主体。 */
  readonly npcId: string;
  /** 当前回合号（整数）。 */
  readonly turn: number;
  /** 可用动词闭集（端口要据此约束输出；真后端把它写进 prompt）。 */
  readonly verbs: readonly IntentVerbSpec[];
  /** 需求/资源读数（精力 / 心情 / 社交欲…·整数）。 */
  readonly needs?: Readonly<Record<string, number>>;
  /** 本回合可感知到的对象（同区在场者 / 物件 id）。 */
  readonly perceived?: readonly string[];
  /** 检索到的相关记忆（top-K·已由 `t2-memory` 按整数打分排好序）。 */
  readonly memories?: readonly AgentMemoryView[];
  /** 人设卡摘要（性格一句话等·纯文本）。 */
  readonly persona?: string;
  /** 游戏侧附加的标量提示（分区名、当前事件名…）。 */
  readonly hints?: Readonly<Record<string, string | number>>;
}

/**
 * 外部 NPC 决策端口。**唯一方法**，照 `EnginePort` / `AishePort` 的窄契约哲学。
 *
 * 实现契约（三条，`null` / `http` 两个实现都守）：
 * ① **不写世界**——只产 `Intent[]`，落地归 `t2-intent-barrier`。
 * ② **不抛**——后端挂了返回空数组或带 `error` 的结果，绝不让异步异常冲进 sim。
 * ③ **不读墙钟、不用裸 `Math.random`**——要随机就消费传入的整数（`AgentContext.turn` 等）。
 */
export interface NpcAgentPort {
  decide(ctx: AgentContext): Promise<readonly Intent[]>;
}
