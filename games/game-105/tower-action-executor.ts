import type { Component, IWorld } from '@zerocraft/engine/engine/core/types.js';
import type { Camera3D, Joint3D, Transform3D, WorldUI3D } from '@zerocraft/engine/engine/protocol/components.js';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { BLOCK_CHANNELS, BLOCK_LENGTH, PULL_FEEL, TOWER_BLOCKS, type TowerBlock } from './tower-blueprint.js';
import { hasFallenFromTower, pullDistanceFromPosition } from './tower-lifecycle.js';
import type { TowerGameSession } from './tower-session.js';

export type TowerActor = 'player' | 'ai';
export type TowerAction =
  | { type: 'observe'; yaw: number; pitch: number }
  | { type: 'hover'; blockId: string | null }
  | { type: 'grab'; blockId: string }
  | { type: 'pull'; delta: number }
  | { type: 'release' }
  | { type: 'cancel' }
  | { type: 'restart' };

export interface TowerActionExecutorOptions {
  world: IWorld;
  session: TowerGameSession;
  invalidate(): void;
  restart(): void;
  /** Calibration-only override. Gameplay uses the frozen PULL_FEEL.maxForce default. */
  pullMaxForce?: number;
}

interface GrabState {
  actor: TowerActor;
  block: TowerBlock;
  baseline: { x: number; y: number; z: number };
  requestedDistance: number;
}

const MAX_PULL_DISTANCE = BLOCK_LENGTH * 1.12;

/** The sole runtime path for both pointer input and local AI 3D interaction. */
export class TowerActionExecutor {
  private hovered: TowerBlock | null = null;
  private grabState: GrabState | null = null;

  constructor(private readonly options: TowerActionExecutorOptions) {}

  get selectedBlockId(): string | null { return this.grabState?.block.id ?? null; }
  get isGrabbing(): boolean { return this.grabState !== null; }
  get grabbedBy(): TowerActor | null { return this.grabState?.actor ?? null; }
  get requestedPullDistance(): number { return this.grabState?.requestedDistance ?? 0; }
  get dragPlaneY(): number | null { return this.grabState?.baseline.y ?? null; }
  /** Read-only Cannon-synchronised displacement along the grabbed block's permitted axis. */
  get actualPullDistance(): number {
    const state = this.grabState;
    const transform = state && this.options.world.getComponent<Transform3D>(state.block.id, 'Transform3D');
    return state && transform ? this.currentDistance(state, transform) : 0;
  }

  execute(actor: TowerActor, action: TowerAction): boolean {
    if (action.type === 'observe') return this.observe(action.yaw, action.pitch);
    if (action.type === 'hover') return this.hover(action.blockId);
    if (action.type === 'restart') { this.clear(); this.options.restart(); return true; }
    if (action.type === 'cancel') { this.cancel(); return true; }
    if (action.type === 'grab') return this.grab(actor, action.blockId);
    if (action.type === 'pull') return this.pull(actor, action.delta);
    return this.release(actor);
  }

  observe(yaw: number, pitch: number): boolean {
    if (this.options.session.phase === 'collapse-locked' || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
    const camera = this.options.world.getComponent<Camera3D>('g105-camera', 'Camera3D');
    if (!camera) return false;
    camera.yaw += yaw;
    camera.pitch = Math.max(camera.pitchMin ?? -Infinity, Math.min(camera.pitchMax ?? Infinity, camera.pitch + pitch));
    this.options.invalidate();
    return true;
  }

  hover(blockId: string | null): boolean {
    this.clearHover();
    if (!blockId) return true;
    if (this.options.session.phase !== 'player-ready' && this.options.session.phase !== 'ai-observe') return false;
    const block = TOWER_BLOCKS.find((candidate) => candidate.id === blockId);
    if (!block || this.options.session.retiredBlocks.has(block.id) || this.options.session.extractedBlocks.has(block.id)) return false;
    const channel = BLOCK_CHANNELS[block.channel];
    const node: LayoutNode = {
      // A compact factual tag, deliberately free of stability or success predictions.
      type: 'Panel', id: `g105-hover-info-${block.id}`,
      props: {
        bg: { custom: 'linear-gradient(145deg,rgba(53,31,49,.96),rgba(26,25,37,.96))' },
        edge: 'gold',
      },
      layout: { padding: 5, radius: 999, fx: [{ kind: 'glow', color: 'gold', intensity: .22 }] },
      children: [
        { type: 'Label', id: `g105-hover-copy-${block.id}`, props: {
          text: `${channel.label} · ${block.score}分`, size: 'sm', font: 'cnwen', bold: true,
          spans: [{ text: `${channel.label} · `, color: { custom: '#fff8e9' } }, { text: `${block.score}分`, color: { custom: '#f1cf8d' }, bold: true }],
        } },
      ],
    };
    this.options.world.addComponent(block.id, { type: 'WorldUI3D', node, offsetY: block.height / 2 + 0.52 } as WorldUI3D);
    this.hovered = block;
    this.options.invalidate();
    return true;
  }

  cancel(): void {
    if (this.grabState && (this.options.session.phase === 'player-pulling' || this.options.session.phase === 'ai-pulling')) {
      const transform = this.options.world.getComponent<Transform3D>(this.grabState.block.id, 'Transform3D');
      this.options.session.release(transform ? this.currentDistance(this.grabState, transform) : this.grabState.requestedDistance);
    }
    this.clear();
  }

  clear(): void {
    if (this.grabState) this.options.world.removeComponent(this.grabState.block.id, 'Joint3D');
    this.grabState = null;
    this.clearHover();
    this.options.invalidate();
  }

  observePhysicalPull(): void {
    const state = this.grabState;
    if (!state || (this.options.session.phase !== 'player-pulling' && this.options.session.phase !== 'ai-pulling')) return;
    const transform = this.options.world.getComponent<Transform3D>(state.block.id, 'Transform3D');
    if (transform) this.options.session.observePullDistance(this.currentDistance(state, transform));
  }

  /** Samples every tower body against its original seeded position for linked-extraction rules. */
  observeTowerMembership(): void {
    const entries = TOWER_BLOCKS.flatMap((block) => {
      const transform = this.options.world.getComponent<Transform3D>(block.id, 'Transform3D');
      return transform ? [{ block, distance: pullDistanceFromPosition(block, transform, block.axis) }] : [];
    });
    this.options.session.observeTowerBlockDistances(entries);
    this.options.session.observePhysicalFalls(entries
      .filter(({ block }) => block.id !== this.grabState?.block.id)
      .filter(({ block }) => {
        const transform = this.options.world.getComponent<Transform3D>(block.id, 'Transform3D');
        return !!transform && hasFallenFromTower(block, transform, block.width, block.height);
      })
      .map(({ block }) => block));
  }

  projectPullDistance(point: { x: number; z: number }): number | null {
    const state = this.grabState;
    return state ? pullDistanceFromPosition(state.baseline, point, state.block.axis) : null;
  }

  private clearHover(): void {
    if (this.hovered) this.options.world.removeComponent(this.hovered.id, 'WorldUI3D');
    this.hovered = null;
  }

  private grab(actor: TowerActor, blockId: string): boolean {
    if (this.grabState || (this.options.session.phase !== 'player-ready' && this.options.session.phase !== 'ai-observe')) return false;
    const block = TOWER_BLOCKS.find((candidate) => candidate.id === blockId);
    const transform = block && this.options.world.getComponent<Transform3D>(block.id, 'Transform3D');
    if (!block || !transform || !this.options.session.beginPull(block, actor)) return false;
    this.clearHover();
    const baseline = { x: transform.x, y: transform.y, z: transform.z };
    const endpoint = BLOCK_LENGTH / 2;
    this.options.world.addComponent(block.id, {
      type: 'Joint3D', kind: 'point', pivotA: [block.axis[0] * endpoint, 0, block.axis[2] * endpoint],
      anchor: [baseline.x + block.axis[0] * endpoint, baseline.y, baseline.z + block.axis[2] * endpoint],
      maxForce: this.options.pullMaxForce ?? PULL_FEEL.maxForce,
    } as Component);
    this.grabState = { actor, block, baseline, requestedDistance: 0 };
    this.options.invalidate();
    return true;
  }

  private pull(actor: TowerActor, delta: number): boolean {
    const state = this.grabState;
    if (!state || state.actor !== actor || (this.options.session.phase !== 'player-pulling' && this.options.session.phase !== 'ai-pulling') || !Number.isFinite(delta)) return false;
    state.requestedDistance = Math.max(-BLOCK_LENGTH * 0.18, Math.min(MAX_PULL_DISTANCE, state.requestedDistance + delta));
    const joint = this.options.world.getComponent<Joint3D>(state.block.id, 'Joint3D');
    if (!joint) return false;
    const endpoint = BLOCK_LENGTH / 2;
    joint.anchor = [
      state.baseline.x + state.block.axis[0] * (endpoint + state.requestedDistance), state.baseline.y,
      state.baseline.z + state.block.axis[2] * (endpoint + state.requestedDistance),
    ];
    this.options.invalidate();
    return true;
  }

  private release(actor: TowerActor): boolean {
    const state = this.grabState;
    if (!state || state.actor !== actor || (this.options.session.phase !== 'player-pulling' && this.options.session.phase !== 'ai-pulling')) return false;
    const transform = this.options.world.getComponent<Transform3D>(state.block.id, 'Transform3D');
    this.options.session.release(transform ? this.currentDistance(state, transform) : state.requestedDistance);
    this.options.world.removeComponent(state.block.id, 'Joint3D');
    this.grabState = null;
    this.options.invalidate();
    return true;
  }

  private currentDistance(state: GrabState, transform: Transform3D): number {
    return pullDistanceFromPosition(state.baseline, transform, state.block.axis);
  }
}
