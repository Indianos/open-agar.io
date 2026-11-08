# Implementation roadmap

Status: In progress

Phase 1 has begun; incomplete work remains unchecked.
Documentation completion does not complete an implementation phase.
Sequence vertical slices so a developer can observe each mechanic end-to-end
before adding scale or account complexity. For the compact dependency-ordered
view, see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Phase 1 — desktop prototype

Status: In progress

- [x] Resolve baseline library/SQLite decisions; scaffold [DEVELOPMENT.md](DEVELOPMENT.md).
- [x] Add Node.js 24 scripts, root lockfile, config validation, lint/format checks.
- [ ] Implement seeded 30 Hz arena with food, movement, bounds, and spatial hash.
- [ ] Implement v1 HELLO/WELCOME/INPUT/full snapshot codec and anonymous tickets.
- [ ] Render two desktop clients, pointer steering, camera, interpolation.
- [ ] Add unit/protocol tests and a repeatable two-tab smoke procedure.

**Definition of done:** clean install on Node.js 24; documented commands run;
two anonymous desktop browsers see server-controlled movement/food consumption
for ten minutes; malformed intent cannot move beyond limits; tests/build pass.
Mobile, accounts, and production scale are not phase-1 deliverables.

## Phase 2 — core mechanics

Status: Planned

- [ ] Implement enemy eating, deterministic collision order, mass/speed/decay.
- [ ] Implement split, eject, sibling separation/merge, viruses, and spawn budgets.
- [ ] Add death/respawn UI and exactly-once life finalization.
- [ ] Cover mechanic boundaries, cell caps, ties, mass sources/sinks with tests.
- [ ] Playtest constants from [GAME_DESIGN.md](GAME_DESIGN.md) and record changes.

**Definition of done:** a four-player desktop session exercises every mechanic;
seeded intent replays reproduce outcomes; conservation tests account for declared
sources/sinks; no unbounded spawning or duplicate life result occurs.

## Phase 3 — robust netcode

Status: Planned

- [ ] Finish server-derived culling, multipart atomic snapshots, and time estimation.
- [ ] Add backpressure, frame/queue caps, quotas, heartbeat/close policies.
- [ ] Add secure ticket consumption and rotating 30-second body resume.
- [ ] Implement normal/low-bandwidth settings and visible reconnect state.
- [ ] Test latency, slow readers, reconnect races, sequence wrap, and hostile frames.

**Definition of done:** at 150 ms RTT with jitter and brief network drops, clients
resume the same edible body without duplicated actions; stale snapshot parts
cannot corrupt state; slow clients have bounded memory; measured traffic fits
the target workload or documented bandwidth decisions are revised. This prepares
for mobile networks but does not deliver mobile controls.

## Phase 4 — meta features

Status: Planned

- [ ] Implement migrations/repository/DB worker and idempotent final results.
- [ ] Implement Argon2id registration, opaque sessions, CSRF, logout revocation.
- [ ] Add planned player [API.md](API.md) endpoints and response schemas.
- [ ] Add public best-mass leaderboard and private own-match history.
- [ ] Establish account deletion/retention procedure and decide verification/recovery.
- [ ] Test authorization, uniqueness, session expiry, SQL injection, restore.

**Definition of done:** account flow and ranked results survive a restart;
replayed result jobs do not change counts/scores; users cannot read another user's
history; CSRF/Origin tests pass; backup restore recovers accounts and rankings.
Guest play remains usable without registration.

## ACP A — control server and process manager (after phase 4)

Status: Planned

- [ ] Add control server, typed IPC, managed DB ownership and public registry router.
- [ ] Implement fixed-entrypoint spawn, generation IDs, READY/health and metrics.
- [ ] Implement guarded stop/restart, admission/heap/RSS policy and shutdown.
- [ ] Test spawn failure, stale generation, uncertain ACK and no orphan processes.

**Definition of done:** control starts/stops two fixture game processes, reports
per-child CPU/RSS/player/tick metrics, withdraws unhealthy routes, and rejects
arbitrary executable/port input. Worker limits are not presented as hard quotas.
This follows persistence/auth boundaries from phase 4 and feeds phase-5 scaling.

## ACP B — auth and server list (after ACP A)

Status: Planned

- [ ] Implement admin/admin-session/audit migration, provisioning procedure and roles.
- [ ] Add separate admin origin, IP allowlist, CSRF/session/ticket handling.
- [ ] Scaffold React/Vite ACP; add login, server list/detail and audited stop/restart.
- [ ] Test player credentials denied, role enforcement, logout and audit outage.

**Definition of done:** allowlisted operator logs in and sees accurate/stale-marked
server metrics; viewer cannot mutate; unauthorized REST/WS calls fail; lifecycle
UI reports acknowledged outcome rather than transport success.

## ACP C — presets and Create server (after ACP B)

Status: Planned

- [ ] Add versioned server_presets and shared config validation/default mapping.
- [ ] Add preset forms, save/version endpoints and explicit create-from-version.
- [ ] Propagate tick/world config through WELCOME and instance mechanics.
- [ ] Add guarded live config updates and custom-preset unranked policy.
- [ ] Test bounds/population cap, version conflicts, failed starts and resource refusal.

**Definition of done:** saved valid preset starts exactly one managed arena;
invalid form never allocates a process; editing preset cannot change a running
server; restart/config semantics and negotiation pass 15/30/60 Hz tests.

## ACP D — user management (after ACP C)

Status: Planned

- [ ] Add user search/retained stats/active tuple lookup and ban persistence.
- [ ] Add role-filtered kick, ban, mute, live rename, kill, set-mass and notices.
- [ ] Resolve guest-ban/mute scope before claiming those operations complete.
- [ ] Test ban admission races, stale player/generation, audits and unranked lives.

**Definition of done:** authorized mutations apply once at a tick boundary,
disabled actions are denied server-side, bans survive restart, and manipulated
lives cannot enter leaderboards. No chat subsystem is implicitly introduced.

## Phase 5 — scale and polish

Status: Planned

- [ ] Build non-root node:24 image, TLS/WSS Nginx, health and private monitoring.
- [ ] Profile/load-test 64 players per arena with realistic distributions.
- [ ] Tune spatial hash, snapshot allocation, admission/backpressure thresholds.
- [ ] Move to Postgres before multi-host writes; shared routing/tickets/quotas.
- [ ] Add multiple arenas/processes, bounded worker queues, durable result outbox.
- [ ] Test graceful drain, worker crash, database outage, migration/restore runbook.
- [ ] Complete desktop UX/accessibility and security review.

**Definition of done:** published load report meets tick p95 <20 ms/p99 <30 ms at
the agreed hardware/player target; no memory growth in a one-hour soak; valid TLS,
WSS routing and recovery pass; result durability survives process loss; monitored
deployment and restore are rehearsed. No unsupported capacity claims.

## ACP E — live spectator delta feed (after ACP D and phase 5)

Status: Planned

- [ ] Implement separate admin WS authentication, regional snapshot and delta codec.
- [ ] Add zoom LOD, viewport incremental resync, interpolation and backpressure.
- [ ] Extract shared Canvas renderer; add React spectator wrapper and player menu.
- [ ] Add follow, command pending/results, role checks and safe admin notices.
- [ ] Measure whole-map overview and detailed-pan bandwidth/tick cost.
- [ ] Test rapid viewport/LOD changes, dependency gaps, stale generation and slow readers.

**Definition of done:** whole-server navigation works without continuous full-world
snapshots; unchanged overlap survives panning; exact player targets remain safe
at low zoom; 5–10 Hz deltas interpolate with bounded memory; commands are audited
and acknowledged; measured observer load stays inside the phase-5 budget.
Mobile phase 6 remains player-focused, not a mobile ACP commitment.

## Phase 6 — mobile support

Status: Planned

- [ ] Implement touch adapter, multi-touch buttons, safe-area responsive HUD.
- [ ] Add DPR/render tiers, battery/background handling, visible resume consent.
- [ ] Validate low-bandwidth mode on real flaky cellular networks.
- [ ] Execute [MOBILE.md](MOBILE.md#device-test-checklist) on real devices.
- [ ] Decide optional PWA; if approved, implement safe static-only offline cache.
- [ ] Publish a concrete supported device/browser matrix and known limitations.

**Definition of done:** listed iOS/Android devices pass simultaneous-touch,
rotation, keyboard, IP-change, hidden-tab expiry, and 20-minute thermal/battery
tests; both desktop and mobile use the same intent/protocol/simulation; no rewrite
or mobile-only authority fork; no offline ranked gameplay.

## Suggested first week

Status: Planned

| Day | Focus | End-of-day evidence |
| --- | --- | --- |
| 1 | Approve defaults; scaffold root/Vite, scripts/config, Node 24 checks | Clean install, lint, first `node:test`, client build |
| 2 | Seeded arena, formulas, fixed-step scheduler, spatial hash | Movement/bounds/food unit tests; tick timing sample |
| 3 | Shared binary codecs, ticket/WS lifecycle, intent validation | Golden byte fixtures; two clients connect safely |
| 4 | Canvas, input adapters, camera, full snapshots/interpolation | Two-tab playthrough and resize demo |
| 5 | Integrate eating/death slice; measure, document gaps, review | Reproducible smoke run, baseline metrics, next-week backlog |

This is a sequencing guide, not a promise to complete all phases in a week.
Finish each day's safety tests before adding the next slice.

## Review checkpoints and decisions

Status: Planned

At each phase gate update Status lines, tests, constants, and relevant diagrams
together. Require a protocol-version change for incompatible layouts, migrations
for persisted-schema changes, and measured evidence before replacing transport.
Track unresolved decisions in [README.md](README.md#open-decisions); avoid parallel
conflicting decision lists. Record accepted choices in
[ARCHITECTURE.md](ARCHITECTURE.md#decisions-short-adrs).
