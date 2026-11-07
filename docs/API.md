# REST API v1

Status: Planned

## Common contract

Status: Planned

Base path `/api/v1`, JSON over same-origin HTTPS. Every endpoint below is
**Planned**, not currently available. IDs are server-generated UUID strings;
timestamps are RFC 3339 UTC strings; mass is a finite number rounded to two
decimals on output only. No response includes password hashes, token hashes, or
email addresses belonging to other users.

Use full Fastify JSON Schemas for bodies, parameters, queries, and responses:
`additionalProperties: false`, explicit types/required fields, 16 KiB JSON body
limit, and bounded pagination. Unsupported content type → 415. Unsafe methods
require an allowed Origin and JSON content type; authenticated unsafe methods
also require `X-CSRF-Token` tied to the session. Session and CSRF policy is owned
by [SECURITY.md](SECURITY.md).

All errors follow:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request does not match the schema",
    "requestId": "b0ad0673-887b-49e0-bde2-f863c6581828"
  }
}
```

| HTTP | Planned codes | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `RESUME_EXPIRED` | Invalid input or no recoverable live player |
| 401 | `AUTH_REQUIRED`, `INVALID_CREDENTIALS` | Missing/revoked session or generic login failure |
| 403 | `CSRF_FAILED`, `ORIGIN_DENIED` | Unsafe request not authorized |
| 404 | `NOT_FOUND` | Unknown route or absent/non-owned result |
| 409 | `REGISTRATION_UNAVAILABLE` | Registration cannot use supplied identity |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | Body/content-type rejection |
| 429 | `RATE_LIMITED` | Include `Retry-After` seconds |
| 503 | `ARENA_BUSY`, `SERVICE_UNAVAILABLE` | No safe spawn/capacity or persistence unavailable |
| 500 | `INTERNAL_ERROR` | Generic failure; details only in redacted logs |

## Authentication endpoints

Status: Planned

| Method/path | Access | Success | Purpose |
| --- | --- | --- | --- |
| `POST /auth/register` | Public + Origin check | 201 | Create user, session, CSRF token |
| `POST /auth/login` | Public + Origin check | 200 | Rotate/create session |
| `GET /auth/me` | Session required | 200 | Restore user + CSRF token after reload |
| `POST /auth/logout` | Session + CSRF | 204 | Revoke session, tickets and live connection |

Register request:

```json
{"email":"player@example.com","displayName":"BlueCell","password":"example-only-not-a-real-password"}
```

Login request:

```json
{"email":"player@example.com","password":"example-only-not-a-real-password"}
```

Register/login/me response shape:

```json
{
  "user": {
    "id": "10bd7ea3-c691-48a4-8e87-a81596060774",
    "displayName": "BlueCell",
    "createdAt": "2026-10-17T12:00:00.000Z"
  },
  "csrfToken": "<runtime-generated-token>"
}
```

Register/login set
`Set-Cookie: __Host-agar_session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Lax`.
Logout takes `{}` and clears that cookie with the same attributes and `Max-Age=0`;
no response body. Local HTTP uses a distinctly named `agar_session_dev` cookie,
never allowed in production.

Email: ASCII, trimmed/lowercased canonical identity, ≤254 characters with basic
email syntax; no mailbox verification or password recovery in this initial
contract. Display name: 1..20 Unicode code points, trimmed/NFC, no control
characters. Password: 12..128 Unicode code points and ≤512 UTF-8 bytes; preserve
exact input (no normalization/truncation), never log. Login failure is generic,
including nonexistent accounts. Registration conflict uses a generic code but may
still permit identity enumeration; production must decide verification/recovery
and additional anti-abuse policy before account launch.

## Play-ticket endpoint

Status: Planned

`POST /play/tickets` — public or optional session, Origin check; session-bearing
requests require CSRF. Fresh request:

```json
{"arenaId":"local-1","mode":"normal"}
```

Reconnect request (both resume fields must be present together):

```json
{"arenaId":"local-1","mode":"low","playerId":42,"resumeToken":"<43-character-base64url-secret>"}
```

201 response:

```json
{
  "ticket": "<43-character-base64url-secret>",
  "expiresInSeconds": 30,
  "arenaId": "local-1",
  "wsPath": "/ws/local-1",
  "subprotocol": "agar.v1"
}
```

Only configured arena IDs are accepted (1..32 ASCII letters/digits/hyphens), never
arbitrary upstream addresses. For anonymous fresh play the ticket creates a
server-side guest identity; no public guest identifier is needed. On reconnect
the token and player ID recover that guest identity. For account lives, also
require the original still-valid session. Tickets reserve no spawn until HELLO;
capacity can change between issuance and consumption. Full arenas return 503;
invalid/expired resume returns 400 without revealing body state.

## Leaderboard endpoint

Status: Planned

`GET /leaderboard?limit=20&cursor=<opaque>` — public, read-only.
`limit`: default 20, range 1..100. Omit cursor on the first request. All-time only:
one entry per registered user, best persisted peak mass. Guests are excluded.
Order `bestMass DESC, userId ASC`; keyset cursor encodes these two fields and
version, validated and bounded to 256 bytes (it is not an auth token). Duplicate
ties have deterministic order; concurrent score updates can move entries between
pages, so pagination is not a historical snapshot.

200 example:

```json
{
  "items": [
    {"userId":"10bd7ea3-c691-48a4-8e87-a81596060774","displayName":"BlueCell","bestMass":942.25}
  ],
  "nextCursor": null
}
```

## Match-result endpoints

Status: Planned

| Method/path | Access | Success |
| --- | --- | --- |
| `GET /matches?limit=20&cursor=<opaque>` | Session; own results only | 200 |
| `GET /matches/:matchId` | Session; own result only | 200 |

List range is 1..100, default 20. Order `endedAt DESC, id DESC`; cursor encodes
those fields, maximum 256 bytes. List returns `{"items":[<result>],"nextCursor":null}`.
Detail returns:

```json
{
  "id": "dfc86735-052f-4af2-99be-3e47dbbe0ae3",
  "arenaId": "local-1",
  "startedAt": "2026-10-17T12:00:00.000Z",
  "endedAt": "2026-10-17T12:03:00.000Z",
  "durationTicks": 5400,
  "peakMass": 942.25,
  "cellsEaten": 7,
  "endReason": "eaten",
  "ranked": true
}
```

There is **no public POST result endpoint**. Only the simulation writes results.
`endReason` is `eaten`, `disconnect_expired`, or `left`. Results are eventually
visible after the DB worker commits; LIFE_ENDED may precede an HTTP read.
Guest results are persisted for aggregate operations but not publicly retrievable
or retroactively attached to accounts. Aborted/crashed lives have no ranked result.
With ACP, `ranked` is false for custom preset arenas or lives affected by the
interventions in ADMIN.md; leaderboard writes exclude them.

## Cache, health, and request examples

Status: Planned

Auth, tickets, match history, and errors: `Cache-Control: no-store`.
Public leaderboard may cache for 5 seconds without cookies/private fields.
Planned `GET /health/live` and `/health/ready` are outside `/api/v1`:
200 `{"status":"ok"}`; readiness returns 503 during drain, DB failure, or arena
failure. Health responses expose no internal topology.

After implementation, a local login flow would be:

```sh
curl -i -c /tmp/agar-cookies \
  -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  --data '{"email":"player@example.com","password":"example-only-not-a-real-password"}' \
  http://localhost:5173/api/v1/auth/login
```

Copy the returned CSRF value into the following placeholder (do not commit real
tokens); send requests through Vite to keep the browser origin consistent:

```sh
curl -b /tmp/agar-cookies \
  -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <returned-csrf-token>' \
  --data '{"arenaId":"local-1","mode":"normal"}' \
  http://localhost:5173/api/v1/play/tickets
```

Remove the temporary cookie file afterwards. Rate limits and authentication
failure policy are specified in [SECURITY.md](SECURITY.md).

## Admin REST API

Status: Planned

Separate origin/control listener, base `/admin/api/v1`; paths in the tables below
are relative to that base. Same JSON/error envelope, 16 KiB body cap, full schemas,
Origin/CSRF rules as above, but **separate admin session and permission checks**.
All responses `Cache-Control: no-store`; role matrix and quotas are in
[SECURITY.md](SECURITY.md#admin-access-and-permissions). Never expose these paths
through a player server or silently fall back to ACP HTML.

| Planned method/path | Required role | Success / request |
| --- | --- | --- |
| `POST /auth/login` | IP allowlisted, unauthenticated | 200; `{"email":"operator@example.com","password":"example-only-not-a-real-password"}` |
| `GET /auth/me` | Any admin | 200; admin identity/role and rotated CSRF token |
| `POST /auth/logout` | Any admin + CSRF | 204; `{}`, revoke session/tickets/WS |
| `POST /auth/ws-tickets` | Any admin + CSRF | 201; `{}`, one-use session-bound spectator ticket |
| `GET /servers` | Any admin | 200; registered servers and metrics |
| `GET /servers/:serverId` | Any admin | 200; server detail/config/revision |
| `POST /servers` | operator | 202; create from preset, idempotent command |
| `POST /servers/:serverId/stop` | operator | 202; commandId, generation, reason |
| `POST /servers/:serverId/restart` | operator | 202; commandId, generation, reason; optional presetId/presetVersion pair |
| `PATCH /servers/:serverId/config` | operator | 202; commandId, generation, expectedRevision, changes, reason |
| `GET /presets` | Any admin | 200; newest version of each preset |
| `GET /presets/:presetId?version=1` | Any admin | 200; exact version (latest if omitted) |
| `POST /presets` | operator | 201; name, variables, reason |
| `PUT /presets/:presetId` | operator | 201; expectedVersion, name, variables, reason; append new immutable version |
| `GET /users?q=Blue&limit=20&cursor=...` | moderator/operator | 200; registered user search |
| `GET /users/:userId` | moderator/operator | 200; stats and active player targets |
| `POST /servers/:serverId/players/:playerId/actions` | moderator/operator, action-specific | 202; same command fields as admin WS |
| `POST /bans` | moderator/operator | 201; userId, expiresAt or null, reason, commandId |
| `GET /bans?userId=...&active=true` | moderator/operator | 200; paginated bans |
| `DELETE /bans/:banId` | moderator/operator | 200; reason, commandId; revoke record, not erase history |
| `GET /audit-log?actorId=...&serverId=...&status=...` | operator | 200; paginated sanitized audit entries |
| `GET /commands/:commandId` | Issuing admin or operator | 200; pending/applied/rejected/unknown |

All list endpoints return `{"items":[],"nextCursor":null}`; `limit` 1..100,
default 20, cursor ≤256 bytes. Servers sort by server ID, presets by ID, users by
UUID after normalized display-name substring search (`q` 1..64 code points;
escape LIKE wildcards and bind params). Audit/bans sort by `(createdAt,id) DESC`.
Email lookup is an exact normalized query, not exposed in the public player API.
No admin registration/role-edit/delete-user endpoints are introduced.

Admin login/me response:

```json
{
  "admin": {"id":"513b6c9e-a7f9-447c-8adb-82dd15676ec4","role":"operator"},
  "csrfToken":"<runtime-generated-admin-csrf-token>"
}
```

Login sets `__Host-agar_admin` (Secure, HttpOnly, SameSite=Strict, Path=/, no Domain)
on the admin origin, never the player cookie. WS ticket response:

```json
{"ticket":"<43-character-base64url-secret>","expiresInSeconds":30,"wsPath":"/admin/ws","subprotocol":"agar.admin.v1"}
```

Preset create example (variables validated by the owning
[ADMIN.md table](ADMIN.md#create-server-variables)):

```json
{
  "name":"Default",
  "variables":{"worldSize":12000,"foodTarget":2000,"foodRefillRate":100,"maxPlayers":64,"baseSpeed":220,"tickHz":30},
  "reason":"Initial arena preset"
}
```

201 response includes `id`, `version: 1`, `name`, identical `variables`, and
`createdAt`. PUT includes `expectedVersion` and creates version+1 without changing
running servers. Launch request:

```json
{
  "commandId":"981ecba1-901f-4ac1-9ea4-e6fb18753865",
  "presetId":"8e43fe4a-1dd6-4f90-aa51-b0619531df73",
  "presetVersion":1,
  "reason":"Start a second arena"
}
```

202 response:

```json
{"commandId":"981ecba1-901f-4ac1-9ea4-e6fb18753865","status":"pending","serverId":"arena-2"}
```

Server detail example:

```json
{
  "serverId":"arena-2","generation":"4105e936-83db-44cc-b2fa-66bb7bbab8d1",
  "status":"running","presetId":"8e43fe4a-1dd6-4f90-aa51-b0619531df73",
  "presetVersion":1,"configRevision":1,
  "config":{"worldSize":12000,"foodTarget":2000,"foodRefillRate":100,"maxPlayers":64,"baseSpeed":220,"tickHz":30},
  "metrics":{"playerCount":12,"tickP95Ms":4.2,"cpuPercent":23.5,"rssBytes":134217728,"sampledAt":"2026-11-07T12:00:00.000Z"}
}
```

Unknown/stopped metrics are null, never fabricated zero usage. Stats response:

```json
{
  "user":{"id":"10bd7ea3-c691-48a4-8e87-a81596060774","displayName":"BlueCell"},
  "stats":{"retainedMatches":12,"bestRankedMass":942.25,"retainedDurationTicks":54000},
  "activePlayers":[{"serverId":"arena-2","generation":"4105e936-83db-44cc-b2fa-66bb7bbab8d1","playerId":42,"muted":false}]
}
```

Stats use persisted retained results/leaderboard plus current registry; do not
label retention-limited totals “lifetime.” Kick/mute of an account with several
connections targets each selected live tuple explicitly. Ban is account-wide.

Player action request:

```json
{
  "commandId":"be9f89a2-c077-4e99-a481-7573757ea07c",
  "generation":"4105e936-83db-44cc-b2fa-66bb7bbab8d1",
  "action":"set_mass",
  "args":{"totalMass":100,"reason":"Test a collision boundary"}
}
```

| Action | Required args besides `reason` | Permission |
| --- | --- | --- |
| `kick` | none | moderator/operator |
| `ban` | `expiresAt`: RFC3339 future UTC or null; resolve live account or reject guest | moderator/operator |
| `mute` | `enabled`: boolean; live-only state | moderator/operator |
| `rename` | `displayName`: existing name constraints | moderator/operator |
| `kill` | none | operator |
| `set_mass` | `totalMass`: finite bounded number per ADMIN.md | operator |
| `message` | `text`: ≤200 code points/512 UTF-8 bytes | moderator/operator |

All mutation reasons: 1..200 trimmed code points, ≤512 UTF-8 bytes, no controls.
Stop/restart uses generation; restart without preset fields reuses the original
copied preset config. PATCH changes only the live whitelist and marks affected
lives unranked. Ban commit returns 201 with ban ID and command status; enforcement
may still be pending on active processes. A failed kick does not revoke the ban.
Ban checks occur at join/resume and across live sessions; expired/revoked bans
permit new joins but never restore a kicked body.

Audit entry example:

```json
{"id":"be9f89a2-c077-4e99-a481-7573757ea07c","actorId":"513b6c9e-a7f9-447c-8adb-82dd15676ec4","action":"set_mass","serverId":"arena-2","target":"player:42","status":"applied","reason":"Test a collision boundary","appliedTick":120,"createdAt":"2026-11-07T12:00:00.000Z"}
```

Idempotency: command UUID scoped globally, bound to authenticated actor/action/
target/normalized args; same key and payload returns original status. Another
actor or altered payload cannot reuse it. Mutation requests audit pending before
dispatch; persistent command status supports polling after a socket closes.
Preset mutations are synchronous transactions and audited; launch waits for the
saved preset and host admission limits, not user-supplied executables/ports.

Additional admin errors in the same envelope:

| HTTP | Planned code | Meaning |
| --- | --- | --- |
| 403 | `ADMIN_FORBIDDEN`, `ADMIN_IP_DENIED` | Wrong role or network |
| 404 | `SERVER_NOT_FOUND`, `PLAYER_NOT_FOUND`, `PRESET_NOT_FOUND` | Missing registered target |
| 409 | `STALE_GENERATION`, `PRESET_VERSION_CONFLICT`, `CONFIG_REVISION_CONFLICT`, `COMMAND_CONFLICT`, `INVALID_SERVER_STATE` | Stale/conflicting mutation |
| 400 | `PRESET_INVALID`, `ACTION_INVALID`, `GUEST_BAN_UNSUPPORTED` | Unsupported variables/action target |
| 503 | `RESOURCE_LIMIT`, `AUDIT_UNAVAILABLE`, `IPC_UNAVAILABLE` | Admission/audit/dispatch cannot proceed |

Timeout after dispatch is command status `unknown`, **not** a retryable “failed”
mutation. Poll/reconcile before any new attempt.
