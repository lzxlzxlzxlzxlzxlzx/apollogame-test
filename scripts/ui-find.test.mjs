// UI 索引守卫（REQ-UIINDEX）：`catalog.ts` 的 `demo[]` 活范例指针必须**真指得到**——
// 段 id 在 `games/game-i/gallery.ts` 里不存在 = 死链 = 索引烂掉（agent 按它去找会扑空）。
// 同 `build-component-map.test.mjs` / `docs-ref-guard.test.mjs` 的防漂移套路：随全量门禁跑，
// 谁删/改了展台段而没同步 catalog，这里当场亮红并点名。
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSrc = readFileSync(resolve(ROOT, 'src/ui/components/catalog.ts'), 'utf8');
const gallerySrc = readFileSync(resolve(ROOT, 'games/game-i/gallery.ts'), 'utf8');

/** 直接读真 catalog（Node22 类型擦除·不正则刮取）。 */
const loadCatalog = () => {
  const out = execFileSync(process.execPath,
    ['--experimental-strip-types', '--no-warnings', '-e',
      `import(${JSON.stringify(pathToFileURL(resolve(ROOT, 'src/ui/components/catalog.ts')).href)}).then(m=>console.log(JSON.stringify(m.UI_CATALOG)))`],
    { encoding: 'utf8', cwd: ROOT });
  return JSON.parse(out);
};

describe('UI 索引（catalog.demo → game-i 展台段）', () => {
  const catalog = loadCatalog();
  const sections = new Set([...gallerySrc.matchAll(/sectionTitle\('([^']+)'/g)].map((m) => m[1]));

  it('gallery 段 id 可枚举（索引的对账基准在）', () => {
    expect(sections.size).toBeGreaterThan(60);
  });

  it('【核心】demo 指的每个 tab-* 段都真存在于 gallery.ts（零死链）', () => {
    const dead = [];
    for (const s of catalog) {
      for (const d of s.demo ?? []) {
        // 整页演示放行：mod-*（整屏模块·屏在各自文件）· section===tab（该 tab 整页演·如 tab-shop/tab-pick）
        if (d.section === d.tab || d.tab.startsWith('mod-')) continue;
        if (!sections.has(d.section)) dead.push(`${s.type} → ${d.tab}/${d.section}`);
      }
    }
    expect(dead, `死链（catalog 指的展台段不存在）：\n${dead.join('\n')}`).toEqual([]);
  });

  it('demo 条目结构合法（tab/section 非空·tab 是 tab-*/mod-*）', () => {
    const bad = [];
    for (const s of catalog) {
      for (const d of s.demo ?? []) {
        if (!d.tab || !d.section) bad.push(`${s.type}: 缺 tab/section`);
        else if (!/^(tab|mod)-/.test(d.tab)) bad.push(`${s.type}: tab='${d.tab}' 非 tab-*/mod-*`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('检索命中面在：绝大多数控件有中文俗名 tags（agent 按「血条」找得到）', () => {
    const noTags = catalog.filter((s) => !(s.tags ?? []).length).map((s) => s.type);
    // 允许少数纯结构件无俗名；大面积缺失 = 索引没建起来
    expect(noTags.length, `缺 tags 的控件：${noTags.join(', ')}`).toBeLessThanOrEqual(6);
  });

  it('UiComponentSpec 带 demo/tags 字段（schema 在·防被回删）', () => {
    expect(catalogSrc).toMatch(/demo\?:\s*readonly UiDemoRef\[\]/);
    expect(catalogSrc).toMatch(/tags\?:\s*readonly string\[\]/);
  });

  it('ui-find --check 退出码 0（守卫自身可跑）', () => {
    const r = execFileSync(process.execPath, [resolve(ROOT, 'scripts/ui-find.mjs'), '--check'], { encoding: 'utf8', cwd: ROOT });
    expect(r).toContain('零死链');
  });
});
