import { mergeConfig } from 'vite';
import base from '../../../../vite.config';
export default mergeConfig(base, { plugins: [{
  name: 's5-independent-revoke-line-height', enforce: 'pre',
  transform(code: string, id: string) {
    if (!id.replaceAll('\\', '/').endsWith('/src/ui/components/render.ts')) return;
    const anchor = 'p.lineHeight >= 8 && p.lineHeight <= 120';
    const hits = code.split(anchor).length - 1;
    if (hits !== 1) throw new Error(`S5_REVOKE_ANCHOR expected1 got${hits}`);
    console.error('S5_REVOKE_ANCHOR hits=1; line-height output revoked in memory');
    return code.replace(anchor, 'false');
  },
}] });
