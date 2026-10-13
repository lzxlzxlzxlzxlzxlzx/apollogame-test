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
    expect(find(story, 'gal-story-dialogue')?.props).toMatchObject({ skin: art.dialogue?.url });
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
    expect(find(story, 'gal-story-dialogue')?.props).toMatchObject({ skin: art.dialogue?.url, skinSlice: 12 });
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
    expect(renderNode(find(story, 'gal-story-dialogue')!)).toContain('border-image');
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
    });
    expect(validateLayoutNode(confirm)).toEqual([]);
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slots-shell')?.props)
      .not.toHaveProperty('skinBorderWidth');
    const custom = resolveGalUiArt(urls, { systemFrame: 16 });
    expect(find(buildGalSliceTree(auditModel, auditState('slots'), custom), 'gal-slots-shell')?.props)
      .not.toHaveProperty('skinBorderWidth');
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
    expect(find(v2, 'gal-settings-text-card')?.props).toMatchObject({ bg: 'ink-deep' });
    expect(find(v2, 'gal-settings-preview')?.props).toMatchObject({ bg: 'ink-deep' });
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
      type: 'ProgressBar', props: { value: 1, max: 1, barHeight: 6, fillColor: '#9da8e4' },
    });
    expect(find(plain, 'gal-setting-speed-control-shell-rail')).toBeUndefined();
    expect(find(old, 'gal-setting-speed-control-shell-rail')).toBeUndefined();
    expect(find(v2, 'gal-setting-unread-skip-control')?.layout).toMatchObject({ width: 400 });
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
    for (const id of ['gal-slots-settings', 'gal-slots-back', 'gal-page-prev', 'gal-page-next']) {
      expect(find(v2, id)?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
      expect(find(plain, id)?.props).not.toHaveProperty('skin');
      expect(find(old, id)?.props).toMatchObject({ skin: urls[GAL_UI_ART_KEYS.button] });
    }
    expect(find(v2, 'gal-slots-footer')?.layout?.x).toBe((find(plain, 'gal-slots-footer')?.layout?.x ?? 0) - 57);
    expect(find(v2, 'gal-slots-footer')?.layout?.y).toBe((find(plain, 'gal-slots-footer')?.layout?.y ?? 0) - 57);
    expect(find(old, 'gal-slots-footer')?.layout).toEqual(find(plain, 'gal-slots-footer')?.layout);
    expect(validateLayoutNode(v2)).toEqual([]);
  });

  it('consumes approved non-nine-slice V2 art scale without changing explicit legacy slices', () => {
    const art = resolveGalUiArt(urls);
    const story = buildGalSliceTree(auditModel, auditState('story'), art);
    expect(find(story, 'gal-story-dialogue')?.props).toMatchObject({
      skinSize: { x: 100, y: 160 }, skinPosition: 'center',
    });
    expect(find(story, 'gal-story-dialogue')?.layout).toMatchObject({ x: 20, y: 555, width: 1400, height: 345 });
    for (const id of ['gal-story-history', 'gal-story-auto', 'gal-story-skip', 'gal-story-save',
      'gal-story-load', 'gal-story-settings', 'gal-story-home']) {
      expect(find(story, id)?.props).toMatchObject({ skin: '', labelColor: { custom: '#e8e8f4' } });
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
    expect(validateLayoutNode(story)).toEqual([]);
    const old = buildGalSliceTree(auditModel, auditState('story'), resolveGalUiArt(urls, { dialogue: 12, button: 7 }));
    expect(find(old, 'gal-story-dialogue')?.props).not.toHaveProperty('skinSize');
    expect(find(buildGalSliceTree(auditModel, auditState('story')), 'gal-story-dialogue')?.layout)
      .toMatchObject({ width: 1398, height: 343 });
    expect(find(old, 'gal-story-save')?.props).toMatchObject({ skinSlice: 7 });
    expect(find(old, 'gal-story-save')?.props).not.toHaveProperty('skinSize');
    expect(find(old, 'gal-story-save')?.props).not.toHaveProperty('labelColor');
    const oldReplay = buildGalSliceTree(auditModel,
      { ...auditState('story'), replayMemoryId: 'memory-1' }, resolveGalUiArt(urls, { button: 7 }));
    expect(find(oldReplay, 'gal-replay-exit')?.props).not.toHaveProperty('labelColor');
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
    expect(find(tree, 'gal-slot-2-preview')?.layout).toMatchObject({ x: 17, y: 18, width: 275, height: 100 });
    expect(find(tree, 'gal-slot-2-number')?.layout).toMatchObject({ x: 28, y: 20 });
    expect(find(tree, 'gal-slot-2-number')?.props).toMatchObject({ size: 11 });
    expect(find(tree, 'gal-slot-2-meta')?.layout).toMatchObject({ x: 17, y: 131, width: 183 });
    expect(find(tree, 'gal-slot-2-state')?.layout).toMatchObject({ x: 211, y: 131, width: 80 });
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
    expect(find(settings, 'gal-settings-text-card-title')?.props).toMatchObject({ color: { custom: '#f4f0e9' } });
    expect(validateLayoutNode(settings)).toEqual([]);
    const slots = buildGalSliceTree(auditModel, auditState('slots'), art);
    expect(find(slots, 'gal-slots-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(slots, 'gal-slot-2-number')?.props).toMatchObject({ color: { custom: '#f4e2bc' } });
    expect(find(slots, 'gal-slot-2-meta')?.props).toMatchObject({ color: { custom: '#cbd0e3' } });
    expect(find(slots, 'gal-slot-2-preview-text')?.props).toMatchObject({ color: { custom: '#cbd0e3' } });
    expect(find(slots, 'gal-slot-2-preview')?.props).toMatchObject({ bg: 'ink-deep' });
    expect(validateLayoutNode(slots)).toEqual([]);
    const gallery = buildGalSliceTree(auditModel, auditState('gallery'), art);
    expect(find(gallery, 'gal-gallery-title')?.props).toMatchObject({ color: { custom: '#f6e2b5' } });
    expect(find(gallery, 'gal-gallery-hint')?.props).toMatchObject({ color: { custom: '#b9bfd3' } });
    expect(validateLayoutNode(gallery)).toEqual([]);
    const confirm = buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }, art);
    expect(find(confirm, 'gal-confirm-message')?.props).toMatchObject({ color: { custom: '#d0d3e4' } });
    expect(find(confirm, 'gal-confirm')?.props).toMatchObject({ titleColor: { custom: '#f5dfad' } });
    expect(validateLayoutNode(confirm)).toEqual([]);
    const history = buildGalSliceTree(auditModel, { ...auditState('story'), historyOpen: true }, art);
    expect(find(history, 'gal-history-modal')?.props).toMatchObject({ titleColor: { custom: '#f5dfad' } });
    expect(validateLayoutNode(history)).toEqual([]);
    expect(find(buildGalSliceTree(auditModel, { ...auditState('home'), confirm: 'new-game' }), 'gal-confirm')?.props)
      .not.toHaveProperty('titleColor');
    expect(find(buildGalSliceTree(auditModel, auditState('story')), 'gal-story-text')?.props)
      .toMatchObject({ color: 'text' });
    expect(find(buildGalSliceTree(auditModel, auditState('slots')), 'gal-slot-2-number')?.props)
      .toMatchObject({ color: 'text' });
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
});
