# R3-B3 r3 independent-review package

This is a standalone, buildable snapshot for independent review. It contains the source root (`index.html`, lockfile, configs, games, engine, scripts), the design/inventory documents required by the MC Fight full suite, B3 visual screenshots, captured gate logs, and the B3 mutation proof.

## Review procedure

1. Work only in `frozen-source`; do not modify the shared project or the source snapshot.
2. Run `npm ci --ignore-scripts` (the package was already installed this way for the captured logs).
3. Re-run the commands in `freeze-check/results.json`.
4. Inspect `freeze-check/mutations.json`: all six mutations must be red and all source files must match `integrity.sha256` after the check.
5. Record an independent conclusion outside `frozen-source`.

This package is evidence for review, not an independent signoff.
