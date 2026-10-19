import { mountUI } from './index.js';
import { iconAuditTree, iconLightTheme } from './icon-only-button.audit.js';

const probe = window as typeof window & { __iconUnmount?: () => void };
probe.__iconUnmount?.();
probe.__iconUnmount = mountUI(document.getElementById('root')!, iconAuditTree, {}, iconLightTheme);
