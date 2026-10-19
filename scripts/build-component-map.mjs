#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/build-component-map.mjs —— 运行时组件全集清单生成器（8/4 大评审根因②）
//
//  背景：组件全集此前只有编译期形态——`src/assembly/component-map.ts` 的 ComponentDataMap
//  接口（类型层·运行时不可枚举）；`COMPONENT_PROVIDERS` 只含 capability 声明提供的组件，
//  缺全部核心/渲染组件。后果 = `NON_DETERMINISTIC` 这类手维护名单没有可信全集可对账，
//  拼错一个名字即静默失效（多算→误报 desync，少算→假绿）。
//
//  本生成器把「组件全集」落成一份**运行时可枚举**的产物 `src/assembly/component-universe.gen.ts`：
//    来源 A = src/engine/protocol/components/*.ts 全部 `readonly type: 'X'`
//             （复用 component-manifest-guard.mjs 的 scanComponents·同一真相源）；
//    来源 B = src/skills/** 内 `interface X extends Component` 声明的 skill 组件
//             （dialogue 的 3 个 + matrix-duel 的 3 个·层级倒挂另案归位·与 ComponentDataMap 口径一致）。
//  确定性输出：升序去重·固定模板·同输入同字节（Set 收集后 sort，与目录遍历序无关）。
//  消费者：NON_DETERMINISTIC ⊆ 全集对账（src/net/determinism.test.ts）+ 后续装配校验/catalog。
//
//  用法：
//    node scripts/build-component-map.mjs           # 生成/刷新产物（加/改/删组件后同提交重跑）
//    node scripts/build-component-map.mjs --check   # 守卫：现算结果 vs 在档产物，漂移=红（退出码 1）
//  过期防护：--check 之外另有 vitest 门 `scripts/build-component-map.test.mjs`（随全量门禁跑，
//  忘了重跑生成命令 → 该测试亮红并点名漂移组件）。
//  纯 node/fs·文本扫描（组件声明的稳定形态·同 component-manifest-guard.mjs）。
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { scanComponents, diffComponents } from './component-manifest-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'src', 'skills');
const OUT_FILE = join(ROOT, 'src', 'assembly', 'component-universe.gen.ts');

/** 递归收 dir 下全部 .ts 源文件（跳过测试）。返回排序无关的列表（调用方用 Set 去序）。 */
function tsSources(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...tsSources(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(p);
  }
  return files;
}

/** 扫 src/skills/** 内 skill 定义的组件：`interface X extends Component` 头部数行内的
 *  `readonly type: 'X'` 字面量（组件契约的稳定形态：type 总在 interface 开头）。导出供单测。 */
export function scanSkillComponents(dir = SKILLS_DIR) {
  const names = new Set();
  for (const file of tsSources(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/\binterface\s+[A-Za-z0-9]+\s+extends\s+[^{]*\bComponent\b/.test(lines[i])) continue;
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/readonly type:\s*'([A-Za-z0-9]+)'/);
        if (m) { names.add(m[1]); break; }
      }
    }
  }
  return [...names].sort();
}

/** 全集 = protocol 组件 ∪ skill 组件（升序去重）。导出供单测/守卫。 */
export function computeUniverse() {
  return [...new Set([...scanComponents(), ...scanSkillComponents()])].sort();
}

/** 把全集渲染成产物模块源码（固定模板·同输入同字节）。导出供单测/守卫。 */
export function renderUniverseModule(names) {
  return [
    '// ═══════════════════════════════════════════════════════════════',
    '//  src/assembly/component-universe.gen.ts —— 运行时组件全集清单（生成物·勿手改）',
    '//',
    '//  由 `node scripts/build-component-map.mjs` 生成（确定性输出：升序去重·同输入同字节）。',
    '//  来源 = src/engine/protocol/components/*.ts 全部组件 + src/skills/** 内 extends Component',
    '//  的 skill 组件——即编译期闭集 ComponentDataMap（component-map.ts）的运行时可枚举对应物。',
    '//  消费者：NON_DETERMINISTIC ⊆ 全集对账（determinism.test.ts）· 装配校验 · capability catalog。',
    '//  加/改/删组件后同提交重跑生成命令；忘了 → scripts/build-component-map.test.mjs 漂移守卫亮红。',
    '// ═══════════════════════════════════════════════════════════════',
    '',
    `/** 全部运行时组件名（${names.length} 个·升序去重·生成物）。 */`,
    'export const COMPONENT_UNIVERSE = [',
    ...names.map((n) => `  '${n}',`),
    '] as const;',
    '',
    '/** 组件名字面量联合（生成物）。 */',
    'export type RuntimeComponentName = (typeof COMPONENT_UNIVERSE)[number];',
    '',
    '/** O(1) 成员查询视图（对账/校验用）。 */',
    'export const COMPONENT_UNIVERSE_SET: ReadonlySet<string> = new Set(COMPONENT_UNIVERSE);',
    '',
  ].join('\n');
}

/** 从在档产物里刮回组件名（--check 报「差在哪」用）。导出供单测。 */
export function parseUniverseModule(src) {
  const m = src.match(/COMPONENT_UNIVERSE = \[\n([\s\S]*?)\] as const;/);
  if (!m) return [];
  return [...m[1].matchAll(/'([A-Za-z0-9]+)',/g)].map((x) => x[1]);
}

function main(argv) {
  const names = computeUniverse();
  const rendered = renderUniverseModule(names);
  if (argv.includes('--check')) {
    let onDisk = null;
    try { onDisk = readFileSync(OUT_FILE, 'utf8'); } catch { /* 产物缺失 → 下方 FAIL */ }
    if (onDisk === rendered) {
      process.stdout.write(`[component-universe] 在档产物与现算一致（${names.length} 个组件）\nCOMPONENT-UNIVERSE: PASS\n`);
      return;
    }
    const { added, removed } = diffComponents(names, onDisk === null ? [] : parseUniverseModule(onDisk));
    const out = ['[component-universe] 在档产物与现算结果漂移（加/改/删组件后忘了重新生成？）'];
    if (onDisk === null) out.push('  ✖ 产物不存在');
    if (added.length) out.push(`  ✚ 现算有、在档缺：${added.join(', ')}`);
    if (removed.length) out.push(`  ✖ 在档有、现算无（改名/删除）：${removed.join(', ')}`);
    if (!added.length && !removed.length && onDisk !== null) out.push('  ✖ 名单一致但字节漂移（产物被手改？生成物勿手改）');
    out.push('  → 重跑 `node scripts/build-component-map.mjs` 刷新产物并同提交。');
    out.push('COMPONENT-UNIVERSE: FAIL');
    process.stderr.write(out.join('\n') + '\n');
    process.exit(1);
  }
  writeFileSync(OUT_FILE, rendered);
  process.stdout.write(`[component-universe] 已生成 ${OUT_FILE}（${names.length} 个组件）\n`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) main(process.argv.slice(2));
