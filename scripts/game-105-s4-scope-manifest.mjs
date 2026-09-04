#!/usr/bin/env node
// Produce a reviewable S4 snapshot without changing the normal Git index, which remains
// reserved for the separately approved S3 baseline.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameHash } from './game-pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'game-105';
const DESIGN = join('docs', 'design', SLUG);
const PROBE = join('public', 'games', SLUG, 'probe');

const S4_FILES = [
  join(DESIGN, 'standalone-release-freeze.md'),
  join(DESIGN, 's3-standalone-release.md'),
  join(DESIGN, 's4-local-ai-m1.md'),
  join(DESIGN, 's4-experience-extension.md'),
  join(DESIGN, 's4-program-evidence.md'),
  join(DESIGN, 'self-check', 'S4-alignment.md'),
  join(DESIGN, 'acceptance', '01-local-ai-opening.scenario.jsonc'),
  join(DESIGN, 'acceptance', '02-player-ai-roundtrip.scenario.jsonc'),
  join(DESIGN, 'acceptance', '03-partial-pull-keeps-turn.scenario.jsonc'),
  join(DESIGN, 'acceptance', '04-realtime-collapse-and-loot.scenario.jsonc'),
  join(DESIGN, 'acceptance', '05-player-response-and-swap.scenario.jsonc'),
  join(DESIGN, 'acceptance', '06-retired-blocks.scenario.jsonc'),
  join(DESIGN, 'acceptance', '07-aftershock-order-and-cap.scenario.jsonc'),
  join(DESIGN, 'acceptance', '08-ai-wrap-once.scenario.jsonc'),
  join('games', SLUG, 'acceptance-adapter.ts'),
  join('games', SLUG, 'ai-turn-director.ts'),
  join('games', SLUG, 'game-105.ts'),
  join('games', SLUG, 'local-ai-observation.ts'),
  join('games', SLUG, 'tower-action-executor.ts'),
  join('games', SLUG, 'tower-blueprint.ts'),
  join('games', SLUG, 'tower-lifecycle.ts'),
  join('games', SLUG, 'tower-session.ts'),
  join('scripts', 'acceptance-run.mjs'),
  join('scripts', 'game-105-spec-recursion.mjs'),
  join('scripts', 'game-105-s4-structure-snapshot.ts'),
  join('scripts', 'ui-walkthrough-probe.mjs'),
  join(PROBE, 'S4-recursion.json'),
  join(PROBE, 'S4-uiwalk.json'),
  join(PROBE, 'S4-local-ai-playthrough.json'),
];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildS4ScopeManifest(root = ROOT) {
  const hash = gameHash(root, SLUG);
  const fileNames = [...S4_FILES, join(DESIGN, 'self-check', `S4-structure-${hash}.json`)];
  const files = fileNames.map((name) => {
    const path = join(root, name);
    if (!existsSync(path)) throw new Error(`S4 scope file missing: ${name}`);
    const bytes = readFileSync(path);
    return { path: relative(root, path).replaceAll('\\', '/'), sha256: digest(bytes), bytes: bytes.length };
  });
  const contents = createHash('sha256');
  for (const file of files) contents.update(`${file.path}\0${file.sha256}\0`);
  const contentHash = contents.digest('hex').slice(0, 16);
  return {
    schemaVersion: 1,
    stage: 'S4',
    slug: SLUG,
    gameHash: hash,
    scopeHash: contentHash,
    comparison: {
      method: 'sha256-per-file',
      command: 'node scripts/game-105-s4-scope-manifest.mjs --check',
      indexPolicy: 'Does not read or mutate the normal Git index; S3 retains its separate staged baseline.',
    },
    files,
  };
}

function manifestPath(root, manifest) {
  return join(root, DESIGN, 'self-check', `S4-scope-${manifest.gameHash}.json`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const manifest = buildS4ScopeManifest();
  const path = manifestPath(ROOT, manifest);
  if (process.argv.includes('--check')) {
    if (!existsSync(path)) throw new Error(`S4 scope baseline missing: ${relative(ROOT, path)}`);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    const same = saved.gameHash === manifest.gameHash && saved.scopeHash === manifest.scopeHash
      && JSON.stringify(saved.files) === JSON.stringify(manifest.files);
    console.log(JSON.stringify({ ok: same, path: relative(ROOT, path), gameHash: manifest.gameHash, scopeHash: manifest.scopeHash }));
    process.exit(same ? 0 : 1);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, path: relative(ROOT, path), gameHash: manifest.gameHash, scopeHash: manifest.scopeHash, files: manifest.files.length }));
}
