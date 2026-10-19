// Tier 1 涌现层（直接结算）。counter 折叠为 Macro 待定。
export { motionApplyCapability } from './motion-apply.js';
export { accelApplyCapability } from './accel-apply.js';
export { lifetimeCapability } from './lifetime.js';
export { rotationApplyCapability } from './rotation-apply.js';
export { animationCapability } from './animation.js';
export { hierarchyResolveCapability } from './hierarchy-resolve.js';
export { hierarchyCascadeCapability } from './hierarchy-cascade.js';
export { tweenCapability } from './tween.js';
// group-gc（G4 group 配套）：销毁实体从 Group.members 摘除·Cleanup 相位。
export { groupGcCapability } from './group-gc.js';
// event-log（REQ-EVENTLOG）：流水事件日志的通用泛型数据结构核（非 capability·先例见 dice.ts）。
// 带 seq 的类型化事件流·供 HUD 显示 + 回放/测试；旁路观测·不进 sim hash。game-b/game-c 手写两份收敛于此。
export { EventLog, createEventLog } from './event-log.js';
export type { LogEntry } from './event-log.js';
