import type { ButtonProps, LayoutNode } from '@ui/components/types.js';
import { resolveBindings } from '@ui/components/bindings.js';
import { buildStarterHome } from '@ui/starters/index.js';
import { galUiDataSource, type GalUiReadModel, type GalUiSlot } from './gal-ui-read-model.js';
import { galSettingsTree, type GalSettingsTab } from './gal-ui-settings.js';
import { applyGalUiArt, type GalUiArt } from './gal-ui-art.js';

export type GalSlicePage = 'home' | 'story' | 'slots' | 'gallery' | 'settings';
export type GalSlotMode = 'save' | 'load';
export type GalGalleryTab = 'memories' | 'cg';
export type GalConfirmKind = 'new-game' | 'save-empty' | 'overwrite' | 'load' | 'return-title';
export interface GalSliceUiState {
  readonly page: GalSlicePage;
  readonly slotMode: GalSlotMode;
  readonly selectedSlot: number | null;
  readonly confirm: GalConfirmKind | null;
  readonly feedback: string | null;
  readonly historyOpen: boolean;
  readonly galleryTab: GalGalleryTab;
  readonly galleryPage: number;
  readonly expandedCgId: string | null;
  readonly settingsTab: GalSettingsTab;
  /** Re-key the settings root after a rejected native Toggle change, restoring authoritative checked. */
  readonly settingsRenderRevision: number;
  readonly playbackMode: 'off' | 'auto' | 'skip';
  readonly playbackAvailable: boolean;
  readonly audioAvailable?: boolean;
  readonly audioPreviewAvailable?: boolean;
  readonly voiceReplayAvailable?: boolean;
  readonly replayMemoryId?: string | null;
}

const label = (id: string, text: string, size: number, color: 'text' | 'sub' | 'gold' = 'text'): LayoutNode =>
  ({ type: 'Label', id, props: { text, size, color } });
const button = (id: string, text: string, action: string, disabled = false, arg?: string,
  kind: ButtonProps['kind'] = 'ghost'): LayoutNode => ({
  type: 'Button', id, props: { label: text, action, disabled, kind, ...(arg ? { actionArg: arg } : {}) },
});

function home(model: GalUiReadModel): LayoutNode[] {
  const starter = buildStarterHome({ title: model.title, subtitle: 'GAL STORY', actions: [
    { label: '开始游戏', action: 'gal.home.start', kind: 'hero' },
    { label: '继续游戏', action: 'gal.home.continue', kind: 'primary' },
    { label: '读取存档', action: 'gal.home.load' },
  ] });
  const actions = starter.children?.find(node => node.id === 'starter-actions');
  const menu: LayoutNode = {
    type: 'Panel', id: 'gal-home-menu', props: { bare: true },
    layout: { x: 108, y: 145, width: 360, direction: 'column', gap: 18 },
    children: [
      label('gal-home-eyebrow', 'GAL STORY', 17, 'gold'),
      label('gal-home-title', model.title, 70),
      label('gal-home-subtitle', '点击开始，进入剧情。', 20),
      { type: 'Panel', id: 'gal-home-actions', props: { bare: true },
        layout: { direction: 'column', align: 'stretch', gap: 12, width: 300 },
        children: [
          ...(actions?.children ?? []).map(node => ({ ...node, props: {
            ...node.props,
            ...(node.id === 'starter-act-1' ? { disabled: !model.home.canContinue } : {}),
            ...(node.id === 'starter-act-2' ? { disabled: !model.home.canLoad } : {}),
          } })),
          button('gal-home-gallery', '回想 / CG', 'gal.home.gallery',
            model.gallery.cg.length === 0 && model.gallery.memories.length === 0),
          button('gal-home-settings', '系统设置', 'gal.settings.open'),
          button('gal-home-exit', '退出演示（宿主）', 'gal.unavailable', true),
        ] },
      label('gal-home-placeholder', '背景占位 · 正式场景资产尚未入库', 13, 'sub'),
    ],
  };
  return [
    { type: 'Panel', id: 'gal-home-stage-placeholder', props: { bg: 'ink-deep', pattern: 'stripe' },
      layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true }, children: [] },
    menu,
  ];
}

function story(model: GalUiReadModel, state: GalSliceUiState,
  contentUrls: Readonly<Record<string, string>>): LayoutNode[] {
  const portraitSrc = model.story.portraitAssetKey ? contentUrls[model.story.portraitAssetKey] : undefined;
  const optionLayer: LayoutNode = {
    type: 'Panel', id: 'gal-story-options', props: { bare: true },
    layout: { x: 365, y: 296, width: 710, direction: 'column', gap: 15, align: 'stretch' },
    repeat: { source: 'gal.options', key: 'id', template: {
      type: 'Button', id: 'gal-choice', props: {
        label: '{{item.label}}', action: 'narrative.choose', actionArg: '{{item.id}}',
        disabled: '{{item.disabled}}', kind: 'hero',
      } as unknown as ButtonProps,
      layout: { height: 66 },
    } },
  };
  return [
    { type: 'Panel', id: 'gal-story-stage-placeholder', props: { bg: 'sunken', pattern: 'stripe' },
      layout: { x: 0, y: 0, width: 1438, height: 898, padding: 0, allowOverlap: true },
      children: model.story.backgroundAssetKey && contentUrls[model.story.backgroundAssetKey] ? [
        { type: 'Image', id: 'gal-story-background', props: {
          src: contentUrls[model.story.backgroundAssetKey], alt: '', fit: 'cover' },
          layout: { width: 1438, height: 898 } },
      ] : [] },
    { type: 'Panel', id: 'gal-story-portrait-placeholder',
      props: portraitSrc ? { bare: true } : { bg: 'raised', edge: 'gold' },
      layout: { x: 675, y: 38, width: portraitSrc ? 563 : 561, height: portraitSrc ? 845 : 843, padding: 0,
        align: 'center', justify: 'center', allowOverlap: true },
      children: portraitSrc ? [
        { type: 'Image', id: 'gal-story-portrait', props: {
          src: portraitSrc, alt: '', fit: 'contain' },
          layout: { width: 563, height: 845 } },
      ] : [label('gal-portrait-note', '立绘占位\n正式角色素材尚未入库', 18, 'text')] },
    { type: 'Panel', id: 'gal-story-topbar', props: { bare: true },
      layout: { x: 32, y: 22, width: 1376, direction: 'row', justify: 'between', align: 'center' },
      children: [
        label('gal-story-chapter', state.replayMemoryId ?
          `回想 · ${model.gallery.memories.find(card => card.id === state.replayMemoryId)?.title ?? model.story.chapterTitle}` :
          model.story.chapterTitle, 17, 'text'),
        { type: 'Panel', id: 'gal-story-tools', props: { bare: true },
          layout: { direction: 'row', gap: 8 }, children: [
            button('gal-story-history', '回想记录', 'gal.history.open'),
            button('gal-story-voice-replay', '↻ 语音', 'gal.story.voice-replay', !state.voiceReplayAvailable),
            ...(state.replayMemoryId ? [button('gal-replay-exit', '退出回想', 'gal.replay.exit')] : [
            button('gal-story-auto', state.playbackMode === 'auto' ? '停止自动' : '自动',
              state.playbackMode === 'auto' ? 'gal.playback.off' : 'gal.playback.auto', !state.playbackAvailable),
            button('gal-story-skip', state.playbackMode === 'skip' ? '停止跳过' : '跳过',
              state.playbackMode === 'skip' ? 'gal.playback.off' : 'gal.playback.skip', !state.playbackAvailable),
            button('gal-story-save', '保存', 'gal.story.save'), button('gal-story-load', '读取', 'gal.story.load'),
            button('gal-story-settings', '设置', 'gal.settings.open'),
            button('gal-story-home', '标题', 'gal.story.home'),
            ]),
          ] },
      ] },
    ...(model.story.choices.length ? [
      { type: 'Panel', id: 'gal-story-choice-note', props: { bare: true },
        layout: { x: 365, y: 265, width: 710, direction: 'row', justify: 'center' },
        children: [label('gal-story-choice-hint', '你的回答会改变接下来的台词；回滚后可以重新选择。', 12, 'text')] } as LayoutNode,
      optionLayer,
    ] : []),
    { type: 'Panel', id: 'gal-story-dialogue', props: { bg: 'panel', edge: 'gold', shadow: { y: 4, color: 'gold' },
      ...(model.story.kind === 'choice' ? {} : { action: 'narrative.advance' }) },
      layout: { x: 20, y: 555, width: 1398, height: 343, padding: 0, allowOverlap: true },
      children: [
        { ...label('gal-story-speaker', model.story.speaker ?? '旁白', 23, 'gold'),
          layout: { x: 101, y: 69 } },
        { ...label('gal-story-text', model.story.text ?? '', 27),
          layout: { x: 105, y: 142, width: 1156 } },
        { ...label('gal-story-read', state.replayMemoryId ? '隔离重播 · 不计入已读或解锁' :
          model.story.read ? '已读' : '未读', 12, 'sub'),
          layout: { x: 39, y: 293 } },
        { ...label('gal-story-hint', '滚轮↑ 回滚（跨分支可重新选择）　·　滚轮↓ / 点击台词框 推进', 12, 'sub'),
          layout: { x: 39, y: 311 } },
        ...(model.story.kind === 'choice' ? [] : [{ ...button('gal-story-advance',
          state.replayMemoryId && model.story.kind === 'ending' ? '结束回想' : '◆', 'narrative.advance'),
          layout: { x: 1291, y: 284 } }]),
      ] },
  ];
}

function gallery(model: GalUiReadModel, state: GalSliceUiState,
  contentUrls: Readonly<Record<string, string>>): LayoutNode[] {
  const isCg = state.galleryTab === 'cg';
  const collection = isCg ? model.gallery.cg : model.gallery.memories;
  const pageCount = Math.max(1, Math.ceil(collection.length / 6));
  const start = (state.galleryPage - 1) * 6;
  const visible = collection.slice(start, start + 6);
  const unlocked = collection.filter(card => card.unlocked).length;
  return [
    { type: 'Panel', id: 'gal-gallery-stage-placeholder', props: { bg: 'ink-deep', pattern: 'stripe' },
      layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true }, children: [] },
    { type: 'Panel', id: 'gal-gallery-shell', props: { bg: 'panel', edge: 'gold', glass: true },
      layout: { x: 18, y: 61, width: 1272, height: 692, direction: 'column', padding: 65,
        allowOverlap: state.expandedCgId !== null }, children: [
        { type: 'Panel', id: 'gal-gallery-heading', props: { bare: true },
          layout: { x: 65, y: 47, width: 1272, height: 61, direction: 'row', justify: 'between', align: 'center',
            allowOverlap: state.expandedCgId !== null }, children: [
            label('gal-gallery-title', '回想与画廊', 36, 'gold'),
            label('gal-gallery-progress', `已解锁 ${unlocked} / ${collection.length}`, 14, 'sub'),
          ] },
        { type: 'Panel', id: 'gal-gallery-tabs', props: { bare: true },
          layout: { x: 65, y: 120, width: 1272, height: 44, direction: 'row', gap: 10, align: 'center',
            allowOverlap: state.expandedCgId !== null }, children: [
            button('gal-gallery-memories-tab', '剧情回想', 'gal.gallery.tab', false, 'memories',
              state.galleryTab === 'memories' ? 'primary' : 'ghost'),
            button('gal-gallery-cg-tab', 'CG 画廊', 'gal.gallery.tab', false, 'cg',
              state.galleryTab === 'cg' ? 'primary' : 'ghost'),
          ] },
        { type: 'Panel', id: 'gal-gallery-grid', props: { bare: true },
          layout: { x: 65, y: isCg ? 180 : 182, width: 1272,
            direction: 'grid', cols: isCg ? 3 : 2, gap: isCg ? 17 : 15, align: 'stretch',
            allowOverlap: state.expandedCgId !== null },
          children: visible.length ? visible.map((card, index) => {
            const number = start + index + 1;
            return { type: 'Panel', id: `gal-gallery-card-${card.id}`,
              props: { bg: card.unlocked ? 'raised' : 'sunken', edge: card.unlocked ? 'gold' : 'jade',
                dashed: !card.unlocked,
                ...(isCg && card.unlocked ? { action: 'gal.gallery.open-cg', actionArg: card.id } : {}) },
              layout: { height: isCg ? 222 : 148, direction: 'column', gap: 5, padding: 8,
                tilt3d: isCg && card.unlocked, press3d: isCg && card.unlocked }, children: [
                { type: 'Panel', id: `gal-gallery-art-${card.id}`,
                  props: { bg: card.unlocked ? 'panel' : 'sunken', pattern: card.unlocked ? 'stripe' : undefined },
                  layout: { height: isCg ? 172 : 50, align: 'center', justify: 'center' },
                  children: isCg && card.unlocked && card.assetKey && contentUrls[card.assetKey] ? [
                    { type: 'Image', id: `gal-gallery-image-${card.id}`, props: {
                      src: contentUrls[card.assetKey], alt: card.title, fit: 'cover' },
                      layout: { width: 350, height: 172 } },
                  ] : [label(`gal-gallery-art-note-${card.id}`, card.unlocked ?
                    (isCg ? 'CG 图像占位 · 正式素材尚未入库' : '回想条目 · 场景素材待入库') : '✧ 未解锁', 13, 'text')] },
                { type: 'Panel', id: `gal-gallery-caption-${card.id}`, props: { bare: true },
                  layout: { direction: 'row', justify: 'between' }, children: [
                    label(`gal-gallery-name-${card.id}`, card.title, 15),
                    label(`gal-gallery-count-${card.id}`, `${isCg ? 'CG' : 'MEMORY'} ${String(number).padStart(2, '0')} / ${String(collection.length).padStart(2, '0')}`, 12, 'text'),
                  ] },
                ...(!isCg && card.unlocked ? [button(`gal-memory-play-${card.id}`, '重播回想',
                  'gal.gallery.play-memory', false, card.id, 'primary')] : []),
              ] } satisfies LayoutNode;
          }) : [label('gal-gallery-empty', isCg ? '暂无可浏览的 CG' : '暂无可浏览的回想', 18, 'sub')] },
        { type: 'Panel', id: 'gal-gallery-footer', props: { bare: true },
          layout: { x: 65, y: 720, width: 1272, height: 51,
            direction: 'row', justify: 'between', align: 'center',
            allowOverlap: state.expandedCgId !== null }, children: [
            label('gal-gallery-hint', isCg ? '未解锁项不可打开 · 正式 CG 素材待入库' :
              '仅已解锁回想可重播 · 与主线进度隔离', 13, 'sub'),
            { type: 'Panel', id: 'gal-gallery-nav', props: { bare: true },
              layout: { height: 42, direction: 'row', gap: 8, align: 'center' }, children: [
                button('gal-gallery-prev', '◀', 'gal.gallery.page', state.galleryPage <= 1, String(state.galleryPage - 1)),
                label('gal-gallery-page', `第 ${state.galleryPage} / ${pageCount} 页`, 14),
                button('gal-gallery-next', '▶', 'gal.gallery.page', state.galleryPage >= pageCount, String(state.galleryPage + 1)),
                button('gal-gallery-settings', '设置', 'gal.settings.open'),
                button('gal-gallery-back', '返回', 'gal.gallery.back'),
              ] },
          ] },
      ] },
  ];
}

function historyModal(model: GalUiReadModel): LayoutNode {
  return { type: 'Modal', id: 'gal-history-modal', props: { title: '回想记录', size: 'wide', closeAction: 'gal.history.close' },
    layout: { allowOverlap: true },
    children: [
      label('gal-history-count', `当前游标 ${model.history.cursor < 0 ? 0 : model.history.cursor + 1} / ${model.history.windowSize} · 可浏览 ${model.history.rows.length} 条 · 最多保留 512 条`, 14, 'sub'),
      { type: 'Panel', id: 'gal-history-scroll', props: { bg: 'ink-deep', scroll: true },
        layout: { height: 430, direction: 'column', gap: 6, padding: 12 },
        children: model.history.rows.length ? model.history.rows.map(row => ({
          type: 'Panel', id: `gal-history-row-${row.id}`, props: { bg: row.current ? 'raised' : 'ink-deep', bare: false },
          layout: { direction: 'column', gap: 3, padding: 8 }, children: [
            label(`gal-history-speaker-${row.id}`, row.speaker, 15, 'gold'),
            label(`gal-history-text-${row.id}`, row.text, 18),
          ],
        })) : [label('gal-history-empty', '当前会话尚无可浏览的历史记录', 18)] },
      { type: 'Panel', id: 'gal-history-actions', props: { bare: true },
        layout: { direction: 'row', justify: 'end' }, children: [button('gal-history-back', '返回剧情', 'gal.history.close')] },
    ] };
}

function cgModal(model: GalUiReadModel, id: string,
  contentUrls: Readonly<Record<string, string>>): LayoutNode {
  const card = model.gallery.cg.find(item => item.id === id && item.unlocked);
  if (!card) throw new Error('GAL 已解锁 CG 不存在');
  return { type: 'Modal', id: 'gal-cg-modal', props: { title: card.title, size: 'wide',
    closable: false, closeAction: 'gal.gallery.close-cg' },
    children: [
      { type: 'Panel', id: 'gal-cg-expanded-placeholder', props: { bg: 'raised', edge: 'gold', pattern: 'stripe' },
        layout: { height: 482, align: 'center', justify: 'center' },
        children: card.assetKey && contentUrls[card.assetKey] ? [
          { type: 'Image', id: 'gal-cg-expanded-image', props: {
            src: contentUrls[card.assetKey], alt: card.title, fit: 'contain' },
            layout: { width: 790, height: 482 } },
        ] : [label('gal-cg-expanded-note', 'CG 大图占位 · 正式素材尚未入库', 20)] },
      { type: 'Panel', id: 'gal-cg-expanded-actions', props: { bare: true },
        layout: { direction: 'row', justify: 'end' }, children: [button('gal-cg-expanded-back', '返回画廊', 'gal.gallery.close-cg', false, undefined, 'primary')] },
    ] };
}

function slotCard(slot: GalUiSlot, mode: GalSlotMode, selected: number | null): LayoutNode {
  const active = selected === slot.number;
  return { type: 'Panel', id: `gal-slot-${slot.number}`, props: { bg: active ? 'raised' : 'panel', edge: active ? 'gold' : 'jade',
    action: 'gal.slot.select', actionArg: String(slot.number) },
  layout: { height: 142, flex: 1, direction: 'column', gap: 6, padding: 10 }, children: [
    label(`gal-slot-${slot.number}-number`, `NO. ${String(slot.number).padStart(2, '0')}`, 13, 'text'),
    { type: 'Panel', id: `gal-slot-${slot.number}-preview`, props: { bg: 'sunken', dashed: !slot.filled },
      layout: { height: 80, padding: 0, align: 'center', justify: 'center' }, children: [
        slot.preview === 'ready' && slot.previewSrc
          ? { type: 'Image', id: `gal-slot-${slot.number}-preview-image`,
            props: { src: slot.previewSrc, alt: `存档 ${slot.number} 预览`, fit: 'cover' },
            layout: { width: 276, height: 72 } }
          : label(`gal-slot-${slot.number}-preview-text`, slot.preview === 'empty' ? '空存档位' :
            slot.preview === 'damaged' ? '预览损坏 · 可读取' :
            slot.preview === 'unavailable' ? '预览不可用 · 可读取' :
            slot.preview === 'invalid-save' ? '存档损坏 · 不可读取' : '暂无预览', 14, 'sub'),
      ] },
    label(`gal-slot-${slot.number}-meta`, slot.filled ? (slot.label ?? `进度 ${slot.tick}`) : '等待故事写入', 12, 'text'),
    label(`gal-slot-${slot.number}-state`, slot.filled ? (mode === 'load' ? (slot.canLoad ? '可读取' : '不可读取') : '可覆盖') :
      (mode === 'load' ? '不可读取' : '可保存'), 11,
      slot.filled ? 'text' : mode === 'load' ? 'text' : 'sub'),
  ] };
}

function slots(model: GalUiReadModel, state: GalSliceUiState): LayoutNode[] {
  const selected = model.manual.slots.find(slot => slot.number === state.selectedSlot);
  return [
    { type: 'Panel', id: 'gal-slots-stage-placeholder', props: { bg: 'ink-deep', pattern: 'stripe' },
      layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true }, children: [] },
    { type: 'Panel', id: 'gal-slots-shell', props: { bg: 'panel', edge: 'gold', glass: true },
      layout: { x: 18, y: 60, width: 1272, height: 698, direction: 'column', gap: 14, padding: 65,
        allowOverlap: state.confirm !== null }, children: [
        { type: 'Panel', id: 'gal-slots-header', props: { bare: true }, layout: { direction: 'row', justify: 'between' },
          children: [label('gal-slots-title', state.slotMode === 'save' ? '保存游戏' : '读取游戏', 36, 'gold'),
            { type: 'Panel', id: 'gal-slots-header-actions', props: { bare: true },
              layout: { direction: 'row', gap: 8 }, children: [
                button('gal-slots-settings', '设置', 'gal.settings.open'),
                button('gal-slots-back', '返回剧情', 'gal.slot.back'),
              ] }] },
        { type: 'Panel', id: 'gal-slots-toolbar', props: { bare: true }, layout: { height: 32, direction: 'row', justify: 'between' },
          children: [
            { type: 'Panel', id: 'gal-slots-modes', props: { bare: true }, layout: { direction: 'row', gap: 8 }, children: [
              button('gal-mode-save', '保存', 'gal.slot.mode', false, 'save'),
              button('gal-mode-load', '读取', 'gal.slot.mode', false, 'load'),
            ] },
            { type: 'Panel', id: 'gal-slots-pagination', props: { bare: true }, layout: { direction: 'row', gap: 8 }, children: [
              button('gal-page-prev', '◀', 'gal.slot.page', model.manual.page === 1, String(model.manual.page - 1)),
              label('gal-page-counter', `第 ${model.manual.page} / ${model.manual.pageCount} 页`, 14),
              button('gal-page-next', '▶', 'gal.slot.page', model.manual.page === model.manual.pageCount, String(model.manual.page + 1)),
            ] },
          ] },
        { type: 'Panel', id: 'gal-slots-grid', props: { bare: true },
          layout: { direction: 'column', gap: 8, align: 'stretch' },
          children: Array.from({ length: 3 }, (_, row) => ({
            type: 'Panel', id: `gal-slots-row-${row + 1}`, props: { bare: true },
            layout: { direction: 'row', gap: 12, align: 'stretch' },
            children: model.manual.slots.slice(row * 4, row * 4 + 4)
              .map(slot => slotCard(slot, state.slotMode, state.selectedSlot)),
          })) },
        { type: 'Panel', id: 'gal-slots-footer', props: { bare: true },
          layout: { x: 65, y: 721, width: 1272, height: 51, direction: 'row', justify: 'between', align: 'center' },
          children: [
            label('gal-slots-hint', '每页 4 × 3 = 12 个槽位 · 预览仅供识别，不影响存读档', 13, 'sub'),
            button('gal-slots-commit', state.slotMode === 'save' ? '保存至此槽' : '读取此存档',
              'gal.slot.commit', selected === undefined || (state.slotMode === 'load' && !selected.canLoad)),
          ] },
      ] },
  ];
}

function confirm(kind: GalConfirmKind): LayoutNode {
  const messages: Record<GalConfirmKind, string> = {
    'new-game': '当前剧情将从开头重新开始。全局已读与解锁会保留。',
    'save-empty': '确认写入这个空存档位？',
    overwrite: '确认覆盖已有存档？',
    load: '确认读取存档？当前未保存的剧情进度将被替换。',
    'return-title': '确认返回标题画面？当前剧情进度不会被自动保存。',
  };
  return { type: 'Modal', id: 'gal-confirm', props: { title: '请确认', size: 'xl', closeAction: 'gal.confirm.cancel' },
    layout: { allowOverlap: true },
    children: [
      label('gal-confirm-message', messages[kind], 22),
      { type: 'Panel', id: 'gal-confirm-actions', props: { bare: true }, layout: { direction: 'row', gap: 12, justify: 'end' },
        children: [button('gal-confirm-no', '取消', 'gal.confirm.cancel'), button('gal-confirm-yes', '确认', 'gal.confirm.accept')] },
    ] };
}

/** 1440×900 S4 geometry. Optional resolved UI chrome does not alter actions or layout. */
export function buildGalSliceTree(model: GalUiReadModel, state: GalSliceUiState, art: GalUiArt = {},
  contentUrls: Readonly<Record<string, string>> = {}): LayoutNode {
  const content = state.page === 'home' ? home(model) : state.page === 'story' ? [
    { type: 'Panel', id: 'gal-story-wheel-region', props: { bare: true,
      wheel: { upAction: 'narrative.back', downAction: 'narrative.advance' } },
    layout: { width: 1440, height: 900 }, children: story(model, state, contentUrls) } satisfies LayoutNode,
  ] : state.page === 'slots' ? slots(model, state) : state.page === 'settings' ?
    galSettingsTree(model, state.settingsTab, state.playbackAvailable, state.audioAvailable,
      state.audioPreviewAvailable) : gallery(model, state, contentUrls);
  const root: LayoutNode = { type: 'Screen',
    id: state.page === 'settings' ? `gal-slice-screen-settings-${state.settingsRenderRevision}` : 'gal-slice-screen',
    props: { fill: true, bg: state.page === 'story' ? 'sunken' : 'ink-deep' },
    children: [...content, ...(state.feedback ? [label('gal-slice-feedback', state.feedback, 15, 'gold')] : []),
      ...(state.confirm ? [confirm(state.confirm)] : []),
      ...(state.historyOpen ? [historyModal(model)] : []),
      ...(state.expandedCgId ? [cgModal(model, state.expandedCgId, contentUrls)] : [])] };
  return applyGalUiArt(resolveBindings(root, galUiDataSource(model)), art);
}
