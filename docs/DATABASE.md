# Database and migrations

Status: Planned

## Persistence boundary

Status: Planned

SQLite file: `db/data/agar.sqlite`, owned by a dedicated DB worker using
`node:sqlite`. Proposed migration file: `db/migrations/001_initial.sql`.
Connection setup: `PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;` and
`PRAGMA busy_timeout=5000;`. SQLite APIs are synchronous; never call them from
the simulation loop. Keep SQL parameterized and disable extension loading.
See runtime maturity notes in [DEVELOPMENT.md](DEVELOPMENT.md).

Store accounts, sessions, and life results, not per-tick positions. Tickets,
resume secrets, and guest identity exist only in prototype process memory.
Multiple gateways later need a shared atomic ticket/resume store or arena-local
routing, not independent copies of those maps.

## Entity relationships

Status: Planned

All tables and relationships shown are planned.

```mermaid
erDiagram
  USERS ||--o{ SESSIONS : owns
  USERS o|--o{ MATCH_RESULTS : optionally_owns
  USERS ||--o| LEADERBOARD_BEST : has
  ADMINS ||--o{ ADMIN_SESSIONS : owns
  ADMINS o|--o{ AUDIT_LOG : performs
  ADMINS o|--o{ SERVER_PRESETS : creates
  ADMINS o|--o{ BANS : issues
  USERS ||--o{ BANS : receives
  ADMINS {
    text id PK
    text email_canonical UK
    text role
    text password_hash
  }
  ADMIN_SESSIONS {
    text id PK
    text admin_id FK
    text token_hash UK
    integer expires_at_ms
  }
  AUDIT_LOG {
    text id PK
    text actor_id FK
    text action
    text status
  }
  SERVER_PRESETS {
    text id PK
    integer version PK
    text variables_json
    text created_by FK
  }
  BANS {
    text id PK
    text user_id FK
    text created_by FK
    integer expires_at_ms
    integer revoked_at_ms
  }
  USERS {
    text id PK
    text email_canonical UK
    text display_name
    text password_hash
    integer created_at_ms
  }
  SESSIONS {
    text id PK
    text user_id FK
    text token_hash UK
    text csrf_hash
    integer expires_at_ms
  }
  MATCH_RESULTS {
    text id PK
    text user_id FK
    text arena_id
    real peak_mass
    integer ended_at_ms
  }
  LEADERBOARD_BEST {
    text user_id PK, FK
    real best_mass
    integer updated_at_ms
  }
```

## Proposed initial schema

Status: Planned

UUIDs and wall-clock timestamps (integer Unix milliseconds) are generated in
Node.js. Milliseconds fit safely within JS integers for the intended lifetime.
Protocol simulation ticks are separate from wall-clock time. Validate Unicode
code-point lengths in application code as well as database constraints.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email_canonical TEXT NOT NULL UNIQUE CHECK(length(email_canonical) <= 254),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 20),
  password_hash TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  csrf_hash TEXT NOT NULL CHECK(length(csrf_hash) = 64),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms > created_at_ms)
) STRICT;

CREATE TABLE match_results (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  arena_id TEXT NOT NULL CHECK(length(arena_id) BETWEEN 1 AND 32),
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER NOT NULL CHECK(ended_at_ms >= started_at_ms),
  duration_ticks INTEGER NOT NULL CHECK(duration_ticks >= 0),
  peak_mass REAL NOT NULL CHECK(peak_mass >= 0 AND peak_mass <= 320000),
  cells_eaten INTEGER NOT NULL CHECK(cells_eaten >= 0),
  end_reason TEXT NOT NULL
    CHECK(end_reason IN ('eaten', 'disconnect_expired', 'left'))
) STRICT;

CREATE TABLE leaderboard_best (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  best_mass REAL NOT NULL CHECK(best_mass >= 0 AND best_mass <= 320000),
  updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at_ms);
CREATE INDEX results_user_recent
  ON match_results(user_id, ended_at_ms DESC, id DESC);
CREATE INDEX results_retention ON match_results(ended_at_ms);
CREATE INDEX leaderboard_rank ON leaderboard_best(best_mass DESC, user_id ASC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at_ms INTEGER NOT NULL
) STRICT;
```

The 320,000 mass bound is `MAX_CELLS * MAX_CELL_MASS`; migrate this check if tuning
raises that limit. No unique display-name constraint: use user IDs as identity.
Index-backed email/session lookups are unique; session expiry and result retention
cleanup run in small batches outside ticks.

## Result transaction and idempotency

Status: Planned

Generate the result UUID once when the life starts. At finalization, the worker
emits the same ID on every retry. In one transaction:

1. Insert result with `ON CONFLICT(id) DO NOTHING`.
2. Only if inserted, `is_ranked = 1`, and `user_id` is non-null, upsert `leaderboard_best` using
   `max(existing best_mass, incoming peak_mass)`; update timestamp only on improvement.
3. Commit, then acknowledge the outbox job.

Use this indexed leaderboard read, with bound parameters for cursor values:

```sql
SELECT u.id AS user_id, u.display_name, b.best_mass
FROM leaderboard_best b JOIN users u ON u.id = b.user_id
WHERE b.best_mass < :mass
   OR (b.best_mass = :mass AND b.user_id > :user_id)
ORDER BY b.best_mass DESC, b.user_id ASC
LIMIT :limit_plus_one;
```

Omit the WHERE clause for the first page. Fetch limit+1 to derive `nextCursor`.
Encode the unrounded stored mass in the cursor, not the rounded display value.
Match history uses the analogous `(ended_at_ms, id)` descending predicate.

## Migrations, backup, and Postgres transition

Status: Planned

Planned `server/db/migrate.ts` creates the ledger if absent, acquires a single
deployment migration lock, verifies applied checksums, and runs unapplied numbered
SQL files in transactions. The initial SQL uses `CREATE TABLE IF NOT EXISTS` only
for the bootstrap migration ledger; its occurrence above describes the final
schema. The runner's ledger bootstrap is infrastructure outside migration
tracking; migration 001 (including its harmless ledger existence check) receives
one checksum/ledger row, not a separate ledger-table migration. Never silently
edit an applied migration.

Run `npm run db:migrate` as a separate pre-start release task, not in every
replica. Failed migrations abort readiness; back up before destructive changes.
Use SQLite's online backup API or a quiesced/checkpointed backup procedure;
copying just the live `.sqlite` file can omit WAL transactions. Test restores.
Retain daily encrypted backups for seven days initially, with credentials/access
separate from the app; retention needs owner approval.

Later Postgres uses `pg`, one bounded pool per process, UUID columns, BIGINT Unix
milliseconds, DOUBLE PRECISION mass, and explicit CHECK constraints. Translate
SQLite STRICT/PRAGMAs rather than running SQLite SQL unchanged. Convert BIGINT
driver strings to validated safe integers at the repository boundary. Use
`GREATEST` rather than SQLite scalar `max` in upserts. Keep HTTP JSON unchanged.
Run adapter contract tests against both engines, export/import during a planned
maintenance window, reconcile row counts/best scores, then switch `DATABASE_URL`.
Do not use SQLite on shared network storage or permit separate replicas to write
independent local files as if they were one database.

Initial retention proposal: delete expired sessions hourly; prune guest results
after seven days and account match detail after 90 days. Preserve leaderboard
summary until account deletion. Account deletion is not an initial API endpoint;
an operator procedure must revoke sessions, delete the user/summary, and unlink
retained results before accounts launch. Never back up raw session/ticket secrets.

## Admin schema and auditing

Status: Planned

Add planned `db/migrations/002_admin.sql` rather than rewriting an applied 001.
In managed ACP mode, the control server owns the DB worker; game repository
operations pass through validated IPC. Admin identities are separate from users,
including separate session rows. No extra SQLite writer per child.

```sql
CREATE TABLE admins (
  id TEXT PRIMARY KEY NOT NULL,
  email_canonical TEXT NOT NULL UNIQUE CHECK(length(email_canonical) <= 254),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('viewer', 'moderator', 'operator')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0, 1)),
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  csrf_hash TEXT NOT NULL CHECK(length(csrf_hash) = 64),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms > created_at_ms)
) STRICT;

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  server_id TEXT,
  generation TEXT,
  target TEXT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200),
  request_fingerprint TEXT,
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  status TEXT NOT NULL CHECK(status IN ('pending', 'applied', 'rejected', 'unknown')),
  applied_tick INTEGER CHECK(applied_tick >= 0),
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER CHECK(completed_at_ms >= created_at_ms)
) STRICT;

CREATE TABLE server_presets (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
  variables_json TEXT NOT NULL CHECK(json_valid(variables_json)),
  created_by TEXT REFERENCES admins(id) ON DELETE SET NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (id, version)
) STRICT;

CREATE TABLE bans (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES admins(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER CHECK(expires_at_ms > created_at_ms),
  revoked_at_ms INTEGER CHECK(revoked_at_ms >= created_at_ms)
) STRICT;

ALTER TABLE match_results
  ADD COLUMN is_ranked INTEGER NOT NULL DEFAULT 1 CHECK(is_ranked IN (0, 1));

CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at_ms);
CREATE INDEX admin_sessions_owner ON admin_sessions(admin_id);
CREATE INDEX audit_recent ON audit_log(created_at_ms DESC, id DESC);
CREATE INDEX audit_actor_recent ON audit_log(actor_id, created_at_ms DESC, id DESC);
CREATE INDEX audit_server_recent ON audit_log(server_id, created_at_ms DESC, id DESC);
CREATE INDEX bans_user_active ON bans(user_id, revoked_at_ms, expires_at_ms);
CREATE INDEX presets_latest ON server_presets(id, version DESC);
```

`variables_json` contains only the six game-variable fields from
[ADMIN.md](ADMIN.md#create-server-variables), not name, paths, secrets or resource
budgets. Validate full schema and cross-field bounds in Node as well as valid JSON
in SQL. Updating a preset appends version+1 in a transaction, requiring expected
latest version; old versions remain available for launch/restart.
Registry/PIDs/ports/live mute flags remain runtime state, not preset contents.
Control restart must terminate its children and clear registry state, not
silently rediscover unrelated host processes.

Audit row ID is command UUID for dispatched mutations; generate a fresh UUID for
login/denial, preset-save, and spectator-session start/end audit events. Keep
actor/action/target/reason/creation immutable; only status/outcome fields finalize
a pending row. `request_fingerprint` is SHA-256 of canonical validated intent,
bound to actor ID; no raw auth token, password, message text, or sensitive body
in `details_json`. Store approved variable values, changed fields, outcomes and
timestamps; account-ban target is UUID, not email. Login failures have null actor
unless independently authenticated; never trust a claimed login actor ID.

Pending audit insert must commit before IPC dispatch; reject mutations if audit
storage is unavailable. Ban row and pending audit insert share one transaction;
enforce on all current bodies, plus authoritative join/resume checks so new joins
cannot race an in-flight kick. Audit uncertain IPC outcomes as unknown; do not
change them to applied without an acknowledgment or explicit reconciliation.
Repeated command IDs return recorded status only after checking actor/fingerprint.

Custom presets (any gameplay override differs from defaults) are unranked pending
a comparable-leaderboard decision. Mark all affected existing lives unranked on
live gameplay change, and persist that flag with final results; server config
state determines new-life eligibility too. Do not retroactively rewrite previously
committed ranked results. The existing leaderboard remains default-rules-only.

Admin session lifetime and token rules are in SECURITY.md. Expired-session cleanup
extends to admin_sessions. Audit retention is an open operator policy; do not
silently apply the player 90-day result purge to audits/presets/bans. No audit
delete endpoint is proposed; revoking a ban preserves its row and audit history.
Postgres maps JSON text to JSONB (or validated TEXT initially), integer flags to
BOOLEAN, and keeps the same public JSON contracts.
