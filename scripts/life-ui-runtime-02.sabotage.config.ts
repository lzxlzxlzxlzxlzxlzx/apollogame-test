import { mergeConfig, type Plugin } from 'vite';
import base from '../vite.config.js';

const mode = process.env.LIFE_UI_RUNTIME_SABOTAGE;
const mutations = {
  'entry-frame': ["kind: 'quiet', skin: '', borderWidth: 0", "kind: 'ghost', skin: '', borderWidth: 2"],
  'status-line': ["text('life-host-status-line', statusLine, statusSize, LIGHT)", "text('life-host-status-line', statusLine.replace(' · ', '\\n'), statusSize, LIGHT)"],
  'hud-row': ["direction: 'row', align: 'start', gap: rightGap", "direction: 'column', align: 'start', gap: rightGap"],
} as const;
if (!mode || !Object.hasOwn(mutations, mode)) throw new Error('Choose entry-frame, status-line, or hud-row');
const mutation = mutations[mode as keyof typeof mutations];
const sabotage: Plugin = {
  name: 'life-runtime-02-exact-anchor', enforce: 'pre',
  transform(source, id) {
    if (!id.replaceAll('\\', '/').split('?')[0]!.endsWith('/src/assembly/life-host/life-hud-overlay.ts')) return;
    const [anchor, replacement] = mutation;
    if (source.split(anchor).length !== 2) throw new Error(`Anchor must hit exactly once: ${anchor}`);
    console.info(`LIFE-UI-RUNTIME-02 ${mode}: anchor hit exactly once; test process only`);
    return source.replace(anchor, replacement);
  },
};
export default mergeConfig(base, { plugins: [sabotage] });
