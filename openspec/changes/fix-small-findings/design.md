## Context

`name-guard add` stores lower-case keys (`widget pro`, `widgetpro`) for a normal name and one key `=<spelling>` for
`--exact`. Text keys carry both forms, so an exact key matches only that exact spelling. A list of common words
(`app`, `display`, `input`, ...) is refused without `--force` because banning their lower-case form would flag
ordinary text. The refusal is checked before `--exact` is considered.

`nightly-triage.test.mjs` runs `node_modules/@fission-ai/openspec/bin/openspec.js validate --all --strict` from the
package's own 1.11.0 dev dependency. The shared workflow pins 2.0.0 in its `package.json`;
`node ~/.workflow/bin/delivery.mjs openspec <args>` runs that version through `npx`, and the CI OpenSpec job uses the
shared `actions/openspec` action with the same pin. The generated scaffold already validates under 2.0.0 (checked
while planning: `fix-nightly-2026-10-11` passes `validate --all --strict`).

## Decisions

### `--exact` works as documented instead of rewording the message

The tool's header comment, `README.md` and `docs/confidentiality.md` all say `--exact` exists for a name whose
lower-case form is an ordinary word. A common word is exactly that case, so `--exact` is the intended route and the
message is right; the code is wrong. An exact key with an upper-case letter (`=Display`) never matches the
lower-case word, so it cannot flag ordinary lower-case text, which is what the refusal guards against.

`--exact` with an all-lower-case spelling (`app --exact`) would store `=app`, which matches the ordinary word in
every file. That case keeps the refusal, and its message no longer suggests `--exact`; it suggests another word,
a capitalised exact spelling, or `--force`. The check moves into an exported helper so the test can call it
without writing the real hash file.

Alternative rejected: keep the code and drop "use --exact" from the message. That leaves the documented purpose of
`--exact` unusable for the very names it was added for, and forces `--force`, which bans the lower-case word too.

### The test uses the shared OpenSpec instead of its own pin

The test finds the shared workflow copy at `XRB_WORKFLOW_HOME` when set, else `~/.workflow`, and runs
`node <copy>/bin/delivery.mjs openspec validate --all --strict --no-interactive` in the temporary repository. When
the copy is missing the test fails with a message naming the install command; it is not skipped, so the scaffold
check never silently disappears.

The CI Node tests job gets the copy by cloning the shared workflow repository (`main`, the same ref the OpenSpec job
uses) into a job folder and setting `XRB_WORKFLOW_HOME`. Removing the dev dependency removes `@fission-ai/openspec`
and its transitive packages from `pnpm-lock.yaml`.

## Risks

- The test now needs network access for `npx` on first run and a shared workflow copy. Every agent and maintainer
  machine has the copy already; CI gets it explicitly.
- The shared pin can move ahead of the scaffold format. That is intended: the test then fails in the same way
  finalization would, instead of passing against an older CLI.
- A capitalised exact ban of a common word (`=Display`) still matches that spelling at the start of a sentence.
  That is the documented trade-off of `--exact` and the maintainer's choice per name.
