import { createLifeDemoSession } from '../../games/game-simlife/game-simlife.js';
import { buildLifeDemoUi } from '../../games/game-simlife/ui.js';
import { selectLifeDemoView } from '../../games/game-simlife/view-model.js';
import { buildLifeInteractionNode, buildLifeInteractionOptions, LifeInteractionController } from '../../games/game-simlife/world-interaction.js';
import { mountUI } from '../../src/ui/components/index.js';
import { STARTER_THEME } from '../../src/ui/starters/index.js';

const session = createLifeDemoSession();
const view = selectLifeDemoView(session.engine.world);
const auditView = { ...view, canInteract: true, affordances: [
  { id: 'tile:a:till', action: 'till' as const, targetKind: 'tile' as const, targetId: 'a', available: true as const },
  { id: 'placement:mayor:talk', action: 'talk' as const, targetKind: 'placement' as const, targetId: 'mayor', available: true as const },
] };
const options = buildLifeInteractionOptions(auditView);
const interaction = new LifeInteractionController(); interaction.interact(options, auditView);
mountUI(document.getElementById('root')!, buildLifeDemoUi(auditView, buildLifeInteractionNode(options, interaction.current)), {}, STARTER_THEME);
