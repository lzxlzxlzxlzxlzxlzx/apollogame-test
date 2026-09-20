import { mountR3 } from './r3-mount.js';
import { mountS4 } from './s4-mount.js';
/** Restoration scope is explicit; the accepted S4 six-unit preview remains available. */
export function mount(container:HTMLElement):()=>void {
 return new URLSearchParams(window.location.search).get('scope')==='s4'?mountS4(container):mountR3(container);
}
