import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { projectHandVisuals } from './card-presentation.js';
import { DEFAULT_RHETORIC_CONFIG } from './config.js';
import { RhetoricPresentationController } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';
import { RHETORIC_THEME } from './theme.js';
import { buildRhetoricDuelUI } from './ui.js';

const controller = new RhetoricPresentationController(new RhetoricDuelSession());
controller.skip();
const ready = controller.view;
const snapshot = { ...ready.snapshot, focus: 0 };
const disabledView = { ...ready, snapshot, handVisuals: projectHandVisuals(snapshot.hand, snapshot.hand) };
mountUI(document.getElementById('root')!, buildRhetoricDuelUI(disabledView, DEFAULT_RHETORIC_CONFIG), {}, RHETORIC_THEME, controller);
