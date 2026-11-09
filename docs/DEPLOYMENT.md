# Deployment and operations

Status: Planned

## Initial topology and release artifacts

Status: Planned

One host, one Node.js service, one SQLite volume, one public Nginx TLS endpoint.
Static assets and API share an origin; Nginx forwards WSS to the same service.
This remains the pre-ACP prototype topology. The ACP extension and changes to
these release examples are specified in [ACP deployment](#acp-deployment-and-process-limits);
do not run the standalone and managed listeners on port 3000 simultaneously.
No infrastructure files currently exist. Planned files:
`Dockerfile`, `.dockerignore`, `deploy/nginx.conf`, `.env.example`.
The examples below become runnable only after
[DEVELOPMENT.md](DEVELOPMENT.md) entry points are implemented.

### Proposed Dockerfile

Status: Planned

Use the required `node:24` base (Debian, not Alpine). Native `argon2` may use
prebuilt binaries; permit source builds in the builder if the target platform
needs them. Compiler/Python tooling is build-only, not an application backend.

```dockerfile
FROM node:24 AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY tsconfig.json tsconfig.build.json ./
RUN npm run build && npm prune --omit=dev

FROM node:24
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --chown=node:node package.json package-lock.json ./
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node db/migrations ./db/migrations
RUN mkdir -p /app/db/data && chown node:node /app/db/data
USER node
EXPOSE 3000
CMD ["node", "build/server/index.js"]
```

Planned `.dockerignore`:

```text
.git
.env
.env.*
!.env.example
node_modules
client/node_modules
client/dist
db/data
coverage
*.log
```

Build/test on the same architecture and Node.js 24 patch as production. Publish a
validated immutable image digest; `node:24` is a moving base, not reproducibility
by itself. Docker uses its own `--env-file` parser: production env files should
contain only plain `KEY=value` entries, not shell code.

### Planned single-host commands

Status: Planned

After implementation, from the project root:

```sh
docker build -t open-agar:planned .
docker volume create agar-data
docker run --rm --user root -v agar-data:/data \
  --entrypoint sh open-agar:planned -c 'chown node:node /data'
docker run --rm --env-file .env.production \
  -v agar-data:/app/db/data open-agar:planned node build/server/db/migrate.js
docker run -d --name agar --restart unless-stopped --init \
  --stop-timeout 40 --env-file .env.production \
  -p 127.0.0.1:3000:3000 -v agar-data:/app/db/data open-agar:planned
```

Provision `.env.production` via the deployment secret mechanism, exclude it from
Git/build context, and set production Origin/host settings below. The short root
volume-initialization job is administrative; the app and migrator run as `node`.
Nginx runs on the host in this example, reaches loopback port 3000, and owns
certificates. Never expose that port directly to the internet.

## Nginx TLS and sticky WebSockets

Status: Planned

Planned `deploy/nginx.conf` is included inside Nginx's `http` context. Replace the
example hostname/certificate paths. Provision valid certificates and renewal
before exposing traffic. One upstream is intentional for the SQLite prototype:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream agar_local_1 {
    ip_hash;
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name game.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name game.example.com;
    ssl_certificate /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 16k;

    location = /ws/local-1 {
        proxy_pass http://agar_local_1;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://agar_local_1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

An upgraded connection stays on one upstream for its lifetime. `ip_hash` provides
basic reconnect stickiness but **is not sufficient for mobile IP changes or
multi-arena ownership**. At scale route each allowlisted `/ws/<arenaId>` to its
specific owner, with at most one active owner per arena. Do not simply add arena
processes to this upstream. Ticket issuance must resolve that same owner through
a shared routing/ticket service, with atomic ticket consumption. Never interpolate
an unchecked user arena ID into an upstream hostname. Keep the old owner until
drained; there is no live state migration in v1.

Official references:
[Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html),
[ip_hash](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#ip_hash),
[Node Docker images](https://github.com/nodejs/docker-node).

## Environment contract

Status: Planned

Config is parsed/validated once on startup; invalid values fail startup rather
than silently falling back. Secrets are not proposed sample values.

| Planned variable | Development default | Production requirement |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `HOST` | `127.0.0.1` | `0.0.0.0` inside container |
| `PORT` | `3000` | Private upstream port |
| `PUBLIC_ORIGIN` | `http://localhost:5173` | Exact public HTTPS origin |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Exact comma-separated HTTPS origins |
| `TRUST_PROXY` | empty (false) | `loopback` for host Nginx; explicit CIDR otherwise |
| `SQLITE_PATH` | `db/data/agar.sqlite` | `/app/db/data/agar.sqlite` |
| `DATABASE_URL` | unset | Later Postgres secret URL; overrides SQLite |
| `REDIS_URL` | unset | Optional later secret URL; not required initially |
| `ARENA_ID` | `local-1` | Unique configured routing ID |
| `LOG_LEVEL` | `info` | `info`; redact credentials |
| `METRICS_HOST` | `127.0.0.1` | Private monitoring bind only |
| `METRICS_PORT` | `9090` | Unpublished/private port |

No JWT/signing secret is needed for the proposed opaque sessions. Generate
session/ticket entropy from `node:crypto`, never environment-derived predictable
values. Load local `.env` only through the development script; container settings
come from the orchestrator. `PUBLIC_ORIGIN` configures canonical URLs/CSP;
`ALLOWED_ORIGINS` controls access.

## Scaling and shutdown

Status: Planned

1. Prototype: one process, simulation worker, DB worker. Limit worker counts by
   CPU budget and measure IPC serialization cost.
2. Add one simulation worker per arena; gateway owns sockets, workers own state.
   Transfer immutable snapshots or bounded typed buffers, not full mutable worlds.
3. Multiple Node processes/containers spread arenas across cores/hosts. Migrate
   persistence to Postgres first; coordinate routing/tickets/quotas (optionally
   Redis). Do not assume workers share heap/session maps or round-robin sockets.
4. Scale from measured active players, tick p99, queue depth, and bytes/s;
   geographic regions are separate arenas, not a shared cross-region tick.

On SIGTERM: fail readiness, reject fresh joins, send restart notice/close 1012,
stop advancing after finalizing active lives with reason `left`, and flush result
jobs within 30 seconds. Close HTTP, sockets, DB, and workers. Deployment stop
timeout is 40 seconds; alert on flush failure. Production rolling deployments
should drain admissions and let lives finish before shutdown, with a configured
maximum maintenance window; no crash-resume guarantee exists.

## Monitoring, capacity, and recovery

Status: Planned

Expose internal metrics separately from public health. Use
`node:perf_hooks.monitorEventLoopDelay()` and built-in process memory/CPU data;
start with JSON logs/internal JSON metrics before choosing an exporter dependency.

| Metric | Proposed alert / gate |
| --- | --- |
| Tick compute p95/p99 | p95 ≥20 ms or p99 ≥30 ms for 5 min |
| Event-loop delay p99 | >50 ms for 5 min |
| Dropped catch-up time | Any sustained growth |
| Outbound bytes/buffer depth | Mode downgrade counts and persistent soft-limit breaches |
| HTTP errors / WS failures | >1% server errors over 5 min with meaningful traffic |
| DB/outbox | Any failed writes, >100 queued results, or no progress for 30 s |
| Memory | >80% container limit or steady post-GC growth |
| Readiness | Fails if required DB/arena worker is unhealthy or draining |

No user IDs, IPs, or tickets in metric labels. Baseline target is 64 players/arena,
not a capacity guarantee. Load-test bots with realistic spatial distribution,
split/eject storms, slow clients, packet loss, and auth traffic. Keep run reports.
Validate Nginx config with `nginx -t`, test WSS idle >75 seconds with heartbeats,
and test reconnect after a mobile IP change before claiming scale readiness.
Backups/restores and migration rollback planning follow [DATABASE.md](DATABASE.md).

## ACP deployment and process limits

Status: Planned

For the initial ACP on one host, run the control server plus forked game children
inside a `node:24` container. The control server owns two separate listeners:
public game routing/static files and private admin API/ACP/WS. The manager uses
only a fixed child entry point and configured private port pool. No public
process-management endpoint and no arbitrary upstream address is accepted.

| Planned listener/path | Local port / route | Production exposure |
| --- | --- | --- |
| Player Vite | 5173 | Development only |
| ACP Vite | 5174; `/admin/` base | Development only |
| Public game front door | 3000; `/api/v1`, `/ws/<arenaId>`, player assets | `game.example.com:443` via Nginx |
| Control/admin | 3001; `/admin/`, `/admin/api/v1`, `/admin/ws` | `admin.example.com:443`, IP allowlist + admin auth |
| Game children | Allocated 3100..3199, loopback in container | Never published |

In managed mode, planned `control/router.ts` routes public game requests/WS by
validated registry IDs to private child ports. `/api/v1/play/tickets` routes to
the requested `arenaId`, which is exactly the registry `serverId` at this public
boundary (including bootstrap `local-1` and managed `arena-<number>` IDs).
The existing player field/path names remain `arenaId`, not a second ID namespace.
Play-ticket requests route to that `arenaId`'s ready server; shared account/history/
static requests use the configured default ready arena instead.
Missing default readiness returns 503, not an
admin fallback. Control routing has no admin privileges on its public listener.
Bootstrap `local-1` from the default config to retain the existing quick start;
additional IDs are manager-assigned. Publish a route only after READY, withdraw
it before stop, and propagate existing player Origin/heartbeat behavior.
Nginx's game upstream remains loopback 3000, but now reaches this registry router
rather than a single arena. Do not edit/reload Nginx for every Create-server form.

### Planned Docker extension

Status: Planned

Once ACP entrypoints/scripts exist, extend the existing Dockerfile rather than
adding another backend stack:

- Add `COPY admin ./admin` before `npm run build`; `build` then produces both
  `client/dist` and `admin/dist`.
- In runtime, copy `control/` and `admin/dist` (chown node:node), retain `server/`,
  `shared/`, DB migrations and production dependencies.
- Expose `3000 3001`; change CMD to `["node", "build/control/index.js"]`.
- Keep `node:24` builder/runtime, non-root user, `--init`, graceful stop, and DB
  volume. Add `admin/node_modules` and `admin/dist` to `.dockerignore`.
  The nested node_modules entry is defensive against accidental installs, not a
  recommendation to create a second dependency graph.
- Replace the single-host run's published ports with
  `-p 127.0.0.1:3000:3000 -p 127.0.0.1:3001:3001` and add
  `--cpus=2 --memory=2g --pids-limit=128`. These cap the **entire container**,
  not each forked child. Migrate 001/002 once before control startup.

Proposed per-game process policy: one CPU-core workload budget, V8 old heap
384 MiB (`fork` execArgv `--max-old-space-size=384`), RSS soft limit 512 MiB,
5-second health timeout, and at most two game children by default in the sample
2-core/2-GiB container. Reserve memory/CPU for control, DB, and IPC. Enforce host
admission first; heap limits alone do not include native/buffer allocations.
If RSS exceeds policy for 5 consecutive samples, withdraw admission, mark failed,
and stop the process gracefully/forcefully using the lifecycle deadline. Sustained
CPU/tick overload stops admissions and alerts; do not claim a hard CPU quota.
Resource configuration is operator environment policy, never a preset override.

**Independent hard limits require one container per game** (or operator-managed
cgroups). Proposed isolated-game launch policy is `--cpus=1 --memory=512m
--pids-limit=64 --init` per `node:24` game container, with a separate control
container and private network/routes. Native fork IPC cannot cross container
boundaries: a trusted local launcher must broker the same validated IPC envelopes
over an authenticated private channel. Its mechanism/credentials are an open
deployment decision, not a working feature of the initial fork design.
Never mount an unrestricted Docker socket into the web-facing control container.
Do not pretend worker_threads `resourceLimits` caps CPU, ArrayBuffers, or RSS.

### Planned admin Nginx extension

Status: Planned

Add an admin upstream/listener block in the same `http` context; retain the
existing Upgrade map. Replace the example allow CIDR with the approved network.
Use a separate certificate and explicit exact Origin checks in control:

```nginx
upstream agar_control {
    server 127.0.0.1:3001;
}
server {
    listen 443 ssl;
    server_name admin.example.com;
    ssl_certificate /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    allow 192.0.2.0/24; # Documentation-only CIDR; replace before deployment.
    deny all;
    client_max_body_size 16k;

    location = /admin/ws {
        proxy_pass http://agar_control;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
    }
    location /admin/ {
        proxy_pass http://agar_control;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { return 404; }
}
```

Player-origin `/admin/*` routes must be rejected, not proxied to port 3001. Admin
API/WS routes are checked before SPA fallback; admin assets never include secrets.
On a host-proxy/container deployment, configure `TRUST_PROXY` with the actual
Docker bridge/proxy source CIDR if it is not loopback. Verify spoofed forwarded
headers and denial from outside the allowlist before exposing ACP.

### Planned control environment and telemetry

Status: Planned

| Variable | Development default | Rule |
| --- | --- | --- |
| `CONTROL_HOST` | `127.0.0.1` | `0.0.0.0` only inside private container binding |
| `CONTROL_PORT` | `3001` | Separate from public PORT=3000 |
| `ADMIN_PUBLIC_ORIGIN` | `http://localhost:5174` | Production exact `https://admin.example.com` |
| `ADMIN_ALLOWED_ORIGINS` | `http://localhost:5174,http://localhost:3001` | Production admin origin only |
| `ADMIN_IP_ALLOWLIST` | `127.0.0.1/32,::1/128` | Production explicit operator CIDRs; empty denies all |
| `GAME_PORT_START`, `GAME_PORT_END` | `3100`, `3199` | Private pool; reject overlaps/reserved ports |
| `MAX_GAME_PROCESSES` | `2` | Admission/resource cap, not player count |
| `GAME_HEAP_MB`, `GAME_RSS_MB` | `384`, `512` | Heap cap/RSS watchdog; no claimed hard isolation |

Manager assigns child ARENA_ID/PORT/config/generation, passes only child-required
environment, and keeps admin session/config secrets out of game processes.
Control hosts the shared DB worker; game health reports process CPU via
`process.cpuUsage()` interval divided by elapsed microseconds, RSS via
`process.memoryUsage().rss` (includes workers), and arena tick p95. Sampling is
1 Hz; snapshots/spectator send are separate 5–10 Hz workloads. Do not use the
control process's CPU/RSS as game metrics; workers share process RSS and cannot
provide independent per-game memory metrics in worker-only mode.

Control shutdown stops admissions/routes, stops all children with the existing
40-second deadline, flushes audits/results, and exits; orphan processes close on
IPC disconnect. New control startup reconciles pending audit commands as unknown,
does not blindly rerun starts/mutations, and boots only its configured default
arena. Registry persistence/host recovery beyond this remains an open decision.
At alternate tick rates use p95 <0.6×tick interval and p99 <0.9×interval as initial
load gates; existing 20/30 ms targets describe only 30 Hz.

Official verification:
[Node 24 fork/IPC](https://nodejs.org/docs/v24.0.0/api/child_process.html#child_processforkmodulepath-args-options),
[send acknowledgment semantics](https://nodejs.org/docs/v24.0.0/api/child_process.html#subprocesssendmessage-sendhandle-options-callback),
[worker resourceLimits](https://nodejs.org/docs/v24.0.0/api/worker_threads.html#new-workerfilename-options),
[process metrics](https://nodejs.org/docs/v24.0.0/api/process.html#processmemoryusage),
[Docker CPU/memory constraints](https://docs.docker.com/engine/containers/resource_constraints/).
