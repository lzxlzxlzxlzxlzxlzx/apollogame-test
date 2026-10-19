import { mergeConfig, type Plugin } from 'vite';
import base from '../vite.config.js';

const sabotage: Plugin = {
  name: 'life-calendar-save-exact-anchor', enforce: 'pre',
  transform(source, id) {
    if (!id.replaceAll('\\', '/').split('?')[0]!.endsWith('/src/assembly/life-host/life-save.ts')) return;
    const anchor = "...descriptor, hud } as Component)";
    if (source.split(anchor).length !== 2) throw new Error('Calendar save anchor must hit exactly once');
    console.info('LIFE-CALENDAR-SAVE: anchor hit exactly once; test process only');
    return source.replace(anchor, '...descriptor } as Component)');
  },
};
export default mergeConfig(base, { plugins: [sabotage] });
