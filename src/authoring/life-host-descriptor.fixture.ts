import {
  LIFE_HOST_AUTOSAVE,
  LIFE_HOST_HUD_PRESET,
  LIFE_HOST_INPUT_PRESET,
  LIFE_HOST_SCHEMA,
  LIFE_HOST_THEME,
  deriveLifeHostSaveNamespace,
  type LifeHostDescriptorV1,
} from './life-host-descriptor.js';
import { LIFE_VIEWPORT_PROFILE_ID } from '../engine/protocol/life-viewport-profile.js';

export function littleValleyHostDescriptorFixture(): LifeHostDescriptorV1 {
  const slug = 'game-simlife';
  return {
    schema: LIFE_HOST_SCHEMA,
    slug,
    packagePath: 'life.json',
    assetSlotsPath: 'asset-slots.json',
    artSlug: slug,
    viewport: { profile: LIFE_VIEWPORT_PROFILE_ID },
    theme: LIFE_HOST_THEME,
    hud: {
      preset: LIFE_HOST_HUD_PRESET,
      title: '小山谷',
      labels: { date: '日期', inventory: '背包', interaction: '互动', objective: '目标', 'advance-day': '休息至明日' },
    },
    input: { preset: LIFE_HOST_INPUT_PRESET },
    save: { namespace: deriveLifeHostSaveNamespace(slug), schemaVersion: 1, autosave: LIFE_HOST_AUTOSAVE },
  };
}

export function seasideMarketHostDescriptorFixture(): LifeHostDescriptorV1 {
  const slug = 'game-seaside-market';
  return {
    schema: LIFE_HOST_SCHEMA,
    slug,
    packagePath: 'life.json',
    assetSlotsPath: 'asset-slots.json',
    artSlug: slug,
    viewport: { profile: LIFE_VIEWPORT_PROFILE_ID },
    theme: LIFE_HOST_THEME,
    hud: {
      preset: LIFE_HOST_HUD_PRESET,
      title: '海风集市',
      labels: { date: '营业日', inventory: '货箱', interaction: '招呼', objective: '今日计划', 'advance-day': '打烊' },
    },
    input: { preset: LIFE_HOST_INPUT_PRESET },
    save: { namespace: deriveLifeHostSaveNamespace(slug), schemaVersion: 1, autosave: LIFE_HOST_AUTOSAVE },
  };
}
