// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Camera, Transform, WorldUI2D } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { validateLayoutNode, type LayoutNode } from '@ui/components/index.js';
import { projectWorldUi2D, WorldUi2DLayer, worldUi2DTree } from './world-ui2d.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { clampLifeCameraView, lifeCellToWorld, projectLifeCameraView, projectLifePointToScreen } from './life-scene-render.js';

function addAnchor(world: World, id: string, x: number, y: number, ui: Omit<WorldUI2D, 'type'>): void {
  world.createEntity(id);
  world.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  world.addComponent(id, { type: 'WorldUI2D', ...ui } as WorldUI2D);
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('WorldUI2D projection', () => {
  it('uses the generic Camera viewport/zoom and hides offscreen points', () => {
    const camera = { centerX: 100, centerY: 50, zoom: 2 };
    expect(projectWorldUi2D(110, 45, camera, 800, 400)).toEqual({ x: 420, y: 190, visible: true });
    expect(projectWorldUi2D(400, 45, camera, 800, 400).visible).toBe(false);
  });

  it('converts Life grid coordinates exactly once before applying the grid-unit camera', () => {
    const projected = projectWorldUi2D(10, 5, { centerX: 10.5, centerY: 5.5, zoom: 1 }, 900, 620, { kind: 'life-cell', options: { cellSize: 32 } });
    expect(projected).toEqual({ x: 450, y: 310, visible: true });
  });

  it('shares the responsive effective Life camera exactly with Canvas projection', () => {
    const width = 640; const height = 668; const options = { cellSize: 32 };
    const point = lifeCellToWorld(0, -0.2, options);
    const effective = clampLifeCameraView({ centerX: 14, centerY: 9.5, zoom: 668 / (19 * 32) }, width, height, 36, 26, lifeCellToWorld(0, 0, options), options);
    const canvas = projectLifePointToScreen(point, projectLifeCameraView(effective, width, height, options));
    const overlay = projectWorldUi2D(0, -0.2, effective, width, height, { kind: 'life-cell', options });
    expect(overlay.visible).toBe(true);
    expect(overlay.x).toBeCloseTo(canvas.x, 10); expect(overlay.y).toBeCloseTo(canvas.y, 10);
  });
});

describe('WorldUi2DLayer', () => {
  it('is wired through CanvasRenderer only when an explicit overlay host is provided', () => {
    const context = new Proxy({ globalAlpha: 1, imageSmoothingEnabled: true } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (target[key] = vi.fn()),
      set: (target, key: string, value) => { target[key] = value; return true; },
    });
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => context;
    const world = new World(); addAnchor(world, 'player', 10, 5, { text: '交谈（E）' });
    world.createEntity('camera'); world.addComponent('camera', { type: 'Camera', zoom: 1, offsetX: 10.5, offsetY: 5.5, rotation: 0, viewportW: 28, viewportH: 19 } as Camera);
    const scene = document.createElement('div'); const overlay = document.createElement('div'); scene.appendChild(overlay);
    const renderer = new CanvasRenderer({ width: 900, height: 620, lifePreviewOptions: { cellSize: 32 }, worldUi2D: { host: overlay } });
    renderer.init(scene); renderer.sync(world.readView());
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="player"]')!;
    expect(host.style.left).toBe('450px'); expect(host.style.top).toBe('310px');
    renderer.destroy(); expect(overlay.children).toHaveLength(0);

    const legacyScene = document.createElement('div'); const legacy = new CanvasRenderer({ width: 100, height: 100 });
    expect(() => { legacy.init(legacyScene); legacy.sync(world.readView()); legacy.destroy(); }).not.toThrow();
  });

  it('keeps Life Canvas and WorldUI on the same responsive cover projection across resize', () => {
    const context = new Proxy({ globalAlpha: 1, imageSmoothingEnabled: true } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (target[key] = vi.fn()),
      set: (target, key: string, value) => { target[key] = value; return true; },
    });
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => context;
    const world = new World(); addAnchor(world, 'player', 11, 5, { text: '交谈（E）' });
    world.createEntity('camera'); world.addComponent('camera', { type: 'Camera', zoom: 1, offsetX: 10.5, offsetY: 5.5, rotation: 0, viewportW: 28, viewportH: 19 } as Camera);
    const scene = document.createElement('div'); const overlay = document.createElement('div');
    Object.defineProperty(scene, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(scene, 'clientHeight', { value: 668, configurable: true });
    const renderer = new CanvasRenderer({
      width: 900, height: 568, lifePreviewOptions: { cellSize: 32 }, viewport: { mode: 'responsive', cameraFit: 'cover' }, worldUi2D: { host: overlay },
    });
    renderer.init(scene); renderer.sync(world.readView());
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="player"]')!;
    const scaleA = 668 / (19 * 32);
    expect(parseFloat(host.style.left)).toBeCloseTo(320 + 32 * scaleA, 5);
    expect(parseFloat(host.style.top)).toBeCloseTo(334, 5);

    Object.defineProperty(scene, 'clientWidth', { value: 1060, configurable: true });
    Object.defineProperty(scene, 'clientHeight', { value: 708, configurable: true });
    window.dispatchEvent(new Event('resize')); renderer.sync(world.readView());
    const scaleB = 1060 / (28 * 32);
    expect(parseFloat(host.style.left)).toBeCloseTo(530 + 32 * scaleB, 5);
    expect(parseFloat(host.style.top)).toBeCloseTo(354, 5);
    expect(scene.querySelector<HTMLCanvasElement>('canvas')?.width).toBe(1060);
    renderer.destroy();
  });

  it('mounts, updates, hides and removes pooled LayoutNode hosts without intercepting pointers', () => {
    const world = new World(); const overlay = document.createElement('div'); document.body.appendChild(overlay);
    addAnchor(world, 'npc', 40, 30, { text: '交谈（E）', offsetY: -8 });
    const layer = new WorldUi2DLayer(); layer.init(overlay); layer.sync(world.readView(), null, 200, 100);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="npc"]')!;
    expect(host).toBeTruthy(); expect(host.style.left).toBe('40px'); expect(host.style.top).toBe('22px');
    expect(host.style.pointerEvents).toBe('none'); expect(host.textContent).toContain('交谈（E）');

    world.addComponent('npc', { type: 'WorldUI2D', text: '采集（E）', offsetY: -8 } as WorldUI2D);
    layer.sync(world.readView(), null, 200, 100);
    expect(host.textContent).toContain('采集（E）');
    world.getComponent<Transform>('npc', 'Transform')!.x = 500;
    layer.sync(world.readView(), null, 200, 100); expect(host.style.display).toBe('none');
    world.removeComponent('npc', 'WorldUI2D'); layer.sync(world.readView(), null, 200, 100);
    expect(overlay.querySelector('[data-entity-anchor="npc"]')).toBeNull();
    layer.dispose();
  });

  it('merges a render-local presentation source without materializing or mutating World state', () => {
    const world = new World(); addAnchor(world, 'npc', 20, 10, { text: '交谈（E）' });
    const before = world.snapshot(); const overlay = document.createElement('div');
    let source = [{
      entityId: 'life:player', transform: { x: 8, y: 4 },
      node: { type: 'Label' as const, id: 'player-prompt', props: { text: '互动（E）' } },
    }];
    const layer = new WorldUi2DLayer({ source: () => source });
    layer.init(overlay); layer.sync(world.readView(), null, 100, 100);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(host.textContent).toContain('互动（E）'); expect(host.style.left).toBe('8px'); expect(host.style.pointerEvents).toBe('none');
    expect(overlay.querySelector('[data-entity-anchor="npc"]')?.textContent).toContain('交谈（E）');
    source = [{ entityId: 'npc', transform: { x: 25, y: 12 }, node: { type: 'Label', id: 'npc-menu', props: { text: '宿主菜单' } } }];
    layer.sync(world.readView(), null, 100, 100);
    expect(overlay.querySelectorAll('[data-entity-anchor="npc"]')).toHaveLength(1);
    expect(overlay.querySelector('[data-entity-anchor="npc"]')?.textContent).toContain('宿主菜单');
    source = []; layer.sync(world.readView(), null, 100, 100);
    expect(overlay.children).toHaveLength(1); expect(overlay.querySelector('[data-entity-anchor="life:player"]')).toBeNull();
    expect(overlay.querySelector('[data-entity-anchor="npc"]')?.textContent).toContain('交谈（E）');
    expect(world.snapshot()).toEqual(before);
  });

  it('keeps measured presentation bounds inside left/right edges and flips below a top-edge anchor', () => {
    const world = new World(); const overlay = document.createElement('div');
    let point = { x: 2, y: 50 };
    const node: LayoutNode = { type: 'Panel', id: 'safe-menu', props: { bg: 'ink-deep' }, children: [{ type: 'Label', id: 'safe-label', props: { text: '菜单' } }] };
    const layer = new WorldUi2DLayer({ source: () => [{ entityId: 'player', transform: point, node, keepInViewport: { padding: 8 } }] });
    layer.init(overlay); layer.sync(world.readView(), null, 120, 80);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="player"]')!;
    Object.defineProperty(host, 'offsetWidth', { configurable: true, value: 60 });
    Object.defineProperty(host, 'offsetHeight', { configurable: true, value: 30 });

    layer.sync(world.readView(), null, 120, 80);
    expect(host.style.left).toBe('8px'); expect(host.style.top).toBe('20px'); expect(host.style.transform).toBe('none');
    point = { x: 118, y: 50 }; layer.sync(world.readView(), null, 120, 80);
    expect(host.style.left).toBe('52px');
    point = { x: 60, y: 10 }; layer.sync(world.readView(), null, 120, 80);
    expect(host.style.left).toBe('30px'); expect(host.style.top).toBe('10px');
    point = { x: 60, y: 78 }; layer.sync(world.readView(), null, 120, 80);
    expect(host.style.left).toBe('30px'); expect(host.style.top).toBe('42px');
    expect(host.style.maxWidth).toBe('104px'); expect(host.style.maxHeight).toBe('64px'); expect(host.style.overflowX).toBe('hidden'); expect(host.style.overflowY).toBe('auto');
    expect((host.firstElementChild as HTMLElement).style.maxWidth).toBe('100%');
    expect(host.style.pointerEvents).toBe('none'); layer.dispose();
  });

  it('contains an oversized multiline menu in all four safe-area edges without losing its entity anchor', () => {
    const world = new World(); const overlay = document.createElement('div');
    let point = { x: 1, y: 1 };
    const node: LayoutNode = { type: 'Panel', id: 'multiline-menu', props: { bg: 'raised' }, layout: { width: 244 }, children: [
      { type: 'Label', id: 'multiline-copy', props: { text: '第一行\n第二行是一段很长的对话内容\n第三行' } },
    ] };
    const layer = new WorldUi2DLayer({ source: () => [{ entityId: 'player', transform: point, node, keepInViewport: { padding: 10 } }] });
    layer.init(overlay); layer.sync(world.readView(), null, 180, 100);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="player"]')!;
    Object.defineProperty(host, 'offsetWidth', { configurable: true, value: 160 });
    Object.defineProperty(host, 'offsetHeight', { configurable: true, value: 76 });
    for (const [x, y, left, top] of [[1, 50, 10, 10], [179, 50, 10, 10], [90, 1, 10, 10], [90, 99, 10, 10]] as const) {
      point = { x, y }; layer.sync(world.readView(), null, 180, 100);
      expect(Number.parseFloat(host.style.left)).toBeGreaterThanOrEqual(left);
      expect(Number.parseFloat(host.style.top)).toBeGreaterThanOrEqual(top);
      expect(Number.parseFloat(host.style.left) + Math.min(160, 160)).toBeLessThanOrEqual(170);
      expect(Number.parseFloat(host.style.top) + Math.min(76, 80)).toBeLessThanOrEqual(90);
      expect(host.dataset.entityAnchor).toBe('player');
    }
    expect(host.style.maxWidth).toBe('160px'); expect(host.style.maxHeight).toBe('80px');
    expect((host.firstElementChild as HTMLElement).style.maxWidth).toBe('100%');
    layer.dispose();
  });

  it('keeps pointer capture opt-in and routes an interactive LayoutNode through the existing ActionSink', () => {
    const world = new World(); const overlay = document.createElement('div'); const calls: Array<[string, string | undefined]> = [];
    let interactive = false;
    const node: LayoutNode = { type: 'Panel', id: 'world-action', props: { action: 'world.choose', actionArg: 'leaf', bg: 'raised' }, children: [
      { type: 'Label', id: 'world-action-label', props: { text: '选择' } },
    ] };
    const layer = new WorldUi2DLayer({
      actionSink: { enqueueAction: (name, value) => calls.push([name, value?.arg]) },
      source: () => [{ entityId: 'player', transform: { x: 40, y: 40 }, node, interactive }],
    });
    layer.init(overlay); layer.sync(world.readView(), null, 100, 100);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="player"]')!;
    expect(host.style.pointerEvents).toBe('none');
    interactive = true; layer.sync(world.readView(), null, 100, 100);
    expect(host.style.pointerEvents).toBe('auto');
    host.querySelector<HTMLElement>('[data-action="world.choose"]')!.click();
    expect(calls).toEqual([['world.choose', 'leaf']]);
    interactive = false; layer.sync(world.readView(), null, 100, 100);
    expect(host.style.pointerEvents).toBe('none'); layer.dispose();
  });

  it('applies the same explicit interaction contract to WorldUI2D components', () => {
    const world = new World(); const overlay = document.createElement('div'); const calls: string[] = [];
    addAnchor(world, 'chest', 30, 30, { interactive: true, node: {
      type: 'Panel', id: 'chest-menu', props: { action: 'chest.open', actionArg: 'chest' },
      children: [{ type: 'Label', id: 'chest-label', props: { text: '打开' } }],
    } });
    const layer = new WorldUi2DLayer({ actionSink: { enqueueAction: (name, value) => calls.push(`${name}:${value?.arg}`) } });
    layer.init(overlay); layer.sync(world.readView(), null, 100, 100);
    const host = overlay.querySelector<HTMLElement>('[data-entity-anchor="chest"]')!;
    expect(host.style.pointerEvents).toBe('auto'); host.querySelector<HTMLElement>('[data-action="chest.open"]')!.click();
    expect(calls).toEqual(['chest.open:chest']); layer.dispose();
  });

  it('produces the existing Float entity-anchor contract and lets mountUI consume it', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callbacks.push(cb); return callbacks.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const world = new World(); const overlay = document.createElement('div'); document.body.appendChild(overlay);
    addAnchor(world, 'target', 80, 40, { text: '目标' });
    addAnchor(world, 'indicator', 20, 20, { node: {
      type: 'Float', id: 'entity-float', props: { anchorTo: { kind: 'entity', id: 'target', at: 'top' } },
      children: [{ type: 'Label', id: 'entity-float-label', props: { text: '已锚定' } }],
    } });
    const layer = new WorldUi2DLayer(); layer.init(overlay); layer.sync(world.readView(), null, 200, 100);
    const target = overlay.querySelector<HTMLElement>('[data-entity-anchor="target"]')!;
    target.getBoundingClientRect = () => ({ x: 70, y: 30, left: 70, top: 30, right: 90, bottom: 50, width: 20, height: 20, toJSON: () => ({}) } as DOMRect);
    callbacks.shift()?.(0);
    const floating = overlay.querySelector<HTMLElement>('#entity-float')!;
    expect(floating.style.opacity).toBe('1');
    expect(floating.style.transform).toContain('translate(80px,30px)');
    layer.dispose();
  });
});

describe('WorldUI2D contract', () => {
  it('keeps rich/text trees valid and add/change/remove never changes the world hash', () => {
    const rich: LayoutNode = { type: 'Panel', id: 'world-menu', props: { bare: true }, children: [{ type: 'Button', id: 'world-menu-talk', props: { label: '交谈', action: 'talk' } }] };
    expect(worldUi2DTree({ type: 'WorldUI2D', node: rich })).toBe(rich);
    expect(validateLayoutNode(worldUi2DTree({ type: 'WorldUI2D', text: '交谈（E）' }))).toEqual([]);
    const world = new World(); world.createEntity('e'); const baseline = hashSnapshot(world.snapshot());
    world.addComponent('e', { type: 'WorldUI2D', text: 'A' } as WorldUI2D); expect(hashSnapshot(world.snapshot())).toBe(baseline);
    world.addComponent('e', { type: 'WorldUI2D', node: rich } as WorldUI2D); expect(hashSnapshot(world.snapshot())).toBe(baseline);
    world.removeComponent('e', 'WorldUI2D'); expect(hashSnapshot(world.snapshot())).toBe(baseline);
  });
});
