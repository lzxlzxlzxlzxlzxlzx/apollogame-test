#!/usr/bin/env node
// 发布屏的统一文档闭包步：无论单个 App 的 build.mjs 如何实现，都以源码 manifest
// 为清单把调用说明刷新进 dist。schemaVersion 2 仅作历史包兼容，不伪造新字段。
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportAppDocumentation } from './app-documentation-closure.mjs';

const app = process.argv[2];
if (!app || !/^[a-z0-9-]+$/.test(app)) {
  console.error(`用法: dokiworld-docs-export.mjs <app>（小写/数字/连字符）·收到 ${JSON.stringify(app)}`);
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, '..');
const appRoot = resolve(repoRoot, 'dokiworld', app);
const manifest = JSON.parse(await readFile(resolve(appRoot, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 3) {
  console.log(`↷ ${app}: legacy schemaVersion ${String(manifest.schemaVersion)}，未声明当前 documentation 闭包`);
  process.exit(0);
}
const entries = await exportAppDocumentation({ manifest, appRoot, distRoot: resolve(appRoot, 'dist') });
console.log(`✓ ${app}: exported ${entries.length} integration document(s)`);
