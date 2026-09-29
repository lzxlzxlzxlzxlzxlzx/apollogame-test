#!/usr/bin/env node
// dokiworld app 测试 runner（DOKI-APPS 后续①·scoped-gate 的 doki-test:<app> 步）：
// 缺 node_modules 才 npm ci（同 main_entry/packaging.py 出包 job 口径），然后 npm test。
// 退出码透传——红=拦推送。独立成脚本是因为 planFor 的步是声明式 [bin,args]，装依赖的条件逻辑塞不进去。
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const app = process.argv[2];
if (!app || !/^[a-z0-9-]+$/.test(app)) { console.error(`用法: doki-app-test.mjs <app>（小写/数字/连字符）·收到 ${JSON.stringify(app)}`); process.exit(1); }
const dir = join('dokiworld', app);
if (!existsSync(join(dir, 'package.json'))) { console.error(`✗ ${dir}/package.json 不存在（不是 app 目录）`); process.exit(1); }
const docs = spawnSync(process.execPath, ['scripts/dokiworld-docs-guard.mjs', app], { stdio: 'inherit' });
if ((docs.status ?? 1) !== 0) { console.error(`✗ 调用文档闭包失败（${dir}）`); process.exit(docs.status ?? 1); }
if (!existsSync(join(dir, 'node_modules'))) {
  const ci = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  if ((ci.status ?? 1) !== 0) { console.error(`✗ npm ci 失败（${dir}）`); process.exit(ci.status ?? 1); }
}
const t = spawnSync('npm', ['test'], { cwd: dir, stdio: 'inherit' });
process.exit(t.status ?? 1);
