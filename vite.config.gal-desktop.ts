/* AI START */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { engineAliases } from './scripts/engine-aliases.mjs';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-gal',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'gal-desktop.html'),
    },
  },
  resolve: {
    alias: {
      ...engineAliases(__dirname),
      '@games': resolve(__dirname, 'games'),
    },
  },
});
/* AI END */
