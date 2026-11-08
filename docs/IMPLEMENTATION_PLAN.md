# Chunked implementation plan

Status: In progress

This plan groups the project blueprint into deliverable implementation chunks,
ordered by dependency. It is a sequencing aid, not a delivery-date commitment;
the detailed scope and acceptance gates remain in [ROADMAP.md](ROADMAP.md) and
the owning specifications. Chunk 1 has an initial project/tooling and simulation
foundation; none of its end-to-end acceptance gate is complete.

## Chunks

### 1. Desktop MVP: two-player arena

Build the smallest end-to-end playable slice: Node.js 24 project/tooling,
validated configuration, seeded 30 Hz authoritative arena, food, movement,
world bounds, anonymous tickets, v1 HELLO/WELCOME/INPUT/full-snapshot protocol,
Canvas rendering, pointer steering, camera, and interpolation.

**Gate:** clean install, tests and build pass; two desktop clients play in one
arena for ten minutes; the server controls movement and food consumption and
rejects invalid movement intent. Accounts, mobile, ACP, and production scale are
out of scope.

**Specifications:** [DEVELOPMENT](DEVELOPMENT.md),
[ARCHITECTURE](ARCHITECTURE.md), [GAME_DESIGN](GAME_DESIGN.md),
[NETWORKING](NETWORKING.md), [SECURITY](SECURITY.md).

### 2. Complete core game mechanics

Add enemy eating, mass/speed/decay, deterministic collision resolution, split,
eject, sibling separation/merge, viruses, bounded spawning, death and respawn,
and exactly-once life finalization. Playtest proposed constants and record
approved changes.

**Gate:** a four-player desktop session exercises every mechanic; seeded replays
are reproducible; tests cover mechanic boundaries, mass sources/sinks, cell
caps, and duplicate-result prevention.

**Specifications:** [GAME_DESIGN](GAME_DESIGN.md),
[DATABASE](DATABASE.md), [ROADMAP](ROADMAP.md#phase-2--core-mechanics).

### 3. Reliable networking and reconnect

Complete server-derived culling, atomic multipart snapshots and time estimation;
bound queues, frames, quotas, and backpressure; harden ticket use and rotating
resume tokens; add bandwidth modes and clear reconnect UI.

**Gate:** latency, jitter, brief drops, sequence wrap, hostile frames, and slow
readers are tested; a reconnect resumes the same live body without duplicate
actions, stale snapshot parts cannot corrupt state, and memory remains bounded.

**Specifications:** [NETWORKING](NETWORKING.md),
[SECURITY](SECURITY.md), [MOBILE](MOBILE.md).

### 4. Accounts, persistence, and results

Add ordered migrations and a DB worker/repository, opaque player sessions and
CSRF protections, registration/login/logout, the documented player API,
idempotent match results, private match history, and the public best-mass
leaderboard. Keep guest play available without registration.

**Gate:** account and ranked-result data survive restart; retries do not duplicate
results; users cannot read another user's history; authorization, CSRF, migration,
and backup-restore tests pass.

**Specifications:** [API](API.md), [DATABASE](DATABASE.md),
[SECURITY](SECURITY.md), [DEVELOPMENT](DEVELOPMENT.md).

### 5. Production readiness and measured scale

Add the non-root Node 24 image, TLS/WSS proxying, health and private monitoring,
graceful drain, realistic load/soak tests, and recovery procedures. Measure and
tune arena capacity; move to Postgres before multi-host writes, then add shared
routing/tickets/quotas and multiple arenas with bounded result delivery.

**Gate:** publish measured load results against agreed hardware and player
targets; meet tick and memory gates, validate TLS/WSS and recovery, and rehearse
deployment, migration, backup, and restore. Do not claim unmeasured capacity.

**Specifications:** [DEPLOYMENT](DEPLOYMENT.md),
[DATABASE](DATABASE.md), [ROADMAP](ROADMAP.md#phase-5--scale-and-polish).

### 6. ACP foundation and managed server lifecycle

After persistence/auth boundaries are established, add the separate control
server, typed private IPC, DB ownership, process manager, health/metrics, admin
provisioning and sessions, roles/audit, and React ACP login/server list with
guarded stop/restart.

**Gate:** operators can manage fixture game processes and see accurate or
explicitly stale metrics; viewer mutations and player credentials are rejected;
lifecycle outcomes are acknowledged and audited; failure tests leave no orphan
processes.

**Specifications:** [ADMIN](ADMIN.md), [ARCHITECTURE](ARCHITECTURE.md),
[API](API.md#admin-rest-api), [SECURITY](SECURITY.md#admin-access-and-permissions),
[DATABASE](DATABASE.md#admin-schema-and-auditing).

### 7. Presets and server creation

Add versioned, validated server presets and Create-server forms/endpoints. Start
only from an explicitly selected saved version; propagate validated configuration
to the instance and support only documented live settings.

**Gate:** a valid preset starts exactly one managed arena; invalid input allocates
no process; preset edits cannot change running servers; version conflicts,
resource refusal, and 15/30/60 Hz configuration are covered.

**Specifications:** [ADMIN](ADMIN.md#create-server-variables),
[API](API.md#admin-rest-api), [ARCHITECTURE](ARCHITECTURE.md),
[DEPLOYMENT](DEPLOYMENT.md).

### 8. Moderation and live spectator operations

Add user lookup and retained stats, bans and role-filtered player actions with
generation checks, audit outcomes, and unranked-life rules. Then add the separate
authenticated admin spectator feed, viewport deltas/LOD, shared Canvas renderer,
follow, and acknowledged actions/notices.

**Gate:** stale targets and unauthorized actions fail server-side; bans persist;
commands apply at tick boundaries and are audited; spectator navigation remains
bounded under panning, LOD changes, dependency gaps, and slow readers.

**Specifications:** [ADMIN](ADMIN.md),
[NETWORKING](NETWORKING.md#admin-spectator-protocol-v1),
[API](API.md#admin-rest-api), [DATABASE](DATABASE.md#admin-schema-and-auditing),
[SECURITY](SECURITY.md#admin-audit-process-safety-and-limits).

### 9. Mobile player support

Add touch input through the existing device-independent intent interface,
responsive safe-area HUD, rendering/battery tiers, explicit resume consent, and
real-device network and lifecycle testing. Decide separately whether to ship a
static-only optional PWA.

**Gate:** the documented iOS/Android device matrix passes multitouch, rotation,
network changes, hidden-tab expiry, and sustained thermal/battery checks. Desktop
and mobile retain the same protocol and authoritative simulation; no offline
ranked play is introduced.

**Specifications:** [MOBILE](MOBILE.md),
[ARCHITECTURE](ARCHITECTURE.md#input-abstraction-and-responsive-rendering),
[ROADMAP](ROADMAP.md#phase-6--mobile-support).

## Chunk completion practice

Deliver one chunk at a time. Before advancing, meet its gate with repeatable
tests or operational evidence, update the relevant specification and
[ROADMAP.md](ROADMAP.md) status, and record protocol or schema changes with
versioning/migrations. Keep unresolved product and deployment decisions explicit;
do not treat proposed constants or capacity figures as measured results.
