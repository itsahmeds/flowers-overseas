# `db/migrations/`

Versioned SQL for the one Postgres database (Neon, Frankfurt — ADR-0015). Spec 002 §5.1 and
§13 Q2 (option A) put it here: `supabase/` was the vendor directory of a stack we no longer use,
and `db/` is a guarded root (`.claude/hooks/task-guard.sh`), so SQL still cannot be written
without an active task.

## Naming and pairing

```
0001_roles_grants_updated_at.sql        the forward migration
0001_roles_grants_updated_at.down.sql   its hand-written rollback
```

- `NNNN_snake_case.sql`, four-digit version, one concern per file, in the order spec 002 §5.1
  plans: `0001` roles and helpers, `0002` i18n + geo, `0003` catalogue, `0004` media, `0005`
  partners, `0006` customers, `0007` orders + payments, `0008` order-integrity triggers, `0009`
  notifications + platform/ops, `0010` auth, `0011` RLS policies, `0012` pg-boss.
- **Every forward migration ships a `.down.sql`.** No exceptions: Phase 0 has no production data,
  which is exactly why the round trip is cheap to keep green (§5.1). A rollback drops in reverse
  dependency order and leaves no type, function, trigger, role or schema behind (AC-4).
- Versions are unique and contiguous from `0001`. `pnpm db:check` fails a gap, a duplicate, an
  unpaired file and a filename it cannot parse, one line per problem.

## Ownership preamble

Every migration except `0001` **begins with**

```sql
SET LOCAL ROLE app_owner;
```

so that `app_owner` owns every object in the database (spec 002 §2 "RLS and roles"): the runner
wraps each file in one transaction, and the role dies with it. `pnpm db:check` fails the file
that forgets. `0001` is exempt because it is the migration that creates the role, and
`0001_…down.sql` is exempt because a role cannot drop itself.

`app_web` — the runtime role, `NOSUPERUSER`, no `BYPASSRLS`, DML only — is granted through
`ALTER DEFAULT PRIVILEGES FOR ROLE app_owner`, so a table created by a later migration is
reachable by the application without any further grant.

## Running them

```bash
pnpm db:migrate              # apply every pending migration, in order, each in one transaction
pnpm db:migrate --dry-run    # print the plan and touch nothing
pnpm db:rollback --to 0003   # roll back 0004 and above, newest first
pnpm db:rollback --to 0000   # roll back everything (AC-4)
pnpm db:generate             # Drizzle Kit writes forward SQL from db/schema/ — write the .down.sql yourself
pnpm db:studio               # Drizzle Studio against the same database
pnpm db:check                # the offline gate: pairing, versions, ownership preamble, table drift
```

The runner uses **`DATABASE_URL_UNPOOLED`**, the direct connection string (spec 002 §13 Q6): a
transaction pooler keeps no session state, and DDL through one is a class of bug nobody debugs
twice. The pooled `DATABASE_URL` belongs to web requests and to `src/lib/db.ts`.

Applied migrations are recorded in `public.schema_migrations` (version, name, applied_at). It is
runner bookkeeping, not an application table: owned by the connecting role, carrying no personal
data, and absent from `db/schema/`.

## Phase 0 caveat

There is one shared database in Phase 0 (spec 002 §13 Q5), so a migration applied from a branch
is applied for everyone. Run `pnpm db:check` and `pnpm db:migrate --dry-run` first, and roll back
before you leave the branch if the migration is not merging today.
