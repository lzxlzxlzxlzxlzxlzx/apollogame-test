// DokiWorld App 调用文档闭包：manifest 是唯一清单，构建时校验并复制所有声明文档。
import { copyFile, lstat, mkdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const SUPPORTED_LOCALES = new Set(['en', 'zh-cn']);
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/;

function invariant(condition, message) {
  if (!condition) throw new Error(`App documentation closure: ${message}`);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function safeMarkdownPath(value, locale) {
  invariant(typeof value === 'string' && value.length > 0, `documentation.${locale}.path must be a non-empty string`);
  invariant(SAFE_PATH.test(value) && !value.includes('\\'), `documentation.${locale}.path must be a plain POSIX path`);
  invariant(!value.startsWith('/') && !value.split('/').some((part) => part === '' || part === '.' || part === '..'), `documentation.${locale}.path escapes the app root`);
  invariant(value.toLowerCase().endsWith('.md'), `documentation.${locale}.path must end in .md`);
  return value;
}

export function planAppDocumentationClosure(manifest) {
  invariant(record(manifest), 'manifest must be an object');
  invariant(record(manifest.documentation), 'manifest.documentation is required');
  const entries = Object.entries(manifest.documentation);
  invariant(entries.length > 0, 'manifest.documentation must declare at least one locale');

  return Object.freeze(entries.map(([locale, spec]) => {
    invariant(SUPPORTED_LOCALES.has(locale), `unsupported documentation locale ${locale}`);
    invariant(record(spec), `documentation.${locale} must be an object`);
    invariant(typeof spec.title === 'string' && spec.title.trim().length > 0 && spec.title.length <= 200,
      `documentation.${locale}.title must be 1-200 characters`);
    invariant(spec.title === spec.title.trim(), `documentation.${locale}.title must not have surrounding whitespace`);
    return Object.freeze({ locale, title: spec.title, path: safeMarkdownPath(spec.path, locale) });
  }).sort((a, b) => a.locale.localeCompare(b.locale)));
}

export async function validateAppDocumentationSource({ manifest, appRoot }) {
  const root = resolve(appRoot);
  const entries = planAppDocumentationClosure(manifest);
  for (const entry of entries) {
    const source = resolve(root, ...entry.path.split('/'));
    invariant(inside(root, source), `${entry.path} escapes the app root`);
    const info = await lstat(source).catch(() => null);
    invariant(info?.isFile(), `missing documentation file ${entry.path}`);
    invariant(!info.isSymbolicLink(), `symbolic-link documentation is forbidden: ${entry.path}`);
  }
  return entries;
}

export async function exportAppDocumentation({ manifest, appRoot, distRoot }) {
  const sourceRoot = resolve(appRoot);
  const outputRoot = resolve(distRoot);
  const entries = await validateAppDocumentationSource({ manifest, appRoot: sourceRoot });

  for (const entry of entries) {
    const source = resolve(sourceRoot, ...entry.path.split('/'));
    const target = resolve(outputRoot, ...entry.path.split('/'));
    invariant(inside(outputRoot, target), `${entry.path} escapes the dist root`);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
  }
  return entries;
}
