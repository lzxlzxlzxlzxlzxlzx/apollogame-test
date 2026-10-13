import type { GalUiReadModel } from './gal-ui-read-model.js';
import type { GalSliceUiState } from './gal-ui-structure.js';
export const auditModel: GalUiReadModel = {
  packageId: 'gal-audit', locale: 'zh-CN', title: '月影书简',
  preferences: { locale: 'zh-CN', textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, masterVolume: 1, focusMute: false, voiceAuto: true, muted: false,
    confirmations: { saveEmpty: true, overwrite: true, load: true, newGame: true, returnTitle: true, exitGame: true } },
  home: { canStart: true, canContinue: true, canLoad: true },
  story: { ref: { chapterId: 'a', nodeId: 'choice' }, refKey: '["a","choice"]', kind: 'choice',
    chapterTitle: '第一章 · 月色来信', speaker: '澪', text: '打开哪一封信？月光还停在窗沿。', read: false,
    choices: [{ id: 'yes', label: '第一封信', disabled: false }, { id: 'no', label: '第二封信', disabled: false }] },
  manual: { page: 1, pageCount: 2, slotsPerPage: 12, columns: 4, rows: 3,
    slots: Array.from({ length: 12 }, (_, index) => ({ number: index + 1, filled: index === 1,
      canLoad: index === 1, label: index === 1 ? '第二格' : null, tick: index === 1 ? 8 : null,
      timestamp: index === 1 ? 1000 : null, preview: index === 1 ? 'no-preview' as const : 'empty' as const })) },
  history: { cursor: 23, windowSize: 24, rows: Array.from({ length: 24 }, (_, index) => ({
    id: `${index}:["a","line"]`, speaker: index % 2 ? '澪' : '旁白',
    text: `第 ${index + 1} 条 · ${index % 2 ? '窗边的书页轻轻翻动。' : '月色静静落下。'}`, current: index === 23,
  })) },
  gallery: { cg: Array.from({ length: 6 }, (_, index) => ({ id: `cg-${index + 1}`,
    title: index < 2 ? ['月夜温室', '未完成的书页'][index]! : '未解锁', unlocked: index < 2,
    preview: index < 2 ? 'no-asset' as const : 'locked' as const })),
    memories: Array.from({ length: 6 }, (_, index) => ({ id: `memory-${index + 1}`,
      title: index < 3 ? ['温室里的初遇', '书页上的分岔', '另一种回答'][index]! : '未解锁',
      unlocked: index < 3, preview: index < 3 ? 'no-asset' as const : 'locked' as const })) },
};
export const auditState = (page: GalSliceUiState['page']): GalSliceUiState => ({
  page, slotMode: 'save', selectedSlot: page === 'slots' ? 2 : null, confirm: null, feedback: null,
  historyOpen: false, galleryTab: 'cg', galleryPage: 1, expandedCgId: null, settingsTab: 'confirm',
  settingsRenderRevision: 0, playbackMode: 'off', playbackAvailable: true,
});
