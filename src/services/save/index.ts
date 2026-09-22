// 存档端口服务（基础设施·确定性 sim 之外）—— 版本化信封 + 迁移链 + checksum + 多后端。
// 与 services/storage（WorldSnapshot 快照向）互补：本模块是「游戏自有数据 blob + schema 迁移」向。
export type { SavePort, SaveEnvelope, SaveMeta, SaveCodec, SaveMigration } from './save-port.js';
export { sealEnvelope, openEnvelope, computeChecksum, CorruptSaveError } from './envelope.js';
export { MemorySavePort } from './memory-save-port.js';
export { LocalStorageSavePort } from './local-save-port.js';
export { IndexedDbSavePort } from './indexeddb-save-port.js';
export { BridgeSavePort, FileSavePort, CloudSavePort, createMemoryFileBridge, type SaveFileBridge } from './bridge-save-port.js';
