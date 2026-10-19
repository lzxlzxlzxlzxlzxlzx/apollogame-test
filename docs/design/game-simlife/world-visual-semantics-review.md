# World Visual Semantics v1 review artifact

> The six farm-state candidates were owner-approved on 2026-10-13 and entered the matching game-local AssetIndex after 32×32 opaque nearest-sampling validation. Warp/landmark rows remain historical candidate evidence.

## Demon Castle — warp → landmark → destination

| scene / warp | map location | landmark / footprint | relation | destination | asset slot | size / anchor | candidate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| moon-courtyard / courtyard-to-forest | 18,7 | forest-arch / 17,5 + 2×2 | adjacent | 前往月影森林 | demon-castle.building.forest-arch | 64×64 px / 0.5,1 | placeholder |
| moon-courtyard / courtyard-to-workshop | 10,12 | undercrypt-stairs / 9,11 + 2×2 | overlap | 前往地下工坊 | demon-castle.building.undercrypt-stairs | 64×64 px / 0.5,1 | placeholder |
| moonshadow-forest / forest-to-courtyard | 1,7 | forest-return-arch / 0,6 + 2×2 | overlap | 返回月影庭院 | demon-castle.building.forest-arch | 64×64 px / 0.5,1 | placeholder |
| undercrypt-workshop / workshop-to-courtyard | 10,1 | workshop-return-stairs / 9,0 + 2×2 | overlap | 返回月影庭院 | demon-castle.building.undercrypt-stairs | 64×64 px / 0.5,1 | placeholder |

## Demon Castle — surface → actions → asset slot

| state | actions | map locations | asset key / slot | size / anchor | candidate |
| --- | --- | --- | --- | --- | --- |
| ordinary courtyard | — | moon-courtyard 全图，排除 2,8 + 6×4 农务区 | `art:demon-castle:tile:moon-courtyard` / demon-castle.tile.moon-courtyard | 1×1 cell / 0.5,0.5 | placeholder |
| plantable untilled | till | moon-courtyard @ 2,8 + 6×4 | `art:demon-castle:tile:moon-garden-earth` / demon-castle.tile.moon-garden-earth | 1×1 cell / 0.5,0.5 | approved + indexed |
| tilled dry | water | moon-courtyard @ 2,8 + 6×4 | `art:demon-castle:tile:moon-garden-tilled` / demon-castle.tile.moon-garden-tilled | 1×1 cell / 0.5,0.5 | approved + indexed |
| watered wet | plant | moon-courtyard @ 2,8 + 6×4 | `art:demon-castle:tile:moon-garden-watered` / demon-castle.tile.moon-garden-watered | 1×1 cell / 0.5,0.5 | approved + indexed |
| crop seeded / growing / mature | — / — / harvest | moon-courtyard @ 2,8 + 6×4 | demon-castle.crop.moonbell.seeded / growing / mature | 20×20 px / 0.5,1 | placeholder |
| forest forage | forage | moonshadow-forest 全图 | `art:demon-castle:tile:moonshadow-forest` / demon-castle.tile.moonshadow-forest | 1×1 cell / 0.5,0.5 | placeholder |
| workshop mineable | mine | undercrypt-workshop 全图 | `art:demon-castle:tile:undercrypt-workshop` / demon-castle.tile.undercrypt-workshop | 1×1 cell / 0.5,0.5 | placeholder |

## Little Valley migration

- `mine-gate → mine-entrance → 进入矿洞` and `mine-exit → mine-exit-stairs → 返回小山谷` are overlap-bound visible exits; the return landmark reuses the existing mine-entrance slot with a second explicit consumer.
- Used ground tiles declare `ground|plantable|water|forage|mineable|blocked` surfaces.
- Farm states use distinct keys: `farmable-earth` (till), `tilled-soil` (water), `watered-soil` (plant), then turnip seeded/growing/mature (harvest only when mature).
- `farmable-earth`、`tilled-soil`、`watered-soil` now resolve to the owner-approved Little Valley game-local textures; provenance and the review source hashes are in the AssetIndex.

## Zero-write materialization evidence

- `life-materialize --plan-update` passed with `writesPerformed=false`, no conflicts.
- Proposed formal files hash: `sha256:c2a3982c72071aab8c290fc0a317a1ac0d4ac67805e9a9acd3a2e9199dfc3563`.
- Confirmation hash: `sha256:160a8c6f06facab77e13d9352577d0d2db5a8a4a3b4909e1c87779cfeb057844`.
- Current formal files hash: `sha256:14f23f978b556b2368466ec1ce012757449b7f103e962933283b2c8a49f1f44c`.
- Formal `games/game-demon-castle/{life.json,asset-slots.json,life-host.json,life-launcher.json}` remain unchanged by this asset-only import; the approved texture keys await the separately controlled Life package update.

