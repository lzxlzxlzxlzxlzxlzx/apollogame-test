import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { ComponentDataMap } from './component-map.js';
import {
  transformCapability,
  velocityCapability,
  shapeCapability,
  spriteCapability,
  timerCapability,
  destroyCapability,
  overlapDetectCapability,
} from '@atom-skills/index.js';
import { motionApplyCapability, lifetimeCapability } from '@skills/tier1/index.js';

// 实体蓝图 = 组件名【闭集】→ 组件数据。
// v1 牙=组件名闭集：写错/拼错/编造组件名 → 编译期报错（替代旧 `{[k:string]:Omit<Component,'type'>}`≈`{[k]:{}}` 的零校验）。
// 值暂为 Record<string,unknown>（放松）：现有游戏蓝图大量用无类型 helper(返回 Record<string,unknown>) 构造组件数据，
// 收紧到逐字段(Partial<ComponentDataMap[K]>)会误伤游戏层——字段级牙待游戏侧把 helper 类型补上后再收（phase 2）。
export type EntityBlueprint = { [K in keyof ComponentDataMap]?: Record<string, unknown> };

export interface WorldBlueprint {
  capabilities: CapabilityDefinition[];
  entities: Record<string, EntityBlueprint>;
  /** 蓝图元数据（P2d）：tickRate 是玩法数据（能力全按 tick 计时）——写进蓝图，宿主/联机据此建时钟并进握手指纹。 */
  meta?: BlueprintMeta;
}

export interface BlueprintMeta {
  /** 模拟频率（Hz）。缺省 60。 */
  tickRate?: number;
}

// 演示蓝图：子弹向右飞 → 撞墙被 overlap-detect 检测 → 寿命到时自毁。
// 验证核心原子 + 2 个 Tier 1 系统在真实 ECS 循环里经拓扑排序协作。
// 拓扑顺序自动得出：motion-apply → overlap-detect；timer-advance → lifetime → destroy-apply。
export const demoBlueprint: WorldBlueprint = {
  capabilities: [
    transformCapability,
    velocityCapability,
    shapeCapability,
    spriteCapability,
    timerCapability,
    overlapDetectCapability,
    destroyCapability,
    motionApplyCapability,
    lifetimeCapability,
  ],
  entities: {
    bullet: {
      Transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 8, vy: 0, angular: 0 },
      Shape: { kind: 'box', width: 8, height: 8 },
      Sprite: { textureKey: 'bullet', anchorX: 0.5, anchorY: 0.5, zOrder: 10 },
      Timer: { id: 'life', elapsed: 0, duration: 12, loop: false },
    },
    wall: {
      Transform: { x: 80, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 16, height: 64 },
    },
  },
};
