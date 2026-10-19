import { mountUI } from '../../src/ui/components/index.js';
import { STARTER_THEME } from '../../src/ui/starters/index.js';
import { lifeInventoryPanelAuditTree } from './life-inventory-panel.fixture.js';

mountUI(document.getElementById('root')!, lifeInventoryPanelAuditTree, {}, STARTER_THEME);
