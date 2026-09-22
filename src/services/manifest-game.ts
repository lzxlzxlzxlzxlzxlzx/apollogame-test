// mountManifestGame —— 内置「纯数据游戏」通用薄宿主（源起 2026-07-10 官方示例先例·该两款 2026-07-16 已删·
// 曾消费者含 game-q（已随 REQ-RETRO 引擎大扫除 2026-08-03 删除），现消费者=game-103/game102 等内置数据游戏）。
//
// 一个内置数据游戏 = public/games/<slug>/manifest.json（tracked·纯 JSON）+ 本地美术 index + 本宿主。
// 职责（全在 sim 外·零玩法逻辑·同已删 game-q 曾用的 host 纪律）：
//   fetch manifest →（残留 art: 引用则经素材库解析）→ parseManifest → Engine + CanvasRenderer(+AssetManager)
//   + 画布指针逆投影入队。世界坐标=画布逻辑坐标（manifest 自带居中相机·1:1）。
// 美术管线：台账/生成/替换走美术平台 library 线（manifestFile 已回退到 public/games/<slug>/manifest.json）。
import { Engine } from '../runtime/engine.js';
import { CanvasRenderer } from '@renderer/index.js';
import { QueuedInputSource, canvasPointerToScreen } from '@net/host/index.js';
import { parseManifest } from '../assembly/manifest.js';
import { resolveArtRefs } from '../assembly/resolve-art-refs.js';
import { AssetManager, ImageAssetLoader, parseAssetIndex, registerAssetIndex, artlibRecords } from '@assets/index.js';

const W = 640;
const H = 400;

export function mountManifestGame(slug: string) {
  return function mount(container: HTMLElement): () => void {
    let dead = false;
    let engine: Engine | null = null;
    let onDown: ((e: PointerEvent) => void) | null = null;
    let canvas: HTMLCanvasElement | null = null;

    void (async () => {
      // 1) manifest（tracked 纯数据=游戏本体）
      let raw: unknown;
      try {
        const r = await fetch(`/games/${slug}/manifest.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        raw = await r.json();
      } catch (e) {
        container.textContent = `加载失败：/games/${slug}/manifest.json（${String(e)}）`;
        return;
      }
      // 2) 残留 art: 引用 → 免费素材库解析（已钉死的引用原样通过；索引缺失不阻塞）
      try {
        const idx = await fetch('/assets/FreeArtLib/index.json').then((r) => (r.ok ? r.json() : null));
        if (idx) raw = resolveArtRefs(raw, artlibRecords(idx)).manifest;
      } catch { /* 无素材索引 → Shape 回退观感 */ }
      const bp = parseManifest(raw);
      if (dead) return;
      // 3) 皮肤资产：本地 index（gen/ 生成物 + 上传物）——就绪即换装，缺失=Shape 回退（观感承诺同已删 game-q 先例）
      const assets = new AssetManager(new ImageAssetLoader());
      try {
        const r = await fetch(`/games/${slug}/art/index.json`, { cache: 'no-store' });
        if (r.ok) {
          registerAssetIndex(assets, parseAssetIndex(await r.json()));
          void assets.loadAll();
        }
      } catch { /* 无本地美术 → 回退观感 */ }
      if (dead) return;
      // 4) 引擎 + 渲染 + 指针
      const input = new QueuedInputSource(slug);
      engine = new Engine({ input });
      engine.load(bp);
      // 渲染后端选择：缺省 CanvasRenderer；`?renderer=webgl2` → WebGL2 实例化批渲原型（REQ-3D-RENDER-EFFICIENCY
      //   增量②·上千同类实体 draw 坍缩）。动态 import 让 GL 代码只在 opt-in 时进包（不拖累缺省 canvas 消费者）。
      const wantWebgl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('renderer') === 'webgl2';
      let renderer;
      if (wantWebgl) {
        try {
          const { WebGLRenderer } = await import('@renderer/webgl/webgl-renderer.js');
          if (dead) return;
          renderer = new WebGLRenderer({ width: W, height: H, background: 'transparent', assets });
        } catch (e) {
          console.warn('[manifest-game] WebGL2 后端不可用·退回 CanvasRenderer：', e); // 无 WebGL2 环境优雅退化
          renderer = new CanvasRenderer({ width: W, height: H, background: 'transparent', assets });
        }
      } else {
        renderer = new CanvasRenderer({ width: W, height: H, background: 'transparent', assets });
      }
      engine.attachRenderer(renderer, container);
      canvas = container.querySelector('canvas');
      if (canvas) {
        onDown = (e: PointerEvent) => {
          const c = canvas!;
          const rect = c.getBoundingClientRect();
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
          const p = canvasPointerToScreen(e.clientX, e.clientY, rect, c.width / dpr, c.height / dpr);
          input.enqueue({ source: slug, x: p.x, y: p.y, phase: 'down' });
        };
        canvas.addEventListener('pointerdown', onDown);
      }
      engine.start();
    })();

    return () => {
      dead = true;
      if (canvas && onDown) canvas.removeEventListener('pointerdown', onDown);
      engine?.stop();
      container.innerHTML = '';
    };
  };
}
