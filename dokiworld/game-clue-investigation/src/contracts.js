export const APP_ID = 'game-clue-investigation';
export const INPUT_CONTRACT = 'doki.game.clue-investigation-input';
export const OUTPUT_CONTRACT = 'doki.game.clue-investigation-result';
export const CONTRACT_VERSION = 1;
const MAX_BYTES = 64 * 1024;
const MAX_MASK_PIXELS = 131072;

const fail = (path, rule) => { throw new TypeError(`${path}: ${rule}`); };
const object = (value, path, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(path, 'must be a plain object');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(path, `expected exactly: ${keys.join(', ')}`);
  return value;
};
const text = (value, path, min, max) => {
  if (typeof value !== 'string' || value.length < min || value.length > max) fail(path, `must be a string of ${min}..${max} UTF-16 code units`);
  return value;
};
const id = (value, path) => {
  text(value, path, 1, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(path, 'must match [A-Za-z0-9_-]+');
  return value;
};
const integer = (value, path, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `must be an integer in ${min}..${max}`);
  return value;
};
const unit = (value, path, allowZero) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > 1 || value < 0 || (!allowZero && value === 0)) fail(path, `must be a finite ${allowZero ? '[0,1]' : '(0,1]'} number`);
  return value;
};
export function isLoopbackDebugOrigin(origin = globalThis.location?.origin) {
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1'
      && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function image(value, path, maxDimension, allowLoopbackHttp) {
  object(value, path, ['imageUrl', 'alt', 'pixelWidth', 'pixelHeight']);
  const imageUrl = text(value.imageUrl, `${path}.imageUrl`, 1, 2048);
  let parsed;
  try { parsed = new URL(imageUrl); } catch { fail(`${path}.imageUrl`, 'must be an absolute HTTPS PNG URL or local loopback HTTP PNG in debug mode'); }
  const secure = parsed.protocol === 'https:';
  const localDebug = allowLoopbackHttp && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
  if ((!secure && !localDebug) || parsed.username || parsed.password || parsed.hash || !/\.png$/i.test(parsed.pathname)) {
    fail(`${path}.imageUrl`, 'must be a credential-free HTTPS PNG URL, or a 127.0.0.1 HTTP PNG while the app itself runs on 127.0.0.1');
  }
  text(value.alt, `${path}.alt`, 1, 120);
  integer(value.pixelWidth, `${path}.pixelWidth`, 1, maxDimension);
  integer(value.pixelHeight, `${path}.pixelHeight`, 1, maxDimension);
  return value;
}

export function parseInvestigationInput(envelope, { allowLoopbackHttp = isLoopbackDebugOrigin() } = {}) {
  object(envelope, 'input', ['contract', 'version', 'data']);
  if (envelope.contract !== INPUT_CONTRACT || envelope.version !== CONTRACT_VERSION) fail('input', 'unsupported contract or version');
  const data = object(envelope.data, 'input.data', ['requestId', 'investigationId', 'title', 'objective', 'background', 'objects']);
  id(data.requestId, 'input.data.requestId');
  id(data.investigationId, 'input.data.investigationId');
  text(data.title, 'input.data.title', 1, 80);
  text(data.objective, 'input.data.objective', 1, 240);
  image(data.background, 'input.data.background', 8192, allowLoopbackHttp);
  if (!Array.isArray(data.objects) || data.objects.length < 1 || data.objects.length > 12) fail('input.data.objects', 'must contain 1..12 objects');
  const ids = new Set();
  let requiredCount = 0;
  let totalMaskPixels = 0;
  for (const [index, item] of data.objects.entries()) {
    const path = `input.data.objects[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(path, 'must be an object');
    const keys = ['objectId', 'kind', 'required', 'name', 'description', 'sceneImage', 'placement', 'hitMask', ...(item.kind === 'clue' ? ['evidenceImage'] : [])];
    object(item, path, keys);
    id(item.objectId, `${path}.objectId`);
    if (ids.has(item.objectId)) fail(`${path}.objectId`, 'must be unique');
    ids.add(item.objectId);
    if (item.kind !== 'clue' && item.kind !== 'flavor') fail(`${path}.kind`, 'must be clue|flavor');
    if (typeof item.required !== 'boolean' || (item.kind === 'flavor' && item.required)) fail(`${path}.required`, 'must be boolean; flavor must be false');
    if (item.kind === 'clue' && item.required) requiredCount++;
    text(item.name, `${path}.name`, 1, 80);
    text(item.description, `${path}.description`, 1, 400);
    image(item.sceneImage, `${path}.sceneImage`, 4096, allowLoopbackHttp);
    if (item.kind === 'clue') image(item.evidenceImage, `${path}.evidenceImage`, 4096, allowLoopbackHttp);
    object(item.placement, `${path}.placement`, ['x', 'y', 'width', 'height', 'zIndex', 'fit', 'anchorX', 'anchorY', 'rotation']);
    const p = item.placement;
    unit(p.x, `${path}.placement.x`, true); unit(p.y, `${path}.placement.y`, true);
    unit(p.width, `${path}.placement.width`, false); unit(p.height, `${path}.placement.height`, false);
    integer(p.zIndex, `${path}.placement.zIndex`, 0, 255);
    if (p.fit !== 'contain' && p.fit !== 'cover') fail(`${path}.placement.fit`, 'must be contain|cover');
    unit(p.anchorX, `${path}.placement.anchorX`, true); unit(p.anchorY, `${path}.placement.anchorY`, true);
    if (p.rotation !== 0) fail(`${path}.placement.rotation`, 'v1 only supports zero rotation');
    const px = p.x * 1440, py = p.y * 900, pw = p.width * 1440, ph = p.height * 900;
    if (px - p.anchorX * pw >= 1440 || px + (1 - p.anchorX) * pw <= 0 || py - p.anchorY * ph >= 900 || py + (1 - p.anchorY) * ph <= 0) fail(`${path}.placement`, 'must intersect the 1440x900 logical canvas');
    object(item.hitMask, `${path}.hitMask`, ['encoding', 'width', 'height', 'rows']);
    const mask = item.hitMask;
    if (mask.encoding !== 'bitset-hex-msb') fail(`${path}.hitMask.encoding`, 'must be bitset-hex-msb');
    integer(mask.width, `${path}.hitMask.width`, 1, 256); integer(mask.height, `${path}.hitMask.height`, 1, 256);
    if (mask.width * item.sceneImage.pixelHeight !== mask.height * item.sceneImage.pixelWidth) fail(`${path}.hitMask`, 'aspect ratio must match sceneImage');
    if (!Array.isArray(mask.rows) || mask.rows.length !== mask.height) fail(`${path}.hitMask.rows`, 'must contain one row per mask pixel row');
    const hexLength = Math.ceil(mask.width / 4);
    const pad = (4 - mask.width % 4) % 4;
    for (const [rowIndex, row] of mask.rows.entries()) {
      if (typeof row !== 'string' || row.length !== hexLength || !/^[0-9a-f]+$/.test(row)) fail(`${path}.hitMask.rows[${rowIndex}]`, `must be ${hexLength} lowercase hex characters`);
      if (pad && (parseInt(row.at(-1), 16) & ((1 << pad) - 1)) !== 0) fail(`${path}.hitMask.rows[${rowIndex}]`, 'unused trailing bits must be zero');
    }
    totalMaskPixels += mask.width * mask.height;
    if (totalMaskPixels > MAX_MASK_PIXELS) fail('input.data.objects', 'total hit-mask pixels exceed 131072');
  }
  if (!requiredCount) fail('input.data.objects', 'at least one required clue is needed');
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_BYTES) fail('input', 'serialized UTF-8 envelope exceeds 64 KiB');
  return data;
}

export function makeInvestigationOutput(data, collectedObjectIds) {
  if (!Array.isArray(collectedObjectIds)) fail('output.data.collectedObjectIds', 'must be an array');
  const clueIds = new Set(data.objects.filter((item) => item.kind === 'clue').map((item) => item.objectId));
  const seen = new Set();
  for (const value of collectedObjectIds) {
    id(value, 'output.data.collectedObjectIds[]');
    if (!clueIds.has(value) || seen.has(value)) fail('output.data.collectedObjectIds', 'must contain unique clue object IDs only');
    seen.add(value);
  }
  if (data.objects.some((item) => item.kind === 'clue' && item.required && !seen.has(item.objectId))) fail('output.data.collectedObjectIds', 'omits a required clue');
  return {
    contract: OUTPUT_CONTRACT,
    version: CONTRACT_VERSION,
    data: { requestId: data.requestId, investigationId: data.investigationId, outcome: 'completed', collectedObjectIds: [...collectedObjectIds] },
  };
}

export function validateInvestigationOutput(value, inputData) {
  object(value, 'output', ['contract', 'version', 'data']);
  if (value.contract !== OUTPUT_CONTRACT || value.version !== CONTRACT_VERSION) fail('output', 'unsupported contract or version');
  const data = object(value.data, 'output.data', ['requestId', 'investigationId', 'outcome', 'collectedObjectIds']);
  if (data.requestId !== inputData.requestId || data.investigationId !== inputData.investigationId || data.outcome !== 'completed') fail('output.data', 'does not match the active investigation or completed outcome');
  const expected = makeInvestigationOutput(inputData, data.collectedObjectIds);
  return expected;
}
