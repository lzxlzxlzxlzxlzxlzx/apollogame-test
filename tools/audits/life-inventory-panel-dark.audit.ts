import { mountUI } from '../../src/ui/components/index.js';
import { forest } from '../../games/game-i/themes.js';
import { lifeInventoryPanelAuditTree } from './life-inventory-panel.fixture.js';

mountUI(document.getElementById('root')!, lifeInventoryPanelAuditTree, {}, forest);
