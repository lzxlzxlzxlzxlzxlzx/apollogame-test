// NPC 决策服务（基础设施·确定性 sim 之外）—— 外部 AI 当**输入源**的入口端口（REQ-111-AINPC）。
//
// 契约形状在 `@engine/protocol/agent`（Intent / AgentContext / NpcAgentPort）：生产者在这里、
// 消费者在 `src/skills/tier2/intent-barrier`，形状归最底层两边都不跨层。
// 无真后端 / 无网 CI / 断网降级用 `NullNpcAgentPort`（确定性桩），接真后端换 `HttpNpcAgentPort`——契约不变，
// 与音频 / 资产 / AIGP 端口同哲学。**端口不写世界**：落地（校验闭集 + 排序 + 超期降级）全归 barrier。
export type { NpcAgentPort, AgentContext, AgentMemoryView, Intent, IntentVerbSpec } from '@engine/protocol/agent.js';
export { NullNpcAgentPort, lowestNeed } from './null-npc-agent.js';
export type { NullNpcAgentConfig, NullAgentRule } from './null-npc-agent.js';
export { HttpNpcAgentPort, parseIntents } from './http-npc-agent.js';
export type { HttpNpcAgentConfig } from './http-npc-agent.js';
