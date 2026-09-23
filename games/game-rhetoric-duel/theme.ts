import { apolloBrocade } from '@zerocraft/engine/ui/components/apollo-kit.js';
import { STARTER_THEME } from '@zerocraft/engine/ui/starters/index.js';
import type { UITheme } from '@zerocraft/engine/ui/components/index.js';

/** Apollo Brocade structure/texture retinted to the demo's high-contrast bronze-ink stage. */
export const RHETORIC_THEME: UITheme = {
  ...apolloBrocade,
  bg0: '#05070a',
  bg1: '#080c10',
  bg2: '#11151a',
  bg3: '#181d22',
  pageBg: '#05070a',
  text: '#eee8dc',
  sub: '#c4b8ab',
  dim: '#9b928a',
  line: 'rgba(214,175,105,.42)',
  jade: '#d6af69',
  jadeWash: 'rgba(214,175,105,.14)',
  jadeLine: 'rgba(214,175,105,.56)',
  gold: '#f1d49a',
  ok: '#b9cf88',
  okWash: 'rgba(185,207,136,.14)',
  warn: '#e0b66d',
  warnWash: 'rgba(224,182,109,.16)',
  danger: '#ec9d87',
  ink: '#05070a',
  inputBg: 'rgba(5,7,10,.82)',
  buttonSkins: STARTER_THEME.buttonSkins,
};
