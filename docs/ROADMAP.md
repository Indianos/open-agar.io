# Implementation roadmap

Status: Planned

All work below is planned and unchecked because there is no implementation.
Documentation completion does not complete an implementation phase.
Sequence vertical slices so a developer can observe each mechanic end-to-end
before adding scale or account complexity.

## Phase 1 — desktop prototype

Status: Planned

- [ ] Resolve baseline library/SQLite decisions; scaffold [DEVELOPMENT.md](DEVELOPMENT.md).
- [ ] Add Node.js 24 scripts, root lockfile, config validation, lint/format checks.
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
- [ ] Add all planned [API.md](API.md) endpoints and response schemas.
- [ ] Add public best-mass leaderboard and private own-match history.
- [ ] Establish account deletion/retention procedure and decide verification/recovery.
- [ ] Test authorization, uniqueness, session expiry, SQL injection, restore.

**Definition of done:** account flow and ranked results survive a restart;
replayed result jobs do not change counts/scores; users cannot read another user's
history; CSRF/Origin tests pass; backup restore recovers accounts and rankings.
Guest play remains usable without registration.

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
