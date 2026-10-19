import {mountUI} from '../../src/ui/components/index.js';
import {STARTER_THEME} from '../../src/ui/starters/index.js';
import {lifeProfilePanelAuditTree} from './life-profile-panel.fixture.js';
mountUI(document.getElementById('root')!,lifeProfilePanelAuditTree,{},STARTER_THEME);
