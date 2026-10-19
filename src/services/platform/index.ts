// 平台服务（基础设施·确定性 sim 之外）。Steam 为首个目标适配器；契约对 Epic/GOG/主机不变。
// 真实 Steamworks 适配器在原生壳(Electron/Tauri)里落地；web/dev/测试用 NullPlatformPort。
export type { PlatformPort } from './platform-port.js';
export { createHostExitController, type HostExitPort, type HostExitResult, type HostExitController, type HostExitAudit, type HostExitAuditEvent } from './host-exit.js';
export { NullPlatformPort } from './null-platform.js';
export { SteamworksPlatformPort, type SteamBridge } from './steamworks-platform.js';
export { createPlatformPort, isMockSteamEnabled } from './select-platform.js';
export { createMockSteamBridge, resetMockSteam, type MockSteamOptions, type MockSteamEvent } from './mock-steam.js';
export { AchievementSync } from './achievement-sync.js';
export { ACHIEVEMENTS, firstBootAchievement, type AchievementDef } from './achievements.js';
