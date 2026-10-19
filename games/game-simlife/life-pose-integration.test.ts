import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '@zerocraft/engine/assembly/life-package-compile.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { Camera, LifePosition, Transform } from '@zerocraft/engine/engine/protocol/components.js';
import { selectLifeHostView } from '@zerocraft/engine/assembly/life-host/life-presenter.js';
import { buildLifeInteractionPresentation, type LifeInteractionOption } from '@zerocraft/engine/assembly/life-host/life-interaction.js';
import { collectLifeSceneRender, lifeCellToWorld } from '@zerocraft/engine/renderer/life-scene-render.js';
import { hashSnapshot } from '@zerocraft/engine/net/determinism.js';
import littleValleyPackage from './little-valley.life.json';
import demonCastlePackage from '@games/game-demon-castle/life.json';

describe('Life formal package pose integration', () => {
  it.each([
    ['Little Valley', littleValleyPackage],
    ['Demon Castle', demonCastlePackage],
  ] as const)('keeps the %s pose, grid context, camera and host anchor on one footpoint', (_name, rawPackage) => {
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(rawPackage).blueprint);
    const position = engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
    const transform = engine.world.getComponent<Transform>('life:player', 'Transform')!;
    transform.x = position.x + 0.75; transform.y = position.y + 0.25;
    engine.world.tick();

    const before = engine.world.snapshot(); const hash = hashSnapshot(before);
    const projection = collectLifeSceneRender(engine.world, { cellSize: 32 })!;
    const view = selectLifeHostView(engine.world);
    const root: readonly LifeInteractionOption[] = [{ id: 'probe', label: 'Probe', enabled: true, actions: [{ name: 'life.action', arg: 'talk' }] }];
    const presentation = buildLifeInteractionPresentation(view, root, { open: false, path: [], selected: 0, sourceKey: '' })!;
    const camera = engine.world.getComponent<Camera>('life:camera', 'Camera')!;

    expect(projection.player).toMatchObject({ cellX: position.x, cellY: position.y, center: lifeCellToWorld(transform.x, transform.y, { cellSize: 32 }), anchor: 'bottom-center' });
    expect(projection.playerHighlight).toMatchObject({ cellX: position.x, cellY: position.y, center: lifeCellToWorld(position.x, position.y, { cellSize: 32 }) });
    expect(view).toMatchObject({ x: position.x, y: position.y, poseX: transform.x, poseY: transform.y });
    expect(presentation.transform).toEqual({ x: transform.x, y: transform.y });
    expect(engine.world.hasComponent('life:player', 'CameraTarget')).toBe(true);
    const focusX = transform.x + (camera.followOffsetX ?? 0); const focusY = transform.y + (camera.followOffsetY ?? 0);
    const visibleW = camera.viewportW / camera.zoom; const visibleH = camera.viewportH / camera.zoom;
    expect(focusX).toBeGreaterThanOrEqual(camera.offsetX - visibleW / 2);
    expect(focusX).toBeLessThanOrEqual(camera.offsetX + visibleW / 2);
    expect(focusY).toBeGreaterThanOrEqual(camera.offsetY - visibleH / 2);
    expect(focusY).toBeLessThanOrEqual(camera.offsetY + visibleH / 2);
    expect(engine.world.getComponent<any>('life:player', 'LifeActivityContext')).toMatchObject({ x: position.x, y: position.y });
    expect(engine.world.snapshot()).toEqual(before); expect(hashSnapshot(engine.world.snapshot())).toBe(hash);
  });
});
