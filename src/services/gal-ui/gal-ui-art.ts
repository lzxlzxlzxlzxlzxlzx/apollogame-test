import type { ButtonProps, ButtonStateColors, LabelProps, LayoutNode, ToggleProps, ToggleVisual } from '@ui/components/types.js';
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
  'gal-slots-system-title': '#f5e0b1',
  'gal-slots-heading-note': '#bfc5da',
  'gal-slots-title': '#f6e2b5',
  'gal-slots-hint': '#b9bfd3',
  'gal-page-counter': '#e4d5aa',
  'gal-settings-title': '#f6e2b5',
  'gal-settings-system-title': '#f6e2b5',
  'gal-settings-heading-note': '#bfc5da',
  'gal-settings-disclaimer': '#c6c8dc',
  'gal-settings-restore-note': '#b9bfd3',
  'gal-gallery-title': '#f6e2b5',
  'gal-gallery-topbar-title': '#f6e2b5',
  'gal-gallery-heading-note': '#bfc5da',
  'gal-gallery-progress': '#bfc5da',
  'gal-gallery-hint': '#b9bfd3',
  'gal-gallery-page': '#e4d5aa',
  'gal-confirm-message': '#d0d3e4',
};
const SETTINGS_CARD_ID = /^gal-settings-(?:text-card|input-card|volume-card|audio-other-card|display-card|accessibility-card|confirm-save|confirm-flow)$/;
const GALLERY_CARD_ID = /^gal-gallery-card-/;
const GALLERY_ART_ID = /^gal-gallery-art-/;

/** V2's `.art-button` is not the same as its compact `.ghost` navigation. */
function usesV2ArtButton(id: string | undefined): boolean {
  if (!id) return false;
  return /^starter-act-\d+$/.test(id) || id.startsWith('gal-choice') ||
    id.startsWith('gal-home-') || id.startsWith('gal-memory-play-') ||
    id.startsWith('gal-settings-tab-') ||
    id === 'gal-gallery-memories-tab' || id === 'gal-gallery-cg-tab' ||
    ['gal-mode-save', 'gal-mode-load', 'gal-slots-commit', 'gal-slots-return', 'gal-settings-reset',
      'gal-settings-back', 'gal-gallery-back', 'gal-confirm-no', 'gal-confirm-yes',
      'gal-history-back', 'gal-cg-expanded-back'].includes(id);
}

function usesV2GhostButton(id: string | undefined): boolean {
  return /^gal-story-(history|voice-replay|auto|skip|save|load|settings|home)$/.test(id ?? '') ||
    /^gal-settings-nav-/.test(id ?? '') ||
    /^gal-setting-(key-help|ui-scale|audio-preview|fullscreen)-control$/.test(id ?? '') ||
    ['gal-replay-exit', 'gal-slots-home', 'gal-slots-story', 'gal-slots-gallery',
      'gal-slots-settings', 'gal-slots-back', 'gal-page-prev', 'gal-page-next',
      'gal-gallery-prev', 'gal-gallery-next', 'gal-gallery-settings',
      'gal-gallery-home', 'gal-gallery-story', 'gal-gallery-slots',
      'gal-gallery-settings-top'].includes(id ?? '');
}

/** Approved V2 ghost palette, expressed only through the shared Button state contract. */
const V2_GHOST_COLORS: ButtonStateColors = {
  default: { background: { custom: '#101a36cf' }, border: { custom: '#e4d6aa88' }, text: { custom: '#e8e8f4' } },
  hover: { background: { custom: '#535c91' }, border: { custom: '#e4d6aa88' }, text: { custom: '#ffffff' } },
  pressed: { background: { custom: '#414b7c' }, border: { custom: '#e4d6aa88' }, text: { custom: '#ffffff' } },
  disabled: { background: { custom: '#101a365c' }, border: { custom: '#e4d6aa52' }, text: { custom: '#abb0c2' } },
};

/** V2's measured switch, applied only when the approved V2 frame is present. */
const V2_TOGGLE_VISUAL: ToggleVisual = {
  width: 75, height: 31, knobSize: 22, knobOffLeft: 4, knobOnLeft: 46, knobTop: 3,
  showLabel: false,
  offBackground: { custom: '#1b2445' }, onBackground: { custom: '#5b679e' },
  border: { custom: '#d8c389' }, offKnob: { custom: '#8b9ac3' }, onKnob: { custom: '#eff1ff' },
};

/** Keep visual data out of the game/read model and out of the deterministic World. */
export function applyGalUiArt(node: LayoutNode, art: GalUiArt): LayoutNode {
  let props = node.props;
  let layout = node.layout;
  let children = node.children;
  if (node.type === 'Screen' && art.systemFrame?.slice === 115 && art.slot && art.slot.slice === undefined) {
    const shell = node.children?.find(child => child.id === 'gal-slots-shell');
    const header = shell?.children?.find(child => child.id === 'gal-slots-header');
    const actions = header?.children?.find(child => child.id === 'gal-slots-header-actions');
    if (shell && header && actions) {
      // V2 keeps global navigation above the frame. Move the same closed-set
      // action nodes, never duplicate them or alter the no-art fallback.
      const movedHeader = { ...header, children: header.children?.filter(child => child !== actions) };
      const movedShell = { ...shell, children: shell.children?.map(child => child === header ? movedHeader : child) };
      children = [...(node.children ?? []).map(child => child === shell ? movedShell : child),
        { ...actions, layout: { ...actions.layout, x: 1080, y: 16, width: 330, height: 40,
          direction: 'row', justify: 'end', gap: 8 } }];
    }
  } else if (node.type === 'Label') {
    /* AI START */
    if (node.id === 'gal-story-speaker' && art.dialogue && art.dialogue.slice === undefined)
      layout = { ...layout, y: 84 };
    /* AI END */
    const isV2EmptySlot = !!art.slot && art.slot.slice === undefined &&
      /^gal-slot-\d+-preview-text$/.test(node.id ?? '') && (node.props as LabelProps).text === '空存档位';
    const ink = (art.dialogue && DIALOGUE_INK[node.id ?? '']) ||
      (art.systemFrame && FRAME_INK[node.id ?? '']) ||
      (art.systemFrame?.slice === 115 && /^gal-gallery-(?:name|count|art-note|placeholder|locked)-/.test(node.id ?? '') &&
        (node.id?.includes('-placeholder-') || node.id?.includes('-locked-') ||
          (node.props as LabelProps).text === '？？？' ? '#aab4c7' :
          node.id?.includes('-count-') ? '#bfc5da' : '#f5e7c6')) ||
      (art.systemFrame?.slice === 115 && /^gal-settings-(?:text-card|input-card|volume-card|audio-other-card|display-card|accessibility-card|confirm-save|confirm-flow)-title$/.test(node.id ?? '') && '#f5dfad') ||
      (art.systemFrame?.slice === 115 && /^gal-settings-|^gal-setting-/.test(node.id ?? '') && '#f4f0e9') ||
      (art.slot && art.slot.slice === undefined && /^gal-slot-\d+-(number|meta|state|preview-text)$/.test(node.id ?? '') &&
        (node.id?.endsWith('-number') ? '#f4e2bc' : '#cbd0e3'));
    if (ink || isV2EmptySlot) props = { ...node.props,
      ...(ink ? { color: { custom: ink } } : {}),
      ...(art.systemFrame?.slice === 115 && SETTINGS_CARD_ID.test((node.id ?? '').replace(/-title$/, '')) &&
        node.id?.endsWith('-title') ? { size: 18, bold: true } : {}),
      ...(isV2EmptySlot ? { text: '◇', size: 24 } : {}) };
  } else if (node.type === 'Button' && art.systemFrame?.slice === 115 &&
    node.id?.startsWith('gal-memory-play-')) {
    props = { ...node.props, skin: '', kind: 'quiet', labelColor: { custom: '#cbd0e3' } };
  } else if (node.type === 'Button' && art.button) {
    const isV2Button = art.button.slice === undefined;
    if (!isV2Button || usesV2ArtButton(node.id)) {
      props = { ...node.props, skin: art.button.url, skinSlice: art.button.slice,
        ...(isV2Button ? { skinSize: { x: 100, y: node.id?.startsWith('gal-choice') ? 180 : 220 },
          skinPosition: 'center', skinOutset: { x: 8, y: 5 },
          ...(node.id?.startsWith('gal-home-') || /^starter-act-\d+$/.test(node.id ?? '') ?
            { labelSize: 21, labelWeight: 700 } : {}),
          skinFeedback: { hoverBrightness: 1.32, pressedBrightness: 1.32,
            glowRadius: 8, glowColor: { custom: '#a7b2ff99' }, transitionMs: 160 } } : {}) };
      if (isV2Button && (node.id === 'gal-confirm-no' || node.id === 'gal-confirm-yes'))
        layout = { ...node.layout, width: 124, height: 44 };
      if (isV2Button && (node.id?.startsWith('gal-home-') || /^starter-act-\d+$/.test(node.id ?? '')))
        layout = { ...node.layout, height: 52 };
      if (isV2Button && (node.id?.startsWith('gal-settings-tab-') ||
        node.id === 'gal-gallery-memories-tab' || node.id === 'gal-gallery-cg-tab' ||
        node.id === 'gal-mode-save' || node.id === 'gal-mode-load')) {
        layout = { ...node.layout, width: node.id?.startsWith('gal-mode-') ||
          node.id?.startsWith('gal-gallery-') ? 124 : 132, height: 46 };
      }
    } else if (usesV2GhostButton(node.id)) {
      // An omitted skin inherits apolloToon's candy buttonSkins. V2 ghost
      // navigation explicitly opts out, without changing the shared theme.
      props = { ...(node.props as ButtonProps), skin: '', shape: 'pill',
        labelColor: { custom: '#e8e8f4' }, stateColors: V2_GHOST_COLORS };
    }
  } else if (node.type === 'Toggle' && art.systemFrame?.slice === 115 &&
    (/^gal-setting-.*-control$/.test(node.id ?? '') || /^gal-confirm-toggle-/.test(node.id ?? ''))) {
    props = { ...(node.props as ToggleProps), visual: V2_TOGGLE_VISUAL };
  } else if (node.type === 'Slider' && art.sliderKnob) {
    props = { ...node.props, thumbSkin: art.sliderKnob.url, thumbSize: 34 };
  } else if (node.type === 'Panel' && art.slot && art.slot.slice === undefined &&
    /^gal-slot-\d+-preview$/.test(node.id ?? '')) {
    // The approved V2 empty-preview well is flat RGB(23,33,64), not the
    // near-black ink-deep preset. Keep this exact fill behind live preview data.
    props = { ...node.props, bg: { custom: '#172140' } };
  } else if (node.type === 'Panel') {
    if (art.systemFrame?.slice === 115 && GALLERY_CARD_ID.test(node.id ?? '')) {
      props = { ...node.props, bg: { custom: '#111b36' }, edge: 'gold', dashed: false };
    } else if (art.systemFrame?.slice === 115 && GALLERY_ART_ID.test(node.id ?? '')) {
      props = { ...node.props, bg: { custom: '#172140' }, pattern: undefined };
    }
    if (art.systemFrame?.slice === 115 &&
      (SETTINGS_CARD_ID.test(node.id ?? '') || node.id === 'gal-settings-preview')) {
      props = { ...node.props,
        bg: { custom: SETTINGS_CARD_ID.test(node.id ?? '') ? '#0b1430ba' : '#172140' }, edge: 'gold' };
      if (SETTINGS_CARD_ID.test(node.id ?? '')) layout = { ...node.layout, radius: 12 };
    }
    if (art.systemFrame?.slice === 115 && art.sliderKnob &&
      /^gal-setting-.*-control-shell$/.test(node.id ?? '') &&
      node.children?.some(child => child.type === 'Slider')) {
      const slider = node.children!.find(child => child.type === 'Slider')!;
      const range = slider.props as { value: number; min: number; max: number };
      const progress = range.max > range.min
        ? Math.max(0, Math.min(1, (range.value - range.min) / (range.max - range.min))) : 0;
      children = [{ type: 'Panel', id: `${node.id}-rail`,
        props: { bg: { custom: '#2b3454' } },
        layout: { x: 0, y: 14, width: 326, height: 6, radius: 3, padding: 0, allowOverlap: true },
        children: progress === 0 ? [] : [{ type: 'Panel', id: `${node.id}-rail-fill`,
          props: { bg: { custom: '#9da8e4' } },
          layout: { width: Math.max(1, Math.round(324 * progress)), height: 4, radius: 2, padding: 0 } }] },
      ...node.children];
    }
    const part = node.id === 'gal-story-dialogue-backdrop' ? art.dialogue :
      node.id === 'gal-slots-shell' || node.id === 'gal-gallery-shell' || node.id === 'gal-settings-shell'
        ? art.systemFrame : /^gal-slot-\d+$/.test(node.id ?? '') ? art.slot : undefined;
    if (part) {
      if (part === art.slot && part.slice === undefined) {
        // V2 slot art is a whole-card 100%×100% image, not a nine-slice or
        // cover image. Positioned elements paint above normal-flow siblings,
        // so put the live content in a later positioned bare group.
        props = { ...node.props, bg: 'ink-deep', edge: undefined };
        /* AI START */
        // 1633×963 skin stretched to 309×164. Dark caption band is source rows
        // 680–848 (display y 116–144); gold filigree starts at display y 145.
        layout = { ...node.layout, padding: 0 };
        /* AI END */
        const slotChildren = node.children ?? [];
        const place = (suffix: string, position: LayoutNode['layout']): LayoutNode | undefined => {
          const child = slotChildren.find(item => item.id === `${node.id}-${suffix}`);
          if (!child) return undefined;
          return { ...child, layout: { ...child.layout, ...position },
            ...(suffix === 'number' ? { props: { ...child.props, size: 11 } } : {}) };
        };
        const number = place('number', {});
        const content = [place('preview', { x: 20, y: 18, width: 269, height: 96 }),
          ...(number ? [{ type: 'Panel', id: `${node.id}-number-pill`, props: { bg: 'ink-deep', edge: 'gold' },
            layout: { x: 26, y: 24, width: 52, height: 18, radius: 9, padding: 0,
              align: 'center', justify: 'center', allowOverlap: true }, children: [number] } as LayoutNode] : []),
          place('meta', { x: 22, y: 120, width: 170 }),
          place('state', { x: 200, y: 120, width: 88 })].filter((item): item is LayoutNode => !!item);
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
            // 2172×724 art in the 1400×345 slot. 135% height keeps that aspect; 160% stretched it.
            { skinSize: { x: 100, y: 135 }, skinPosition: 'center' } : {}) };
        // The unskinned S4 panel has a 1px edge on each side; non-slice art
        // removes that edge. Preserve the approved 1400×345 outer anchor.
        if (part === art.dialogue && part.slice === undefined &&
          node.layout?.width === 1398 && node.layout?.height === 343) {
          layout = { ...node.layout, width: 1400, height: 345 };
        }
        // LayoutNode widths are content-box values. Exchange 57px of the
        // existing 65px inset for the 58px image border (+ old 1px edge).
        if (isV2Frame && node.layout?.padding === 65) {
          layout = { ...node.layout, padding: 8,
            ...(node.id === 'gal-gallery-shell' || node.id === 'gal-slots-shell' || node.id === 'gal-settings-shell'
              ? { x: 18, y: 61, width: 1404, height: 824 } : {}) };
          if (node.id === 'gal-settings-shell' || node.id === 'gal-gallery-shell') {
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
      ...(art.systemFrame.slice === 115 ? { skinBorderWidth: node.id === 'gal-confirm' ? 36 : 58,
        ...(node.id === 'gal-confirm' ? { visual: { minHeight: 310, padding: 26,
          titleSize: 30, titleAlign: 'center', contentAlign: 'center' } } : {}) } : {}) };
    if (art.systemFrame.slice === 115 && node.id === 'gal-confirm')
      children = [{ type: 'Panel', id: 'gal-confirm-content', props: { bare: true },
        layout: { height: 130, direction: 'column', align: 'center', justify: 'center', gap: 20 },
        children: node.children ?? [] }];
  }
  if (art.systemFrame?.slice === 115 && node.id === 'gal-story-text') {
    layout = { ...layout, anim: 'flyIn', animFrom: 'bottom', animDist: 7, animMs: 240 };
  } else if (art.systemFrame?.slice === 115 && node.type === 'Button' && node.id?.startsWith('gal-choice#')) {
    layout = { ...layout, anim: 'flyIn', animFrom: 'bottom', animDist: 7, animMs: 250 };
  } else if (art.systemFrame?.slice === 115 && node.id === 'gal-story-advance') {
    layout = { ...layout, fx: [{ kind: 'cue', ms: 1300 }] };
  }
  if (node.id === 'gal-story-dialogue' && art.dialogue && art.dialogue.slice === undefined &&
      node.layout?.width === 1398 && node.layout?.height === 343)
    layout = { ...layout, width: 1400, height: 345 };
  if (props === node.props && layout === node.layout && !children?.length) return node;
  return { ...node, props, layout,
    ...(children ? { children: children.map(child => applyGalUiArt(child, art)) } : {}) } as LayoutNode;
}
