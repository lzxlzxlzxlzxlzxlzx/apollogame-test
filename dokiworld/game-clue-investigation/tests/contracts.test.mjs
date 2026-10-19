import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvestigationInput, makeInvestigationOutput, validateInvestigationOutput } from '../src/contracts.js';

const mask = { encoding: 'bitset-hex-msb', width: 2, height: 2, rows: ['c', 'c'] };
const placement = { x: .2, y: .2, width: .1, height: .1, zIndex: 2, fit: 'contain', anchorX: .5, anchorY: .5, rotation: 0 };
const png = (name, width = 20, height = 20) => ({ imageUrl: `https://assets.example.test/${name}.png`, alt: name, pixelWidth: width, pixelHeight: height });
const object = (objectId, kind = 'clue', required = true) => ({
  objectId, kind, required, name: objectId, description: `Inspect ${objectId}`, sceneImage: png(`${objectId}-scene`),
  ...(kind === 'clue' ? { evidenceImage: png(`${objectId}-evidence`) } : {}), placement, hitMask: mask,
});
const input = (...objects) => ({ contract: 'doki.game.clue-investigation-input', version: 1, data: {
  requestId: 'req_1', investigationId: 'case_1', title: 'Case', objective: 'Find the evidence',
  background: png('background'), objects: objects.length ? objects : [object('clue_1')],
} });

test('accepts strict formal input and keeps clue order/meaning', () => {
  const data = parseInvestigationInput(input(object('c1'), object('note', 'flavor', false), object('c2', 'clue', false)));
  assert.deepEqual(data.objects.map((item) => item.objectId), ['c1', 'note', 'c2']);
});

test('accepts 1 and 12 object limits, rejects 0 and 13', () => {
  assert.equal(parseInvestigationInput(input(object('one'))).objects.length, 1);
  assert.equal(parseInvestigationInput(input(...Array.from({ length: 12 }, (_, i) => object(`clue${i}`)))).objects.length, 12);
  assert.throws(() => parseInvestigationInput(input(...Array.from({ length: 13 }, (_, i) => object(`clue${i}`)))), /1\.\.12/);
  const none = input(object('flavor', 'flavor', false));
  assert.throws(() => parseInvestigationInput(none), /at least one required clue/);
});

test('rejects extra keys, duplicate ids, bad cross-fields, non-HTTPS and malformed mask padding', () => {
  const extra = input(); extra.data.surprise = true;
  assert.throws(() => parseInvestigationInput(extra), /expected exactly/);
  assert.throws(() => parseInvestigationInput(input(object('same'), object('same'))), /unique/);
  assert.throws(() => parseInvestigationInput(input(object('flavor', 'flavor', true))), /flavor must be false/);
  const badUrl = input(); badUrl.data.objects[0].sceneImage.imageUrl = 'http://assets.example.test/thing.png';
  assert.throws(() => parseInvestigationInput(badUrl), /credential-free HTTPS PNG/);
  const badMask = input(); badMask.data.objects[0].hitMask = { ...mask, width: 3, rows: ['f', 'f'] };
  assert.throws(() => parseInvestigationInput(badMask), /aspect ratio|unused trailing bits/);
});

test('allows loopback HTTP PNGs only when the caller explicitly enables local debug mode', () => {
  const local = input();
  local.data.background.imageUrl = 'http://127.0.0.1:4173/archive/background.png';
  local.data.objects[0].sceneImage.imageUrl = 'http://127.0.0.1:4173/archive/clue.png';
  local.data.objects[0].evidenceImage.imageUrl = 'http://127.0.0.1:4173/archive/clue-detail.png';
  assert.doesNotThrow(() => parseInvestigationInput(local, { allowLoopbackHttp: true }));
  assert.throws(() => parseInvestigationInput(local, { allowLoopbackHttp: false }), /127\.0\.0\.1 HTTP PNG/);
  for (const url of [
    'http://localhost:4173/archive/clue.png',
    'http://127.0.0.2:4173/archive/clue.png',
    'http://user@127.0.0.1:4173/archive/clue.png',
    'http://127.0.0.1:4173/archive/clue.jpg',
    'http://127.0.0.1:4173/archive/clue.png#fragment',
  ]) {
    const invalid = input(); invalid.data.objects[0].sceneImage.imageUrl = url;
    assert.throws(() => parseInvestigationInput(invalid, { allowLoopbackHttp: true }), /127\.0\.0\.1 HTTP PNG/);
  }
});

test('output includes all collected clue ids in supplied first-collection order and rejects invalid results', () => {
  const data = parseInvestigationInput(input(object('required'), object('optional', 'clue', false), object('flavor', 'flavor', false)));
  const output = makeInvestigationOutput(data, ['optional', 'required']);
  assert.deepEqual(output.data.collectedObjectIds, ['optional', 'required']);
  assert.deepEqual(validateInvestigationOutput(output, data), output);
  assert.throws(() => makeInvestigationOutput(data, ['optional']), /omits a required clue/);
  assert.throws(() => makeInvestigationOutput(data, ['required', 'required']), /unique clue object IDs/);
  const mismatch = { ...output, data: { ...output.data, requestId: 'other' } };
  assert.throws(() => validateInvestigationOutput(mismatch, data), /does not match/);
});

test('rejects serialized UTF-8 payload above the 64 KiB budget', () => {
  const longPng = (name, width, height) => ({
    imageUrl: `https://assets.example.test/${name}/${'x'.repeat(1990)}.png`,
    alt: name, pixelWidth: width, pixelHeight: height,
  });
  const hugeObjects = Array.from({ length: 12 }, (_, index) => {
    const isLargeMask = index < 2;
    const width = isLargeMask ? 128 : 1;
    const height = isLargeMask ? 256 : 1;
    const item = object(`clue${index}`);
    item.sceneImage = longPng(`scene${index}`, width, height);
    item.evidenceImage = longPng(`evidence${index}`, width, height);
    item.hitMask = {
      encoding: 'bitset-hex-msb', width, height,
      rows: Array(height).fill(isLargeMask ? 'f'.repeat(32) : '8'),
    };
    return item;
  });
  const oversized = input(...hugeObjects);
  oversized.data.background = longPng('background', 1, 1);
  assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength > 64 * 1024);
  assert.throws(() => parseInvestigationInput(oversized), /serialized UTF-8 envelope exceeds 64 KiB/);
});
