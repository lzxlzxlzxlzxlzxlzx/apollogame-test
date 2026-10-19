import { mergeConfig, type Plugin } from 'vite';
import base from '../vite.config.js';

// Test-process-only transforms, never edits shared working-tree source.
const mode = process.env.LIFE_UI_RUNTIME_SABOTAGE;
if (mode !== 'ribbon-height' && mode !== 'legacy-only' && mode !== 'opaque-paper' && mode !== 'keyboard-native' && mode !== 'ribbon-backing' && mode !== 'entry-icon-only' && mode !== 'partial-art-ready') throw new Error('Choose a known LIFE_UI_RUNTIME_SABOTAGE mode');
const sabotage: Plugin = {
  name: 'life-ui-runtime-anchored-sabotage', enforce: 'pre',
  transform(code, id) {
    const target = mode === 'keyboard-native' ? '/src/engine/host/life-input.ts' : mode === 'partial-art-ready' ? '/src/assembly/life-host/life-game-host.ts' : '/src/assembly/life-host/life-hud-overlay.ts';
    if (!id.replaceAll('\\', '/').split('?')[0]!.endsWith(target)) return;
    const mutations = {
      'ribbon-height': ['height: narrow ? 92 : 104', 'height: narrow ? 20 : 24'],
      'legacy-only': ['if (!skin) return legacy;', 'return legacy;'],
      'opaque-paper': ['id: `life-host-${kind}-paper`, props: { bg: PAPER', 'id: `life-host-${kind}-paper`, props: { bg: NIGHT'],
      'keyboard-native': ['return; // Browser owns Tab/Enter/Space; do not preventDefault or emit a World action.', '// Sabotage: fall through to the old world-key reducer.'],
      'ribbon-backing': ["id: 'life-host-status-ink', props: { bare: true }", "id: 'life-host-status-ink', props: { bg: NIGHT }"],
      'entry-icon-only': ['icon, iconOnly: { size: entrySize }', 'icon'],
      'partial-art-ready': ['if (loaded === false && persistent.session.descriptor.uiSkin) {', 'if (false) {'],
    } as const;
    const [anchor, replacement] = mutations[mode];
    if (code.split(anchor).length !== 2) throw new Error(`Sabotage anchor must hit exactly once: ${anchor}`);
    console.info(`LIFE-UI-RUNTIME-SABOTAGE ${mode}: anchor hit exactly once`);
    return code.replace(anchor, replacement);
  },
};
export default mergeConfig(base, { plugins: [sabotage] });
