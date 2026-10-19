import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseInvestigationInput, validateInvestigationOutput } from '../src/contracts.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));

test('formal app manifest registers the SDK v2 contract and in-package Chinese documentation', async () => {
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.id, 'game-clue-investigation');
  assert.equal(manifest.runtime.protocol, 'dokiworld.app');
  assert.equal(manifest.runtime.protocolVersion, 2);
  assert.deepEqual(manifest.runtime.input, { contract: 'doki.game.clue-investigation-input', version: 1 });
  assert.deepEqual(manifest.runtime.outputs, [{ contract: 'doki.game.clue-investigation-result', version: 1 }]);
  const docPath = manifest.documentation['zh-cn'].path;
  const documentation = await readFile(new URL(docPath, root), 'utf8');
  for (const heading of Array.from({ length: 12 }, (_, index) => `## ${index + 1}.`)) assert.ok(documentation.includes(heading), `missing required section ${heading}`);
  assert.match(documentation, /首次收录/);
  assert.match(documentation, /hitMask/);
  assert.match(documentation, /requestId/);
});

test('integration documentation input and output examples validate against the executable contract', async () => {
  const documentation = await readFile(new URL(manifest.documentation['zh-cn'].path, root), 'utf8');
  const examples = [...documentation.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
  assert.ok(examples.length >= 2, 'expected input and output JSON examples');
  const inputData = parseInvestigationInput(examples[0]);
  assert.deepEqual(validateInvestigationOutput(examples[1], inputData), examples[1]);
});

test('built dist carries the registered documentation and an exact SHA-256 file set', async () => {
  const dist = new URL('../dist/', import.meta.url);
  const distPath = fileURLToPath(dist);
  const builtManifest = JSON.parse(await readFile(new URL('manifest.json', dist), 'utf8'));
  assert.deepEqual(builtManifest, manifest);
  assert.equal(await readFile(new URL(manifest.documentation['zh-cn'].path, dist), 'utf8'),
    await readFile(new URL(manifest.documentation['zh-cn'].path, root), 'utf8'));
  const sumsText = await readFile(new URL('SHA256SUMS.txt', dist), 'utf8');
  const listed = new Map(sumsText.replaceAll('\r\n', '\n').trimEnd().split('\n').map((line) => {
    const match = /^([A-F0-9]{64})  (.+)$/.exec(line);
    assert.ok(match, `malformed SHA line: ${line}`);
    return [match[2], match[1]];
  }));
  const actual = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else actual.push(relative(distPath, file).replaceAll('\\', '/'));
    }
  }
  await walk(distPath);
  const paths = actual.filter((path) => path !== 'SHA256SUMS.txt').sort();
  assert.deepEqual([...listed.keys()].sort(), paths);
  for (const path of paths) {
    const digest = createHash('sha256').update(await readFile(new URL(path, dist))).digest('hex').toUpperCase();
    assert.equal(listed.get(path), digest, `SHA mismatch for ${path}`);
  }
});
