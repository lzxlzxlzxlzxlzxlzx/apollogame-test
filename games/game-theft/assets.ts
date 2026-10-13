/** game-theft 编译期 UI 美术槽：skinMap 优先，本地索引 URL 仅作 fail-soft 回退。 */
export const THEFT_SKINS = Object.freeze({
  frame: 'game-theft/ui/overlay-frame',
  wheel: 'game-theft/ui/wheel-dial',
  qteTarget: 'game-theft/ui/qte-target-ring',
  qteCore: 'game-theft/ui/qte-core',
  qteDial: 'game-theft/ui/qte-dial',
  qtePointer: 'game-theft/ui/qte-pointer',
  doorUnopened: 'game-theft/ui/door-unopened',
  doorSealed: 'game-theft/ui/door-sealed-v2',
  doorOpen: 'game-theft/ui/door-open',
  revealKey: 'game-theft/ui/reveal-key',
  demoLoot: 'game-theft/item/pocketwatch-letter',
  lootTray: 'game-theft/ui/loot-tray',
  withdraw: 'game-theft/ui/withdraw-button',
});

export type TheftSkinMap = Readonly<Record<string, string>>;

const FALLBACK_URLS: Readonly<Record<string, string>> = Object.freeze({
  [THEFT_SKINS.frame]: '/games/game-theft/art/textures/theft-overlay-frame.png',
  [THEFT_SKINS.wheel]: '/games/game-theft/art/textures/theft-wheel-dial.png',
  [THEFT_SKINS.qteTarget]: '/games/game-theft/art/textures/theft-qte-target-ring.png',
  [THEFT_SKINS.qteCore]: '/games/game-theft/art/textures/theft-qte-core.png',
  [THEFT_SKINS.qteDial]: '/games/game-theft/art/textures/theft-qte-dial.png',
  [THEFT_SKINS.qtePointer]: '/games/game-theft/art/textures/theft-qte-pointer.png',
  [THEFT_SKINS.doorUnopened]: '/games/game-theft/art/textures/theft-door-unopened.png',
  [THEFT_SKINS.doorSealed]: '/games/game-theft/art/textures/theft-door-sealed-v2.png',
  [THEFT_SKINS.doorOpen]: '/games/game-theft/art/textures/theft-door-open.png',
  [THEFT_SKINS.revealKey]: '/games/game-theft/art/textures/theft-reveal-key.png',
  [THEFT_SKINS.demoLoot]: '/games/game-theft/art/textures/theft-loot-pocketwatch.png',
  [THEFT_SKINS.lootTray]: '/games/game-theft/art/textures/theft-loot-tray.png',
  [THEFT_SKINS.withdraw]: '/games/game-theft/art/textures/theft-withdraw-button.png',
});

export function theftSkinUrl(skins: TheftSkinMap, key: string): string {
  return skins[key] ?? FALLBACK_URLS[key] ?? '';
}
