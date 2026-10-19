import {mountUI} from '../../src/ui/components/index.js';
import {STARTER_THEME} from '../../src/ui/starters/index.js';
import {lifeUiShellAuditTree} from './life-ui-shell.fixture.js';
mountUI(document.getElementById('root')!,lifeUiShellAuditTree,{},STARTER_THEME);
