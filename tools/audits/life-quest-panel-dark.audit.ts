import { mountUI } from '../../src/ui/components/index.js';
import { forest } from '../../games/game-i/themes.js';
import { lifeQuestPanelAuditTree } from './life-quest-panel.fixture.js';

mountUI(document.getElementById('root')!, lifeQuestPanelAuditTree, {}, forest);
