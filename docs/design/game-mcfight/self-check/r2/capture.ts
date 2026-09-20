import { writeFileSync } from 'node:fs';
import { S4_BALANCE_V1 } from '../../../../../games/game-mcfight/content/s4-balance.js';
writeFileSync('docs/design/game-mcfight/self-check/r2/s4-before.json', JSON.stringify(S4_BALANCE_V1, null, 2));
