# Security and abuse prevention

Status: Planned

## Threat model

Status: Planned

Assume an attacker controls a browser, scripts HTTP/WS traffic, modifies client
code, fabricates timestamps, disconnects deliberately, and coordinates accounts.
TLS protects transit, not honesty. Trust the deployed gateway, arena worker, DB,
and secret store, but minimize privileges between them.

| Threat | Planned control | Residual risk |
| --- | --- | --- |
| Speed/mass/score cheats | Accept intent only; server applies mechanics/results | Bots can still optimize legitimate inputs |
| Map scraping | Server-derived view and spatial culling | Visible state can always be inspected |
| Replay/action floods | Sequence checks, quotas, server cooldowns | Distributed floods require upstream protection |
| CSRF / cross-site WebSocket hijack | Exact Origin allowlist, CSRF, one-use tickets | XSS can act as the user |
| XSS/name injection | `textContent`/Canvas text, never `innerHTML`; CSP | Third-party scripts remain dangerous |
| Credential stuffing | Argon2id, per-IP/account quotas, generic login errors | Distributed attackers and account enumeration |
| SQL injection / IDOR | Bound SQL, ownership checks on every result read | Operator access still requires auditing |
| Resource exhaustion | Frame/body/queue caps, culling, bounded spawn loops | Saturated links need provider-level DDoS controls |
| Secret theft | HttpOnly sessions, hashed secrets at rest, log redaction | Compromised server can still access live sessions |

## Authentication and session design

Status: Planned

Use `argon2` with **Argon2id**, independent random 16-byte salts, 65,536 KiB memory,
time cost 3, parallelism 1, 32-byte hash output, encoded PHC strings. Benchmark
on deployment hardware, target 100–300 ms, and never silently weaken parameters.
Use the package's async hash/verify, at most two concurrent auth jobs per process
and queue at most 20; excess → 503. Dummy-hash verification for unknown accounts
reduces timing disclosure. Rehash after successful login when parameters change.

Generate 32 random bytes per session with `node:crypto.randomBytes`, base64url
encode (43 characters), and persist only SHA-256 hex digests (64 characters).
High-entropy random tokens do not need password hashing. Sessions expire after
seven days absolute, with no sliding refresh initially. Rotate on login, revoke
the presented old session, and invalidate on logout/password change. Check
expiry/revocation at HTTP access and WS resume; live sockets recheck at least
every 60 seconds and close immediately on local logout notification.

Production cookie:
`__Host-agar_session; Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain.
Set Max-Age to remaining session lifetime. Use only HTTPS; `agar_session_dev`
without Secure is permitted solely on explicit localhost development origins.
Never store session/resume tokens in localStorage or expose session tokens to JS.

Generate a separate 32-byte CSRF token on session creation. Persist only its
SHA-256 digest; return its raw value in login/register JSON. `GET /auth/me`
rotates and returns a new CSRF token for reload recovery; require same-origin
Fetch Metadata (or explicit allowed Origin for non-browser clients) on this GET
to prevent cross-site rotation. Multiple tabs may need to refetch after rotation;
retry a rejected unsafe request only after obtaining a new token, never blindly.
Use constant-time digest comparison and reject malformed lengths first.

For all unsafe HTTP requests, require an exact configured Origin match, JSON
content type, and (if session-bearing) `X-CSRF-Token`. Do not allow wildcard CORS
with credentials; initially emit no cross-origin allow headers. Reject missing/
`null` Origin on browser play/auth operations, including WS upgrades. Allow only
`agar.v1`, known arena paths, valid tickets, and session consistency during HELLO.
Anonymous tickets remain Origin-checked, one-use, short-lived bearer secrets.

JWT is an **alternative, not the baseline**. If later adopted, specify algorithm
allowlist, issuer/audience, short access TTL, key rotation, refresh reuse detection,
revocation, and browser storage policy in a separate ADR before implementation.
Do not replace opaque session checks with unverified JWT payload decoding.

## Authoritative input validation

Status: Planned

HTTP schemas are defined by [API.md](API.md); exact binary limits by
[NETWORKING.md](NETWORKING.md). Decode bounded messages before allocating arrays.
Reject unknown opcodes, NaN/infinity, nonzero reserved bits, invalid lengths or
versions, and impossible field combinations. Enforce direction/magnitude, cell
caps, eligibility, and cooldowns even after valid decoding.

Never accept a client-supplied position, mass, result, damage event, simulation
step duration, or arbitrary camera center. No admin opcodes share the public
socket. These are **player** authority rules; authorized ACP mutations follow
the separate role-checked/audited dispatcher below.
Generate IDs/names/colors server-side or validate names identically to
HTTP display names. Do not execute user-provided JS or load user-selected files.
Use serial ownership checks so concurrent resume attempts cannot duplicate a body.

Apply limits before expensive password work and before simulation allocation.
Client-supplied forwarded IP headers are not trusted; accept them only from the
explicit reverse-proxy address/CIDR configured in `TRUST_PROXY`.

## Rate and resource limits

Status: Planned

Use monotonic token buckets. IP grouping alone is insufficient (NATs/mobile
networks share IPs); combine IP/session/account dimensions without putting raw
identifiers in metric labels.

| Surface | Proposed budget / policy |
| --- | --- |
| Global HTTP | 120 requests/minute/IP, burst 30 |
| Register | 5/hour/IP, burst 2 |
| Login | 10/minute/IP, burst 5; 5/minute/canonical email, burst 5 |
| Public leaderboard | 30/minute/IP, burst 10; 5-second cache |
| Play tickets | 10/minute/IP, burst 5; 6/minute/session or guest, burst 3 |
| WS upgrades | 10/minute/IP, burst 5; ≤20 active sockets/IP |
| Pending HELLO | ≤5/IP, 5-second timeout, no arena slot yet |
| Active player | One socket per live player; 64 arena lives including grace |
| INPUT/PING/SETTINGS | Per-message and byte limits in NETWORKING.md |
| DB operations | Query timeouts, bounded worker queues, no arbitrary SQL API |
| Password work | 2 concurrent/process, 20 queued; reject overflow |

Return 429 + `Retry-After` for HTTP rate limits. Use temporary throttling rather
than permanent email lockout (which enables denial of service). Shared deployments
need atomic shared limits; per-process limits alone multiply with replicas.
Log repeated malformed behavior as sampled counters, not every hostile payload.

## Application and operational hardening

Status: Planned

Proposed production headers: CSP
`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss://game.example.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
and HSTS after HTTPS is verified. Replace the example WSS hostname with the
deployment's exact public hostname. Development Vite/HMR needs a separate local
policy, never `unsafe-eval` or wildcard origins in production.

Static serving must resolve paths under `client/dist`, reject traversal, set MIME
types, and never expose repository files, `.env`, SQLite files, migrations, or
source maps with sensitive metadata. Use hashed assets with immutable cache
headers; HTML is revalidated. No external analytics/scripts initially.

Run containers as non-root; keep DB volumes private; use secrets mounted/injected
by the platform. Redact Cookie, Set-Cookie, Authorization, X-CSRF-Token,
password/email request fields, tickets, and resume tokens. Prefer route name,
request ID, and sampled outcome logs. Never log entire HELLO or auth bodies.
Keep IP abuse data short-lived (proposed 24 hours) and limit operator access.

Review lockfile changes with `npm audit` and upstream advisories; test updates,
especially native addons. Pin deployed images by digest after validation while
retaining the `node:24` lineage; rebuild for security patches. No exposed Node
inspector, DB port, or metrics endpoint on the public network.

## Security acceptance tests

Status: Planned

Use `node:test`: malformed/truncated/fuzzed frames, endian/length bounds, action
replays, infinite/NaN floats, ownership violations, SQL metacharacters, CSRF and
Origin failures, expired/reused tickets, concurrent resumes, logout invalidation,
rate-limit exhaustion, and hostile names. Confirm no credentials in logs and no
unbounded allocation on hostile inputs. Load-test login work and WS backpressure
separately from normal gameplay. See [DEVELOPMENT.md](DEVELOPMENT.md).

## Admin access and permissions

Status: Planned

Admin identities/password hashes/sessions are separate tables and cookies from
players. No player token grants admin access, no public admin registration, and
no client-controlled role. Proposed permission matrix (server-enforced for REST,
WS, and rechecked before IPC dispatch):

| Planned operation | viewer | moderator | operator |
| --- | --- | --- | --- |
| Login, server/preset reads, scoped spectator/follow | Yes | Yes | Yes |
| Search users/stats, inspect/revoke bans | No | Yes | Yes |
| Kick, ban, mute, live rename, message | No | Yes | Yes |
| Kill, set mass | No | No | Yes |
| Create/save presets, spawn, stop/restart, live config | No | No | Yes |
| Audit log / other admins' command status | No | No | Yes |
| Own command status | Yes | Yes | Yes |

Apply deny-by-default, including target generation/identity checks. Follow only
needs spectator permission; it never grants user details or mutating authority.
Viewer clicks may follow but not open privileged user data. Provision initial
admins through a restricted operator procedure, never default credentials;
provisioning/recovery design remains open in ADMIN.md. Use the existing Argon2id
parameters and bounded password-work queue for admin credentials.

Require TLS on a separate `admin.example.com` origin and `ADMIN_IP_ALLOWLIST`
(CIDRs, empty means deny all). Check it at reverse proxy and control server,
including static ACP, auth, REST, and WS. Validate source IP using only explicitly
trusted proxy hops; never let X-Forwarded-For bypass it. Local development allows
loopback only. Game children have no admin listener and cannot dispatch admin
commands through a player message.

Admin cookie `__Host-agar_admin`: Secure, HttpOnly, SameSite=Strict, Path=/, no
Domain. Absolute lifetime 8 hours, no sliding renewal; 256-bit opaque token stored
as SHA-256 hash in admin_sessions. Local development uses `agar_admin_dev`, never
accepted in production. Separate admin CSRF token returned/rotated by admin
login/me, with the same same-origin GET and digest comparison rules as player
sessions; require it plus exact admin Origin for unsafe REST requests.

Use CSRF-protected `POST /admin/api/v1/auth/ws-tickets` to authorize WS AUTH:
one-use 256-bit ticket, 30 s expiry, bound to admin session. Admin session is
required at upgrade, AUTH and each command; role/disable/expiry rechecks at most
60 s apart for streaming, immediate revocation notification on logout/role change.
No token in URLs, localStorage, logs, or forwarded game IPC. React role-dependent
controls are usability, not authorization.

## Admin audit, process safety, and limits

Status: Planned

Audit successful/failed logins, access denials, preset changes, lifecycle/config,
player mutations, and spectator session start/end (not every pan or tick). The
[audit schema](DATABASE.md#admin-schema-and-auditing) distinguishes pending,
applied, rejected, unknown; write audit intent before mutation dispatch and record
acknowledged outcome. No public audit writer/delete API. Do not log passwords,
session/WS tickets, CSRF tokens, or message text; reasons may contain operator
information, so bound them and restrict access/retention. Auth attempts can fail
closed if auditing is unavailable; do not permit unaudited mutations.

Ban registered user UUIDs, enforce across all owned processes and at join/resume.
Guest-ban scope and mute communication/duration remain open; do not invent IP
bans or player chat. Message/rename text is rendered safely; admin message cannot
carry HTML/JS. Admin kill/mass and live gameplay changes mark lives unranked.

Use fixed entrypoints, allowlisted variables/actions, bounded typed IPC, and
generation/idempotency checks. Do not execute arbitrary shell commands, accept
process arguments from the form, or mount an unrestricted Docker socket into the
web-facing control server. Resource/admission limits come from deployment policy
not preset fields. Reject invalid world/population/rate values before process
allocation. Restart/stop require confirmation/reason in the ACP; server checks
permission regardless of UI confirmation.

| Planned admin limit | Starting policy |
| --- | --- |
| Login | 5/min/IP + canonical admin identity, burst 3; global auth work bound remains |
| Reads | 120/min/admin, burst 20 |
| Mutation dispatch | 30/min/admin, burst 5 |
| Lifecycle (create/stop/restart) | 6/min/operator, burst 2 |
| WS tickets | 6/min/admin, burst 2 |
| Spectator sessions | Two/admin, one server subscription/socket |
| Viewport updates | 10/s/socket, burst 5; coalesce newest |
| WS player commands | Same 30/min/admin mutation bucket as REST; never separate allowances |
| IPC | ≤100 queued control messages/game, ≤1 MiB each; smaller spectator batch caps |

Combine IP and authenticated identity limits. Return 429 with Retry-After; WS uses
the admin rate/error policy in NETWORKING.md. Clamp view/zoom/LOD and cap entity/
frame assembly allocations. Prevent whole-world high-frequency dumps via zoom
and 5–10 Hz policy; isolate observer workload from simulation tick budget.
Admin-only CSP uses React bundled scripts and self-hosted assets with the admin
WSS origin, no inline/eval code; game CSP stays separate.

Acceptance tests: player cookie on admin REST/WS denied; viewer mutation denied;
forged forwarded IP denied; invalid preset cannot spawn; stale generation cannot
kill a replacement process; audited idempotent command cannot double-apply;
audit outage blocks dispatch; logout closes feed; malicious text cannot execute;
slow spectator cannot drop delta dependencies or grow memory without bound.
