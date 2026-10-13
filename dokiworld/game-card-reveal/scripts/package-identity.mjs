// One App-specific identity contract shared by build, dist verification and tests.
export const APP_ID = 'game-card-reveal';
export const INPUT_CONTRACT = 'doki.game.card-reveal-input';
export const OUTPUT_CONTRACT = 'doki.game.card-reveal-result';
export const DOCUMENT_PATH = 'docs/integration.zh-CN.md';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(condition, message) { if (!condition) throw new Error(`Card reveal package identity: ${message}`); }

export function validateManifest(manifest, packageVersion) {
  check(object(manifest), 'manifest must be an object');
  check(manifest.schemaVersion === 3, 'schemaVersion must be 3');
  check(manifest.id === APP_ID, 'manifest id does not match App directory and SDK appId');
  check(typeof manifest.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version), 'version must be SemVer');
  check(manifest.version === packageVersion, 'manifest/package version mismatch');
  check(manifest.entry === 'index.html', 'entry must be the package-root index.html');
  check(same(manifest.context, { requiredScopes: [], optionalScopes: [] }), 'unexpected scopes');
  check(object(manifest.locales) && Object.keys(manifest.locales).sort().join(',') === 'en,zh-cn', 'en and zh-cn locales required');
  for (const locale of ['en', 'zh-cn']) {
    check(typeof manifest.locales[locale]?.name === 'string' && manifest.locales[locale].name.trim(), `${locale} name required`);
    check(typeof manifest.locales[locale]?.description === 'string' && manifest.locales[locale].description.trim(), `${locale} description required`);
  }
  check(object(manifest.documentation) && Object.keys(manifest.documentation).join(',') === 'zh-cn', 'only the declared zh-cn document is allowed');
  check(manifest.documentation['zh-cn']?.path === DOCUMENT_PATH && typeof manifest.documentation['zh-cn']?.title === 'string' && manifest.documentation['zh-cn'].title.trim(), 'documentation path/title mismatch');
  check(object(manifest.runtime) && manifest.runtime.protocol === 'dokiworld.app' && manifest.runtime.protocolVersion === 2, 'runtime must be dokiworld.app/2');
  check(same(manifest.runtime.input, { contract: INPUT_CONTRACT, version: 1 }), 'input contract mismatch');
  check(same(manifest.runtime.outputs, [{ contract: OUTPUT_CONTRACT, version: 1 }]), 'output contract mismatch');
  check(same(manifest.runtime.modules, []), 'modules must be the empty closed set');
  return manifest;
}

export function validateSdkSource(source) {
  check(/createAppClient\(\{\s*appId:\s*'game-card-reveal'\s*,/.test(source), 'createAppClient appId mismatch');
  check(/app\.connect\(\)/.test(source) && /app\.whenReady\(\{\s*timeoutMs:\s*10_000\s*\}\)/.test(source), 'SDK lifecycle anchor missing');
}
