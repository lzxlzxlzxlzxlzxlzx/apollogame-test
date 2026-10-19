import type { LayoutNode } from '@ui/components/types.js';
import { GAL_CONFIRMATION_KEYS, type GalConfirmationKey } from '../gal-profile/gal-profile.js';
import type { GalUiReadModel } from './gal-ui-read-model.js';

export type GalSettingsTab = 'text' | 'audio' | 'display' | 'confirm';

const label = (id: string, text: string, size = 16, color: 'text' | 'sub' | 'gold' = 'text'): LayoutNode =>
  ({ type: 'Label', id, props: { text, size, color } });
const button = (id: string, caption: string, action?: string, arg?: string, disabled = false): LayoutNode =>
  ({ type: 'Button', id, props: { label: caption, ...(action ? { action } : {}), ...(arg ? { actionArg: arg } : {}), disabled,
    kind: 'ghost' } });
const row = (id: string, name: string, control: LayoutNode): LayoutNode => ({
  type: 'Panel', id, props: { bare: true }, layout: { height: 56, direction: 'row',
    justify: 'between', align: 'center', gap: 16 }, children: [
      { type: 'Divider', id: `${id}-rule`, props: {},
        layout: { x: 0, y: -8, width: 590, height: 1, allowOverlap: true } },
      label(`${id}-name`, name, 15),
      control.type === 'Toggle' ? { ...control, layout: { ...control.layout, width: 400 } } :
        control.type === 'Button' ? { type: 'Panel', id: `${id}-control-shell`, props: { bare: true },
          layout: { width: 400, align: 'start' }, children: [control] } : control],
});
const unavailable = (id: string, checked = false): LayoutNode =>
  ({ type: 'Toggle', id, props: { label: '待接入', checked, disabled: true } });
const slider = (id: string, value: number, min: number, max: number, action?: string, unit = 'ms'): LayoutNode =>
  ({ type: 'Panel', id: `${id}-shell`, props: { bare: true },
    layout: { width: 400, direction: 'row', align: 'center', gap: 12 }, children: [
      { type: 'Slider', id, props: { value, min, max, ...(action ? { action,
        ...(unit === '%' ? { releaseSnap: true } : {}) } : { disabled: true }) },
      layout: { width: 326 } },
      { ...label(`${id}-value`, action ? `${value} ${unit}` : `${value} · 待接入`, 12),
        layout: { width: 62 } },
    ] });
const card = (id: string, title: string, rows: LayoutNode[], compact = false): LayoutNode => ({
  type: 'Panel', id, props: { bg: 'panel', edge: 'gold' }, layout: { height: compact ? 222 : 286,
    direction: 'column', gap: 8, padding: 16 }, children: [label(`${id}-title`, title, 20), ...rows],
});

const CONFIRM_LABELS: Readonly<Record<GalConfirmationKey, string>> = {
  saveEmpty: '保存到空位', overwrite: '覆盖已有存档', load: '读取存档',
  newGame: '开始新游戏', returnTitle: '返回标题', exitGame: '退出游戏',
};

function previewSample(model: GalUiReadModel): string {
  if (!model.home.canContinue || !model.story.text?.trim())
    return '预览 · 当前作品的文字显示效果';
  const characters = Array.from(model.story.text.replace(/\s+/g, ' ').trim());
  const excerpt = characters.slice(0, 40).join('') + (characters.length > 40 ? '…' : '');
  const speaker = model.story.speaker ? `${Array.from(model.story.speaker).slice(0, 12).join('')} ` : '';
  return `预览 · ${speaker}「${excerpt}」`;
}

function cards(model: GalUiReadModel, tab: GalSettingsTab, playbackAvailable: boolean,
  audioAvailable: boolean, audioPreviewAvailable: boolean): LayoutNode[] {
  const p = model.preferences;
  if (tab === 'confirm') {
    const makeRow = (key: GalConfirmationKey): LayoutNode => row(`gal-setting-${key}`, CONFIRM_LABELS[key], {
      type: 'Toggle', id: `gal-confirm-toggle-${key}`, props: { label: '显示确认', checked: p.confirmations[key],
        action: `gal.settings.confirm.${key}` },
    });
    return [card('gal-settings-confirm-save', '存读档确认', GAL_CONFIRMATION_KEYS.slice(0, 3).map(makeRow), true),
      card('gal-settings-confirm-flow', '流程确认', GAL_CONFIRMATION_KEYS.slice(3).map(makeRow), true)];
  }
  if (tab === 'text') return [
    card('gal-settings-text-card', '文字与节奏', [
      row('gal-setting-speed', '文字显示速度', slider('gal-setting-speed-control', p.textSpeedMsPerChar, 0, 500,
        'gal.settings.text-speed')),
      row('gal-setting-auto-delay', '自动播放间隔', slider('gal-setting-auto-control', p.autoDelayMs, 0, 10000,
        playbackAvailable ? 'gal.settings.auto-delay' : undefined)),
      row('gal-setting-read-skip', '已读快进', { type: 'Toggle', id: 'gal-setting-read-skip-control',
        props: { label: '启用', checked: p.readSkipEnabled,
          ...(playbackAvailable ? { action: 'gal.settings.skip-read' } : { disabled: true }) } }),
      row('gal-setting-unread-skip', '跳过未读', { type: 'Toggle', id: 'gal-setting-unread-skip-control',
        props: { label: '允许', checked: p.skipMode === 'all',
          ...(playbackAvailable ? { action: 'gal.settings.skip-unread' } : { disabled: true }) } }),
    ]),
    card('gal-settings-input-card', '交互方式', [
      row('gal-setting-wheel-back', '滚轮向上回滚', { type: 'Toggle', id: 'gal-setting-wheel-back-control',
        props: { label: '启用', checked: p.wheelRollback, action: 'gal.settings.wheel-back' } }),
      row('gal-setting-wheel-next', '滚轮向下推进', { type: 'Toggle', id: 'gal-setting-wheel-next-control',
        props: { label: '启用', checked: p.wheelAdvance, action: 'gal.settings.wheel-next' } }),
      row('gal-setting-auto-continue', '选择后继续自动播放', { type: 'Toggle', id: 'gal-setting-auto-continue-control',
        props: { label: '启用', checked: p.autoContinueAfterChoice,
          ...(playbackAvailable ? { action: 'gal.settings.auto-continue' } : { disabled: true }) } }),
      row('gal-setting-key-help', '快捷说明', button('gal-setting-key-help-control', '查看快捷键', 'gal.settings.key-help')),
    ]),
  ];
  if (tab === 'audio') return [
    card('gal-settings-volume-card', '音量', [
      row('gal-setting-master', '主音量', slider('gal-setting-master-control', Math.round(p.masterVolume * 100), 0, 100,
        audioAvailable ? 'gal.settings.master-volume' : undefined, '%')),
      row('gal-setting-bgm', '背景音乐', slider('gal-setting-bgm-control', Math.round(p.bgmVolume * 100), 0, 100,
        audioAvailable ? 'gal.settings.bgm-volume' : undefined, '%')),
      row('gal-setting-voice', '角色语音', slider('gal-setting-voice-control', Math.round(p.voiceVolume * 100), 0, 100,
        audioAvailable ? 'gal.settings.voice-volume' : undefined, '%')),
      row('gal-setting-sfx', '环境与音效', slider('gal-setting-sfx-control', Math.round(p.sfxVolume * 100), 0, 100,
        audioAvailable ? 'gal.settings.sfx-volume' : undefined, '%')),
    ]),
    card('gal-settings-audio-other-card', '试听与开关', [
      row('gal-setting-voice-auto', '语音自动播放', { type: 'Toggle', id: 'gal-setting-voice-auto-control',
        props: { label: '进入台词自动播放', checked: p.voiceAuto,
          ...(audioAvailable ? { action: 'gal.settings.voice-auto' } : { disabled: true }) } }),
      row('gal-setting-focus-mute', '窗口失焦静音', { type: 'Toggle', id: 'gal-setting-focus-mute-control',
        props: { label: '失焦时静音', checked: p.focusMute,
          ...(audioAvailable ? { action: 'gal.settings.focus-mute' } : { disabled: true }) } }),
      row('gal-setting-audio-preview', '试听', button('gal-setting-audio-preview-control',
        audioPreviewAvailable ? '播放提示音' : '试听待接入',
        audioPreviewAvailable ? 'gal.settings.audio-preview' : 'gal.unavailable', undefined, !audioPreviewAvailable)),
    ]),
  ];
  return [
    card('gal-settings-display-card', '画面', [
      row('gal-setting-opacity', '对话框不透明度', slider('gal-setting-opacity-control',
        Math.round(p.dialogueOpacity * 100), 40, 100, 'gal.settings.dialogue-opacity', '%')),
      row('gal-setting-fullscreen', '显示模式', button('gal-setting-fullscreen-control', '窗口 / 全屏待接入', 'gal.unavailable', undefined, true)),
      row('gal-setting-transitions', '转场演出', { type: 'Toggle', id: 'gal-setting-transitions-control',
        props: { label: '启用', checked: p.storyTransitions, action: 'gal.settings.story-transitions' } }),
    ], true),
    card('gal-settings-accessibility-card', '无障碍', [
      row('gal-setting-reduced-motion', '减少动态效果', { type: 'Toggle', id: 'gal-setting-reduced-motion-control',
        props: { label: '启用', checked: p.reducedMotion, action: 'gal.settings.reduced-motion' } }),
      row('gal-setting-high-contrast', '高对比度文字', unavailable('gal-setting-high-contrast-control')),
      row('gal-setting-ui-scale', '界面缩放', button('gal-setting-ui-scale-control', '100%', undefined, undefined, true)),
    ], true),
  ];
}

/** Partial S4 settings: confirmation and available playback controls are real; other rows remain honest. */
export function galSettingsTree(model: GalUiReadModel, tab: GalSettingsTab, playbackAvailable = false,
  audioAvailable = false, audioPreviewAvailable = false, backgroundSrc?: string): LayoutNode[] {
  const tabNames: readonly [GalSettingsTab, string][] = [
    ['text', '文本 / 操作'], ['audio', '声音'], ['display', '画面'], ['confirm', '确认窗口'],
  ];
  return [
    { type: 'Panel', id: 'gal-settings-stage-placeholder',
      props: backgroundSrc ? { bare: true } : { bg: 'ink-deep', pattern: 'stripe' },
      layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true }, children: backgroundSrc ? [
        { type: 'Image', id: 'gal-settings-background', props: { src: backgroundSrc, alt: '', fit: 'cover' },
          layout: { width: 1440, height: 900 } },
        { type: 'Panel', id: 'gal-settings-background-veil', props: { bg: { custom: 'rgba(5, 8, 22, 0.78)' } },
          layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true } },
      ] : [] },
    { type: 'Panel', id: 'gal-settings-system-bar', props: { bare: true },
      layout: { x: 31, y: 14, width: 1378, height: 42, direction: 'row',
        justify: 'between', align: 'center' }, children: [
        label('gal-settings-system-title', '✧ SYSTEM', 20, 'gold'),
        { type: 'Panel', id: 'gal-settings-nav', props: { bare: true },
          layout: { width: 329, height: 39, direction: 'row', justify: 'between', align: 'center' }, children: [
            button('gal-settings-nav-home', '主页', 'gal.settings.nav', 'home'),
            button('gal-settings-nav-story', '剧情', 'gal.settings.nav', 'story'),
            button('gal-settings-nav-slots', '存档', 'gal.settings.nav', 'slots'),
            button('gal-settings-nav-gallery', '回想 / CG', 'gal.settings.nav', 'gallery'),
          ] },
      ] },
    { type: 'Panel', id: 'gal-settings-shell', props: { bg: 'panel', edge: 'gold', glass: true },
      layout: { x: 18, y: 61, width: 1272, height: 692, padding: 65 }, children: [
        { type: 'Panel', id: 'gal-settings-heading', props: { bare: true },
          layout: { x: 65, y: 47, width: 1272, height: 61, direction: 'row', justify: 'between', align: 'center' }, children: [
            label('gal-settings-title', '系统设置', 36, 'gold'),
            label('gal-settings-heading-note', '阅读习惯 · 声音 · 画面 · 确认窗口', 14, 'sub'),
          ] },
        { type: 'Panel', id: 'gal-settings-tabs', props: { bare: true },
          layout: { x: 65, y: 123, width: 1272, height: 44, direction: 'row', gap: 10,
            align: 'center' }, children: tabNames.map(([key, title]) =>
            ({ type: 'Button', id: `gal-settings-tab-${key}`, props: { label: title, action: 'gal.settings.tab',
              actionArg: key, kind: key === tab ? 'primary' : 'ghost' } })) },
        { type: 'Panel', id: 'gal-settings-grid', props: { bare: true },
          layout: { x: 65, y: 182, width: 1272, direction: 'grid', cols: 2, gap: 18 },
          children: cards(model, tab, playbackAvailable, audioAvailable, audioPreviewAvailable) },
        { type: 'Panel', id: 'gal-settings-disclaimer-wrap', props: { bare: true },
          layout: { x: 65, y: 540, width: 1272 }, children: [
            label('gal-settings-disclaimer', tab === 'confirm' ?
              '确认偏好按当前作品保存；关闭后仅跳过该项弹窗，不改变操作。退出能力待桌面宿主接入。' :
              tab === 'text' && playbackAvailable ?
                '自动间隔、已读/未读快进和输入开关按当前作品保存；文字速度仍待接入。' :
              tab === 'audio' && audioAvailable ?
                '主音量、三类声道、自动语音与失焦静音已生效；没有配音的台词会降级。' :
                tab === 'display' ? '对话框透明度和转场开关按当前作品保存。没有写转场的句子保持硬切；全屏、高对比与缩放仍待接入。' :
                '本页只读展示；相关播放能力尚未接入，控件已禁用。', 14, 'sub'),
          ] },
        { type: 'Panel', id: 'gal-settings-preview', props: { bg: 'raised', edge: 'gold' },
          layout: { x: 65, y: 625, width: 1272, height: 52, padding: 14,
            direction: 'row', align: 'center' }, children: [
            label('gal-settings-preview-line', previewSample(model), 18),
          ] },
        { type: 'Panel', id: 'gal-settings-footer', props: { bare: true },
          layout: { x: 65, y: 720, width: 1272, height: 51,
            direction: 'row', justify: 'between', align: 'center' }, children: [
            label('gal-settings-restore-note', '恢复当前作品的已纳管设置，不影响进度与解锁', 13, 'sub'),
            { type: 'Panel', id: 'gal-settings-footer-actions', props: { bare: true },
              layout: { direction: 'row', gap: 10 }, children: [
                // The Profile transaction exists, but V2 still has disabled settings without
                // consumers.  A partial reset would lie about the visible contract.
                button('gal-settings-reset', '恢复默认（待完整设置接入）', undefined, undefined, true),
                button('gal-settings-back', '返回', 'gal.settings.back'),
              ] },
          ] },
      ] },
  ];
}
