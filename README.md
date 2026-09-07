# Flowers Overseas

International flower relay for Europe. Planning repository: see `plan/00-summary.md` for the executive summary and `CLAUDE.md` for how work is done here (spec-driven, agent-enforced).

No application code exists yet. The first `/implement` happens against `specs/001-*` and a `TASK-` id.

## Layout
- `plan/` — the build plan (00–13)
- `specs/` — one spec per feature (template inside)
- `docs/adr/` — decision records · `docs/decisions-log.md`
- `docs/runbooks/` — operational procedures · `docs/compliance/` — RoPA, DPAs, sign-offs
- `docs/research/` — competitor and SERP research
- `.claude/` — agents, skills, hooks, settings for Claude Code
- `TASKS.md` — single source of truth for work

## Local setup (target: <15 minutes, to be completed by spec 001)
1. `pnpm install`
2. `cp .env.example .env.local` and fill from the Vercel env store (`vercel env pull`)
3. `pnpm db:migrate && pnpm db:seed`
4. `pnpm dev`
