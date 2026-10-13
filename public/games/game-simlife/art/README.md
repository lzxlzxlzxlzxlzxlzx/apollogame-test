# Little Valley local art contract

This directory is the hermetic, game-local art library for `game-simlife`.

- Runtime identity is the opaque `art:little-valley:*` key from `LITTLE_VALLEY_PACKAGE`; no scene data stores a URL or file path.
- `games/game-simlife/game-simlife.ts` already calls `loadGameArtInto(assets, 'game-simlife')`. That shared render-only bridge fetches this `index.json`, registers each `filled` texture, and leaves Canvas semantic previews in place if a file cannot load.
- `index.json` is the storage truth for runnable assets. Every current `art:` consumer has exactly one `filled` entry with `usage:'sprite'`, `colorSpace:'srgb'`, and an explicit `wrap` mode.
- `art-ledger.json` is the requirement truth: one append-only row per actual consumer slot. It contains no speculative/unconsumed art.
- The first vertical slice uses self-authored CC0 SVG pixel-art placeholders, with explicit provenance. They are not AI output. Replace an entry only after the incoming local-library or AI file has an approved human review and complete source/license/provenance metadata.

## Approved visual grid

| role | source dimensions | runtime anchor/layer |
| --- | --- | --- |
| map tile, crop, resource, item | 32×32 | tile/crop/placement/inventory |
| player, NPC | 32×48 | bottom-center actor |
| farmhouse | 256×96 (8×3 tiles) | bottom-center placement |

## Next consumer needed

`mine-gate` now has a non-blocking `mine-entrance` decoration consumer. Its approved local key is `art:little-valley:placement:mine-entrance`, rendered from a 64×64 bottom-center SVG. Any later AI replacement must first land under `ai/pending/` and receive human approval before replacing its filled index entry.
