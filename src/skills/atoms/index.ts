// ═══════════════════════════════════════════════════════════════
//  Atom Skills — 核心原子统一导出（33 核心 + 1 扩展；唯一真相=本文件导出表）
//  参见 wiki/atom-skill-periodic-table.md
// ═══════════════════════════════════════════════════════════════
import type { CapabilityDefinition } from '@engine/core/define-capability.js';

import { transformCapability } from './transform/index.js';
import { hierarchyCapability } from './hierarchy/index.js';
import { velocityCapability } from './velocity/index.js';
import { accelerationCapability } from './acceleration/index.js';
import { massCapability } from './mass/index.js';
import { shapeCapability } from './shape/index.js';
import { overlapDetectCapability } from './overlap-detect/index.js';
import { overlapDetect3dCapability } from './overlap-detect-3d/index.js';
import { navmeshBakeCapability } from './navmesh-bake/index.js';
import { collisionResolve3dCapability } from './collision-resolve-3d/index.js';
import { timerCapability } from './timer/index.js';
import { resourceCapability } from './resource/index.js';
import { flagCapability } from './flag/index.js';
import { tagCapability } from './tag/index.js';
import { relationCapability } from './relation/index.js';
import { ownerCapability } from './owner/index.js';
import { groupCapability } from './group/index.js';
import { visibilityCapability } from './visibility/index.js';
import { inputCaptureCapability } from './input-capture/index.js';
import { actionMapCapability } from './action-map/index.js';
import { controllableCapability } from './controllable/index.js';
import { stateCapability } from './state/index.js';
import { spawnCapability } from './spawn/index.js';
import { destroyCapability } from './destroy/index.js';
import { spriteCapability } from './sprite/index.js';
import { colorCapability } from './color/index.js';
import { frameCapability } from './frame/index.js';
import { soundCapability } from './sound/index.js';
import { cameraCapability } from './camera/index.js';
import { textCapability } from './text/index.js';
import { randomCapability } from './random/index.js';
import { spatialQueryCapability } from './spatial-query/index.js';
import { vfx2dCapability } from './vfx2d/index.js';

// 扩展原子（周期表 Extension，非核心原子）
import { stringVariableCapability } from './string-variable/index.js';

export {
  transformCapability,
  hierarchyCapability,
  velocityCapability,
  accelerationCapability,
  massCapability,
  shapeCapability,
  overlapDetectCapability,
  overlapDetect3dCapability,
  navmeshBakeCapability,
  collisionResolve3dCapability,
  timerCapability,
  resourceCapability,
  flagCapability,
  tagCapability,
  relationCapability,
  ownerCapability,
  groupCapability,
  visibilityCapability,
  inputCaptureCapability,
  actionMapCapability,
  controllableCapability,
  stateCapability,
  spawnCapability,
  destroyCapability,
  spriteCapability,
  colorCapability,
  frameCapability,
  soundCapability,
  cameraCapability,
  textCapability,
  randomCapability,
  spatialQueryCapability,
  vfx2dCapability,
  stringVariableCapability,
};

// 世界级服务的纯函数助手
export { nextRandom, randomInt, chancePass, mulberry32, seededShuffle, deriveSeed, createShuffleBag, drawFromBag, gaussianApprox } from './random/index.js';
export type { ShuffleBag } from './random/index.js';
export { queryRange, queryNearest } from './spatial-query/index.js';
export { ownerOf, teamOf, sameTeam, isOwnedBy } from './owner/index.js';
export { groupAdd, groupInsertAt, groupRemove, groupMove, groupHas, groupIsFull, findGroup } from './group/index.js';

// 全部核心原子（32 个；用于注册到 World 或 assembly 蓝图）
export const allAtomCapabilities: CapabilityDefinition[] = [
  transformCapability,
  hierarchyCapability,
  velocityCapability,
  accelerationCapability,
  massCapability,
  shapeCapability,
  overlapDetectCapability,
  overlapDetect3dCapability,
  navmeshBakeCapability,
  collisionResolve3dCapability,
  timerCapability,
  resourceCapability,
  flagCapability,
  tagCapability,
  relationCapability,
  ownerCapability,
  groupCapability,
  visibilityCapability,
  inputCaptureCapability,
  actionMapCapability,
  controllableCapability,
  stateCapability,
  spawnCapability,
  destroyCapability,
  spriteCapability,
  colorCapability,
  frameCapability,
  soundCapability,
  cameraCapability,
  textCapability,
  randomCapability,
  spatialQueryCapability,
  vfx2dCapability,
];

// 扩展原子（按需引入，不计入核心原子）。
export const extensionAtomCapabilities: CapabilityDefinition[] = [stringVariableCapability];
