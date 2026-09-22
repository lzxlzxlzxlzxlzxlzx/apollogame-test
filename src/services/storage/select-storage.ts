import type { StoragePort } from './storage-port.js';
import { MemoryStoragePort } from './memory-storage.js';
import { LocalStorageStoragePort } from './local-storage.js';
import { IndexedDbStoragePort } from './indexeddb-storage.js';
import { indexedDbAvailable } from './indexeddb-kv.js';
import { SteamCloudStoragePort } from './steam-cloud-storage.js';
import { createMockSteamCloudBridge, type SteamCloudBridge } from './cloud-bridge.js';
import { isMockSteamEnabled } from '../platform/index.js';

// createStoragePort —— 存储端口工厂，**不写 if 云 分支**。优先级：
//   ① 原生壳真云桥(available) → SteamCloudStoragePort；
//   ② 开了假 Steam → SteamCloudStoragePort 包假云（真假同代码路径，无账号可验云存档）；
//   ③ 有 IndexedDB → IndexedDbStoragePort（M1·真事务+大配额·首用自动迁入 localStorage 旧档）；
//   ④ 有 localStorage → LocalStorageStoragePort（无 IndexedDB 的降级）；
//   ⑤ 否则 MemoryStoragePort（headless/测试）。
// bridge / opts.mock 可注入（测试用）。
export function createStoragePort(
  bridge: SteamCloudBridge | undefined = (globalThis as { __APOLLO_STEAM_CLOUD__?: SteamCloudBridge }).__APOLLO_STEAM_CLOUD__,
  opts: { mock?: boolean } = {},
): StoragePort {
  if (bridge && bridge.available) return new SteamCloudStoragePort(bridge);
  const mock = opts.mock ?? isMockSteamEnabled();
  if (mock) return new SteamCloudStoragePort(createMockSteamCloudBridge());
  try {
    if (indexedDbAvailable()) return new IndexedDbStoragePort();
  } catch { /* fall through */ }
  try {
    if (typeof localStorage !== 'undefined') return new LocalStorageStoragePort();
  } catch { /* fall through */ }
  return new MemoryStoragePort();
}

// resolveCloudBridge —— 拿到当前可用的云桥（真桥 / 假云·开关 / 无 → null）。供需要直接读写
// 云文件的场景（如 game-g 把自有 localStorage 存档 blob 镜像上云，而非走 SaveSystem 快照）。
export function resolveCloudBridge(
  bridge: SteamCloudBridge | undefined = (globalThis as { __APOLLO_STEAM_CLOUD__?: SteamCloudBridge }).__APOLLO_STEAM_CLOUD__,
  opts: { mock?: boolean } = {},
): SteamCloudBridge | null {
  if (bridge && bridge.available) return bridge;
  if (opts.mock ?? isMockSteamEnabled()) return createMockSteamCloudBridge();
  return null;
}
