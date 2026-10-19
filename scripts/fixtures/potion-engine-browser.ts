import { World } from '../../src/engine/core/world.js';
import type { AngularGesture, Clickable, Color, Draggable, DropZone, OrderedActionSession, Shape, Sprite, Transform } from '../../src/engine/protocol/components.js';
import { angularGestureCapability } from '../../src/skills/tier2/angular-gesture.js';
import { dragPlaceCapability } from '../../src/skills/tier2/drag-place.js';
import { orderedActionSessionCapability } from '../../src/skills/tier2/ordered-action-session.js';
import { PointerInputSource } from '../../src/net/host/queued-input.js';
import { applyCommands } from '../../src/net/commands.js';
import { DragPreviewLayer } from '../../src/runtime/drag-preview.js';
import { CanvasRenderer } from '../../src/renderer/canvas-renderer.js';
import { hashSnapshot } from '../../src/net/determinism.js';

const world = new World({ strict: true });
world.addSystem(angularGestureCapability.systems[0]!);
for (const system of dragPlaceCapability.systems) world.addSystem(system);
world.addSystem(orderedActionSessionCapability.systems[0]!);
world.createEntity('cauldron');
world.addComponent<DropZone>('cauldron', { type: 'DropZone', hitShape: 'ellipse' });
world.addComponent<OrderedActionSession>('cauldron', {
  type: 'OrderedActionSession', id: 'brew',
  acceptedActions: ['brew.stir.clockwise', 'brew.stir.counterclockwise', 'brew.add.silver'],
  steps: [
    { expectedAction: 'brew.stir.clockwise', requiredCount: 1 },
    { expectedAction: 'brew.stir.counterclockwise', requiredCount: 1 },
    { expectedAction: 'brew.add.silver', requiredCount: 1 },
  ],
  successSignal: 'brew.success', failureSignal: 'brew.failure',
});
world.addComponent<Transform>('cauldron', { type: 'Transform', x: 380, y: 160, rotation: 0, scaleX: 1, scaleY: 1 });
world.addComponent<Shape>('cauldron', { type: 'Shape', kind: 'box', width: 180, height: 100 });
world.addComponent<Color>('cauldron', { type: 'Color', tint: 0x364f63, alpha: 1 });
world.createEntity('rod');
world.addComponent<AngularGesture>('rod', {
  type: 'AngularGesture', id: 'probe-rod', centerX: 380, centerY: 160, radiusX: 80, radiusY: 40,
  angleMilliDegrees: 0, grabTolerance: 0.2, centerDeadZone: 0.16,
  maxJumpMilliDegrees: 129600, jitterMilliDegrees: 500, fullTurnMilliDegrees: 330000,
  clockwiseSignal: 'brew.stir.clockwise', counterclockwiseSignal: 'brew.stir.counterclockwise',
  sessionEntity: 'cauldron',
});
world.addComponent<Transform>('rod', { type: 'Transform', x: 460, y: 160, rotation: 0, scaleX: 1, scaleY: 1 });
world.addComponent<Shape>('rod', { type: 'Shape', kind: 'circle', radius: 10 });
world.addComponent<Color>('rod', { type: 'Color', tint: 0x90e0cf, alpha: 1 });
world.createEntity('material');
world.addComponent<Draggable>('material', { type: 'Draggable', onlyFlag: 'never-enabled' });
world.addComponent<Clickable>('material', { type: 'Clickable', action: 'brew.add.silver', onlyFlag: 'never-enabled' });
world.addComponent<Transform>('material', { type: 'Transform', x: 100, y: 300, rotation: 0, scaleX: 1, scaleY: 1 });
world.addComponent<Shape>('material', { type: 'Shape', kind: 'box', width: 24, height: 24 });
world.addComponent<Sprite>('material', { type: 'Sprite', textureKey: 'probe-missing', anchorX: 0.5, anchorY: 0.5, zOrder: 2 });
world.addComponent<Color>('material', { type: 'Color', tint: 0xf8d596, alpha: 1 });

const preview = new DragPreviewLayer({ entityIds: ['material'] });
const renderer = new CanvasRenderer({ width: 600, height: 400, background: 'transparent', dragPreview: preview });
renderer.init(document.getElementById('host')!);
const canvas = document.querySelector<HTMLCanvasElement>('#host canvas')!;
const pointer = new PointerInputSource('player', canvas, {
  move: true,
  onPointerSample: (sample) => preview.sample(sample, world, performance.now()),
});
let tick = 1;
let running = true;
function frame(): void {
  if (!running) return;
  applyCommands(world, pointer.commandsForTick(tick++));
  world.tick();
  const session = world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!;
  renderer.sync(world);
  document.getElementById('status')!.textContent = `step=${session.stepIndex} status=${session.status} last=${session.lastAction ?? 'none'}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const initialHash = hashSnapshot(world.snapshot());
Object.assign(window, {
  potionProbe: {
    state: () => ({
      clockwiseSeen: (world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!.stepIndex ?? 0) >= 1,
      counterclockwiseSeen: (world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!.stepIndex ?? 0) >= 2,
      drop: world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!.lastAction === 'brew.add.silver' ? 'brew.add.silver' : null,
      session: world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession'),
      rod: world.getComponent<Transform>('rod', 'Transform'),
      gesture: world.getComponent<AngularGesture>('rod', 'AngularGesture'),
      preview: preview.frame(world, performance.now()),
      material: world.getComponent<Transform>('material', 'Transform'),
      initialHash,
      hash: hashSnapshot(world.snapshot()),
    }),
    dispose: () => { running = false; pointer.dispose(); renderer.destroy(); },
  },
});
