# open-agar.io — project blueprint

Status: Planned

This is a greenfield design, not a playable release. The repository originally
contained only a title in the root README. No server, client, database, scripts,
tests, or infrastructure are implemented. All features, endpoints, dependencies,
commands, configuration examples, and application paths in this documentation are
**Planned**, including paths shown without repeating that label. Documentation
files exist as specifications; their Status lines track implementation readiness,
not whether the prose has been written.

## Vision and scope

Status: Planned

A fast, readable multiplayer survival game: steer a cell, eat food and smaller
players, split to attack, and survive long enough to climb a leaderboard. All
application backend code runs in Node.js; no second backend language or web
framework outside the Node.js ecosystem is proposed. Nginx and SQL databases are
infrastructure, not alternative application backends.

| Planned feature | Initial scope |
| --- | --- |
| Public arenas | Anonymous play; 64 players per arena as a starting target |
| Authoritative mechanics | Server movement, eating, split, eject, viruses, merging |
| Desktop controls | Pointer steering; keyboard actions; Canvas rendering |
| Accounts | Optional registration, cookie sessions, personal match history |
| Competition | Public all-time leaderboard based on server-recorded peak mass |
| Operations | One region first, observable tick budget, graceful deployments |
| Admin Control Panel | Separate React ACP; presets/process lifecycle, user moderation, audited spectator actions |
| Mobile | **Phase 6**, touch controls and optional PWA; no initial mobile promise |

No player-to-player chat, paid items, teams, trading, cross-arena migration, or offline simulation
is in the initial scope.
Admin notices are not chat; mute semantics remain an [ACP open decision](ADMIN.md#open-acp-decisions).

## Proposed stack and platforms

Status: Planned

| Layer | Proposed choice | Reason |
| --- | --- | --- |
| Runtime | Node.js 24 LTS; `engines.node: ">=24"` | One runtime, native ESM, test runner, workers |
| Simulation/transport | Plain JavaScript + `ws` 8 | Fixed preset tick rate, 30 Hz default |
| HTTP/API | Fastify 5 | JSON Schema validation and structured logging |
| Persistence | `node:sqlite` initially; `pg` 8/Postgres later | Low setup cost, explicit migration boundary |
| Player browser | Vanilla JS, HTML5 Canvas, Vite 8 | Input adapters isolate devices |
| ACP browser | React + Vite; shared imperative Canvas | Forms/menus in React, viewport deltas and LOD for live map |
| Control backend | Node.js control API/process manager, private IPC | Separate admin auth; spawns managed game processes |
| Auth | `argon2` package + opaque cookie sessions | Password hashing and revocable sessions |
| Optional scale | Redis | Shared quotas/tickets/presence, not simulation authority |

Desktop target: current and previous major Chrome, Firefox, Edge, and Safari on
Windows/macOS/Linux where available. Mobile Safari and Android Chrome are later
targets. Touch emulation alone will not qualify mobile support.

Exact proposed package versions, official sources, Node.js 24 caveats, setup
commands, and the folder tree live in [DEVELOPMENT.md](DEVELOPMENT.md).
Planned top-level structure is `/server`, `/client`, `/shared`, `/db`, `/docs`,
plus `/admin` for the ACP and `/control` for its backend. Player and admin
protocols/authentication stay separate; see [ADMIN.md](ADMIN.md).

## Planned quick start

Status: Planned

**Not runnable against this documentation-only repository.** First follow
[setup from scratch](DEVELOPMENT.md#setup-from-scratch), then implement the named
entry points/configuration. Once those files exist:

```sh
npm ci
npm run db:migrate
```

Run in two terminals:

```sh
npm run dev:server
```

```sh
npm run dev:client
```

Open `http://localhost:5173`; Vite will proxy `/api` and `/ws` to
`http://127.0.0.1:3000`. For production-style local verification:

```sh
npm run build
npm start
```

Open `http://localhost:3000`. The production server must serve `client/dist`;
`vite preview` is not the production server.

## Documentation map

Status: Planned

| Blueprint | Owns |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, tick loop, data flow, decisions |
| [GAME_DESIGN.md](GAME_DESIGN.md) | Mechanics, formulas, tunable gameplay constants |
| [NETWORKING.md](NETWORKING.md) | Binary wire contract, lifecycle, bandwidth |
| [API.md](API.md) | HTTP contracts and error responses |
| [DATABASE.md](DATABASE.md) | SQL schema, indexes, persistence |
| [SECURITY.md](SECURITY.md) | Threats, validation, sessions, abuse controls |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker, Nginx/WSS routing, scaling, monitoring |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Scaffolding, versions, scripts, testing |
| [MOBILE.md](MOBILE.md) | Later touch, responsive layout, power/network behavior |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Dependency-ordered chunks, from desktop MVP through mobile |
| [ROADMAP.md](ROADMAP.md) | Phases, acceptance gates, first-week tasks |
| [ADMIN.md](ADMIN.md) | ACP pages, roles, create-server variables and spectator UI |

## Maintaining the blueprint

Status: Planned

Every section starts with `Status: Planned`, `Status: In progress`, or
`Status: Done`. Change status only when implementation and acceptance tests
justify it. Mixed sections should gain per-row status instead of declaring an
entire feature complete. Keep protocol versions and schema migrations explicit;
update the owning document and its examples in the same implementation PR.
Roadmap checkboxes indicate delivered functionality, not documentation progress.

## Open decisions

Status: Planned

1. Confirm `ws` versus uWebSockets.js after profiling; `ws` is the baseline.
2. Confirm Fastify versus Express; Fastify is the baseline.
3. Accept experimental `node:sqlite` for the prototype, or select a maintained
   SQLite binding before implementation?
4. Confirm opaque sessions rather than JWTs; avoid implementing both initially.
5. Set hosting region, player target, art/name policy, and whether results should
   become public beyond the leaderboard.
6. Approve gameplay values and bandwidth targets through playtests, not by
   treating proposed numbers as measured capacity.
7. ACP-specific open decisions are owned by [ADMIN.md](ADMIN.md#open-acp-decisions).
