/* AI START */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const staging = path.join(root, 'release', 'manor-escape-app');
const dist = path.join(root, 'dist-gal');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/' },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npx', ['vite', 'build', '--config', 'vite.config.gal-desktop.ts']);

for (const relative of ['games/manor-escape', 'games/gal-template/art']) {
  cpSync(path.join(root, 'public', relative), path.join(dist, relative), { recursive: true });
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(path.join(staging, 'electron'), { recursive: true });
cpSync(path.join(root, 'electron', 'gal-main.cjs'), path.join(staging, 'electron', 'gal-main.cjs'));
cpSync(path.join(root, 'electron', 'gal-preload.cjs'), path.join(staging, 'electron', 'gal-preload.cjs'));
cpSync(path.join(root, 'electron', 'gal-root.cjs'), path.join(staging, 'electron', 'gal-root.cjs'));
cpSync(dist, path.join(staging, 'dist-gal'), { recursive: true });
writeFileSync(path.join(staging, 'package.json'), JSON.stringify({
  name: 'manor-escape',
  version: '0.1.0',
  private: true,
  description: '庄园出逃',
  main: 'electron/gal-main.cjs',
}, null, 2));

run('npx', ['electron-builder', '--win', '--projectDir', staging, '--config', path.join(root, 'electron-builder.gal.yml')]);
/* AI END */
