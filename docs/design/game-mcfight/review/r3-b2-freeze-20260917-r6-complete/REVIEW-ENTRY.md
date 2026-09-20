# Independent review entry — R3-B2 r6

Review only the immutable source in rozen-source/. This replacement corrects prior omissions: root index.html, Vite and TypeScript configuration, the R2 baseline at docs/design/game-mcfight/self-check/r2/s4-before.json, test sources, and the declared B3 visual screenshots are present.

1. In rozen-source, run 
pm ci.
2. Inspect FREEZE-MANIFEST.json and the captured outputs in reeze-check/.
3. Rerun the five commands in README.md.
4. Perform the batch's mutation/revert checks. B2 uses eview-input/r3-b2-independent-review-checklist-v1.md; B3 uses the documented B3 cancellation and boundary checklist in its prior review.
5. Write an independent conclusion outside this package. This package itself contains no signoff.

PACKAGE-MANIFEST.json records verified SHA-256 parity between the packaged source and the staging snapshot used for validation. Dependencies are intentionally omitted from the deliverable.
