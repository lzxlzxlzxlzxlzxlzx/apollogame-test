import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { GAME105_SKINS } from './game-105-art.js';

export const TOWER_LAYERS = 18;
export const BLOCKS_PER_LAYER = 3;
export const BLOCK_COUNT = TOWER_LAYERS * BLOCKS_PER_LAYER;
export const BLOCK_LENGTH = 2.1;
export const BLOCK_WIDTH = 0.7;
export const BLOCK_HEIGHT = 0.42;
/** A real tabletop sits just above the renderer fallback floor, avoiding coincident Cannon contact planes. */
export const TABLE_TOP = 0.02;
export const TOWER_LAYOUT_SEED = 105031;
export const TOWER_DIMENSION_TOLERANCE = { length: 0.007, width: 0.015, height: 0.01 } as const;

export const BLOCK_CHANNELS = {
  pink: { label: '樱粉', score: 1, tint: 0xe9a2ba, count: 20 },
  purple: { label: '星紫', score: 2, tint: 0xa98bd7, count: 16 },
  blue: { label: '夜蓝', score: 3, tint: 0x6d91c9, count: 12 },
  gold: { label: '流金', score: 5, tint: 0xe8c568, count: 6 },
} as const;
export type TowerChannel = keyof typeof BLOCK_CHANNELS;

export const PHYSICS_WORLD = {
  gravity: -9.82,
  restitution: 0,
  friction: 0.58,
  solverIterations: 40,
} as const;

export const PULL_FEEL = { maxForce: 420 } as const;

export type TowerAxis = readonly [number, number, number];

export interface TowerBlock {
  id: string;
  layer: number;
  slot: number;
  axis: TowerAxis;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  channel: TowerChannel;
  score: number;
  tint: number;
}

export interface TowerLayout {
  seed: number;
  blocks: readonly TowerBlock[];
}

const SLOT_SPACING = BLOCK_WIDTH * (1 + TOWER_DIMENSION_TOLERANCE.width);
const GAPS = [-SLOT_SPACING, 0, SLOT_SPACING] as const;

function seededUnit(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 0x6d2b79f5)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
}

function withTolerance(nominal: number, tolerance: number, seed: number, index: number): number {
  return nominal * (1 + (seededUnit(seed, index) * 2 - 1) * tolerance);
}

function channelsForSeed(seed: number): TowerChannel[] {
  const channels = (Object.entries(BLOCK_CHANNELS) as [TowerChannel, typeof BLOCK_CHANNELS[TowerChannel]][])
    .flatMap(([channel, config]) => Array.from({ length: config.count }, () => channel));
  // Keep the first documented S4 specimen pink; shuffle the remaining distribution by seed.
  for (let index = channels.length - 1; index > 1; index--) {
    const other = 1 + Math.floor(seededUnit(seed, index + 200) * index);
    [channels[index], channels[other]] = [channels[other]!, channels[index]!];
  }
  return channels;
}

/** Creates a replayable physical sample: seed is the only source of dimensional variation. */
export function createTowerLayout(seed: number): TowerLayout {
  const blocks: TowerBlock[] = [];
  const channels = channelsForSeed(seed);
  let y = TABLE_TOP;
  for (let layer = 0; layer < TOWER_LAYERS; layer++) {
    const height = withTolerance(BLOCK_HEIGHT, TOWER_DIMENSION_TOLERANCE.height, seed, layer * 7);
    const alongX = layer % 2 === 0;
    for (let slot = 0; slot < BLOCKS_PER_LAYER; slot++) {
      const index = layer * BLOCKS_PER_LAYER + slot;
      const channel = channels[index]!;
      const channelConfig = BLOCK_CHANNELS[channel];
      blocks.push({
        id: `g105-block-${String(layer).padStart(2, '0')}-${String(slot).padStart(2, '0')}`,
        layer,
        slot,
        axis: alongX ? [1, 0, 0] : [0, 0, 1],
        x: alongX ? 0 : GAPS[slot]!,
        y: y + height / 2,
        z: alongX ? GAPS[slot]! : 0,
        length: withTolerance(BLOCK_LENGTH, TOWER_DIMENSION_TOLERANCE.length, seed, index * 7 + 1),
        width: withTolerance(BLOCK_WIDTH, TOWER_DIMENSION_TOLERANCE.width, seed, index * 7 + 2),
        height,
        channel,
        score: channelConfig.score,
        tint: channelConfig.tint,
      });
    }
    y += height;
  }
  return { seed, blocks };
}

// S3's fixed sample is seeded rather than an all-equal tower, so probes remain reproducible.
export const TOWER_LAYOUT = createTowerLayout(TOWER_LAYOUT_SEED);
export const TOWER_BLOCKS = TOWER_LAYOUT.blocks;

export function towerBlueprint(): WorldBlueprint {
  const entities: WorldBlueprint['entities'] = {
    'g105-physics': { PhysicsWorld3D: { ...PHYSICS_WORLD } },
    'g105-table': {
      Transform3D: { x: 0, y: TABLE_TOP - 0.35, z: 0 },
      Mesh3D: { shape: 'box', width: 12, height: 0.7, depth: 12, tint: 0x4c2d2c },
      Material3D: { preset: 'wood', color: 0x4c2d2c, roughness: 0.46, map: GAME105_SKINS.tableOak, tiling: { repeat: 5 } },
      RigidBody3D: { shape: 'box', mass: 0, restitution: 0, friction: PHYSICS_WORLD.friction },
    },
    'g105-camera': {
      Camera3D: { yaw: 0.7, pitch: 0.52, distance: 15, pivotX: 0, pivotY: 3.6, pivotZ: 0, pitchMin: 0.28, pitchMax: 0.86 },
    },
    'g105-key': { Light3D: { kind: 'directional', color: 0xffd4bd, intensity: 2.1, dirX: -0.4, dirY: -1, dirZ: -0.5, castShadow: true } },
    // The CSS room replaces the former Sky3D environment, so retain the tower's readable fill light explicitly.
    'g105-fill': { Light3D: { kind: 'ambient', color: 0xffd8e6, intensity: 2.35 } },
    // SMAA is preferable to temporal AA here: it smooths the tower's hard edges without ghosting during physical pulls.
    'g105-post': { Post3D: { aa: true, ao: { intensity: 0.8, radius: 3 }, grade: { exposure: 1.04, contrast: 1.04, saturation: 1.04, brightness: 0, tint: 0xfff1eb }, vignette: { intensity: 0.28, smoothness: 0.55, color: 0x281827 } } },
  };

  for (const block of TOWER_BLOCKS) {
    // Cannon currently derives box colliders from Mesh3D dimensions, not Transform3D rotation.
    // Express each layer's orientation by swapping the rectangular box dimensions, so visual and
    // physical long axes stay identical without a platform-level rotation bridge.
    const width = block.axis[0] ? block.length : block.width;
    const depth = block.axis[2] ? block.length : block.width;
    entities[block.id] = {
      Transform3D: { x: block.x, y: block.y, z: block.z },
      Mesh3D: { shape: 'box', width, height: block.height, depth, tint: block.tint },
      // The shared grain leaves each channel's existing tint as an independent material parameter.
      Material3D: { preset: 'wood', color: block.tint, roughness: 0.52, normalMap: GAME105_SKINS.blockWoodGrain, tiling: { repeat: 2 } },
      RigidBody3D: { shape: 'box', mass: 0.9, restitution: 0, friction: PHYSICS_WORLD.friction, settleSignal: 'g105-settled', toppleSignal: 'g105-toppled', toppleTilt: Math.PI / 4 },
      Pickable3D: { signal: 'g105-pick', hover: true },
    };
  }

  return { capabilities: [], entities };
}
