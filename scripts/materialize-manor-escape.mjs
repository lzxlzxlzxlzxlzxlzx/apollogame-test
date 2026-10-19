import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assembleApprovedGalScript } from '../src/authoring/gal-script-assemble.ts';

const root = process.cwd();
const draft = join(root, 'docs/design/galgame/drafts/manor-escape');
const candidates = join(draft, 'art-candidates');
const artRoot = join(root, 'public/games/manor-escape/art/textures');
const approval = JSON.parse(readFileSync(join(draft, 'art-approval.json'), 'utf8'));
const script = JSON.parse(readFileSync(join(draft, 'script-candidate.json'), 'utf8'));
const license = approval.license;
const source = approval.source;
const note = '《庄园出逃》对话立绘。Owner 2026-10-16 批准，来源为本机部署的 AI，不是官方立绘。';

function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), transparent: bytes[25] === 6 };
}
function place(file, folder) {
  const bytes = readFileSync(join(candidates, file));
  const target = join(artRoot, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  const size = pngSize(bytes);
  return { bytes, size, sha256: createHash('sha256').update(bytes).digest('hex'), publicPath: `/games/manor-escape/art/textures/${file.replaceAll('\\', '/')}` };
}

const assets = [];
for (const item of [...approval.portraits, ...approval.backgrounds, ...approval.cg]) {
  const stored = place(item.file);
  const portrait = approval.portraits.includes(item);
  assets.push({
    id: item.assetKey.replace(/^art:/, ''),
    type: 'texture',
    description: portrait ? `${item.characterId} ${item.emotion}` : item.title,
    status: 'filled',
    path: stored.publicPath,
    category: portrait ? 'character.portrait' : item.file.startsWith('cg/') ? 'cg' : 'background',
    tags: ['manor-escape', portrait ? 'portrait' : item.file.startsWith('cg/') ? 'cg' : 'background'],
    source,
    license,
    style: 'illustrated',
    spec: { format: 'png', width: stored.size.width, height: stored.size.height, transparent: stored.size.transparent, usage: 'sprite', colorSpace: 'srgb' },
    provenance: { sha256: stored.sha256, generator: 'owner-local-ai', approvedBy: 'owner', approvedOn: '2026-10-16', candidateFile: `docs/design/galgame/drafts/manor-escape/art-candidates/${item.file}` },
  });
}
assets.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(join(root, 'public/games/manor-escape/art'), { recursive: true });
writeFileSync(join(root, 'public/games/manor-escape/art/index.json'), `${JSON.stringify({ version: 1, assets }, null, 2)}\n`);

const characterFile = new Map();
for (const item of approval.portraits) {
  const base = item.file.split('/').pop();
  const relative = item.characterId === 'mechanic' ? `suo-xin/manor-escape/${base}` : `manor-escape/${base}`;
  const destination = join(root, 'characters', item.characterId, relative);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(candidates, item.file), destination);
  characterFile.set(`${item.characterId}:${item.emotion}`, relative);
}
for (const id of ['prisoner', 'doctor', 'gardener', 'factory-chief']) {
  const catalogPath = join(root, 'characters', id, 'catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const known = new Set(catalog.entries.filter(entry => entry.file).map(entry => entry.file));
  for (const item of approval.portraits.filter(entry => entry.characterId === id)) {
    const file = characterFile.get(`${id}:${item.emotion}`);
    if (!known.has(file)) catalog.entries.push({ title: item.emotion, file, description: note });
  }
  for (const entry of catalog.entries) {
    if (entry.title === '外形' && typeof entry.description === 'string')
      entry.description = entry.description.replace('立绘尚未审核', '立绘已由 Owner 于 2026-10-16 批准');
  }
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}
const mechanicPath = join(root, 'characters/mechanic/catalog.json');
const mechanic = JSON.parse(readFileSync(mechanicPath, 'utf8'));
const costume = mechanic.costumes.find(item => item.id === 'suo-xin');
const knownMechanic = new Set(costume.entries.filter(entry => entry.file).map(entry => entry.file));
for (const item of approval.portraits.filter(entry => entry.characterId === 'mechanic')) {
  const file = characterFile.get(`mechanic:${item.emotion}`);
  if (!knownMechanic.has(file)) costume.entries.push({ title: item.emotion, file, description: note });
}
writeFileSync(mechanicPath, `${JSON.stringify(mechanic, null, 2)}\n`);

const { package: pkg } = assembleApprovedGalScript(script, approval);
writeFileSync(join(root, 'public/games/manor-escape/package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
const urls = Object.fromEntries(assets.map(asset => [`art:${asset.id}`, asset.path]));
writeFileSync(join(root, 'public/games/manor-escape/content-urls.json'), `${JSON.stringify(urls, null, 2)}\n`);
console.log(`assets ${assets.length}`);
