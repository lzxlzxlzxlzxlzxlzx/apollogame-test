import {mountUI} from '../../src/ui/components/index.js';
import {forest} from '../../games/game-i/themes.js';
import {lifeProfilePanelAuditTree} from './life-profile-panel.fixture.js';
mountUI(document.getElementById('root')!,lifeProfilePanelAuditTree,{},forest);
