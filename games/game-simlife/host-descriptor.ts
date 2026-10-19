import type { LifeHostDescriptorV1 } from '@zerocraft/engine/authoring/life-host-descriptor.js';
import { LIFE_VIEWPORT_PROFILE_ID } from '@zerocraft/engine/engine/protocol/life-viewport-profile.js';

export const LIFE_DEMO_HOST_DESCRIPTOR = Object.freeze({
  schema: 'zerocraft.life-host.v1', slug: 'game-simlife', packagePath: 'life.json',
  assetSlotsPath: 'asset-slots.json', artSlug: 'game-simlife',
  viewport: { profile: LIFE_VIEWPORT_PROFILE_ID },
  theme: 'starter',
  hud: {
    preset: 'life-standard-v1', title: '小山谷',
    labels: { objective: '目标', date: '日期', 'time-slot': '时段', inventory: '背包', 'advance-time': 'T：消磨时光', 'advance-day': 'N：休息至明日' },
  },
  input: { preset: 'life-keyboard-v1' },
  save: { namespace: 'life:game-simlife:v1', schemaVersion: 1, autosave: 'life-commit-v1' },
} as const satisfies LifeHostDescriptorV1);
