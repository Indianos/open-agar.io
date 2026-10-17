# Deployment and operations

Status: Planned

## Initial topology and release artifacts

Status: Planned

One host, one Node.js service, one SQLite volume, one public Nginx TLS endpoint.
Static assets and API share an origin; Nginx forwards WSS to the same service.
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
COPY shared ./shared
RUN npm run build && npm prune --omit=dev

FROM node:24
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node db/migrations ./db/migrations
RUN mkdir -p /app/db/data && chown node:node /app/db/data
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
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
  -v agar-data:/app/db/data open-agar:planned node server/db/migrate.js
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
