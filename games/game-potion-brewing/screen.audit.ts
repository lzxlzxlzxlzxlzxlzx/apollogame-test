import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { MOON_ROUND } from './fixtures.js';
import {
  POTION_RECIPE_HOST, POTION_RACK_HOST, POTION_TITLE_HOST, POTION_LIQUID_HOST, POTION_STATUS_HOST, POTION_THEME,
  buildPotionShell, buildRackScreen, buildRecipeScreen, buildTitleScreen, buildLiquidScreen, buildStatusScreen,
} from './screen.js';

const host = document.getElementById('root')!;
mountUI(host, buildPotionShell(), {}, POTION_THEME);
mountUI(host.querySelector<HTMLElement>(`[id="${POTION_RECIPE_HOST}"]`)!, buildRecipeScreen(MOON_ROUND.recipe), {}, POTION_THEME);
mountUI(host.querySelector<HTMLElement>(`[id="${POTION_RACK_HOST}"]`)!, buildRackScreen(MOON_ROUND.recipe), {}, POTION_THEME);
const state = { status: 'active' as const, stepIndex: 0, confirmedCount: 0 };
mountUI(host.querySelector<HTMLElement>(`[id="${POTION_TITLE_HOST}"]`)!, buildTitleScreen(MOON_ROUND.recipe, state), {}, POTION_THEME);
mountUI(host.querySelector<HTMLElement>(`[id="${POTION_LIQUID_HOST}"]`)!, buildLiquidScreen(MOON_ROUND.recipe, state), {}, POTION_THEME);
mountUI(host.querySelector<HTMLElement>(`[id="${POTION_STATUS_HOST}"]`)!, buildStatusScreen(MOON_ROUND.recipe, state), {}, POTION_THEME);
