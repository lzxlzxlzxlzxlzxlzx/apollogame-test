// Same data fixture under a bright theme; mountUI replaces the initial dark HTML before audit capture.
import { daylight, mountGciS6Audit } from './gci-s6-ui02.audit.js';

mountGciS6Audit(daylight);
