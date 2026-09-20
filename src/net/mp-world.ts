import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Controllable, Shape, Color } from '@engine/protocol/components.js';
import { driftCapability } from '../assembly/playground.assembly.js';

// 玩家配色（按 join 槽位分配）：醒目色，与灰调背景区分。
export const PLAYER_COLORS = [0xffffff, 0xef4444, 0xfacc15, 0x22c55e, 0xa855f7, 0xf97316];

const SPAWNS = [
  { x: 320, y: 200 }, { x: 160, y: 200 }, { x: 480, y: 200 },
  { x: 320, y: 110 }, { x: 320, y: 300 }, { x: 160, y: 110 },
];

// 渲染所需的最小投影（喂给 canvas 画）。
export interface RenderEnt {
  id: string;
  x: number;
  y: number;
  kind: 'box' | 'circle';
  w: number;
  h: number;
  r: number;
  color: number;
}

export function playerEntityId(playerId: string): string {
  return `player:${playerId}`;
}

// 多人世界：3 个灰调背景形状（drift 自动移动+环绕，无需输入 → 天然同步）
// + 动态加入的玩家方块。所有对端用**相同构建顺序** → 相同实体迭代序 → 相同哈希。
export function buildMpWorld(): World {
  const w = new World();
  for (const s of driftCapability.systems) w.addSystem(s);

  spawnScenery(w, 'scene:a', 80, 90, 2.2, 0.7, { type: 'Shape', kind: 'box', width: 46, height: 46 } as Shape, 0x475569);
  spawnScenery(w, 'scene:b', 330, 250, -1.6, 1.2, { type: 'Shape', kind: 'circle', radius: 26 } as Shape, 0x334155);
  spawnScenery(w, 'scene:c', 520, 150, -2.4, -1.0, { type: 'Shape', kind: 'box', width: 32, height: 32 } as Shape, 0x64748b);
  return w;
}

function spawnScenery(w: World, id: string, x: number, y: number, vx: number, vy: number, shape: Shape, tint: number): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx, vy, angular: 0 } as Velocity);
  w.addComponent(id, shape);
  w.addComponent(id, { type: 'Color', tint, alpha: 1 } as Color);
}

// 在 slot 槽位加入一个玩家方块（Controllable → 由 applyCommands 按输入驱动）。
export function addPlayer(w: World, slot: number, playerId: string): void {
  const id = playerEntityId(playerId);
  if (w.getAllEntities().includes(id)) return;
  const spawn = SPAWNS[slot % SPAWNS.length];
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x: spawn.x, y: spawn.y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Controllable', playerId, speed: 3 } as Controllable);
  w.addComponent(id, { type: 'Shape', kind: 'box', width: 34, height: 34 } as Shape);
  w.addComponent(id, { type: 'Color', tint: PLAYER_COLORS[slot % PLAYER_COLORS.length], alpha: 1 } as Color);
}

export function renderEnts(w: World): RenderEnt[] {
  const out: RenderEnt[] = [];
  for (const id of w.getAllEntities()) {
    const t = w.getComponent<Transform>(id, 'Transform');
    if (!t) continue;
    const s = w.getComponent<Shape>(id, 'Shape');
    const c = w.getComponent<Color>(id, 'Color');
    out.push({
      id,
      x: t.x,
      y: t.y,
      kind: s && (s.kind === 'box' || s.kind === 'circle') ? s.kind : 'box', // Legacy MP view only draws box/circle; other visuals remain placeholders. Collision is unaffected.
      w: s?.width ?? 20,
      h: s?.height ?? 20,
      r: s?.radius ?? 12,
      color: c?.tint ?? 0xffffff,
    });
  }
  return out;
}
