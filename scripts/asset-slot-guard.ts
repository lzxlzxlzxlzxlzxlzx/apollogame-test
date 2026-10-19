// Read-only AssetSlotBrief guard. It never generates, moves, approves, imports or registers assets.
// Usage: npx vite-node scripts/asset-slot-guard.ts [game-simlife] [--print-fingerprints|--probe]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  deriveAssetSlotBriefFingerprint,
  parseAssetIndex,
  parseAssetSlotManifest,
  validateAssetPendingIsolation,
  validateAssetSlotClosure,
  validateAssetSlotManifest,
  type AssetIndex,
  type AssetSlotBrief,
  type AssetSlotIssue,
} from '../src/assets/index.js';
import { collectLifeVisualReferences } from './lib/life-visual-references.js';

const ROOT = resolve(import.meta.dirname ?? process.cwd(), '..');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function sha256File(path: string): string { return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`; }

export function validateApprovedContentHashes(manifest: { readonly slots: readonly AssetSlotBrief[] }, index: AssetIndex, publicRoot: string): readonly AssetSlotIssue[] {
  const issues: AssetSlotIssue[] = []; const entries = new Map(index.assets.map((entry) => [entry.id, entry]));
  for (const slot of manifest.slots) {
    if (slot.governance.approval !== 'approved') continue;
    const entry = entries.get(slot.assetKey); const path = entry?.path;
    if (!path) { issues.push({ path: `slot:${slot.slotId}`, code: 'content_file', message: 'approved slot has no indexed path' }); continue; }
    const abs = path.startsWith('/games/') || path.startsWith('/assets/') ? join(publicRoot, path.replace(/^\//, '')) : join(ROOT, 'assets', path);
    if (!existsSync(abs)) issues.push({ path: `slot:${slot.slotId}`, code: 'content_file', message: `missing indexed file ${path}` });
    else if (sha256File(abs) !== slot.governance.contentHash) issues.push({ path: `slot:${slot.slotId}`, code: 'content_hash', message: 'tool-derived file hash does not match approved brief' });
  }
  return issues;
}

function main(): void {
  const game = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'game-simlife';
  const gameDir = join(ROOT, 'games', game); const artDir = join(ROOT, 'public', 'games', game, 'art');
  const manifestPath = join(gameDir, game === 'game-simlife' ? 'little-valley.asset-slots.json' : 'asset-slots.json');
  const lifePath = join(gameDir, game === 'game-simlife' ? 'little-valley.life.json' : 'life.json');
  const indexPath = join(artDir, 'index.json');
  const rawManifest = readJson(manifestPath); const life = readJson(lifePath); const index = parseAssetIndex(readJson(indexPath));
  if (process.argv.includes('--print-fingerprints')) {
    if (!record(rawManifest) || !Array.isArray(rawManifest.slots)) throw new Error('invalid manifest shape');
    for (const raw of rawManifest.slots) {
      if (!record(raw)) continue;
      const slot = raw as unknown as AssetSlotBrief;
      console.log(`${String(raw.slotId)} ${deriveAssetSlotBriefFingerprint(slot)}`);
    }
    return;
  }
  const schemaIssues = validateAssetSlotManifest(rawManifest);
  if (schemaIssues.length > 0) throw new Error(schemaIssues.map((value) => `${value.path} [${value.code}] ${value.message}`).join('\n'));
  const manifest = parseAssetSlotManifest(rawManifest);
  const refs = collectLifeVisualReferences(life); const expectedKeys = [...new Set(refs.map((ref) => ref.key))].sort();
  const pendingPath = join(artDir, 'ai', 'pending.json'); const ledgerPath = join(artDir, 'art-ledger.json');
  if (process.argv.includes('--probe')) {
    const mutatedLife = structuredClone(life);
    if (!record(mutatedLife) || !record(mutatedLife.playerVisual)) throw new Error('probe requires Life playerVisual');
    mutatedLife.playerVisual.skinKey = 'art:probe:missing';
    const mutatedRefs = collectLifeVisualReferences(mutatedLife);
    const closureIssues = validateAssetSlotClosure(
      manifest,
      { [lifePath.split(/[\\/]/).pop()!]: mutatedLife },
      index,
      [...new Set(mutatedRefs.map((ref) => ref.key))].sort(),
    );
    const active = index.assets[0];
    if (!active) throw new Error('probe requires at least one active index entry');
    const pendingIssues = validateAssetPendingIsolation(index, {
      version: 1,
      pending: [{
        id: active.id,
        path: active.path,
        license: 'probe-only',
        provenance: { model: 'probe', prompt: 'probe', generatedAt: 'probe' },
      }],
    });
    const codes = new Set([...closureIssues, ...pendingIssues].map((issue) => issue.code));
    const required = ['consumer_mismatch', 'missing_slot', 'approval_bypass'];
    const absent = required.filter((code) => !codes.has(code));
    if (absent.length > 0) throw new Error(`probe failed to turn red for: ${absent.join(', ')}`);
    console.log(`ASSET-SLOT-PROBE: RED expected=${required.join(',')} observed=${[...codes].sort().join(',')}`);
    return;
  }
  const issues = [
    ...validateAssetSlotClosure(manifest, { [lifePath.split(/[\\/]/).pop()!]: life }, index, expectedKeys),
    ...validateAssetPendingIsolation(index, existsSync(pendingPath) ? readJson(pendingPath) : { version: 1, pending: [] }, existsSync(ledgerPath) ? readJson(ledgerPath) : undefined),
    ...validateApprovedContentHashes(manifest, index, join(ROOT, 'public')),
  ];
  if (issues.length > 0) throw new Error(issues.map((value) => `${value.path} [${value.code}] ${value.message}`).join('\n'));
  console.log(`ASSET-SLOT: PASS game=${game} slots=${manifest.slots.length} consumers=${refs.length} approved=${manifest.slots.filter((slot) => slot.governance.approval === 'approved').length} placeholders=${manifest.slots.filter((slot) => slot.governance.approval === 'placeholder').length}`);
}

main();
