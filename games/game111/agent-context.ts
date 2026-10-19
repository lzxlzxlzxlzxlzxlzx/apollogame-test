// game111 —— prompt 组装（capability-plan §4 例外②·Lead 2026-09-12「有条件准」）。
//
// **裁决条件（写死·复查门按此核）**：`AgentContext` 的**形状归引擎**（`@engine/protocol/agent`），
// 游戏层只负责**填**它——不得自定义一套平行的上下文结构。理由：形状一旦在游戏层自定义，第二个 AI 游戏
// 来的时候就不是「下沉一个 helper」，而是「两套不兼容的上下文格式二选一」。
//
// 本文件因此**只有一件事**：把世界的一份只读切片填进引擎给定的形状。
// 红线：不写世界 · 不读墙钟 · 无裸 Math.random · 不判闭集（闭集裁决归 t2-intent-barrier）。
import type { IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { AgentContext, AgentMemoryView } from '@zerocraft/engine/engine/protocol/agent.js';
import type { Resource, State } from '@zerocraft/engine/engine/protocol/components.js';
import { recall } from '@zerocraft/engine/skills/tier2/memory.js';
import { ZONE_NAME } from './blueprint.js';
import {
  NPCS, NEEDS, INTENT_VERBS, ZONES, needId, zoneFsm,
} from './world-data.js';

/** 检索几条记忆进 prompt。 */
export const RECALL_K = 5;

const NPC_BY_ID = new Map(NPCS.map((n) => [n.id, n]));

function readResource(world: IWorld, resourceId: string): number | undefined {
  for (const [eid] of world.query('Resource')) {
    const r = world.getComponent<Resource>(eid, 'Resource');
    if (r?.id === resourceId) return r.current;
  }
  return undefined;
}

function readState(world: IWorld, fsmId: string): string | undefined {
  for (const [eid] of world.query('State')) {
    const st = world.getComponent<State>(eid, 'State');
    if (st?.fsmId === fsmId) return st.current;
  }
  return undefined;
}

/** 谁和我在同一个分区（不含自己·按 id 升序·确定性）。 */
export function coLocated(world: IWorld, npcId: string): string[] {
  const mine = readState(world, zoneFsm(npcId));
  if (mine === undefined) return [];
  return NPCS
    .filter((n) => n.id !== npcId && readState(world, zoneFsm(n.id)) === mine)
    .map((n) => n.id)
    .sort();
}

/**
 * 填一份 `AgentContext` —— 世界的只读扁平切片。
 *
 * 内容对位 framework.md §4.2 的 `PERCEIVE` 相位：需求读数 + 同区在场者 + top-K 记忆 + 人设 + 地点提示。
 * 动机**不落世界**（owner 2026-09-12 判 ④=B）——它由这里的「需求 + 记忆」现推，只活在 prompt 里。
 */
export function buildAgentContext(world: IWorld, npcId: string, turn: number): AgentContext {
  const card = NPC_BY_ID.get(npcId);
  const zone = readState(world, zoneFsm(npcId));

  const needs: Record<string, number> = {};
  for (const n of NEEDS) {
    const v = readResource(world, needId(npcId, n.key));
    if (v !== undefined) needs[n.key] = v;
  }

  const memories: AgentMemoryView[] = recall(world, `npc-${npcId}`, { k: RECALL_K, now: turn })
    .map((e) => ({
      id: e.id, subject: e.subject, object: e.object, turn: e.turn,
      strength: e.strength, tags: [...e.tags], source: e.source,
    }));

  return {
    npcId,
    turn,
    verbs: INTENT_VERBS,
    needs,
    perceived: coLocated(world, npcId),
    memories,
    persona: card?.persona,
    hints: {
      zone: zone ?? '',
      zoneName: zone !== undefined ? (ZONE_NAME[zone] ?? zone) : '',
      // 分区闭集也进提示——真后端据此约束 move_to 的参数，减少闭集外产出（被拒是有成本的）。
      zones: ZONES.map((z) => `${z.id}(${z.name})`).join(','),
    },
  };
}
