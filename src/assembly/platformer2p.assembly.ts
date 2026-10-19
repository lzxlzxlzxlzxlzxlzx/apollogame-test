import type { WorldBlueprint } from './demo.assembly.js';
import type { KeyMap } from '@net/host/index.js';
import {
  transformCapability,
  velocityCapability,
  accelerationCapability,
  shapeCapability,
  colorCapability,
  overlapDetectCapability,
} from '@atom-skills/index.js';
import { accelApplyCapability, motionApplyCapability } from '@skills/tier1/index.js';
import { collisionResolveCapability, groundSenseCapability, jumpCapability, boundsClampCapability } from '@skills/tier2/index.js';

// ═══════════════════════════════════════════════════════════════
//  本地双人平台跳跃 —— 同一份引擎，两名玩家各跑各的
// ═══════════════════════════════════════════════════════════════
//  双人几乎"免费"：net 层本就为多玩家而建——Controllable 按 playerId 路由，
//  applyCommands 按 playerId 定序应用。这里只是放第二个 Controllable 实体 +
//  第二个键位的输入源（见 main.tsx 的 MultiInputSource）。
//
//  键位：玩家1（橙）A/D 走、W 跳；玩家2（青）←/→ 走、↑ 跳。
// ═══════════════════════════════════════════════════════════════

export const P1_KEYMAP: KeyMap = { KeyA: { dx: -1 }, KeyD: { dx: 1 }, KeyW: { jump: true } };
export const P2_KEYMAP: KeyMap = { ArrowLeft: { dx: -1 }, ArrowRight: { dx: 1 }, ArrowUp: { jump: true } };

const GROUND_TINT = 0x4b5563;
const PLATFORM_TINT = 0x6b7280;

export const platformer2pBlueprint: WorldBlueprint = {
  capabilities: [
    transformCapability,
    velocityCapability,
    accelerationCapability,
    shapeCapability,
    colorCapability,
    accelApplyCapability,
    motionApplyCapability,
    overlapDetectCapability,
    groundSenseCapability,
    collisionResolveCapability,
    jumpCapability,
    boundsClampCapability,
  ],
  entities: {
    ground: {
      Transform: { x: 320, y: 372, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 620, height: 48 },
      Color: { tint: GROUND_TINT, alpha: 1 },
    },
    platformLeft: {
      Transform: { x: 150, y: 280, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 150, height: 24 },
      Color: { tint: PLATFORM_TINT, alpha: 1 },
    },
    platformRight: {
      Transform: { x: 500, y: 210, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 150, height: 24 },
      Color: { tint: PLATFORM_TINT, alpha: 1 },
    },
    // 玩家1（橙）：A/D 走、W 跳
    player1: {
      Transform: { x: 240, y: 80, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Acceleration: { ax: 0, ay: 0.6 },
      Controllable: { playerId: 'p1', speed: 3 },
      Shape: { kind: 'box', width: 30, height: 30 },
      Color: { tint: 0xfb923c, alpha: 1 },
      Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
    },
    // 玩家2（青）：←/→ 走、↑ 跳
    player2: {
      Transform: { x: 400, y: 80, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 0, vy: 0, angular: 0 },
      Acceleration: { ax: 0, ay: 0.6 },
      Controllable: { playerId: 'p2', speed: 3 },
      Shape: { kind: 'box', width: 30, height: 30 },
      Color: { tint: 0x22d3ee, alpha: 1 },
      Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
    },
  },
};
