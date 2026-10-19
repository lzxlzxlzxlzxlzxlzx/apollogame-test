import {mountUI} from '../../src/ui/components/index.js';
import {forest} from '../../games/game-i/themes.js';
import {lifeUiShellAuditTree} from './life-ui-shell.fixture.js';
mountUI(document.getElementById('root')!,lifeUiShellAuditTree,{},forest);
