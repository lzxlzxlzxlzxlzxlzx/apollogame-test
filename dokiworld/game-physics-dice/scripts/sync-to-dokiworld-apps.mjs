import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(appRoot, 'dist');
const target = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-to-dokiworld-apps.mjs <apps/game-physics-dice>');

const currentManifestPath = resolve(target, 'app.manifest.json');
const current = JSON.parse(await readFile(currentManifestPath, 'utf8'));
if (current.id !== 'game-physics-dice') throw new Error(`Refusing to replace unexpected target: ${target}`);
await access(resolve(dist, 'SHA256SUMS.txt'));

// 目标仓可能有 owner 尚未提交的旧实现；本同步器不删除、不移动它们。只备份即将覆盖的
// 顶层接线文件，并把新版放入独立 exported/。旧 src/public/vite 配置仍留在原位，可随时人工比较。
const backup = resolve(target, '.zerocraft-sync-backup');
await mkdir(backup, { recursive: true });
for (const name of ['app.manifest.json', 'package.json', 'package-lock.json', 'README.md']) {
  const saved = resolve(backup, name);
  try { await access(saved); continue; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  try { await copyFile(resolve(target, name), saved); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const exported = resolve(target, 'exported');
await rm(exported, { recursive: true, force: true });
await cp(dist, exported, { recursive: true });
await mkdir(resolve(target, 'scripts'), { recursive: true });

const pkg = {
  name: '@dokiworld/game-physics-dice', version: '0.2.0', private: true, type: 'module',
  scripts: { build: 'node scripts/build.mjs' },
};
await writeFile(resolve(target, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile(resolve(target, 'package-lock.json'), `${JSON.stringify({
  name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
  packages: { '': { name: pkg.name, version: pkg.version } },
}, null, 2)}\n`);
await writeFile(currentManifestPath, await readFile(resolve(dist, 'app.manifest.json')));
await writeFile(resolve(target, 'scripts', 'build.mjs'), `import { access, cp, readFile, rm } from 'node:fs/promises';\nimport { resolve } from 'node:path';\n\nconst root = process.cwd();\nconst exported = resolve(root, 'exported');\nconst manifest = JSON.parse(await readFile(resolve(exported, 'app.manifest.json'), 'utf8'));\nif (manifest.id !== 'game-physics-dice' || manifest.entry !== 'index.html') throw new Error('Invalid generated game-physics-dice export.');\nawait access(resolve(exported, 'SHA256SUMS.txt'));\nawait rm(resolve(root, 'dist'), { recursive: true, force: true });\nawait cp(exported, resolve(root, 'dist'), { recursive: true });\nawait access(resolve(root, 'dist', manifest.entry));\nconsole.log('Built generated game-physics-dice package to dist');\n`);
await writeFile(resolve(target, 'README.md'), `# Physics Dice App\n\nGenerated DokiWorld package for ZeroCraft \`game-dice\`. The authoritative source lives in the ApolloGame engine repository; do not edit \`exported/\` by hand.\n\n- App ID: \`game-physics-dice\`\n- Protocol: \`dokiworld.app/2\`\n- Input: \`doki.game.dice-input/1\`\n- Output: \`doki.game.result/1\`\n\nRun \`npm run build\` to copy the verified generated package into \`dist/\`. Legacy \`src/\` and \`public/\` files are intentionally retained but are no longer part of the build. Pre-sync top-level files are preserved in \`.zerocraft-sync-backup/\`.\n`);
console.log(`Synchronized generated game-physics-dice package to ${target}`);
