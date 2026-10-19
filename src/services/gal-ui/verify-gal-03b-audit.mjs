// Repeatable 03B static UI audit; no service, database or Git.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable = process.env.UI_AUDIT_CHROMIUM ?? (existsSync(edge) ? edge : undefined);
let failed = false;
for (const entry of ['history', 'gallery', 'cg-expanded']) {
  const file = `src/services/gal-ui/gal-ui-${entry}.audit.ts`;
  const run = spawnSync(process.execPath, ['tools/ui-audit.mjs', file, '--w', '1440', '--h', '900'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, ...(executable ? { UI_AUDIT_CHROMIUM: executable } : {}) } });
  if (run.error) { console.error(`${file}: ${String(run.error)}`); failed = true; }
  else if (run.status !== 0) { console.error(`${file}: exit ${run.status}`); failed = true; }
}
process.exitCode = failed ? 1 : 0;
