import type { ButtonProps, LayoutNode } from '@ui/components/types.js';
import type { AssetIndex } from '../../assets/asset-index.js';

/** Stable local-AssetIndex identities. Only these five are reusable GAL chrome. */
export const GAL_UI_ART_KEYS = {
  dialogue: 'tex/gal-dialogue-panel',
  systemFrame: 'tex/gal-system-frame',
  button: 'tex/gal-button-default',
  slot: 'tex/gal-save-slot',
  sliderKnob: 'tex/gal-slider-knob',
} as const;

export type GalUiArtSlot = keyof typeof GAL_UI_ART_KEYS;
export interface GalUiArtPart {
  /** Already-resolved, loadable URL from the local AssetIndex; never a design-document path. */
  readonly url: string;
  /** Optional source-edge pixels for the closed-set 9-slice renderer. */
  readonly slice?: number;
}
export type GalUiArt = Partial<Record<GalUiArtSlot, GalUiArtPart>>;

/** Only filled local texture entries may provide the five template chrome URLs. */
export function galUiUrlsFromIndex(index: AssetIndex): Record<string, string> {
  const keys = new Set<string>(Object.values(GAL_UI_ART_KEYS));
  return Object.fromEntries(index.assets.filter(asset => keys.has(asset.id) &&
    asset.type === 'texture' && asset.status === 'filled' &&
    asset.path?.startsWith('/games/gal-template/art/'))
    .map(asset => [asset.id, asset.path!]));
}

/** Pure key→URL bridge; missing keys preserve the original procedural theme. */
export function resolveGalUiArt(urls: Readonly<Record<string, string>>,
  slices: Partial<Record<GalUiArtSlot, number>> = {}): GalUiArt {
  const out: GalUiArt = {};
  for (const slot of Object.keys(GAL_UI_ART_KEYS) as GalUiArtSlot[]) {
    const url = urls[GAL_UI_ART_KEYS[slot]];
    if (typeof url !== 'string' || !url.trim()) continue;
    // The registered V2 system-frame source is 1536×1024. Its source cut is
    // independent of the 58/36px display edge used by the two frame sizes.
    const slice = slices[slot] ?? (slot === 'systemFrame' ? 115 : undefined);
    out[slot] = { url, ...(slice !== undefined && Number.isFinite(slice) && slice > 0 ? { slice } : {}) };
  }
  return out;
}

export type GalUiImageProbe = (url: string) => Promise<boolean>;

/** Image failures remove only the failed decoration; no interaction or save path depends on it. */
export async function loadGalUiArt(urls: Readonly<Record<string, string>>,
  slices: Partial<Record<GalUiArtSlot, number>> = {},
  probe: GalUiImageProbe = browserImageProbe): Promise<GalUiArt> {
  const candidates = resolveGalUiArt(urls, slices);
  const entries = await Promise.all((Object.keys(candidates) as GalUiArtSlot[]).map(async slot => {
    const part = candidates[slot]!;
    try { return await probe(part.url) ? [slot, part] as const : null; }
    catch { return null; }
  }));
  return Object.fromEntries(entries.filter(entry => entry !== null)) as GalUiArt;
}

function browserImageProbe(url: string): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

/** Optional demo/content images are independently preflighted and never become template defaults. */
export async function loadGalContentUrls(urls: Readonly<Record<string, string>>,
  probe: GalUiImageProbe = browserImageProbe): Promise<Readonly<Record<string, string>>> {
  const entries = await Promise.all(Object.entries(urls).map(async ([key, url]) => {
    if (!key || typeof url !== 'string' || !url.trim()) return null;
    try { return await probe(url) ? [key, url] as const : null; }
    catch { return null; }
  }));
  return Object.fromEntries(entries.filter(entry => entry !== null));
}

// V2 art is dark in both house themes. Only labels laid directly over its
// texture use the prototype's light ink; labels inside theme-colored cards
// keep their semantic tokens, and the no-art fallback stays unchanged.
const DIALOGUE_INK: Readonly<Record<string, string>> = {
  'gal-story-chapter': '#e3d4a7',
  'gal-story-speaker': '#f5dfb3',
  'gal-story-text': '#f6f1e9',
  'gal-story-read': '#cbd0e3',
  'gal-story-hint': '#cbd0e3',
  'gal-story-choice-hint': '#f5e7c6',
};
const FRAME_INK: Readonly<Record<string, string>> = {
  'gal-slots-title': '#f6e2b5',
  'gal-slots-hint': '#b9bfd3',
  'gal-page-counter': '#e4d5aa',
  'gal-settings-title': '#f6e2b5',
  'gal-settings-system-title': '#f6e2b5',
  'gal-settings-heading-note': '#bfc5da',
  'gal-settings-disclaimer': '#c6c8dc',
  'gal-settings-restore-note': '#b9bfd3',
  'gal-gallery-title': '#f6e2b5',
  'gal-gallery-progress': '#bfc5da',
  'gal-gallery-hint': '#b9bfd3',
  'gal-gallery-page': '#e4d5aa',
  'gal-confirm-message': '#d0d3e4',
};
const SETTINGS_CARD_ID = /^gal-settings-(?:text-card|input-card|volume-card|audio-other-card|display-card|accessibility-card|confirm-save|confirm-flow)$/;

/** V2's `.art-button` is not the same as its compact `.ghost` navigation. */
function usesV2ArtButton(id: string | undefined): boolean {
  if (!id) return false;
  return /^starter-act-\d+$/.test(id) || id.startsWith('gal-choice') ||
    id.startsWith('gal-home-') || id.startsWith('gal-memory-play-') ||
    id.startsWith('gal-settings-tab-') ||
    ['gal-mode-save', 'gal-mode-load', 'gal-slots-commit', 'gal-settings-reset',
      'gal-settings-back', 'gal-gallery-back', 'gal-confirm-no', 'gal-confirm-yes',
      'gal-history-back', 'gal-cg-expanded-back'].includes(id);
}

function usesV2GhostButton(id: string | undefined): boolean {
  return /^gal-story-(history|voice-replay|auto|skip|save|load|settings|home)$/.test(id ?? '') ||
    /^gal-settings-nav-/.test(id ?? '') ||
    ['gal-replay-exit', 'gal-slots-settings', 'gal-slots-back', 'gal-page-prev', 'gal-page-next'].includes(id ?? '');
}

/** Keep visual data out of the game/read model and out of the deterministic World. */
export function applyGalUiArt(node: LayoutNode, art: GalUiArt): LayoutNode {
  let props = node.props;
  let layout = node.layout;
  let children = node.children;
  if (node.type === 'Label') {
    const ink = (art.dialogue && DIALOGUE_INK[node.id ?? '']) ||
      (art.systemFrame && FRAME_INK[node.id ?? '']) ||
      (art.systemFrame?.slice === 115 && /^gal-settings-|^gal-setting-/.test(node.id ?? '') && '#f4f0e9') ||
      (art.slot && art.slot.slice === undefined && /^gal-slot-\d+-(number|meta|state|preview-text)$/.test(node.id ?? '') &&
        (node.id?.endsWith('-number') ? '#f4e2bc' : '#cbd0e3'));
    if (ink) props = { ...node.props, color: { custom: ink } };
  } else if (node.type === 'Button' && art.button) {
    const isV2Button = art.button.slice === undefined;
    if (!isV2Button || usesV2ArtButton(node.id)) {
      props = { ...node.props, skin: art.button.url, skinSlice: art.button.slice,
        ...(isV2Button ? { skinSize: { x: 100, y: node.id?.startsWith('gal-choice') ? 180 : 220 },
          skinPosition: 'center', skinOutset: { x: 8, y: 5 } } : {}) };
      if (isV2Button && (node.id?.startsWith('gal-settings-tab-') ||
        node.id === 'gal-mode-save' || node.id === 'gal-mode-load')) {
        layout = { ...node.layout, width: node.id?.startsWith('gal-mode-') ? 124 : 132, height: 46 };
      }
    } else if (usesV2GhostButton(node.id)) {
      // An omitted skin inherits apolloToon's candy buttonSkins. V2 ghost
      // navigation explicitly opts out, without changing the shared theme.
      props = { ...(node.props as ButtonProps), skin: '', labelColor: { custom: '#e8e8f4' } };
    }
  } else if (node.type === 'Slider' && art.sliderKnob) {
    props = { ...node.props, thumbSkin: art.sliderKnob.url, thumbSize: 34 };
  } else if (node.type === 'Panel' && art.slot && art.slot.slice === undefined &&
    /^gal-slot-\d+-preview$/.test(node.id ?? '')) {
    props = { ...node.props, bg: 'ink-deep' };
  } else if (node.type === 'Panel') {
    if (art.systemFrame?.slice === 115 &&
      (SETTINGS_CARD_ID.test(node.id ?? '') || node.id === 'gal-settings-preview')) {
      props = { ...node.props, bg: 'ink-deep' };
    }
    if (art.systemFrame?.slice === 115 && art.sliderKnob &&
      /^gal-setting-.*-control-shell$/.test(node.id ?? '') &&
      node.children?.some(child => child.type === 'Slider')) {
      children = [{ type: 'ProgressBar', id: `${node.id}-rail`,
        props: { value: 1, max: 1, barHeight: 6, fillColor: '#9da8e4' },
        layout: { x: 0, y: 14, width: 326, height: 6, allowOverlap: true } }, ...node.children];
    }
    const part = node.id === 'gal-story-dialogue' ? art.dialogue :
      node.id === 'gal-slots-shell' || node.id === 'gal-gallery-shell' || node.id === 'gal-settings-shell'
        ? art.systemFrame : /^gal-slot-\d+$/.test(node.id ?? '') ? art.slot : undefined;
    if (part) {
      if (part === art.slot && part.slice === undefined) {
        // V2 slot art is a whole-card 100%×100% image, not a nine-slice or
        // cover image. Positioned elements paint above normal-flow siblings,
        // so put the live content in a later positioned bare group.
        props = { ...node.props, bg: 'ink-deep' };
        const slotChildren = node.children ?? [];
        const place = (suffix: string, position: LayoutNode['layout']): LayoutNode | undefined => {
          const child = slotChildren.find(item => item.id === `${node.id}-${suffix}`);
          if (!child) return undefined;
          return { ...child, layout: { ...child.layout, ...position },
            ...(suffix === 'number' ? { props: { ...child.props, size: 11 } } : {}) };
        };
        const content = [place('preview', { x: 17, y: 18, width: 275, height: 100 }),
          place('number', { x: 28, y: 20 }), place('meta', { x: 17, y: 131, width: 183 }),
          place('state', { x: 211, y: 131, width: 80 })].filter((item): item is LayoutNode => !!item);
        children = [{ type: 'Image', id: `${node.id}-skin`,
          props: { src: part.url, alt: '', fit: 'fill' },
          layout: { x: 0, y: 0, width: 309, height: 164, allowOverlap: true } },
        { type: 'Panel', id: `${node.id}-content`, props: { bare: true },
          layout: { x: 0, y: 0, width: 309, height: 164, direction: 'column',
            allowOverlap: true }, children: content }];
      } else {
        const isV2Frame = part === art.systemFrame && part.slice === 115;
        props = { ...node.props, skin: part.url, skinSlice: part.slice,
          ...(isV2Frame ? { skinBorderWidth: 58 } : {}),
          ...(part === art.dialogue && part.slice === undefined ?
            { skinSize: { x: 100, y: 160 }, skinPosition: 'center' } : {}) };
        // The unskinned S4 panel has a 1px edge on each side; non-slice art
        // removes that edge. Preserve the approved 1400×345 outer anchor.
        if (part === art.dialogue && part.slice === undefined &&
          node.layout?.width === 1398 && node.layout?.height === 343) {
          layout = { ...node.layout, width: 1400, height: 345 };
        }
        // LayoutNode widths are content-box values. Exchange 57px of the
        // existing 65px inset for the 58px image border (+ old 1px edge).
        if (isV2Frame && node.layout?.padding === 65) {
          layout = { ...node.layout, padding: 8 };
          if (node.id === 'gal-settings-shell') {
            // The source frame adds 58px of real display border. Its child
            // coordinates still included the former 65px inset. Subtract the
            // exchanged 57px only for this loaded V2 frame, not fallback UI.
            children = node.children?.map(child => ({ ...child,
              layout: { ...child.layout,
                ...(typeof child.layout?.x === 'number' ? { x: child.layout.x - 57 } : {}),
                ...(typeof child.layout?.y === 'number' ? { y: child.layout.y - 57 } : {}),
              } }));
          } else if (node.id === 'gal-slots-shell') {
            children = node.children?.map(child => child.id === 'gal-slots-footer' ? { ...child,
              layout: { ...child.layout,
                x: typeof child.layout?.x === 'number' ? child.layout.x - 57 : child.layout?.x,
                y: typeof child.layout?.y === 'number' ? child.layout.y - 57 : child.layout?.y } } : child);
          }
        }
      }
    }
  } else if (node.type === 'Modal' && art.systemFrame) {
    props = { ...node.props, skin: art.systemFrame.url, skinSlice: art.systemFrame.slice,
      titleColor: { custom: '#f5dfad' },
      ...(art.systemFrame.slice === 115 ? { skinBorderWidth: node.id === 'gal-confirm' ? 36 : 58 } : {}) };
  }
  if (props === node.props && !children?.length) return node;
  return { ...node, props, layout,
    ...(children ? { children: children.map(child => applyGalUiArt(child, art)) } : {}) } as LayoutNode;
}
