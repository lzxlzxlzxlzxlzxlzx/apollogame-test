import type { GalConfirmationKey, GalProfilePreferences } from './gal-profile.js';

export interface GalConfirmationContext {
  /** Current authoritative slot fact; required for saveEmpty/overwrite. */
  readonly slotFilled?: boolean;
  /** Only a readable filled slot may request load confirmation. */
  readonly slotReadable?: boolean;
  /** Starting a new game asks only when an active run would be replaced. */
  readonly hasProgress?: boolean;
}

/** Pure prompt policy. Callers must check operation legality separately before executing. */
export function requiresGalConfirmation(kind: GalConfirmationKey,
  preferences: GalProfilePreferences, context: GalConfirmationContext = {}): boolean {
  switch (kind) {
    case 'saveEmpty': return context.slotFilled === false && preferences.confirmations.saveEmpty;
    case 'overwrite': return context.slotFilled === true && preferences.confirmations.overwrite;
    case 'load': return context.slotReadable === true && preferences.confirmations.load;
    case 'newGame': return context.hasProgress === true && preferences.confirmations.newGame;
    case 'returnTitle': return preferences.confirmations.returnTitle;
    case 'exitGame': return preferences.confirmations.exitGame;
  }
}
