# Snapshot provider compatibility / steering measurement — 2026-09-15

Implementation: `World.ensureSorted()` and `collectSystems()` both use `withSnapshotProvider`. A declared `FrameStartTransform` reader causes one engine provider to be included; pure motion installs no provider. Provider remains phase -2 and updates coordinates before decisions. No fallback to live positions. Original capability declarations and duplicate diagnostics are not suppressed. `motionApplyCapability.systems[0]` remains motion.

`flow-field.test.ts` now inspects actual `getSortedSystems()` rather than private registration order. Exact contract: frame-start-transform → steering → path-follow → flow-field → motion-apply; original relative ordering and warning checks retained. No game-i source or test edits.

Steering keeps a lazily built, lexicographically sorted neighbor list only within a single execute. Position/Tag/Steering input references do not change while this system writes Velocity. Same candidate order, sqrt, falloff, coincident-position rule and sum are retained; no cross-tick/world cache.

Targeted verification (single worker):
- snapshot-compat.log: ai-lab 3 + grid-move 20 + flow-field 39 = 62 PASS, exit 0; first-tick and original distance assertions unchanged.
- snapshot-provider.log: snapshot-provider 5 + system-graph 11 = 16 PASS, exit 0. Static capture without motion, decision-before-movement vs actual overlap-after-movement, single provider/audit equality, pure-motion exclusion, new-world isolation.
- snapshot-steering.log: steering 13 + provider 5 = 18 PASS, exit 0.
- snapshot-types.log: exit 2, only duplicate SystemPhase imports in concurrently edited over-time.ts. Final unified type check belongs to root; this is not a green type-check claim.

## Performance (original benchmark / original 5.5667 ms threshold unchanged)

Command: node node_modules/vitest/vitest.mjs run games/game211/slg-scale.bench.test.ts --maxWorkers=1 --minWorkers=1

| units | before mean / p95 ms | after mean / p95 ms |
| --- | --- | --- |
| 240 | 26.99 / 30.42 | 0.61 / 0.85 |
| 500 | 110.68 / 122.15 | 2.37 / 2.96 |
| 1000 | 389.71 / 498.84 | 8.86 / 10.48 |
| 2000 | 1461.27 / 1843.57 | 30.31 / 35.52 |
| 4000 | 3564.12 / 5820.33 | 114.87 / 141.91 |

Before: slg-before.log, 1 PASS / 1 FAIL, exit 1, 267.30 s. Type-check overlapped initial seconds; subsequent scan had no intended concurrent tests. After: slg-after.log, 2 PASS, exit 0, 7.54 s. Root subsequently reported overlapping game regression/type-check in initial after measurement, so neither run is an uncontested final benchmark. Controlled final three single-worker full regressions will supply final distributions. These logs demonstrate restored original 240-unit guard, not a promise of 4000-unit real-time support. No performance threshold or distance assertion changed.
