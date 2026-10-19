import { mountUI } from './index.js';
import { feedbackAuditTree, feedbackLightTheme } from './icon-feedback.audit.js';

const probe = window as typeof window & { __feedbackUnmount?: () => void };
probe.__feedbackUnmount?.();
probe.__feedbackUnmount = mountUI(document.getElementById('root')!, feedbackAuditTree, {}, feedbackLightTheme);
