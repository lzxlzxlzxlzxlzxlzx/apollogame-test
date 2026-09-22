// scripts/depcruise-fence.test.mjs —— P0 治理围栏自测（.dependency-cruiser.cjs · 原 decouple-check.test 的替身）
//
// 红腿走临时树（hermetic）：种 games/game-a → ../game-b 逃逸 + src/studio → games 反向依赖 + 解析不到的 import，
// 用真仓的配置文件跑 depcruise CLI，断言三条规则各恰命中、退出码 = 3（违规条数）。绿腿 = 真仓零违规（门禁 depcruise 步 + 包装入口）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const BIN = resolve(ROOT, 'node_modules/.bin/depcruise');
const CONFIG = resolve(ROOT, '.dependency-cruiser.cjs');

function put(root, rel, text) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), text);
}

describe('dependency-cruiser 围栏', () => {
  it('红腿：相对逃逸 / src→games / 解析不到 三条规则各恰命中·exit 1', () => {
    const root = mkdtempSync(join(tmpdir(), 'zc-depcruise-'));
    try {
      writeFileSync(join(root, 'tsconfig.json'), '{ "compilerOptions": { "module": "ESNext", "moduleResolution": "bundler" } }');
      put(root, 'games/game-b/x.ts', 'export const x = 1;');
      put(root, 'games/game-a/index.ts', "import { x } from '../game-b/x.js';\nimport { y } from './own.js';\nexport const a = x + y;\n");
      put(root, 'games/game-a/own.ts', 'export const y = 2;');
      put(root, 'src/studio/Foo.ts', "import { a } from '../../games/game-a/index.js';\nimport { gone } from './does-not-exist.js';\nexport const f = a + gone;\n");
      const r = spawnSync(BIN, ['--config', CONFIG, 'src', 'games'], { cwd: root, encoding: 'utf8' });
      const out = r.stdout + r.stderr;
      expect(r.status, out).toBe(3); // dependency-cruiser 退出码 = 违规条数（非 0 即红·门禁只认非 0）
      expect(out).toMatch(/games-no-relative-escape: games\/game-a\/index\.ts → games\/game-b\/x\.ts/);
      expect(out).toMatch(/src-no-games: src\/studio\/Foo\.ts → games\/game-a\/index\.ts/);
      expect(out).toMatch(/not-to-unresolvable: src\/studio\/Foo\.ts → \.\/does-not-exist\.js/);
      expect(out).not.toMatch(/games\/game-a\/index\.ts → games\/game-a\/own\.ts/); // 同游戏内相对引用合法
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('绿腿：真仓零违规（包装入口 scripts/decouple-check.mjs exit 0）', () => {
    const r = spawnSync('node', ['scripts/decouple-check.mjs'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/零违规/);
  }, 120_000);
});
