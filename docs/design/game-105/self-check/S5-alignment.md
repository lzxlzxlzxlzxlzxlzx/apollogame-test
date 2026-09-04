# game-105 S5 Skin Self-Check

日期：2026-09-03

## Current Controlled Baseline

- Current game content fingerprint: `38db589c1137893a`.
- The controlled S4 scope is [S4-scope-38db589c1137893a.json](S4-scope-38db589c1137893a.json), with scope hash `b146cdf7cce24368`.
- The current S4 four-state structural projection is [S4-structure-38db589c1137893a.json](S4-structure-38db589c1137893a.json). It checks IDs, parentage, sibling order, anchors, dimensions, visibility, actions and arguments, while deliberately excluding paint properties.
- `games/game-105/s5-structure.test.ts` passes all four frozen visible-state checks. S5 did not change layout, component count, information ordering, visibility, interaction paths, session logic, AI or physics.

## Current S5 Pixel Baseline

- State: `s5-skin-candidate-38db589c1137893a`.
- File: [s5-skin-candidate-38db589c1137893a.png](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/golden/s5-skin-candidate-38db589c1137893a.png).
- Fixed viewport: `1280x800`; two consecutive captures were stable.
- SHA-256: `3a09a3cce76c0c211219aec2436779e92435595a38bf2e4a7066a0126c4cef9b`.
- Owner signed this S5-only pixel baseline at `2026-09-03T08:12:01.684Z`.
- Real Chromium comparison against the signed photo passed: `59/1,024,000` pixels beyond channel tolerance, ratio `0.00006` (within the `0.005` threshold); the page itself reported stable.

`s4-structure-*` records are structural contracts, not pixel baselines. `golden-shot compare --state` now rejects an unblessed or structural-only state, and the S5 gate selects only a blessed `s5-*` state whose `gameHash` equals the current content fingerprint. Historical candidates therefore cannot mask or fail the current S5 skin comparison.

## Visual Scope

- Existing cards retain their cream-paper surfaces, dark high-contrast body copy and fine gold rules.
- Fonts, brocade-like patterns, background finish, button skin and short non-blocking motion remain scoped under `#g105-probe-hud`.
- No shared UI component or global pointer-event policy is used for this skin.

## Verification

- `node --check scripts/golden-shot.mjs` and `node --check scripts/game-pipeline.mjs` passed.
- `node scripts/golden-shot.mjs capture --game game-105 --state s5-skin-candidate-38db589c1137893a` produced a stable two-capture image.
- `node scripts/golden-shot.mjs bless --game game-105 --state s5-skin-candidate-38db589c1137893a --note "..."` recorded the owner-approved baseline.
- `node scripts/golden-shot.mjs compare --game game-105 --state s5-skin-candidate-38db589c1137893a` passed in real Chromium.

## Sampled Replay

The following replay used the current `bbcf70ab62997e23` build in real Chromium. Its complete, zero-console-error record is [S5-bbcf70ab62997e23-playthrough.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-playthrough.json).

| Sample | Evidence | Replay result |
| --- | --- | --- |
| Stable opening | [01-opening](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-01-opening.png) | The 54-block tower reaches the player-ready opening state while the existing companion card, ledger, controls and restart entry retain their frozen locations. |
| Player card to AI handover | [02-player-card](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-02-player-card.png), [03-ai-observe](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-03-ai-observe.png), [04-ai-turn](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-04-ai-turn.png) | A real canvas pull reaches the existing interaction card; quick reply and submit hand the same physical tower to AI. Card text remains dark on cream paper, and no new action or state is introduced. |
| Collapse and restart | [05-collapse](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-05-collapse.png), [06-restart](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S5-bbcf70ab62997e23-06-restart.png) | The calibrated physical-collapse drag reaches the pre-existing wrap card. Its registered cream banner background is present, and restart returns to the same opening structure without browser errors. |

## Fun Check

1. **Would I play another round?** Yes, because a successful real pull changes both the tower silhouette and which interaction card appears. The appeal comes from choosing a block under physical uncertainty, not from a hidden risk percentage. The local-template AI is intentionally limited, so its dialogue variety remains a known M1 ceiling rather than a claim of endless replay value.
2. **Is key feedback immediately legible?** The replay shows the player card, AI-observe state, and neutral wrap card as distinct moments. Cream-paper cards with dark text keep the action copy legible, while the physical tower remains visible behind the HUD. The strongest feedback remains a block moving and the tower settling or collapsing; no scripted collapse or success prediction is used.
3. **Where is there confusion or waiting?** The AI observe-to-turn transition and real physics settling are the only deliberate waiting windows. The replay waits about `600ms` between the observe and AI-turn screenshots; it stays below a one-second idle pause. Longer physics settling is not skipped because it is the game’s real verdict, but the status card continues to identify whose turn and what is happening. AI text now waits for player continuation rather than disappearing automatically.

This self-check records machine evidence and the owner-approved S5 pixel baseline only. It does not substitute for a fresh independent S5 review. The current S4 structure contract `s4-structure-bbcf70ab62997e23` is now owner-blessed and remains excluded from S5 pixel comparison.

## Current S5 Amendment

- This S7 readability and visible-feedback amendment is bound to `38db589c1137893a`; it removes only the narrow-screen card's second scale and adds a short collapse-settle halo. It does not change any LayoutNode projection, component, action, state, physics or AI rule. The frozen structure test remains `4/4`.
- Signed candidate: [s5-skin-candidate-38db589c1137893a.png](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/golden/s5-skin-candidate-38db589c1137893a.png), SHA-256 `3a09a3cce76c0c211219aec2436779e92435595a38bf2e4a7066a0126c4cef9b`, fixed `1280x800`, two stable captures.
- Status is `blessed`. Older `bbcf` and `a3ebb` baselines remain historical evidence and cannot approve this current skin.
- Current browser evidence and 240-frame performance sampling are recorded in [S7-38db589c1137893a-usability.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-38db589c1137893a-usability.json). `npx tsc --noEmit` and `npx vitest run games/game-105 --silent` passed `42/42`.

Next: request a fresh S5 independent review against the current S4 structure scope and signed pixel baseline.
