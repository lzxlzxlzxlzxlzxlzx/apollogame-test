import { describe, expect, it } from 'vitest';
import {
  LIFE_VIEWPORT_PROFILE,
  LIFE_VIEWPORT_PROFILE_ID,
  isLifeViewportProfileId,
  lifePackageViewportProfileId,
  resolveLifeViewportProfile,
} from './life-viewport-profile.js';

describe('Life viewport profile vocabulary', () => {
  it('freezes the proven Little Valley host, HUD, grid and camera proportions as one engine-owned profile', () => {
    expect(LIFE_VIEWPORT_PROFILE).toEqual({
      id: 'life-standard-v1',
      host: {
        fieldW: 900,
        fieldH: 620,
        topBarH: 52,
        bottomBarH: 0,
        cellSize: 32,
        mode: 'responsive',
        cameraFit: 'cover',
      },
      camera: {
        viewportWidthCells: 28,
        viewportHeightCells: 19,
        follow: {
          marginCells: 0,
          minZoom: 1,
          maxZoom: 1,
          deadZone: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3 },
        },
      },
    });
    expect(Object.isFrozen(LIFE_VIEWPORT_PROFILE.host)).toBe(true);
    expect(Object.isFrozen(LIFE_VIEWPORT_PROFILE.camera.follow.deadZone)).toBe(true);
  });

  it('resolves only the closed profile id and never infers a profile from free camera numbers', () => {
    expect(isLifeViewportProfileId(LIFE_VIEWPORT_PROFILE_ID)).toBe(true);
    expect(isLifeViewportProfileId('life-custom-v1')).toBe(false);
    expect(resolveLifeViewportProfile(LIFE_VIEWPORT_PROFILE_ID)).toBe(LIFE_VIEWPORT_PROFILE);
    expect(() => resolveLifeViewportProfile('life-custom-v1' as never)).toThrow(/unknown life viewport profile/i);
    expect(lifePackageViewportProfileId({ camera: { profile: LIFE_VIEWPORT_PROFILE_ID } })).toBe(LIFE_VIEWPORT_PROFILE_ID);
    expect(lifePackageViewportProfileId({ camera: { viewportWidthCells: 28, viewportHeightCells: 19 } })).toBeUndefined();
  });
});
