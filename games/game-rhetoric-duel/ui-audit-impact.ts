import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_RHETORIC_CONFIG } from './config.js';
import { RhetoricPresentationController } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';
import { RHETORIC_THEME } from './theme.js';
import { buildRhetoricDuelUI } from './ui.js';

const controller = new RhetoricPresentationController(new RhetoricDuelSession());
controller.skip();
controller.playVisibleCard(2);
controller.advance();
mountUI(document.getElementById('root')!, buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG), {}, RHETORIC_THEME, controller);
