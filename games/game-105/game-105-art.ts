/**
 * S6 visual-only skin contract. These IDs are the sole bridge from game code
 * to public/games/game-105/art/index.json; missing entries retain S5 fallbacks.
 */
export const GAME105_SKINS = {
  sceneNightRoom: 'game-105/scene/night-room',
  tableOak: 'game-105/table/oak',
  blockWoodGrain: 'game-105/block/wood-grain',
  portraitThink: 'game-105/ai/portrait-think',
  portraitExpect: 'game-105/ai/portrait-expect',
  portraitLaugh: 'game-105/ai/portrait-laugh',
  portraitShy: 'game-105/ai/portrait-shy',
  heartSlot: 'game-105/ui/heart-slot',
  heartFill: 'game-105/ui/heart-fill',
  heartIcon: 'game-105/ui/heart-icon',
  panelS: 'game-105/ui/panel-s',
  panelM: 'game-105/ui/panel-m',
  panelL: 'game-105/ui/panel-l',
  cardFrame: 'game-105/ui/card-frame',
  buttonPrimary: 'game-105/ui/button-primary',
  buttonSecondary: 'game-105/ui/button-secondary',
  bannerWrap: 'game-105/ui/banner-wrap',
  hoverRing: 'game-105/fx/hover-ring',
  heartSpark: 'game-105/fx/heart-spark',
} as const;

export type Game105Skins = Partial<Record<(typeof GAME105_SKINS)[keyof typeof GAME105_SKINS], string>>;

/** Select the companion image by visible state without affecting turn or AI behaviour. */
export function companionPortrait(phase: string): (typeof GAME105_SKINS)[keyof typeof GAME105_SKINS] {
  if (phase === 'ai-observe' || phase === 'ai-pulling') return GAME105_SKINS.portraitExpect;
  if (phase === 'ai-response' || phase === 'player-interaction') return GAME105_SKINS.portraitLaugh;
  if (phase === 'collapse-locked') return GAME105_SKINS.portraitShy;
  return GAME105_SKINS.portraitThink;
}
