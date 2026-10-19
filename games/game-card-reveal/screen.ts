import { apolloOnyx, type LayoutNode, type UITheme } from '@zerocraft/engine/ui/components/index.js';
import type { RevealView } from './session.js';

export const CARD_REVEAL_THEME: UITheme = apolloOnyx;
export type DeliveryView = 'idle' | 'pending' | 'retry' | 'accepted';
export interface ArtworkView { readonly status: 'loading' | 'ready' | 'error'; readonly fallbackCount: number }

/** Card reveal is a transparent host overlay. It intentionally renders no game chrome. */
export function buildCardRevealScreen(_view: RevealView, _preview: boolean, _delivery: DeliveryView, _artwork: ArtworkView = { status: 'ready', fallbackCount: 0 }): LayoutNode {
  return { type: 'Screen', id: 'reveal-ui-root', props: { fill: true, bg: 'transparent' }, children: [] };
}
