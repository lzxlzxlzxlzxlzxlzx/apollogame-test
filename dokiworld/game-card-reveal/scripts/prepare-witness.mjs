// Prepare a bounded, disposable HTTP witness root; never starts a server.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const witness = resolve(appRoot, 'witness-static');
if (dirname(witness) !== appRoot || !witness.startsWith(`${appRoot}${sep}`)) throw new Error('Unsafe witness target');
const verified = spawnSync(process.execPath, [resolve(appRoot, 'scripts', 'verify-dist.mjs')], { cwd: appRoot, encoding: 'utf8' });
if (verified.status !== 0) throw new Error(`dist must verify before witness staging:\n${verified.stderr}`);
await rm(witness, { recursive: true, force: true });
await mkdir(resolve(witness, 'apps'), { recursive: true });
await mkdir(resolve(witness, 'vendor', 'dokiworlds-app-sdk', 'src'), { recursive: true });
await cp(resolve(appRoot, 'dist'), resolve(witness, 'apps', 'game-card-reveal'), { recursive: true });
await cp(resolve(repoRoot, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js'), resolve(witness, 'vendor', 'dokiworlds-app-sdk', 'src', 'index.js'));
await cp(resolve(appRoot, 'tests', 'host-witness.html'), resolve(witness, 'index.html'));
console.log(`WITNESS READY: ${witness} (serve this directory at 127.0.0.1:4174; open /index.html)`);
