import { mountUI } from '../../src/ui/components/index.js';
import { MOON_ROUND } from '../../games/game-potion-brewing/fixtures.js';
import {
  buildPotionShell, buildRecipeScreen, buildRackScreen, buildLiquidScreen, buildStatusScreen, buildResultScreen, buildTitleScreen,
  POTION_THEME, POTION_RECIPE_HOST, POTION_RACK_HOST, POTION_LIQUID_HOST, POTION_STATUS_HOST, POTION_RESULT_HOST, POTION_TITLE_HOST,
} from '../../games/game-potion-brewing/screen.js';

const root = document.getElementById('root')!;
mountUI(root, buildPotionShell(), {}, POTION_THEME);
const view = { status: 'active' as const, stepIndex: 1, confirmedCount: 0 };
const attach = (id: string, node: ReturnType<typeof buildRecipeScreen>) => mountUI(root.querySelector<HTMLElement>(`#${id}`)!, node, {}, POTION_THEME);
attach(POTION_RECIPE_HOST, buildRecipeScreen(MOON_ROUND.recipe, view));
attach(POTION_RACK_HOST, buildRackScreen(MOON_ROUND.recipe));
attach(POTION_LIQUID_HOST, buildLiquidScreen(MOON_ROUND.recipe, view));
attach(POTION_STATUS_HOST, buildStatusScreen(MOON_ROUND.recipe, view));
attach(POTION_RESULT_HOST, buildResultScreen(MOON_ROUND.recipe, view));
attach(POTION_TITLE_HOST, buildTitleScreen(MOON_ROUND.recipe, view));
