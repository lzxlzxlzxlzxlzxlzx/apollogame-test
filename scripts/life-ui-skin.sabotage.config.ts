import { mergeConfig, type Plugin } from 'vite';
import base from '../vite.config.js';

// Test-process-only mutations: never rewrite shared working-tree source files.
const mode = process.env.LIFE_UI_SKIN_SABOTAGE;
if (mode !== 'foreign-key' && mode !== 'panel-frame') throw new Error('Set LIFE_UI_SKIN_SABOTAGE to foreign-key or panel-frame');
const sabotage: Plugin = {
  name: 'life-ui-skin-anchored-sabotage', enforce: 'pre',
  transform(code, id) {
    const file = id.replaceAll('\\', '/').split('?')[0];
    const target = mode === 'foreign-key' ? '/src/authoring/life-host-descriptor-core.ts' : '/src/assembly/life-host/life-hud.ts';
    if (!file.endsWith(target)) return;
    const anchor = mode === 'foreign-key' ? 'match[1] !== raw.artSlug' : 'if (!frame) return node;';
    const replacement = mode === 'foreign-key' ? 'false' : 'return node;';
    if (code.split(anchor).length !== 2) throw new Error(`Sabotage anchor must hit exactly once: ${anchor}`);
    console.info(`LIFE-UI-SKIN-SABOTAGE: ${mode} anchor hit exactly once`);
    return code.replace(anchor, replacement);
  },
};
export default mergeConfig(base, { plugins: [sabotage] });
