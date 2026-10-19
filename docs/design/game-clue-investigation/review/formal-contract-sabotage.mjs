import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseInvestigationInput } from '../../../../dokiworld/game-clue-investigation/src/contracts.js';

const sourcePath = new URL('../../../../dokiworld/game-clue-investigation/src/contracts.js', import.meta.url);
const docsPath = new URL('../../../../dokiworld/game-clue-investigation/docs/integration.zh-CN.md', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const fence = String.fromCharCode(96).repeat(3);
const badInput = JSON.parse(readFileSync(docsPath, 'utf8').split(fence + 'json')[1].split(fence)[0]);
badInput.data.background.imageUrl = 'http://assets.example.test/archive-room.png';
const anchor = "parsed.protocol !== 'https:'";
const hits = source.split(anchor).length - 1;
if (hits !== 1) throw new Error(`sabotage anchor must hit exactly once, got ${hits}`);

let originalRejected = false;
try { parseInvestigationInput(badInput); } catch (error) {
  originalRejected = true;
  console.log('ORIGINAL_REJECT', error.message);
}
const sabotaged = source.replace(anchor, 'false');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(sabotaged).toString('base64');
const modifiedParser = await import(moduleUrl);
let mutatedAccepted = false;
try { modifiedParser.parseInvestigationInput(badInput); mutatedAccepted = true; }
catch (error) { console.log('MUTANT_REJECT', error.message); }

const hash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
console.log(JSON.stringify({ anchorHits: hits, originalRejected, mutatedAccepted,
  sourceSha256BeforeAndAfter: hash, sourceFileEdited: false }));
if (!originalRejected || !mutatedAccepted) process.exitCode = 1;
