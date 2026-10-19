/* AI START */
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { resolveAppFile } = createRequire(import.meta.url)('./gal-root.cjs') as {
  resolveAppFile: (root: string, requestPath: string) => string | null;
};

describe('GAL desktop file root', () => {
  const root = path.resolve('dist-gal');

  it('serves the page and packaged art inside the root', () => {
    expect(resolveAppFile(root, '/')).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile(root, '/games/manor-escape/package.json'))
      .toBe(path.join(root, 'games', 'manor-escape', 'package.json'));
  });

  it('rejects paths that leave the package root', () => {
    expect(resolveAppFile(root, '/../electron/gal-main.cjs')).toBeNull();
    expect(resolveAppFile(root, '/%2e%2e/package.json')).toBeNull();
    expect(resolveAppFile(root, '')).toBeNull();
  });
});
/* AI END */
