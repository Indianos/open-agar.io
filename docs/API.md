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
  "endReason": "eaten"
}
```

There is **no public POST result endpoint**. Only the simulation writes results.
`endReason` is `eaten`, `disconnect_expired`, or `left`. Results are eventually
visible after the DB worker commits; LIFE_ENDED may precede an HTTP read.
Guest results are persisted for aggregate operations but not publicly retrievable
or retroactively attached to accounts. Aborted/crashed lives have no ranked result.

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
