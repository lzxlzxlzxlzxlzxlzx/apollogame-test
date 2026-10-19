import { mergeConfig } from 'vite';
import base from '../../../../vite.config';

export default mergeConfig(base, {
  plugins: [{
    name: 'independent-host-session-revoke',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.replaceAll('\\', '/').endsWith('/src/studio/cart-run-core.ts')) return;
      const anchor = 'options.hostVisualSession?.bindWorld(engine.world)';
      const hits = code.split(anchor).length - 1;
      if (hits !== 1) throw new Error(`REVOKE_ANCHOR expected 1 got ${hits}`);
      console.error('REVOKE_ANCHOR hits=1; formal World binding removed in memory only');
      return code.replace(anchor, 'undefined');
    },
  }],
});
