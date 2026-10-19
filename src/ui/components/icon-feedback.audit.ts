import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { ButtonIconFeedback, LayoutNode, UITheme } from './types.js';

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=';
export const feedbackLightTheme: UITheme = { ...SHELL, bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6', text: '#1b2434', sub: '#46546a', jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)' };
export const feedback: ButtonIconFeedback = {
  hover: { translateY: -3, brightness: 1.2, glowRadius: 5, glowColor: { custom: '#d6b6ef' } },
  pressed: { translateY: 3, brightness: 0.85 },
  disabled: { opacity: 0.48, grayscale: 0.7 }, transitionMs: 120,
};
export const feedbackAuditTree: LayoutNode = { type: 'Panel', id: 'feedback-stage', props: { bg: 'panel' }, layout: { direction: 'column', gap: 16, padding: 24 }, children: [
  { type: 'Label', id: 'feedback-title', props: { text: 'Icon feedback states', color: 'text' } },
  { type: 'Panel', id: 'feedback-row', props: { bare: true }, layout: { direction: 'row', gap: 20 }, children: [
    { type: 'Button', id: 'feedback-ready', props: { label: '任务日志', icon: tinyPng, iconOnly: { size: 60 }, iconFeedback: feedback, kind: 'quiet', skin: '', borderWidth: 0, action: 'demo.open' } },
    { type: 'Button', id: 'feedback-narrow', props: { label: '背包', icon: tinyPng, iconOnly: { size: 42 }, iconFeedback: feedback, kind: 'quiet', skin: '', borderWidth: 0, action: 'demo.open' } },
    { type: 'Button', id: 'feedback-missing', props: { label: '人物档案', icon: '/missing-feedback.png', iconOnly: { size: 60 }, iconFeedback: feedback, kind: 'quiet', skin: '', borderWidth: 0, action: 'demo.open' } },
    { type: 'Button', id: 'feedback-disabled', props: { label: '已禁用', icon: tinyPng, iconOnly: { size: 42 }, iconFeedback: feedback, kind: 'quiet', skin: '', borderWidth: 0, disabled: true, action: 'demo.open' } },
  ] },
] };
const probe = window as typeof window & { __feedbackActions?: number; __feedbackUnmount?: () => void };
probe.__feedbackActions = 0;
probe.__feedbackUnmount = mountUI(document.getElementById('root')!, feedbackAuditTree, {}, location.hash === '#light' ? feedbackLightTheme : SHELL, {
  enqueueAction: () => { probe.__feedbackActions = (probe.__feedbackActions ?? 0) + 1; },
});
