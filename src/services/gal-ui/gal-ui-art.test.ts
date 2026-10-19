import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { LayoutNode } from '@ui/components/types.js';
import { parseAssetIndex } from '../../assets/asset-index.js';
import { renderNode } from '@ui/components/render.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { GAL_UI_ART_KEYS, galUiUrlsFromIndex, loadGalContentUrls, loadGalUiArt, resolveGalUiArt } from './gal-ui-art.js';
import { buildGalSliceTree } from './gal-ui-structure.js';

const urls = Object.fromEntries(Object.entries(GAL_UI_ART_KEYS).map(([slot, key]) =>
  [key, `/games/gal-template/art/${slot}.png`]));

function find(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = find(child, id);
    if (match) return match;
  }
  return undefined;
}

describe('GAL UI indexed art consumption', () => {
  it('uses all five registered GAL AssetIndex identities, never design-document URLs', () => {
    const raw = JSON.parse(readFileSync(new URL('../../../public/games/gal-template/art/index.json', import.meta.url), 'utf8'));
    const indexed = galUiUrlsFromIndex(parseAssetIndex(raw));
    expect(Object.keys(indexed).sort()).toEqual(Object.values(GAL_UI_ART_KEYS).sort());
    for (const url of Object.values(indexed)) {
      expect(url).toMatch(/^\/games\/gal-template\/art\/textures\/ui\/.+\.png$/);
      expect(url).not.toContain('docs/design');
    }
    expect(Object.keys(resolveGalUiArt(indexed))).toHaveLength(5);
  });
  it('accepts only filled local texture index entries', () => {
    const raw = { version: 1, assets: [
      { id: GAL_UI_ART_KEYS.dialogue, type: 'texture', status: 'filled', path: '/games/gal-template/art/dialogue.png' },
      { id: GAL_UI_ART_KEYS.button, type: 'texture', status: 'tbf', path: '/games/gal-template/art/button.png' },
      { id: GAL_UI_ART_KEYS.slot, type: 'texture', status: 'filled', path: 'docs/design/galgame/slot.png' },
      { id: GAL_UI_ART_KEYS.sliderKnob, type: 'sound', status: 'filled', path: '/games/gal-template/art/knob.png' },
      { id: 'tex/gal-demo-cg', type: 'texture', status: 'filled', path: '/games/gal-template/art/cg.png' },
    ] } as unknown as Parameters<typeof galUiUrlsFromIndex>[0];
    expect(galUiUrlsFromIndex(raw)).toEqual({ [GAL_UI_ART_KEYS.dialogue]: '/games/gal-template/art/dialogue.png' });
  });
  it('resolves only stable keys and leaves absent parts unskinned', () => {
    const art = resolveGalUiArt({ [GAL_UI_ART_KEYS.dialogue]: '/games/gal-template/art/dialogue.png',
      unrelated: '/x.png' });
    expect(Object.keys(art)).toEqual(['dialogue']);
    const story = buildGalSliceTree(auditModel, auditState('story'), art);
    expect(find(story, 'gal-story-dialogue-backdrop')?.props).toMatchObject({ skin: art.dialogue?.url });
    expect(find(story, 'gal-story-topbar')?.props).not.toHaveProperty('skin');
    expect(find(story, 'gal-story-save')?.props).not.toHaveProperty('skin');
  });

  it('wires five closed-set slots without changing geometry or actions', () => {
    const art = resolveGalUiArt(urls, { dialogue: 12, systemFrame: 16, button: 7, slot: 11 });
    for (const page of ['story', 'slots', 'settings', 'gallery', 'home'] as const) {
      const before = buildGalSliceTree(auditModel, auditState(page));
      const after = buildGalSliceTree(auditModel, auditState(page), art);
      expect(validateLayoutNode(after)).toEqual([]);
      const strip = (node: LayoutNode): unknown => ({ type: node.type, id: node.id, layout: node.layout,
        children: node.children?.filter(child => !child.id?.endsWith('-skin')).map(strip),
        action: (node.props as { action?: string })?.action });
      expect(strip(after)).toEqual(strip(before));
    }
    const story = buildGalSliceTree(auditModel, auditState('story'), art);
    expect(find(story, 'gal-story-dialogue-backdrop')?.props).toMatchObject({ skin: art.dialogue?.url, skinSlice: 12 });
    expect(find(story, 'gal-story-save')?.props).toMatchObject({ skin: art.button?.url, skinSlice: 7 });
    const slots = buildGalSliceTree(auditModel, auditState('slots'), art);
    expect(find(slots, 'gal-slots-shell')?.props).toMatchObject({ skin: art.systemFrame?.url });
    expect(find(slots, 'gal-slot-2')?.props).toMatchObject({ skin: art.slot?.url, skinSlice: 11,
      action: 'gal.slot.select' });
    expect(find(slots, 'gal-slot-2-preview')?.props).not.toHaveProperty('skin');
    const settings = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'text' }, art);
    expect(find(settings, 'gal-setting-auto-control')?.props).toMatchObject({ thumbSkin: art.sliderKnob?.url });
    const modal = buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }, art);
    expect(find(modal, 'gal-confirm')?.props).toMatchObject({ skin: art.systemFrame?.url });
    expect(renderNode(find(story, 'gal-story-dialogue-backdrop')!)).toContain('border-image');
  });

  it('separates the V2 system-frame source cut from large and confirmation display edges', () => {
    const art = resolveGalUiArt(urls);
    expect(art.systemFrame?.slice).toBe(115);
    for (const page of ['slots', 'settings', 'gallery'] as const) {
      const tree = buildGalSliceTree(auditModel, auditState(page), art);
      expect(find(tree, `gal-${page}-shell`)?.props).toMatchObject({
        skin: art.systemFrame?.url, skinSlice: 115, skinBorderWidth: 58,
      });
      expect(find(tree, `gal-${page}-shell`)?.layout?.padding).toBe(8);
      expect(validateLayoutNode(tree)).toEqual([]);
    }
    const confirm = buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }, art);
    expect(find(confirm, 'gal-confirm')?.props).toMatchObject({
      skin: art.systemFrame?.url, skinSlice: 115, skinBorderWidth: 36,
      visual: { minHeight: 310, padding: 26, titleSize: 30, titleAlign: 'center', contentAlign: 'center' },
    });
    expect(validateLayoutNode(confirm)).toEqual([]);
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slots-shell')?.props)
      .not.toHaveProperty('skinBorderWidth');
    const custom = resolveGalUiArt(urls, { systemFrame: 16 });
    expect(find(buildGalSliceTree(auditModel, auditState('slots'), custom), 'gal-slots-shell')?.props)
      .not.toHaveProperty('skinBorderWidth');
  });

  it('completes only the loaded V2 slot system chrome with brand, capacity and footer return', () => {
    const v2Art = resolveGalUiArt(urls);
    const v2 = buildGalSliceTree(auditModel, auditState('slots'), v2Art);
    const plain = buildGalSliceTree(auditModel, auditState('slots'));
    const legacy = buildGalSliceTree(auditModel, auditState('slots'),
      resolveGalUiArt(urls, { systemFrame: 16 }));
    expect(find(v2, 'gal-slots-system-title')?.props).toMatchObject({ text: `✧ ${auditModel.title}`,
      color: { custom: '#f5e0b1' } });
    expect(find(v2, 'gal-slots-heading-note')).toBeUndefined();
    expect(find(v2, 'gal-slots-hint')).toBeUndefined();
    expect(find(v2, 'gal-slots-footer-actions')?.children?.map(child => child.id))
      .toEqual(['gal-slots-commit', 'gal-slots-return']);
    expect(find(v2, 'gal-slots-return')?.props).toMatchObject({ action: 'gal.slot.back',
      skin: v2Art.button?.url });
    for (const tree of [plain, legacy]) {
      expect(find(tree, 'gal-slots-system-title')).toBeUndefined();
      expect(find(tree, 'gal-slots-heading-note')).toBeUndefined();
      expect(find(tree, 'gal-slots-return')).toBeUndefined();
    }
    expect(validateLayoutNode(v2)).toEqual([]);
  });

  it('aligns loaded V2 settings contents without moving fallback or legacy sliced layouts', () => {
    const v2 = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'text' },
      resolveGalUiArt(urls));
    const plain = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'text' });
    const old = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'text' },
      resolveGalUiArt(urls, { systemFrame: 16 }));
    for (const id of ['gal-settings-heading', 'gal-settings-tabs', 'gal-settings-grid',
      'gal-settings-disclaimer-wrap', 'gal-settings-preview', 'gal-settings-footer']) {
      const target = find(v2, id)?.layout;
      const base = find(plain, id)?.layout;
      expect(target?.x).toBe((base?.x ?? 0) - 57);
      expect(target?.y).toBe((base?.y ?? 0) - 57);
      expect(find(old, id)?.layout).toEqual(base);
    }
    expect(find(v2, 'gal-settings-text-card')?.props).toMatchObject({ bg: { custom: '#0b1430ba' }, edge: 'gold' });
    expect(find(v2, 'gal-settings-preview')?.props).toMatchObject({ bg: { custom: '#172140' }, edge: 'gold' });
    expect(find(v2, 'gal-setting-speed-name')?.props).toMatchObject({ color: { custom: '#f4f0e9' } });
    expect(find(v2, 'gal-setting-speed-control-shell')?.layout).toMatchObject({
      width: 400, direction: 'row', align: 'center', gap: 12,
    });
    expect(find(v2, 'gal-setting-speed-control')?.layout).toMatchObject({ width: 326 });
    expect(find(v2, 'gal-setting-speed-control-value')?.layout).toMatchObject({ width: 62 });
    expect(find(v2, 'gal-setting-speed-control-shell-rail')?.layout).toMatchObject({
      x: 0, y: 14, width: 326, height: 6, allowOverlap: true,
    });
    expect(find(v2, 'gal-setting-speed-control-shell-rail')).toMatchObject({
      type: 'Panel', props: { bg: { custom: '#2b3454' } },
    });
    expect(find(v2, 'gal-setting-speed-control-shell-rail-fill')).toMatchObject({
      type: 'Panel', props: { bg: { custom: '#9da8e4' } }, layout: { width: 19, height: 4 },
    });
    expect(find(plain, 'gal-setting-speed-control-shell-rail')).toBeUndefined();
    expect(find(old, 'gal-setting-speed-control-shell-rail')).toBeUndefined();
    expect(find(v2, 'gal-setting-unread-skip-control')?.layout).toMatchObject({ width: 400 });
    expect(find(v2, 'gal-setting-unread-skip-control')?.props).toMatchObject({ visual: {
      width: 75, height: 31, knobSize: 22, knobOffLeft: 4, knobOnLeft: 46, knobTop: 3,
      showLabel: false,
      offBackground: { custom: '#1b2445' }, onBackground: { custom: '#5b679e' },
    } });
    expect(find(plain, 'gal-setting-unread-skip-control')?.props).not.toHaveProperty('visual');
    expect(find(old, 'gal-setting-unread-skip-control')?.props).not.toHaveProperty('visual');
    const confirm = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'confirm' }, resolveGalUiArt(urls));
    expect(find(confirm, 'gal-confirm-toggle-newGame')?.props).toHaveProperty('visual');
    for (const id of ['gal-settings-nav-home', 'gal-story-voice-replay']) {
      const tree = id.startsWith('gal-story') ? buildGalSliceTree(auditModel, auditState('story'),
        resolveGalUiArt(urls)) : v2;
      expect(find(tree, id)?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
    }
    expect(find(v2, 'gal-settings-tab-text')?.props).toMatchObject({ skin: urls[GAL_UI_ART_KEYS.button] });
    expect(find(v2, 'gal-settings-tab-text')?.layout).toMatchObject({ width: 132, height: 46 });
    expect(find(plain, 'gal-settings-text-card')?.props).toMatchObject({ bg: 'panel' });
    expect(find(plain, 'gal-settings-nav-home')?.props).not.toHaveProperty('labelColor');
    expect(validateLayoutNode(v2)).toEqual([]);
  });
  it('shows only a resolved current-scene image behind settings and keeps the no-art fallback', () => {
    const model = { ...auditModel, story: { ...auditModel.story,
      backgroundAssetKey: 'tex/gal-demo-backdrop' } };
    const resolved = buildGalSliceTree(model, auditState('settings'),
      resolveGalUiArt(urls), { 'tex/gal-demo-backdrop': '/games/gal-template/art/demo-backdrop.png' });
    expect(find(resolved, 'gal-settings-background')?.props).toMatchObject({
      src: '/games/gal-template/art/demo-backdrop.png', alt: '', fit: 'cover',
    });
    expect(find(resolved, 'gal-settings-background')?.layout).toMatchObject({ width: 1440, height: 900 });
    expect(find(resolved, 'gal-settings-stage-placeholder')?.props).toMatchObject({ bare: true });
    expect(find(resolved, 'gal-settings-background-veil')?.props).toMatchObject({
      bg: { custom: 'rgba(5, 8, 22, 0.78)' },
    });
    const unresolved = buildGalSliceTree(model, auditState('settings'), resolveGalUiArt(urls));
    expect(find(unresolved, 'gal-settings-background')).toBeUndefined();
    expect(find(unresolved, 'gal-settings-background-veil')).toBeUndefined();
    expect(find(unresolved, 'gal-settings-stage-placeholder')?.props).toMatchObject({ pattern: 'stripe' });
    expect(validateLayoutNode(resolved)).toEqual([]);
    expect(validateLayoutNode(unresolved)).toEqual([]);
  });
  it('uses the resolved title-scene image for V2 home without borrowing the current story scene', () => {
    const model = { ...auditModel, story: { ...auditModel.story,
      backgroundAssetKey: 'tex/other-scene' } };
    const home = buildGalSliceTree(model, auditState('home'), resolveGalUiArt(urls),
      { 'tex/gal-demo-backdrop': '/games/gal-template/art/demo-backdrop.png',
        'tex/other-scene': '/games/gal-template/art/other.png' });
    expect(find(home, 'gal-home-background')?.props).toMatchObject({
      src: '/games/gal-template/art/demo-backdrop.png', alt: '', fit: 'cover',
    });
    expect(find(home, 'gal-home-background-veil')?.props).toMatchObject({
      bg: { custom: 'rgba(5, 8, 22, 0.28)' },
    });
    expect(find(home, 'gal-home-rule')).toBeDefined();
    expect(find(home, 'gal-home-title')?.props).toMatchObject({ size: 78, color: { custom: '#ffffff' } });
    expect(find(home, 'gal-home-eyebrow')?.props).toMatchObject({ text: 'A STORY UNDER THE MOON' });
    expect(find(home, 'gal-home-subtitle')?.props).toMatchObject({ text: '在月色落下以前，翻开未完成的故事。' });
    expect(find(home, 'gal-home-placeholder')?.props).toMatchObject({ text: '界面验证用演示场景；正式素材待审核' });
    expect(find(home, 'gal-home-actions')?.layout).toMatchObject({ width: 288, gap: 10 });
    expect(find(home, 'gal-home-gallery')?.props).toMatchObject({ labelSize: 21, labelWeight: 700 });
    expect(find(home, 'gal-home-gallery')?.layout).toMatchObject({ height: 52 });
    const missing = buildGalSliceTree(model, auditState('home'), resolveGalUiArt(urls),
      { 'tex/other-scene': '/games/gal-template/art/other.png' });
    expect(find(missing, 'gal-home-background')).toBeUndefined();
    expect(find(missing, 'gal-home-background-veil')).toBeUndefined();
    expect(find(missing, 'gal-home-rule')).toBeUndefined();
    expect(find(missing, 'gal-home-placeholder')?.props).toMatchObject({ text: '背景占位 · 正式场景资产尚未入库' });
    expect(find(missing, 'gal-home-stage-placeholder')?.props).toMatchObject({ pattern: 'stripe' });
    expect(validateLayoutNode(home)).toEqual([]);
    expect(validateLayoutNode(missing)).toEqual([]);
  });

  it('exchanges the V2 gallery frame inset without moving fallback or legacy gallery', () => {
    const v2 = buildGalSliceTree(auditModel, auditState('gallery'), resolveGalUiArt(urls));
    const plain = buildGalSliceTree(auditModel, auditState('gallery'));
    const old = buildGalSliceTree(auditModel, auditState('gallery'),
      resolveGalUiArt(urls, { systemFrame: 16 }));
    for (const id of ['gal-gallery-heading', 'gal-gallery-tabs', 'gal-gallery-grid', 'gal-gallery-footer']) {
      const target = find(v2, id)?.layout;
      const base = find(plain, id)?.layout;
      expect(target?.x).toBe((base?.x ?? 0) - 57);
      expect(target?.y).toBe((base?.y ?? 0) - 57);
      expect(find(old, id)?.layout).toEqual(base);
    }
    expect(validateLayoutNode(v2)).toEqual([]);
  });

  it('uses dark V2 gallery cards while preserving the no-art and legacy themes', () => {
    const state = { ...auditState('gallery'), galleryTab: 'memories' as const };
    const v2 = buildGalSliceTree(auditModel, state, resolveGalUiArt(urls));
    const plain = buildGalSliceTree(auditModel, state);
    const old = buildGalSliceTree(auditModel, state,
      resolveGalUiArt(urls, { systemFrame: 16 }));
    const cardId = 'gal-gallery-card-memory-1';
    const v2Card = find(v2, cardId);
    expect(v2Card?.props).toMatchObject({ bg: { custom: '#111b36' }, edge: 'gold', dashed: false });
    expect(find(v2, 'gal-gallery-name-memory-1')?.props).toMatchObject({
      text: '温室里的初遇', color: { custom: '#f5e7c6' },
    });
    expect(find(v2, 'gal-gallery-count-memory-1')?.props).toMatchObject({ text: 'MEMORY 01' });
    expect(find(v2, 'gal-memory-play-memory-1')?.props).toMatchObject({
      action: 'gal.gallery.play-memory', actionArg: 'memory-1', skin: '', kind: 'quiet',
    });
    expect(find(v2, 'gal-gallery-placeholder-memory-1')?.props).toMatchObject({ text: '场景素材待入库' });
    expect(find(v2, 'gal-gallery-card-memory-1')?.layout).toMatchObject({ height: 149, padding: 0 });
    expect(find(v2, 'gal-gallery-name-memory-4')?.props).toMatchObject({ text: '？？？' });
    expect(find(v2, 'gal-gallery-locked-memory-4')?.props).toMatchObject({
      text: '尚未解锁', color: { custom: '#aab4c7' },
    });
    expect(find(v2, 'gal-memory-play-memory-4')).toBeUndefined();
    expect(find(v2, 'gal-gallery-memories-tab')?.props).toMatchObject({ skin: resolveGalUiArt(urls).button?.url });
    expect(find(v2, 'gal-gallery-settings')).toBeUndefined();
    expect(find(plain, 'gal-gallery-settings')?.props).toMatchObject({ action: 'gal.settings.open' });
    expect(find(old, 'gal-gallery-settings')?.props).toMatchObject({ action: 'gal.settings.open' });
    expect(find(plain, cardId)?.props).not.toMatchObject({ bg: { custom: '#111b36' } });
    expect(find(old, cardId)?.props).toEqual(find(plain, cardId)?.props);
    expect(find(old, 'gal-gallery-count-memory-1')?.props).toMatchObject({ text: 'MEMORY 01 / 06' });
    const cgModel = { ...auditModel, gallery: { ...auditModel.gallery,
      cg: auditModel.gallery.cg.map((card, index) => index === 0 ?
        { ...card, assetKey: 'tex/gal-demo-cg' } : card) } };
    const cg = buildGalSliceTree(cgModel, { ...state, galleryTab: 'cg' }, resolveGalUiArt(urls),
      { 'tex/gal-demo-cg': '/demo-cg.png' });
    expect(find(cg, 'gal-gallery-image-cg-1')?.layout).toMatchObject({ width: 395, height: 185 });
    expect(find(cg, 'gal-gallery-image-cg-3')).toBeUndefined();
    expect(validateLayoutNode(v2)).toEqual([]);
  });

  it('consumes optional memory and spoiler-free lock art only in their own visibility states', () => {
    const memories = auditModel.gallery.memories.map((card, index) => index === 0 ?
      { ...card, assetKey: 'memory/scene' } : index === 3 ?
      { ...card, lockedAssetKey: 'memory/silhouette' } : card);
    const model = { ...auditModel, gallery: { ...auditModel.gallery, memories } };
    const tree = buildGalSliceTree(model, { ...auditState('gallery'), galleryTab: 'memories' },
      resolveGalUiArt(urls), { 'memory/scene': '/scene.png', 'memory/silhouette': '/lock.png' });
    expect(find(tree, 'gal-gallery-memory-image-memory-1')?.props).toMatchObject({ src: '/scene.png' });
    expect(find(tree, 'gal-gallery-memory-image-memory-4')?.props).toMatchObject({ src: '/lock.png' });
    expect(find(tree, 'gal-gallery-placeholder-memory-1')).toBeUndefined();
    expect(find(tree, 'gal-memory-play-memory-4')).toBeUndefined();
    expect(JSON.stringify(find(tree, 'gal-gallery-card-memory-4'))).not.toContain('/scene.png');
    expect(validateLayoutNode(tree)).toEqual([]);
    const missing = buildGalSliceTree(model, { ...auditState('gallery'), galleryTab: 'memories' },
      resolveGalUiArt(urls), {});
    expect(find(missing, 'gal-gallery-memory-image-memory-1')).toBeUndefined();
    expect(find(missing, 'gal-gallery-placeholder-memory-1')).toBeDefined();
    expect(find(missing, 'gal-gallery-memory-image-memory-4')).toBeUndefined();
  });

  it('aligns V2 save/load toolbar and footer without moving fallback or legacy slices', () => {
    const v2 = buildGalSliceTree(auditModel, auditState('slots'), resolveGalUiArt(urls));
    const plain = buildGalSliceTree(auditModel, auditState('slots'));
    const old = buildGalSliceTree(auditModel, auditState('slots'), resolveGalUiArt(urls, { systemFrame: 16,
      button: 12 }));
    for (const id of ['gal-mode-save', 'gal-mode-load']) {
      expect(find(v2, id)?.props).toMatchObject({ skin: urls[GAL_UI_ART_KEYS.button] });
      expect(find(v2, id)?.layout).toMatchObject({ width: 124, height: 46 });
      expect(find(plain, id)?.layout?.width).toBeUndefined();
      expect(find(old, id)?.layout?.width).toBeUndefined();
    }
    for (const id of ['gal-slots-settings', 'gal-page-prev', 'gal-page-next']) {
      expect(find(v2, id)?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
      expect(find(plain, id)?.props).not.toHaveProperty('skin');
      expect(find(old, id)?.props).toMatchObject({ skin: urls[GAL_UI_ART_KEYS.button] });
    }
    for (const id of ['gal-slots-home', 'gal-slots-story', 'gal-slots-gallery']) {
      expect(find(v2, id)?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
      expect(find(plain, id)).toBeUndefined();
      expect(find(old, id)).toBeUndefined();
    }
    expect(find(v2, 'gal-slots-back')).toBeUndefined();
    expect(find(plain, 'gal-slots-back')).toBeDefined();
    expect(find(v2, 'gal-slots-footer')?.layout?.x).toBe((find(plain, 'gal-slots-footer')?.layout?.x ?? 0) - 57);
    expect(find(v2, 'gal-slots-footer')?.layout?.y).toBe((find(plain, 'gal-slots-footer')?.layout?.y ?? 0) - 57);
    expect(find(old, 'gal-slots-footer')?.layout).toEqual(find(plain, 'gal-slots-footer')?.layout);
    expect(validateLayoutNode(v2)).toEqual([]);
  });

  it('consumes approved non-nine-slice V2 art scale without changing explicit legacy slices', () => {
    const art = resolveGalUiArt(urls);
    const story = buildGalSliceTree(auditModel, auditState('story'), art);
    expect(find(story, 'gal-story-dialogue-backdrop')?.props).toMatchObject({
      skinSize: { x: 100, y: 135 }, skinPosition: 'center',
    });
    expect(find(story, 'gal-story-speaker')?.layout).toMatchObject({ x: 101, y: 84 });
    expect(find(story, 'gal-story-dialogue')?.layout).toMatchObject({ x: 20, y: 555, width: 1400, height: 345 });
    for (const id of ['gal-story-history', 'gal-story-auto', 'gal-story-skip', 'gal-story-save',
      'gal-story-load', 'gal-story-settings', 'gal-story-home']) {
      expect(find(story, id)?.props).toMatchObject({ skin: '', shape: 'pill', labelColor: { custom: '#e8e8f4' },
        stateColors: { default: { background: { custom: '#101a36cf' } },
          hover: { background: { custom: '#535c91' } },
          pressed: { background: { custom: '#414b7c' } },
          disabled: { background: { custom: '#101a365c' } } } });
      expect(renderNode(find(story, id)!)).toContain('data-apollo-state-colors');
      expect(find(story, id)?.props).not.toHaveProperty('skinSize');
    }
    const replay = buildGalSliceTree(auditModel, { ...auditState('story'), replayMemoryId: 'memory-1' }, art);
    expect(find(replay, 'gal-replay-exit')?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
    const unavailable = buildGalSliceTree(auditModel, { ...auditState('story'), playbackAvailable: false }, art);
    expect(find(unavailable, 'gal-story-auto')?.props).toMatchObject({ disabled: true,
      skin: '', labelColor: { custom: '#e8e8f4' } });
    expect(renderNode(find(unavailable, 'gal-story-auto')!)).toContain(' disabled');
    const home = buildGalSliceTree(auditModel, auditState('home'), art);
    expect(find(home, 'gal-home-settings')?.props).toMatchObject({
      skinSize: { x: 100, y: 220 }, skinPosition: 'center', skinOutset: { x: 8, y: 5 },
    });
    const choices: LayoutNode[] = [];
    const visit = (node: LayoutNode): void => {
      if (node.type === 'Button' && node.id?.startsWith('gal-choice')) choices.push(node);
      for (const child of node.children ?? []) visit(child);
    };
    visit(story);
    expect(choices).toHaveLength(2);
    for (const choice of choices) expect(choice.props).toMatchObject({
      skinSize: { x: 100, y: 180 }, skinPosition: 'center', skinOutset: { x: 8, y: 5 },
    });
    expect(find(story, 'gal-story-text')?.layout).toMatchObject({
      anim: 'flyIn', animFrom: 'bottom', animDist: 7, animMs: 240,
    });
    expect(choices.map(choice => choice.layout)).toMatchObject([
      { anim: 'flyIn', animFrom: 'bottom', animDist: 7, animMs: 250, animDelay: 0 },
      { anim: 'flyIn', animFrom: 'bottom', animDist: 7, animMs: 250, animDelay: 90 },
    ]);
    expect(choices[0]?.props).toMatchObject({ skinFeedback: { hoverBrightness: 1.32,
      pressedBrightness: 1.32, glowRadius: 8, transitionMs: 160 } });
    const lineModel = { ...auditModel, story: { ...auditModel.story, kind: 'line' as const, choices: [] } };
    const lineStory = buildGalSliceTree(lineModel, auditState('story'), art);
    expect(find(lineStory, 'gal-story-advance')?.layout).toMatchObject({ fx: [{ kind: 'cue', ms: 1300 }] });
    expect(find(buildGalSliceTree(lineModel, auditState('story')), 'gal-story-advance')?.layout)
      .not.toHaveProperty('fx');
    expect(validateLayoutNode(lineStory)).toEqual([]);
    expect(renderNode(find(story, 'gal-story-text')!)).toContain('apollo-flyIn 240ms');
    expect(renderNode(choices[1]!)).toContain('apollo-flyIn 250ms 90ms');
    expect(validateLayoutNode(story)).toEqual([]);
    const old = buildGalSliceTree(auditModel, auditState('story'), resolveGalUiArt(urls, { dialogue: 12, button: 7 }));
    const legacyFrame = buildGalSliceTree(auditModel, auditState('story'),
      resolveGalUiArt(urls, { systemFrame: 7, dialogue: 12, button: 7 }));
    expect(find(legacyFrame, 'gal-story-text')?.layout).not.toHaveProperty('anim');
    expect(find(old, 'gal-story-dialogue')?.props).not.toHaveProperty('skinSize');
    expect(find(buildGalSliceTree(auditModel, auditState('story')), 'gal-story-dialogue')?.layout)
      .toMatchObject({ width: 1398, height: 343 });
    expect(find(old, 'gal-story-save')?.props).toMatchObject({ skinSlice: 7 });
    expect(find(old, 'gal-story-save')?.props).not.toHaveProperty('skinSize');
    expect(find(old, 'gal-story-save')?.props).not.toHaveProperty('labelColor');
    expect(find(old, 'gal-story-save')?.props).not.toHaveProperty('stateColors');
    const oldReplay = buildGalSliceTree(auditModel,
      { ...auditState('story'), replayMemoryId: 'memory-1' }, resolveGalUiArt(urls, { button: 7 }));
    expect(find(oldReplay, 'gal-replay-exit')?.props).not.toHaveProperty('labelColor');
    expect(find(oldReplay, 'gal-replay-exit')?.props).not.toHaveProperty('stateColors');
    expect(find(buildGalSliceTree(auditModel, auditState('story')), 'gal-story-save')?.props)
      .not.toHaveProperty('labelColor');
  });

  it('drops failed or missing images without throwing or changing unlocked content', async () => {
    const art = await loadGalUiArt(urls, {}, async url => !url.includes('slot') && !url.includes('dialogue'));
    expect(art.slot).toBeUndefined();
    expect(art.dialogue).toBeUndefined();
    expect(art.button?.url).toContain('button.png');
    const tree = buildGalSliceTree(auditModel, auditState('slots'), art);
    expect(find(tree, 'gal-slot-1')?.props).not.toHaveProperty('skin');
    expect(find(tree, 'gal-slot-1-skin')).toBeUndefined();
    expect(find(tree, 'gal-slots-shell')?.props).toHaveProperty('skin');
    const cg = buildGalSliceTree(auditModel, { ...auditState('gallery'), galleryTab: 'cg' }, art);
    expect(JSON.stringify(cg)).not.toContain('demo-cg');
  });

  it('uses the V2 full-card fill image while preserving live slot content and old explicit slice data', () => {
    const art = resolveGalUiArt(urls);
    const tree = buildGalSliceTree(auditModel, auditState('slots'), art);
    expect(find(tree, 'gal-slot-2')?.props).toMatchObject({ action: 'gal.slot.select' });
    expect(find(tree, 'gal-slot-2-skin')?.props).toMatchObject({ src: art.slot?.url, fit: 'fill' });
    expect(find(tree, 'gal-slot-2-skin')?.layout).toMatchObject({ width: 309, height: 164, allowOverlap: true });
    expect(find(tree, 'gal-slot-2-content')?.layout).toMatchObject({ x: 0, y: 0, width: 309, height: 164,
      direction: 'column', allowOverlap: true });
    expect(find(tree, 'gal-slot-2')?.layout).toMatchObject({ padding: 0 });
    expect(find(tree, 'gal-slot-2-preview')?.layout).toMatchObject({ x: 20, y: 18, width: 269, height: 96 });
    expect(find(tree, 'gal-slot-2-number-pill')?.layout).toMatchObject({ x: 26, y: 24,
      width: 52, height: 18, radius: 9 });
    expect(find(tree, 'gal-slot-2-number')?.props).toMatchObject({ size: 11 });
    expect(find(tree, 'gal-slot-1-preview-text')?.props).toMatchObject({ text: '◇', size: 24 });
    expect(find(tree, 'gal-slot-2-preview-text')?.props).toMatchObject({ text: '暂无预览' });
    expect(find(tree, 'gal-slot-2-meta')?.layout).toMatchObject({ x: 22, y: 120, width: 170 });
    expect(find(tree, 'gal-slot-2-state')?.layout).toMatchObject({ x: 200, y: 120, width: 88 });
    expect(tree.children?.find(child => child.id === 'gal-slots-header-actions')?.layout)
      .toMatchObject({ x: 1080, y: 16, width: 330, height: 40 });
    expect(find(tree, 'gal-slots-header')?.children?.some(child => child.id === 'gal-slots-header-actions'))
      .toBe(false);
    expect(JSON.stringify(tree).match(/"id":"gal-slots-settings"/g)).toHaveLength(1);
    expect(find(tree, 'gal-slots-home')?.props).toMatchObject({ action: 'gal.slot.nav', actionArg: 'home' });
    expect(find(tree, 'gal-slots-story')?.props).toMatchObject({ actionArg: 'story', disabled: true });
    expect(find(tree, 'gal-slots-gallery')?.props).toMatchObject({ actionArg: 'gallery' });
    const fallback = buildGalSliceTree(auditModel, auditState('slots'));
    expect(fallback.children?.some(child => child.id === 'gal-slots-header-actions')).toBe(false);
    expect(find(fallback, 'gal-slots-header')?.children?.some(child => child.id === 'gal-slots-header-actions'))
      .toBe(true);
    const noSlotArt = buildGalSliceTree(auditModel, auditState('slots'), { ...art, slot: undefined });
    expect(noSlotArt.children?.some(child => child.id === 'gal-slots-header-actions')).toBe(false);
    expect(find(noSlotArt, 'gal-slots-header')?.children?.some(child => child.id === 'gal-slots-header-actions'))
      .toBe(true);
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('uses V2 light ink only on labels directly over loaded dark art', () => {
    const art = resolveGalUiArt(urls);
    const story = buildGalSliceTree(auditModel, auditState('story'), art);
    expect(find(story, 'gal-story-speaker')?.props).toMatchObject({ color: { custom: '#f5dfb3' } });
    expect(find(story, 'gal-story-text')?.props).toMatchObject({ color: { custom: '#f6f1e9' } });
    expect(validateLayoutNode(story)).toEqual([]);
    const settings = buildGalSliceTree(auditModel, { ...auditState('settings'), settingsTab: 'text' }, art);
    expect(find(settings, 'gal-settings-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(settings, 'gal-settings-system-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(settings, 'gal-settings-disclaimer')?.props).toMatchObject({ color: { custom: '#c6c8dc' } });
    expect(find(settings, 'gal-settings-text-card-title')?.props).toMatchObject({ color: { custom: '#f5dfad' } });
    expect(find(settings, 'gal-settings-text-card')?.props).toMatchObject({ bg: { custom: '#0b1430ba' }, edge: 'gold' });
    expect(find(settings, 'gal-setting-speed-rule')?.layout).toMatchObject({ x: 0, y: -8, width: 590 });
    expect(validateLayoutNode(settings)).toEqual([]);
    const slots = buildGalSliceTree(auditModel, auditState('slots'), art);
    expect(find(slots, 'gal-slots-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(slots, 'gal-slot-2-number')?.props).toMatchObject({ color: { custom: '#f4e2bc' } });
    expect(find(slots, 'gal-slot-2-meta')?.props).toMatchObject({ color: { custom: '#cbd0e3' } });
    expect(find(slots, 'gal-slot-2-preview-text')?.props).toMatchObject({ color: { custom: '#cbd0e3' } });
    expect(find(slots, 'gal-slot-2-preview')?.props).toMatchObject({ bg: { custom: '#172140' } });
    expect(find(slots, 'gal-slot-1-meta')?.props).toMatchObject({ text: '空存档位' });
    expect(find(slots, 'gal-slot-1-state')?.props).toMatchObject({ text: '可保存' });
    const loading = buildGalSliceTree(auditModel, { ...auditState('slots'), slotMode: 'load' }, art);
    expect(find(loading, 'gal-slot-1-meta')?.props).toMatchObject({ text: '空存档位' });
    expect(find(loading, 'gal-slot-1-state')?.props).toMatchObject({ text: '不可读取' });
    expect(validateLayoutNode(slots)).toEqual([]);
    const gallery = buildGalSliceTree(auditModel, auditState('gallery'), art);
    expect(find(gallery, 'gal-gallery-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(gallery, 'gal-gallery-topbar')?.layout).toMatchObject({ x: 31, y: 14, width: 1378, height: 42 });
    expect(find(gallery, 'gal-gallery-topbar-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(gallery, 'gal-gallery-heading-note')).toBeUndefined();
    expect(find(gallery, 'gal-gallery-hint')).toBeUndefined();
    expect(find(gallery, 'gal-gallery-heading')?.children?.some(child => child.id === 'gal-gallery-progress')).toBe(false);
    expect(find(gallery, 'gal-gallery-tabs')?.children?.some(child => child.id === 'gal-gallery-progress')).toBe(true);
    expect(find(gallery, 'gal-gallery-tab-actions')?.children?.map(child => child.id))
      .toEqual(['gal-gallery-memories-tab', 'gal-gallery-cg-tab']);
    expect(find(gallery, 'gal-gallery-home')?.props).toMatchObject({ action: 'gal.gallery.nav', actionArg: 'home', skin: '' });
    expect(find(gallery, 'gal-gallery-story')?.props).toMatchObject({ actionArg: 'story', disabled: true });
    expect(find(gallery, 'gal-gallery-slots')?.props).toMatchObject({ actionArg: 'slots' });
    expect(find(gallery, 'gal-gallery-settings-top')?.props).toMatchObject({ actionArg: 'settings' });
    expect(find(gallery, 'gal-gallery-settings')).toBeUndefined();
    expect(find(gallery, 'gal-gallery-shell')?.layout).toMatchObject({ x: 18, y: 61, width: 1404, height: 824 });
    expect(find(slots, 'gal-slots-shell')?.layout).toMatchObject({ x: 18, y: 61, width: 1404, height: 824 });
    expect(validateLayoutNode(gallery)).toEqual([]);
    const fallbackGallery = buildGalSliceTree(auditModel, auditState('gallery'));
    expect(find(fallbackGallery, 'gal-gallery-topbar')).toBeUndefined();
    expect(find(fallbackGallery, 'gal-gallery-heading-note')).toBeUndefined();
    expect(find(fallbackGallery, 'gal-gallery-heading')?.children?.some(child => child.id === 'gal-gallery-progress')).toBe(true);
    expect(find(fallbackGallery, 'gal-gallery-tab-actions')).toBeUndefined();
    expect(find(fallbackGallery, 'gal-gallery-settings')?.props).toMatchObject({ action: 'gal.settings.open' });
    const confirm = buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }, art);
    expect(find(confirm, 'gal-confirm-message')?.props).toMatchObject({ color: { custom: '#d0d3e4' } });
    expect(find(confirm, 'gal-confirm')?.props).toMatchObject({
      title: '开始新游戏', titleColor: { custom: '#f5dfad' }, closable: false,
      closeAction: 'gal.confirm.cancel',
    });
    expect(find(confirm, 'gal-confirm-actions')?.layout).toMatchObject({ justify: 'center' });
    expect(find(confirm, 'gal-confirm-content')?.layout).toMatchObject({
      height: 130, direction: 'column', align: 'center', justify: 'center', gap: 20,
    });
    expect(find(confirm, 'gal-confirm-yes')?.props).toMatchObject({
      label: '重新开始', action: 'gal.confirm.accept',
      skinFeedback: { hoverBrightness: 1.32, pressedBrightness: 1.32,
        glowRadius: 8, glowColor: { custom: '#a7b2ff99' }, transitionMs: 160 },
    });
    expect(find(confirm, 'gal-confirm-yes')?.layout).toMatchObject({ width: 124, height: 44 });
    expect(renderNode(find(confirm, 'gal-confirm')!)).not.toContain('aria-label="close"');
    expect(renderNode(find(confirm, 'gal-confirm')!)).toContain('aria-labelledby="gal-confirm-title"');
    expect(validateLayoutNode(confirm)).toEqual([]);
    const history = buildGalSliceTree(auditModel, { ...auditState('story'), historyOpen: true }, art);
    expect(find(history, 'gal-history-modal')?.props).toMatchObject({ titleColor: { custom: '#f5dfad' } });
    expect(validateLayoutNode(history)).toEqual([]);
    expect(find(buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }), 'gal-confirm')?.props)
      .not.toHaveProperty('titleColor');
    expect(find(buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }), 'gal-confirm')?.props)
      .not.toHaveProperty('visual');
    expect(find(buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }), 'gal-confirm-content'))
      .toBeUndefined();
    expect(find(buildGalSliceTree(auditModel, auditState('story')), 'gal-story-text')?.props)
      .toMatchObject({ color: 'text' });
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slot-2-number')?.props)
      .toMatchObject({ color: 'text' });
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slot-1-preview-text')?.props)
      .toMatchObject({ text: '空存档位' });
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slot-1-meta')?.props)
      .toMatchObject({ text: '等待故事写入' });
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slot-2-preview')?.props)
      .toMatchObject({ bg: 'sunken' });
  });


  it('maps demo content only from declared asset keys, never exposing locked CG URLs', async () => {
    const model = { ...auditModel,
      story: { ...auditModel.story, backgroundAssetKey: 'demo/background', portraitAssetKey: 'demo/portrait' },
      gallery: { ...auditModel.gallery, cg: auditModel.gallery.cg.map((card, i) =>
        ({ ...card, assetKey: `demo/cg-${i}` })) } };
    const content = await loadGalContentUrls({ 'demo/background': '/bg.png', 'demo/portrait': '/portrait.png',
      'demo/cg-0': '/unlocked.png', 'demo/cg-2': '/locked-secret.png', 'demo/missing': '/missing.png' },
    async url => url !== '/missing.png');
    const story = buildGalSliceTree(model, auditState('story'), {}, content);
    expect(find(story, 'gal-story-background')?.props).toMatchObject({ src: '/bg.png' });
    expect(find(story, 'gal-story-portrait')?.props).toMatchObject({ src: '/portrait.png' });
    expect(find(story, 'gal-story-portrait-placeholder')?.props).toMatchObject({ bare: true });
    expect(find(story, 'gal-story-portrait-placeholder')?.layout).toMatchObject({
      x: 675, y: 38, width: 563, height: 845, padding: 0,
    });
    expect(find(story, 'gal-story-portrait')?.layout).toMatchObject({ width: 563, height: 845 });
    const cg = buildGalSliceTree(model, { ...auditState('gallery'), galleryTab: 'cg', expandedCgId: 'cg-1' }, {}, content);
    expect(find(cg, 'gal-gallery-image-cg-1')?.props).toMatchObject({ src: '/unlocked.png' });
    expect(find(cg, 'gal-cg-expanded-image')?.props).toMatchObject({ src: '/unlocked.png' });
    expect(JSON.stringify(cg)).not.toContain('/locked-secret.png');
    const noContent = buildGalSliceTree(model, auditState('story'));
    expect(find(noContent, 'gal-story-background')).toBeUndefined();
    expect(find(noContent, 'gal-portrait-note')).toBeDefined();
    expect(find(noContent, 'gal-story-portrait-placeholder')?.props).not.toHaveProperty('bare');
    expect(find(noContent, 'gal-story-portrait-placeholder')?.layout).toMatchObject({
      x: 675, y: 38, width: 561, height: 843, padding: 0,
    });
  });

  it('composes current story CG over the background/cast, switches shots and restores the scene on hide', () => {
    const content = { 'demo/background': '/bg.png', 'demo/portrait': '/portrait.png',
      'demo/shot-1': '/shot-1.png', 'demo/shot-2': '/shot-2.png' };
    const base = { ...auditModel, story: { ...auditModel.story,
      backgroundAssetKey: 'demo/background', portraitAssetKey: 'demo/portrait' } };
    for (const key of ['demo/shot-1', 'demo/shot-2']) {
      const tree = buildGalSliceTree({ ...base, story: { ...base.story, cgAssetKey: key } },
        auditState('story'), {}, content);
      expect(find(tree, 'gal-story-cg')?.props).toMatchObject({ src: content[key as keyof typeof content], fit: 'cover' });
      expect(find(tree, 'gal-story-background')).toBeUndefined();
      expect(find(tree, 'gal-story-portrait-placeholder')).toBeUndefined();
      expect(find(tree, 'gal-story-dialogue')).toBeDefined();
      expect(find(tree, 'gal-story-topbar')).toBeDefined();
      expect(validateLayoutNode(tree)).toEqual([]);
    }
    const missing = buildGalSliceTree({ ...base, story: { ...base.story, cgAssetKey: 'demo/missing' } },
      auditState('story'), {}, content);
    expect(find(missing, 'gal-story-cg')).toBeUndefined();
    expect(find(missing, 'gal-story-cg-unavailable')).toBeDefined();
    expect(find(missing, 'gal-story-background')).toBeUndefined();
    expect(find(missing, 'gal-story-portrait-placeholder')).toBeUndefined();
    const hidden = buildGalSliceTree(base, auditState('story'), {}, content);
    expect(find(hidden, 'gal-story-cg')).toBeUndefined();
    expect(find(hidden, 'gal-story-background')?.props).toMatchObject({ src: '/bg.png' });
    expect(find(hidden, 'gal-story-portrait')?.props).toMatchObject({ src: '/portrait.png' });
  });
});
