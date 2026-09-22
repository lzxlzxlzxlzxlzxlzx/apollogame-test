// net — 多人地基：固定步长 + tick 索引输入模型 + 确定性守卫 + lockstep
//
// ⚠ **目录分两半**（P3a·REQ-P3TAIL M1）：`src/net/*.ts` 是 sim 面（必须能在 Node/Worker 里
// 不带 dom lib 编译·由 `tsconfig.sim.json` 机器守），`src/net/host/**` 是**浏览器宿主胶水**
// （键盘/指针/手柄/多标签页 demo——它们本来就要 window、document、navigator）。
// **本桶只出 sim 面**；键盘/指针/手柄/轮替等宿主件改从 `@net/host/index.js` 取（见那边文件头）。
export type { Command, InputSource, RawInputData } from './commands.js';
export { orderCommands, applyCommands, applyMovement, applyRawActions, INPUT_QUEUE_ENTITY, MultiInputSource } from './commands.js';
export { hashSnapshot, hashWithOrder } from './determinism.js';
export { FixedStepClock } from './fixed-step.js';
export type { FixedStepOptions } from './fixed-step.js';
export { LockstepSession } from './lockstep.js';
export type { PeerHash, StepReport } from './lockstep.js';
// 帧同步（lockstep）双标签页：各端各跑确定性世界，只交换输入。
export { LockstepClient } from './lockstep-tab.js';
export type { Channel, NetMsg, ClientView, LockstepOptions, Dir } from './lockstep-tab.js';
export { buildMpWorld, addPlayer, playerEntityId, renderEnts, PLAYER_COLORS } from './mp-world.js';
export type { RenderEnt } from './mp-world.js';
// 状态同步打包层（盟友战局只读镜像；与 lockstep 互补——各跑各世界、只搬运状态）。
export { packKeyframe, diffState, applyPacket, PRESENTATION_COMPONENTS, StateSyncSession } from './state-sync.js';
export type { StatePacket, SyncFilter, StateSyncMsg, SyncChannel, StateSyncOptions } from './state-sync.js';
export { hashWorld, hasherOf, WorldHasher, scheduleFingerprint } from './world-hash.js';
