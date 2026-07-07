# General Guidelines

## Code shape

- **500 LoC per file, hard cap.** Approaching it is the signal to split by responsibility. Never merge a file over the cap.
- Small, single-purpose functions; module-level organisation over deep class hierarchies.
- **Comments** exist only for what code cannot express: invariants, constraints, non-obvious whys (e.g. "feather must exceed tile overlap or seams show"). Delete narration ("loop over tiles"), history ("used to be X"), and section banners. If a comment restates the line below it, remove one of them.
- Naming: boring and literal beats clever. The domain vocabulary is fixed: region, line, point, label, manifest, pass, tile, generation.

## Errors

- Fail loudly and early on programmer errors; handle expected failures (ComfyUI connection loss, cancelled jobs, malformed project files) explicitly with typed errors/responses.
- Never swallow an exception without recording why that's safe.

## Testing

- Test behaviour at boundaries: compiler golden images, workflow JSON snapshots, API round-trips, property tests for geometry (street generator).
- Every acceptance criterion in an issue maps to at least one automated check where feasible; manual checks get documented in the PR.
- No GPU in CI. GPU-dependent verification happens locally and is reported in the PR body.

## Git & PRs

- Branch per issue: `issue/NN-short-slug`. PR title mirrors the issue title; body says `Closes #NN` and walks acceptance criteria with evidence.
- Commits are small and buildable. Green `just lint` + `just test` before pushing.
- Experiment issues (#3–#7 pattern) deliver a `RESULTS.md` under `experiments/` — downstream issues consume those files, so write them for a reader with no session context.
