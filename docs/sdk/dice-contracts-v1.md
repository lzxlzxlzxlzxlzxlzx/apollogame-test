# Physics Dice contracts v1

ApolloGame development reference for the standalone `game-physics-dice` App. The
source-of-record is `dokiworlds-apps/docs/sdk/dice-contracts-v1.md`.

## Input: `doki.game.dice-input/1`

```json
{"contract":"doki.game.dice-input","version":1,"data":{"dice":[{"sides":6},{"sides":20}]}}
```

One to three d4, d6, d8, or d20 dice are accepted. The input does not carry a result,
seed, or preset face.

## Output: `doki.game.result/1`

Use `createGameResult()` with scalar metrics: `total`, `diceCount`, `roll`
(`d6:4,d20:17`), `randomSource: "physics"`, and `physics: true`. The normalized score
is `round(total / sum(die.sides) * 100)`.

Browser physics remains presentation-side until the Host validates or replays the
fixed-step simulation; clients cannot be accepted as server-authoritative actions.
