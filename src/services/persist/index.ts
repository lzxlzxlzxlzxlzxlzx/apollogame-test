// 局外小态持久化（REQ-SHELL-公共壳三件 ③）：一个键一个小值的类型化本地存储 + 本地榜纯算术。
// 与既有存档体系分工：引擎快照存档=`services/storage`（StoragePort/SaveSystem）；带 schema/迁移链的
// 数据 blob 存档=`services/save`（SavePort 信封）；**本模块只管局外偏好/进度/榜这类小态**。
// 红线：不进 world/snapshot/hash，不参与回放/lockstep。
export {
  localStore,
  memoryKV,
  defaultKV,
  jsonCodec,
  textCodec,
  intCodec,
  flagCodec,
  type KV,
  type StoreCodec,
  type LocalStore,
} from './local-store.js';
export { insertRanked } from './leaderboard.js';
// 本地成就台账（阈值解锁·持久化）——game-103 手写原型的通用形（owner 2026-09-09 令补齐）。
export { createAchievementLedger } from './achievements-ledger.js';
export type { AchievementDef, AchievementLedger } from './achievements-ledger.js';
