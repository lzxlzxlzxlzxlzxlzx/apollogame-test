#!/usr/bin/env node
// 全库 DokiWorld App 调用文档守卫。纯读取，不构建、不启动服务。
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateAppDocumentationSource } from './app-documentation-closure.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const appsRoot = resolve(repoRoot, 'dokiworld');
const requested = process.argv.slice(2);
const names = requested.length > 0
  ? requested
  : (await readdir(appsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

let checked = 0;
let legacy = 0;
for (const name of names) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid DokiWorld App directory name: ${name}`);
  const appRoot = resolve(appsRoot, name);
  const manifestPath = resolve(appRoot, 'manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8').catch((error) => {
    if (requested.length === 0 && error?.code === 'ENOENT') return null;
    throw error;
  });
  if (manifestText === null) continue;
  const manifest = JSON.parse(manifestText);
  // schemaVersion 2 是历史发布路线；当前 documentation 目录能力属于 schemaVersion 3。
  // 显式点名（某 App 正在更新）时不豁免，迫使更新者先迁到当前规范。
  if (requested.length === 0 && manifest.schemaVersion !== 3) {
    legacy += 1;
    continue;
  }
  await validateAppDocumentationSource({ manifest, appRoot });
  checked += 1;
}

if (checked === 0) throw new Error('No DokiWorld App manifests were checked.');
console.log(`✓ DokiWorld App documentation closure: ${checked} current app(s)${legacy ? `; ${legacy} legacy app(s) skipped` : ''}`);
