import { mountUI } from '../../src/ui/components/index.js';
import { STARTER_THEME } from '../../src/ui/starters/index.js';
import { lifeQuestPanelAuditTree } from './life-quest-panel.fixture.js';

mountUI(document.getElementById('root')!, lifeQuestPanelAuditTree, {}, STARTER_THEME);
