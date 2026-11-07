# Admin Control Panel (ACP)

Status: Planned

## Scope and pages

Status: Planned

The ACP is a separate React/Vite application in `admin/`, not a replacement for
the vanilla player client. A plain Canvas component reuses the game's
browser-safe renderer and geometry; React renders forms, tables, and menus, not
entities. The Node.js control server in `control/` owns admin authentication,
auditing, presets, process lifecycle, and the separate spectator feed.
Nothing is implemented yet.

| Planned page | Features | Owning contract |
| --- | --- | --- |
| Login | Separate admin credentials, role-aware session, logout | [SECURITY.md](SECURITY.md#admin-access-and-permissions) |
| Servers | All managed servers; status, player count, tick time, CPU/RAM; stop/restart | [ARCHITECTURE.md](ARCHITECTURE.md#control-server-and-ipc) |
| Create server / presets | Validate variables, save preset, then launch from saved version | Variables below; [API.md](API.md#admin-rest-api) |
| Users | Search registered users, stats, active connections; ban, mute, kick | [API.md](API.md#admin-rest-api) |
| Spectator | Whole-server navigation with regional delta feed; player actions | [NETWORKING.md](NETWORKING.md#admin-spectator-protocol-v1) |
| Audit log / bans | Filter action outcomes; inspect/revoke bans | [DATABASE.md](DATABASE.md#admin-schema-and-auditing) |

“All servers” means all instances registered with this control server, not
discovery of arbitrary hosts. CPU is process CPU utilization (100% = one core),
RAM is RSS, tick time is p95 compute milliseconds over the latest 5 seconds,
player count includes reconnect-grace bodies, and stale metrics show their age.

## Roles and player actions

Status: Planned

Proposed roles are `viewer`, `moderator`, and `operator`; the exact permission
matrix is owned by [SECURITY.md](SECURITY.md#admin-access-and-permissions).
Hide unavailable controls in the UI, but always enforce permissions server-side.
There is no player-account-to-admin promotion or public admin registration.

| Planned action | Target and behavior |
| --- | --- |
| Kick | One live player; remove body, invalidate tickets/resume, close socket |
| Ban | Registered user across servers; persist ban and kick current connections |
| Mute | Live player only; session-scoped flag; no player chat is introduced |
| Rename | Live display name only; validate like player names; not account identity |
| Kill | Remove all target cells; end life, with no automatic respawn |
| Set mass | Set total owned mass; distribute equally across existing cells within cell bounds |
| Follow | Camera centers on selected live player; still sends bounded viewport updates |
| Message | Deliver one bounded admin notice, not bidirectional chat |

Commands target `(serverId, generation, playerId)`, never a render aggregate ID.
Registered user UUID is resolved by the control server for bans/stats; guest bans
are an open decision, with API rejection as the safe interim proposal rather than
an invented guest/IP identity policy. Follow is local camera state, not a
destructive IPC command.
Mute records intended moderation state but cannot suppress nonexistent chat:
its communication scope must be decided before that feature is marked Done.
Admin notices require the separate player notification extension described in
[NETWORKING.md](NETWORKING.md#player-admin-notices); player sockets never accept
admin commands.

Kick/kill finalize a life as `left`; a life touched by mass/kill/kick/ban or runtime
gameplay changes is unranked, avoiding manipulated leaderboard entries. Custom
presets differing from default gameplay values are unranked pending a comparability
decision. Details
remain available in history. Rename/mute/message do not alter mechanics.
Set-mass accepts `[ownedCellCount * MIN_CELL_MASS,
ownedCellCount * MAX_CELL_MASS]`, recalculates radii/bounds at the next tick, and
requires `expectedCellCount` from the authenticated live-player detail endpoint.
It fails if the player has died or its cell count changed before execution.

## Create-server variables

Status: Planned

Planned `shared/server-config.js` owns the schema, mapping, and cross-field
validation. `shared/constants.js` retains defaults; each instance gets an
immutable validated config derived from its preset, not mutable global constants.
Only these form fields are exposed initially. All other gameplay constants remain
the [existing defaults](GAME_DESIGN.md#tunable-constants-starting-proposal).

| API/form name | Type | Allowed range | Default | Mapping / application |
| --- | --- | --- | --- | --- |
| `name` | string | 1..64 trimmed Unicode code points, no controls | `Default` | Preset label, not a process/host name |
| `worldSize` | integer WU | 4000..24000 | 12000 | `WORLD_SIZE`; restart required |
| `foodTarget` | integer | 100..3000 | 2000 | `FOOD_TARGET`; restart required |
| `foodRefillRate` | number /s | 0..200 | 100 | `FOOD_REFILL_RATE`; live at tick boundary |
| `maxPlayers` | integer | 2..128 | 64 | `MAX_PLAYERS`; live admission limit |
| `baseSpeed` | number WU/s | 35..300 | 220 | `BASE_SPEED`; live at tick boundary |
| `tickHz` | integer enum | 15, 30, 60 | 30 | Fixed `dt = 1/tickHz`; restart required |

Reject unknown properties, NaN/infinity, wrong units, and oversized JSON.
`maxPlayers` cannot be lowered below current live/grace count; `baseSpeed` remains
clamped by unchanged min/max speed. Maximum arena population remains below the
player protocol's 6,000-entity cap (128×16 + 3000 + 500 + 30 = 5,578).
Food/viruses must fit spawn geometry; bounded spawning can still reject joins.

Save first → receive preset ID/version → submit create-server request referencing
that exact version. Saving a preset alone never starts or changes a process.
Editing a preset increments its version; running servers retain their copied
configuration. Initial server IDs are assigned by the manager (`arena-<number>`,
≤32 ASCII characters), not supplied as executable names, ports, or paths.

Runtime configuration commands accept only `foodRefillRate`, `baseSpeed`, and
`maxPlayers`, with expected config revision. Other changes require explicit
restart with a saved preset version; no automatic restart on save. A restart ends
lives and rotates instance generation; it is not in-place world migration.
Server resource limits are deployment policy, not editable gameplay variables.

## Spectator interaction

Status: Planned

Start with “fit map”: the viewport spans the whole configured world at low LOD.
Pan/zoom changes the reported world-space rectangle and pixels-per-WU zoom;
the server clamps it to the world and applies the LOD/bandwidth policy in
[NETWORKING.md](NETWORKING.md#admin-spectator-protocol-v1). Zoom in for exact food
and cells. Retain unchanged entities when panning; render only after complete
revision batches. Interpolate at 100–200 ms delay for 10/5 Hz respectively.

Click a player cell to open a role-filtered menu: kick, ban, rename, kill, set
mass, follow, message. Mute is also available through the user/active-player
panel. Aggregated food is never actionable. Resolve player/account identity via
the authenticated API, not by exposing emails in the spectator stream.
Show target generation, confirmation/reason for mutations, pending command ID,
and final acknowledged outcome; never imply success just because IPC was sent.
If generation changes or player disappears, close the menu and stop follow.

## React structure and renderer reuse

Status: Planned

```text
admin/src/
├── main.jsx
├── App.jsx
├── pages/LoginPage.jsx
├── pages/ServersPage.jsx
├── pages/CreateServerPage.jsx
├── pages/UsersPage.jsx
├── pages/SpectatorPage.jsx
├── pages/AuditPage.jsx
├── pages/BansPage.jsx
├── components/SpectatorCanvas.jsx
├── components/PlayerActionsMenu.jsx
├── components/ServerVariablesForm.jsx
├── net/admin-connection.js
└── state/spectator-store.js
```

`SpectatorCanvas` attaches the Canvas renderer with a ref/effect; clean up sockets,
listeners, and animation frames on unmount and React development effect re-runs.
Delta state lives in a bounded non-React store; only selection, connection status,
and coarse metrics enter React state. Draw imperatively through
`shared/render/canvas.js`, extracted from planned `client/src/render/canvas.js`;
the player wrapper retains its camera/input policy. Admin aggregate records
adapt to the renderer; they do not change the player simulation.
Use React's built-in state/effects first; routing/state-library choices stay open.

## Open ACP decisions

Status: Planned

- Approve proposed role matrix, preset ranges, and unranked-intervention policy.
- Decide guest-ban identity/scope and mute duration/communication semantics.
- Decide initial admin provisioning and password recovery procedure; no public registration.
- Confirm child-process deployment versus separate per-game containers for hard limits.
- Agree audit retention/access policy and measured spectator bandwidth targets.
- Approve the bounded selected-player follow-position channel; it reveals no
  unrelated entities outside the requested viewport.
- Define preset leaderboard comparability before ranking any custom-rule arenas.
