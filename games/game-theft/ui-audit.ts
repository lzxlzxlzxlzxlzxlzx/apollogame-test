import { mountUI } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_THEFT_CONFIG } from './config.js';
import { projectTheftView } from './project.js';
import { buildTheftScreen, THEFT_THEME } from './ui.js';
import { TheftGameSession } from './session.js';

const session = new TheftGameSession(DEFAULT_THEFT_CONFIG);

mountUI(
  document.getElementById('root')!,
  buildTheftScreen(projectTheftView(DEFAULT_THEFT_CONFIG, session.state())),
  {},
  THEFT_THEME,
);
