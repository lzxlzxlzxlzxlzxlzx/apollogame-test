/**
 * Engine-owned Life viewport vocabulary.
 *
 * Games select a profile id; they never author field, HUD, cell, fit or camera
 * numbers independently. The first profile deliberately freezes the proven
 * Little Valley proportions as the shared Life/sim-management baseline.
 */
export const LIFE_VIEWPORT_PROFILE_ID = 'life-standard-v1' as const;
export type LifeViewportProfileId = typeof LIFE_VIEWPORT_PROFILE_ID;

export interface LifeViewportProfile {
  readonly id: LifeViewportProfileId;
  readonly host: {
    readonly fieldW: 900;
    readonly fieldH: 620;
    readonly topBarH: 52;
    readonly bottomBarH: 0;
    readonly cellSize: 32;
    readonly mode: 'responsive';
    readonly cameraFit: 'cover';
  };
  readonly camera: {
    readonly viewportWidthCells: 28;
    readonly viewportHeightCells: 19;
    readonly follow: {
      readonly marginCells: 0;
      readonly minZoom: 1;
      readonly maxZoom: 1;
      readonly deadZone: { readonly left: 0.3; readonly right: 0.3; readonly top: 0.3; readonly bottom: 0.3 };
    };
  };
}

export const LIFE_VIEWPORT_PROFILE: LifeViewportProfile = Object.freeze({
  id: LIFE_VIEWPORT_PROFILE_ID,
  host: Object.freeze({
    fieldW: 900,
    fieldH: 620,
    topBarH: 52,
    bottomBarH: 0,
    cellSize: 32,
    mode: 'responsive',
    cameraFit: 'cover',
  }),
  camera: Object.freeze({
    viewportWidthCells: 28,
    viewportHeightCells: 19,
    follow: Object.freeze({
      marginCells: 0,
      minZoom: 1,
      maxZoom: 1,
      deadZone: Object.freeze({ left: 0.3, right: 0.3, top: 0.3, bottom: 0.3 }),
    }),
  }),
});

export function isLifeViewportProfileId(value: unknown): value is LifeViewportProfileId {
  return value === LIFE_VIEWPORT_PROFILE_ID;
}

export function resolveLifeViewportProfile(id: LifeViewportProfileId): LifeViewportProfile {
  if (id !== LIFE_VIEWPORT_PROFILE_ID) throw new Error(`Unknown Life viewport profile: ${String(id)}`);
  return LIFE_VIEWPORT_PROFILE;
}

/** Reads only the closed profile selection; it never accepts legacy camera numbers as a profile. */
export function lifePackageViewportProfileId(value: unknown): LifeViewportProfileId | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const camera = (value as { readonly camera?: unknown }).camera;
  if (typeof camera !== 'object' || camera === null || Array.isArray(camera)) return undefined;
  const profile = (camera as { readonly profile?: unknown }).profile;
  return isLifeViewportProfileId(profile) ? profile : undefined;
}
