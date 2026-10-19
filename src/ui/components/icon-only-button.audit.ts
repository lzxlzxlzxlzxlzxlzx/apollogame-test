import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './types.js';

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=';
export const iconLightTheme: UITheme = { ...SHELL, bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6', text: '#1b2434', sub: '#46546a', jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)' };
export const iconAuditTree: LayoutNode = { type: 'Panel', id: 'icon-stage', props: { bg: 'panel' }, layout: { direction: 'column', padding: 24, gap: 16 }, children: [
  { type: 'Label', id: 'icon-title', props: { text: 'Native icon-only Button', color: 'text' } },
  { type: 'Panel', id: 'icon-row', props: { bare: true }, layout: { direction: 'row', gap: 16 }, children: [
    { type: 'Button', id: 'icon-ready', props: { label: '背包', icon: tinyPng, iconOnly: { size: 48 }, kind: 'primary', action: 'demo.open' } },
    { type: 'Button', id: 'icon-failed', props: { label: '任务', icon: '/missing.png', iconOnly: { size: 48 }, kind: 'primary', action: 'demo.open' } },
    { type: 'Button', id: 'icon-disabled', props: { label: '档案', icon: tinyPng, iconOnly: { size: 32 }, kind: 'primary', disabled: true, action: 'demo.open' } },
  ] },
] };
const probe = window as typeof window & { __iconActions?: number; __iconUnmount?: () => void };
probe.__iconActions = 0;
probe.__iconUnmount = mountUI(document.getElementById('root')!, iconAuditTree, {}, location.hash === '#light' ? iconLightTheme : SHELL, {
  enqueueAction: () => { probe.__iconActions = (probe.__iconActions ?? 0) + 1; },
});
