# GAL-ART-01A · Gallery V2 frame-anchor independent review

Verdict: **PASS for the local loaded-V2 gallery inset exchange only; whole S5/S6 remains CONCERNS.** Reviewer is separate from the implementer. This report does not approve the Owner gate or the full media-and-final-skin milestone.

## Scope and evidence

- Reviewed src/services/gal-ui/gal-ui-art.ts at the V2 system-frame branch and the named regression in gal-ui-art.test.ts. Only direct children of gal-gallery-shell use the same −57px reanchor as settings when the registered frame has source slice 115. Missing art and legacy slice 16 remain on original anchors.
- Independently ran `npx vitest run src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1`: **13/13, exit 0**, including the gallery loaded/fallback/legacy assertion and validateLayoutNode check. Initial sandbox attempt failed before collecting tests with EPERM realpath node_modules/vitest/dist/spy.js; the authorized local rerun is the evidence. No test warning appeared in that rerun.
- Anchored in-memory sabotage: checked the exact source condition `node.id === 'gal-settings-shell' || node.id === 'gal-gallery-shell'` occurs **once**, transpiled original and a memory-only mutant with the gallery half removed, and exercised the same gallery shell geometry. Original child x=8; mutant child x=65. Assertion requiring x=8 **turned red** on mutant (`65 !== 8`). Shared source files were not altered.
- Independently inspected the saved 1440×900 light screenshot at C:/Users/24652/AppData/Local/Temp/gal-gallery-anchor-20261013/gal-art-01a-gallery-memories-light.png against docs/design/galgame/gal-ui-v2-memories.png. The grid's first card now starts near **x84/y245**, consistent with the V2 target near **x84/y244**. This is a local placement match, not an overall screenshot match.

## Remaining visual differences

The actual page still has light parchment card bodies and generic tab buttons where V2 specifies dark illustrated memory cards and integrated art tabs. Top navigation, footer controls, typography and locked-card treatment also differ. These are existing S5 visual differences, not regressions proven by this anchor change; no S6 animation timing was verified. Do not close S5/S6 or request Owner approval on this partial PASS.

No roadmap, pipeline, asset index, PUI source, or implementation file was edited by this reviewer.
