#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/package-web-smoke.mjs —— package-web 端到端真构建冒烟（REQ-PKG）
//
//  用法：node scripts/package-web-smoke.mjs
//  跑真 vite 单文件构建（重·~分钟级），故 opt-in、不进默认 vitest 门禁。
//  钉死：库卡带 manifest → 单个自包含 HTML（零 http(s) 外链）+ 内联 __APOLLO_INLINE_CART__
//  + <title> 是游戏名 + 可解析 JSON。临时 fixture 建在 library/<slug>·跑完即清（零仓库污染）。
// ═══════════════════════════════════════════════════════════════

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { packageWeb, scanSelfContainment } from './package-web.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'pkgweb-smoke-fixture';
const FIX_DIR = join(ROOT, 'library', SLUG);
const OUT = join(ROOT, 'release', SLUG, `${SLUG}.html`);

// 弹跳小球 = 最小非平凡数据 manifest（纯 Shape/Color·零外部资产·全离线可跑）。
const MANIFEST = {
  capabilities: ['a1-transform', 'b1-velocity', 'b2-acceleration', 'c1-shape', 'l2-color',
    'd1-overlap-detect', 't1-accel-apply', 't1-motion-apply', 't2-collision-resolve', 't2-bounds-clamp'],
  entities: {
    camera: { Camera: { zoom: 1, offsetX: 320, offsetY: 200, rotation: 0, viewportW: 640, viewportH: 400 } },
    ball: {
      Transform: { x: 320, y: 60, rotation: 0, scaleX: 1, scaleY: 1 },
      Velocity: { vx: 2, vy: 0, angular: 0 }, Acceleration: { ax: 0, ay: 0.5 },
      Shape: { kind: 'circle', radius: 12 }, Color: { tint: 4886754, alpha: 1 },
      Mass: { value: 1 }, Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
    },
    ground: {
      Transform: { x: 320, y: 380, rotation: 0, scaleX: 1, scaleY: 1 },
      Shape: { kind: 'box', width: 640, height: 40 }, Color: { tint: 3553598, alpha: 1 }, Mass: { value: 0 },
    },
  },
};

let failed = 0;
function check(name, cond) {
  process.stdout.write(`${cond ? '  ✓' : '  ✗'} ${name}\n`);
  if (!cond) failed++;
}

async function run() {
  process.stdout.write(`[package-web-smoke] fixture=${SLUG}\n`);
  mkdirSync(FIX_DIR, { recursive: true });
  writeFileSync(join(FIX_DIR, 'manifest.json'), JSON.stringify(MANIFEST, null, 2));
  writeFileSync(join(FIX_DIR, 'meta.json'), JSON.stringify({ name: '弹跳冒烟', tagline: '离线自包含验证' }));

  try {
    process.stdout.write('  … 真 vite 单文件构建中（约 1 分钟）\n');
    const out = await packageWeb(ROOT, SLUG, OUT);
    check('产物存在', existsSync(out));
    const html = readFileSync(out, 'utf8');
    check('自包含（零 http(s) 外链）', scanSelfContainment(html).length === 0);
    check('内联 window.__APOLLO_INLINE_CART__', html.includes('window.__APOLLO_INLINE_CART__='));
    check('<title> 是游戏名', html.includes('<title>弹跳冒烟</title>'));
    check('内联卡带含 ball 实体（manifest 真进去了）', html.includes('ball') && html.includes('Velocity'));
    // P2e 验收（engine-architecture-review-2026-09-02 §5 P2e）：10 能力卡带的外壳 JS < 120 KB（裁剪前 ~317 KB）；
    // 没点名的能力连名字都不该出现（rollup 真摇掉了·不是只藏起来）。
    const scriptBytes = [...html.matchAll(/<script(?![^>]*__APOLLO_INLINE_CART__)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => Buffer.byteLength(m[1])).reduce((a, b) => a + b, 0);
    process.stdout.write(`  · 外壳 JS ${Math.round(scriptBytes / 1024)} KB\n`);
    check('产物体量合理（>40KB·bundle 真内联）', readFileSync(out).length > 40 * 1024);
    check('P2e 摇树：外壳 JS < 120 KB', scriptBytes < 120 * 1024);
    check('P2e 摇树：未点名能力零命中（matrix-duel / hand-pattern / poker-hand 的 id 串）', !html.includes('matrix-duel') && !html.includes('hand-pattern') && !html.includes('poker-hand'));
  } finally {
    rmSync(FIX_DIR, { recursive: true, force: true });
    rmSync(join(ROOT, 'release', SLUG), { recursive: true, force: true });
  }

  process.stdout.write(failed === 0 ? '[package-web-smoke] PASS\n' : `[package-web-smoke] FAIL（${failed} 项）\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  rmSync(FIX_DIR, { recursive: true, force: true });
  process.stderr.write(`[package-web-smoke] 异常：${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
