import { mountGal03e } from './gal-ui-story-03e-fixture.js';
const [variant, theme] = location.hash.slice(1).split(':');
mountGal03e(variant ?? 'normal', theme ?? 'dark');
