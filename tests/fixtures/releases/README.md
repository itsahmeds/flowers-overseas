# Release-note fixtures (spec 040 §14 A3, AC-39, T-37; TASK-156)

Templates for `docs/releases/YYYY-MM-DD-<env>-<short-sha>.md`, committed onto `main` of a
temporary bare repository by `tests/integration/release-rollback.test.ts`. `{{name}}` is replaced
by the full SHA of the fixture commit `name`, `{{name:7}}` by its first seven characters.

`release:rollback` reads one line of a production note: AC-37's
`RELEASE: READY <40-char sha> (release at <sha>)`. The `(release at …)` value is the previous
release of the note that promoted `<sha>`.

`git-fixture.ts` beside them builds the repository, runs the real CLI and serves a stand-in
`/api/health`.
