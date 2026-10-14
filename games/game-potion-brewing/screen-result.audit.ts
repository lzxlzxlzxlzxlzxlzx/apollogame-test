import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { MOON_ROUND } from './fixtures.js';
import { POTION_THEME, buildResultScreen } from './screen.js';

mountUI(document.getElementById('root')!, buildResultScreen(MOON_ROUND.recipe, { status: 'success', stepIndex: 4, confirmedCount: 0 }, '/games/game-potion-brewing/art/textures/potion-bottle-v1.png'), {}, POTION_THEME);
