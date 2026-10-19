import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { exportAppDocumentation, planAppDocumentationClosure, validateAppDocumentationSource } from './app-documentation-closure.mjs';

const valid = {
  documentation: {
    'zh-cn': { title: '调用说明', path: 'docs/integration.zh-CN.md' },
    en: { title: 'Integration guide', path: 'docs/integration.en.md' },
  },
};

test('plans supported localized Markdown documents deterministically', () => {
  assert.deepEqual(planAppDocumentationClosure(valid), [
    { locale: 'en', title: 'Integration guide', path: 'docs/integration.en.md' },
    { locale: 'zh-cn', title: '调用说明', path: 'docs/integration.zh-CN.md' },
  ]);
});

test('rejects missing declarations, unsafe paths, unknown locales and non-Markdown files', () => {
  assert.throws(() => planAppDocumentationClosure({}), /documentation is required/);
  assert.throws(() => planAppDocumentationClosure({ documentation: {} }), /at least one locale/);
  assert.throws(() => planAppDocumentationClosure({ documentation: { fr: { title: 'Guide', path: 'docs/fr.md' } } }), /unsupported.*fr/);
  assert.throws(() => planAppDocumentationClosure({ documentation: { en: { title: 'Guide', path: '../secret.md' } } }), /escapes/);
  assert.throws(() => planAppDocumentationClosure({ documentation: { en: { title: 'Guide', path: 'docs/guide.txt' } } }), /end in .md/);
});

test('validates source existence and exports every declared document', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'app-doc-closure-'));
  const appRoot = resolve(root, 'app');
  const distRoot = resolve(root, 'dist');
  await mkdir(resolve(appRoot, 'docs'), { recursive: true });
  await writeFile(resolve(appRoot, 'docs/integration.en.md'), '# English\n');
  await writeFile(resolve(appRoot, 'docs/integration.zh-CN.md'), '# 中文\n');
  try {
    await validateAppDocumentationSource({ manifest: valid, appRoot });
    await exportAppDocumentation({ manifest: valid, appRoot, distRoot });
    assert.equal(await readFile(resolve(distRoot, 'docs/integration.en.md'), 'utf8'), '# English\n');
    assert.equal(await readFile(resolve(distRoot, 'docs/integration.zh-CN.md'), 'utf8'), '# 中文\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fails closed when a declared source file is missing', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'app-doc-closure-missing-'));
  try {
    await assert.rejects(
      validateAppDocumentationSource({ manifest: valid, appRoot: root }),
      /missing documentation file/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
