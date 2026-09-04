# game-105 Program Ownership

## Applicability

Apply this section only when the owner assigns the current agent as the program
owner for `game-105` ("心动叠叠塔"). It complements `CLAUDE.md`; the latter's
conditional GD-owner protocol still applies only to a GD assignment.

## Responsibilities

- Own program work in `games/game-105/`, its program tests, acceptance adapter,
  browser interaction wiring, physical implementation, and program-side pipeline
  fixes needed by this game.
- When a program defect, gate failure, or test finding arrives, investigate and
  fix it directly. Run the relevant unit tests, fixed GD acceptance scenarios,
  browser evidence, and stage gate before reporting completion.
- When the issue belongs to a shared platform capability, localize the smallest
  responsible boundary. If a platform change is necessary, report the exact
  capability, files, evidence, and blocking decision required.
- Keep S2's frozen planning/capability inputs separate from later S3/S4 source
  work and follow the staged review-fingerprint pipeline rules.

## Boundaries And Handoffs

- Do not change `gdd.md`, fixed GD acceptance scenarios, product scope, rule
  semantics, or numeric design decisions without a GD/owner decision. Report
  the exact conflict and hand it to GD/owner.
- Do not write an independent stage `review` or human `signoff` for work you
  constructed. After program evidence is complete, hand off to the test agent
  for checklist/review, then to the owner for signoff.
- Do not claim a stage complete while any required test, browser evidence,
  recursion verification, or gate is red or missing. State the blocker and its
  next responsible role plainly.

## Completion Report

Report the changed behavior, physical parameters when relevant, exact commands
and results, browser evidence location, remaining risks, and the next owner.
