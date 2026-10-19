import { mount } from '../../../games/game-dice/index.js';

const stage = document.querySelector<HTMLElement>('#app');
if (!stage) throw new Error('#app not found');

const unmount = mount(stage);
window.addEventListener('pagehide', unmount, { once: true });
