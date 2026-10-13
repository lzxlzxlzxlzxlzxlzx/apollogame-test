import type { IWorld } from '@engine/core/types.js';
import type { Transform, Visibility, WorldUI2D } from '@engine/protocol/components.js';
import type { CameraView } from '@engine/protocol/camera-view.js';
import type { LifeSceneProjectionOptions } from './life-scene-render.js';
import { lifeCellToWorld } from './life-scene-render.js';
import type { ActionSink, HandlerMap, LayoutNode, MountHandle, UITheme } from '@ui/components/index.js';
import { mountUI } from '@ui/components/index.js';

export type WorldUi2DProjectionMode =
  | { readonly kind: 'world' }
  | { readonly kind: 'life-cell'; readonly options?: LifeSceneProjectionOptions };

export interface WorldUi2DProjection {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/** World point → logical Canvas pixels. Life mode performs its sole cell→pixel conversion here. */
export function projectWorldUi2D(
  x: number,
  y: number,
  camera: CameraView | null,
  width: number,
  height: number,
  mode: WorldUi2DProjectionMode = { kind: 'world' },
): WorldUi2DProjection {
  const point = mode.kind === 'life-cell' ? lifeCellToWorld(x, y, mode.options) : { x, y };
  let sx = point.x; let sy = point.y;
  if (camera) {
    const center = mode.kind === 'life-cell'
      ? lifeCellToWorld(camera.centerX - 0.5, camera.centerY - 0.5, mode.options)
      : { x: camera.centerX, y: camera.centerY };
    sx = (point.x - center.x) * camera.zoom + width / 2;
    sy = (point.y - center.y) * camera.zoom + height / 2;
  }
  return { x: sx, y: sy, visible: Number.isFinite(sx) && Number.isFinite(sy) && sx >= 0 && sx <= width && sy >= 0 && sy <= height };
}

interface Item { readonly host: HTMLElement; ui: MountHandle; sig: string }

export interface WorldUi2DLayerOptions {
  readonly theme?: UITheme;
  readonly actionSink?: ActionSink;
  /** Render-local navigation handlers. World mutation must still go through actionSink. */
  readonly handlers?: HandlerMap;
  /** Render-local UI supplied by a host view-model. It is read-only and never materialized as World components. */
  readonly source?: () => readonly WorldUi2DPresentation[];
}

export interface WorldUi2DPresentation {
  readonly entityId: string;
  readonly transform: Readonly<Pick<Transform, 'x' | 'y'>>;
  readonly node: LayoutNode;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly visible?: boolean;
  /** Opt-in pointer capture. Omitted/false presentations continue to pass through to Canvas. */
  readonly interactive?: boolean;
  /** Opt-in DOM placement guard. Measured LayoutNode bounds stay inside the logical Canvas viewport. */
  readonly keepInViewport?: boolean | { readonly padding?: number };
}

interface PresentationEntry {
  readonly entityId: string;
  readonly x: number;
  readonly y: number;
  readonly node: LayoutNode;
  readonly sig: string;
  readonly visible: boolean;
  readonly viewportPadding?: number;
  readonly interactive: boolean;
}

/** DOM overlay bridge only: projection + host pooling; LayoutNode rendering stays in mountUI. */
export class WorldUi2DLayer {
  private overlay: HTMLElement | null = null;
  private readonly items = new Map<string, Item>();

  constructor(private readonly options: WorldUi2DLayerOptions = {}) {}

  init(overlay: HTMLElement): void {
    this.overlay = overlay;
  }

  sync(world: IWorld, camera: CameraView | null, width: number, height: number, mode: WorldUi2DProjectionMode = { kind: 'world' }): void {
    if (!this.overlay) return;
    const presentations = new Map<string, PresentationEntry>();
    for (const [id] of world.query('WorldUI2D', 'Transform')) {
      const ui = world.getComponent<WorldUI2D>(id, 'WorldUI2D');
      const transform = world.getComponent<Transform>(id, 'Transform');
      if (!ui || !transform) continue;
      const visibility = world.getComponent<Visibility>(id, 'Visibility');
      presentations.set(id, {
        entityId: id,
        x: transform.x + (ui.offsetX ?? 0),
        y: transform.y + (ui.offsetY ?? 0),
        node: worldUi2DTree(ui, id),
        sig: worldUi2DSig(ui),
        visible: visibility?.visible !== false,
        viewportPadding: undefined,
        interactive: ui.interactive === true,
      });
    }
    // Render-local descriptors intentionally win on an equal entity id, so a host can
    // replace a static presentation without adding/removing deterministic World state.
    for (const descriptor of this.options.source?.() ?? []) {
      presentations.set(descriptor.entityId, {
        entityId: descriptor.entityId,
        x: descriptor.transform.x + (descriptor.offsetX ?? 0),
        y: descriptor.transform.y + (descriptor.offsetY ?? 0),
        node: descriptor.node,
        sig: `p:${JSON.stringify(descriptor.node)}`,
        visible: descriptor.visible !== false,
        viewportPadding: descriptor.keepInViewport
          ? Math.max(0, typeof descriptor.keepInViewport === 'object' ? descriptor.keepInViewport.padding ?? 8 : 8)
          : undefined,
        interactive: descriptor.interactive === true,
      });
    }
    for (const presentation of presentations.values()) {
      const id = presentation.entityId;
      let item = this.items.get(id);
      if (!item) {
        const host = this.overlay.ownerDocument.createElement('div');
        host.dataset.entityAnchor = id;
        host.style.cssText = 'position:absolute;transform:translate(-50%,-100%);will-change:left,top;pointer-events:none';
        this.overlay.appendChild(host);
        item = { host, ui: mountUI(host, presentation.node, this.options.handlers ?? {}, this.options.theme, this.options.actionSink), sig: presentation.sig };
        this.items.set(id, item);
      } else {
        if (presentation.sig !== item.sig) { item.ui.update(presentation.node, this.options.theme); item.sig = presentation.sig; }
      }
      const projected = projectWorldUi2D(presentation.x, presentation.y, camera, width, height, mode);
      const visible = presentation.visible && projected.visible;
      item.host.style.display = visible ? 'block' : 'none';
      item.host.style.pointerEvents = visible && presentation.interactive ? 'auto' : 'none';
      if (visible && presentation.viewportPadding !== undefined) {
        const padding = presentation.viewportPadding;
        const availableWidth = Math.max(0, width - padding * 2);
        const availableHeight = Math.max(0, height - padding * 2);
        item.host.style.maxWidth = `${availableWidth}px`;
        item.host.style.maxHeight = `${availableHeight}px`;
        item.host.style.overflowX = 'hidden';
        item.host.style.overflowY = 'auto';
        item.host.style.boxSizing = 'border-box';
        const root = item.host.firstElementChild as HTMLElement | null;
        if (root) { root.style.maxWidth = '100%'; root.style.boxSizing = 'border-box'; }
        const hostW = item.host.offsetWidth;
        const hostH = item.host.offsetHeight;
        const maxLeft = Math.max(padding, width - hostW - padding);
        const maxTop = Math.max(padding, height - hostH - padding);
        const left = Math.min(maxLeft, Math.max(padding, projected.x - hostW / 2));
        const above = projected.y - hostH;
        const topCandidate = above < padding ? projected.y : above;
        const top = Math.min(maxTop, Math.max(padding, topCandidate));
        item.host.style.transform = 'none';
        item.host.style.left = `${left}px`; item.host.style.top = `${top}px`;
      } else if (visible) {
        item.host.style.maxWidth = ''; item.host.style.maxHeight = ''; item.host.style.overflowX = ''; item.host.style.overflowY = ''; item.host.style.boxSizing = '';
        const root = item.host.firstElementChild as HTMLElement | null;
        if (root) { root.style.maxWidth = ''; root.style.boxSizing = ''; }
        item.host.style.transform = 'translate(-50%,-100%)';
        item.host.style.left = `${projected.x}px`; item.host.style.top = `${projected.y}px`;
      }
    }
    for (const [id, item] of this.items) {
      if (presentations.has(id)) continue;
      item.ui(); item.host.remove(); this.items.delete(id);
    }
  }

  dispose(): void {
    for (const [, item] of this.items) { item.ui(); item.host.remove(); }
    this.items.clear();
    this.overlay = null;
  }
}

export function worldUi2DTree(ui: WorldUI2D, entityId = 'entity'): LayoutNode {
  if (ui.node) return ui.node;
  return {
    type: 'Panel', id: `wui2d-${entityId}`, props: { bare: true },
    children: [{ type: 'Label', id: `wui2d-${entityId}-label`, props: { text: ui.text ?? '', size: ui.size ?? 'sm', glow: ui.glow ?? false, ...(ui.color ? { color: ui.color } : {}) } }],
  };
}

const worldUi2DSig = (ui: WorldUI2D): string => ui.node
  ? `n:${JSON.stringify(ui.node)}`
  : `${ui.text ?? ''}|${ui.size ?? ''}|${ui.color ?? ''}|${ui.glow ? 1 : 0}`;
