import { mountUI } from '../../src/ui/components/index.js';
import { DEFAULT_RHETORIC_CONFIG } from '../../games/game-rhetoric-duel/config.js';
import { RhetoricPresentationController } from '../../games/game-rhetoric-duel/presentation-controller.js';
import { RhetoricDuelSession } from '../../games/game-rhetoric-duel/session.js';
import { buildRhetoricDuelUI } from '../../games/game-rhetoric-duel/ui.js';
import { RHETORIC_THEME } from '../../games/game-rhetoric-duel/theme.js';

const controller = new RhetoricPresentationController(new RhetoricDuelSession());
controller.skip();
mountUI(document.getElementById('root')!, buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG), {}, RHETORIC_THEME, controller);
