// 存储 / 存档服务（基础设施，确定性 sim 之外）。
export type { StoragePort, SaveGame, SaveMeta } from './storage-port.js';
export { MemoryStoragePort } from './memory-storage.js';
export { LocalStorageStoragePort } from './local-storage.js';
export { IndexedDbStoragePort } from './indexeddb-storage.js';
export { IndexedDbKV, indexedDbAvailable, migrateLocalStorageOnce, type StorageLike } from './indexeddb-kv.js';
export { SaveSystem } from './save-system.js';
export { SteamCloudStoragePort } from './steam-cloud-storage.js';
export { createStoragePort, resolveCloudBridge } from './select-storage.js';
export { createMockSteamCloudBridge, resetMockSteamCloud, type SteamCloudBridge } from './cloud-bridge.js';
