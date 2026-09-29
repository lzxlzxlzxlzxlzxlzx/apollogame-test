# Loot Chest DokiWorld App

Current DokiWorld `public/apps` package for the existing loot chest experience.

- App ID: `game-loot-chest`
- SDK: `dokiworlds-app-sdk@0.2.0`
- Input: `doki.game.chest-input/2`
- Output: `doki.game.chest-result/2`
- Contract: `docs/sdk/loot-chest-contracts-v2.md`

Version `1.1.0` adds a fixed three-seal timing QTE before reveal. The QTE is internal,
does not add host configuration, and never changes the deterministic reward result.

The old `dokiworlds-apps` project remains a historical source reference. This directory is the authoritative source for new self-contained builds.
