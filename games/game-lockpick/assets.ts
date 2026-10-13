/**
 * Render-only asset keys for the mechanism-lock skin pack.
 *
 * The local AssetIndex is the source of truth; this map is only the packaged
 * URL fallback used by LayoutNode after resolving a key.  It deliberately
 * contains no gameplay state or rule data.
 */
export const LOCKPICK_SKINS = Object.freeze({
  background: 'game-lockpick/bg/workbench',
  consoleFrame: 'game-lockpick/ui/console-frame',
  consoleFrame3: 'game-lockpick/ui/console-frame-3',
  consoleFrame4: 'game-lockpick/ui/console-frame-4',
  consoleFrame5: 'game-lockpick/ui/console-frame-5',
  tumblerRail: 'game-lockpick/ui/tumbler-rail',
  tumblerKnob: 'game-lockpick/ui/tumbler-knob',
  lockBody: 'game-lockpick/ui/lock-body',
  lockShackle: 'game-lockpick/ui/lock-shackle',
  /** Aggregate-only mechanical confirmation layer; it has no per-tumbler state. */
  relayRotor: 'game-lockpick/ui/relay-rotor',
});

export type LockpickSkinMap = Readonly<Record<string, string>>;

const FALLBACK_URLS: Readonly<Record<string, string>> = Object.freeze({
  [LOCKPICK_SKINS.background]: '/games/game-lockpick/art/textures/lockpick-workbench-retro.png',
  [LOCKPICK_SKINS.consoleFrame]: '/games/game-lockpick/art/textures/lockpick-console-frame-retro.png',
  [LOCKPICK_SKINS.consoleFrame3]: '/games/game-lockpick/art/textures/lockpick-console-frame-3-retro.png',
  [LOCKPICK_SKINS.consoleFrame4]: '/games/game-lockpick/art/textures/lockpick-console-frame-4-retro.png',
  [LOCKPICK_SKINS.consoleFrame5]: '/games/game-lockpick/art/textures/lockpick-console-frame-5-retro.png',
  [LOCKPICK_SKINS.tumblerRail]: '/games/game-lockpick/art/textures/lockpick-rail-retro.png',
  [LOCKPICK_SKINS.tumblerKnob]: '/games/game-lockpick/art/textures/lockpick-knob-retro.png',
  [LOCKPICK_SKINS.lockBody]: '/games/game-lockpick/art/textures/lockpick-padlock-body-retro.png',
  [LOCKPICK_SKINS.lockShackle]: '/games/game-lockpick/art/textures/lockpick-padlock-shackle-retro.png',
  [LOCKPICK_SKINS.relayRotor]: '/games/game-lockpick/art/textures/lockpick-relay-rotor-retro.png',
});

/** Resolves a render asset key; a missing override safely retains the packaged art. */
export function lockpickSkinUrl(skins: LockpickSkinMap, key: string): string {
  return skins[key] ?? FALLBACK_URLS[key] ?? '';
}
