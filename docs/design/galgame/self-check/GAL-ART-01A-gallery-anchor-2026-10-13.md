# GAL-ART-01A · Gallery V2 frame inset local self-check

Scope: only `gal-gallery-shell` direct-child anchors when the registered system frame is loaded with V2 source cut 115. The frame's 58px display edge replaces the prior 65px content inset, so heading, tabs, grid and footer move by −57px on both axes. Missing-art and legacy sliced paths retain their original coordinates. No PUI API or asset index changed.

- `npx vitest run src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1`: 13/13 pass, including exact loaded/fallback/legacy assertions and `validateLayoutNode` zero issues.
- `npx vitest run src/ui/components src/services/gal-ui --maxWorkers=1 --minWorkers=1`: 609/609 pass.
- `npx tsc --noEmit`: exit 0.
- Existing GAL light Button-label UI audit: exit 0, zero blocking overlaps/contrast failures; this fixture does not substitute for a gallery-specific visual audit.
- `GAL_ART_AUDIT_OUTPUT=... node src/services/gal-ui/verify-gal-art-live.mjs`: 34 dark/light states, exit 0; short-lived static browser closed by probe. Saved [memories](../review/gal-art-01a-gallery-anchor-memories-light.png) and [CG](../review/gal-art-01a-gallery-anchor-cg-light.png) light screenshots. No full ZeroCraft service launched.
- `node scripts/scoped-gate.mjs --run`: exit 1 at depcruise, 33 dependency violations in unrelated simlife/potion/clue/engine-host areas; no GAL gallery diagnostic in its output. This is not a full-green claim.

V2 target comparison: reference grid starts near x84/y244; actual loaded frame now places its grid near x84/y245 instead of the previous x141/y301. The current bright card palette, tabs, navigation and content remain visibly different from V2; S5/S6 remain CONCERNS, not complete. Independent anchored mutation review: [local PASS](../review/GAL-ART-01A-gallery-anchor-independent.md).
