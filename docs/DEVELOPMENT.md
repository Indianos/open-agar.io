# Development guide

Status: Planned

## Scope and verified runtime baseline

Status: Planned

These are implementation instructions, **not commands that work against the
current documentation-only repository**. All application/config/test files below
are planned. Use a current patched **Node.js 24 LTS**; keep the requested
`"engines": {"node": ">=24"}` and test/deploy on 24. A permissive engines range
does not promise that every future Node major has been tested.

Official references checked for this blueprint on 2026-10-17:

| Capability | Node.js 24-specific guidance and official source |
| --- | --- |
| LTS | [Release schedule](https://nodejs.org/en/about/previous-releases) lists 24 as LTS; use the latest patched 24.x, not 24.0.0 in production |
| ESM | Set `type: "module"`; use explicit `.js` extensions and `node:` built-in imports |
| Tests | [`node:test`](https://nodejs.org/docs/v24.0.0/api/test.html) is stable; `node --test` needs no external runner |
| Development reload | [`--watch`](https://nodejs.org/docs/v24.0.0/api/cli.html#--watch) is stable; do not use platform-specific `--watch-path` on Linux |
| Environment | [`--env-file`](https://nodejs.org/docs/v24.0.0/api/cli.html#--env-fileconfig) exists in 24.0.0; experimental there, stable from 24.10.0; process environment wins over file |
| SQLite | [`node:sqlite` at 24.0.0](https://nodejs.org/docs/v24.0.0/api/sqlite.html) needs no `--experimental-sqlite` flag, but is experimental; [24.15.0 history](https://github.com/nodejs/node/blob/v24.15.0/doc/api/sqlite.md) advances it to release candidate, not stable |
| Threads | [`worker_threads`](https://nodejs.org/docs/v24.0.0/api/worker_threads.html) is stable; isolate CPU simulation and synchronous SQLite, not ordinary async HTTP I/O |
| Web APIs | [`fetch` and global WebSocket](https://nodejs.org/docs/v24.0.0/api/globals.html) are stable clients; global WebSocket does not implement a WS server |
| Argon2 | [`crypto.argon2`](https://nodejs.org/docs/v24.7.0/api/crypto.html#cryptoargon2algorithm-parameters-callback) starts at 24.7.0; do not rely on it when allowing 24.0.0. Use the password-oriented `argon2` package |
| Deprecations | [Node 24 deprecations](https://nodejs.org/docs/v24.0.0/api/deprecations.html): use `Buffer.from`/`Buffer.alloc`, never legacy `Buffer()`/`new Buffer()`; no legacy `url.parse()` for new code |

Do not suppress experimental warnings globally or add obsolete enabling flags.
Keep the SQLite maturity decision explicit. Use `DatabaseSync` methods documented
in 24.0.0, rather than assuming APIs added in later 24.x patches exist.

## Proposed dependency snapshot

Status: Planned

These exact versions were checked in published metadata and official source
manifests; they are a reproducible starting proposal, not a claim of perpetual
security or latest versions. Recheck advisories when implementing and commit the
generated root lockfile. No dependencies are installed by this documentation PR.

| Package | Proposed exact version | Official source / compatibility |
| --- | --- | --- |
| `fastify` | 5.12.7 | [Manifest](https://github.com/fastify/fastify/blob/v5.12.7/package.json), [LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md); v5 supports Node 24 |
| `ws` | 8.22.0 | [Manifest](https://github.com/websockets/ws/blob/8.22.0/package.json), [usage](https://github.com/websockets/ws#usage-examples); browser uses native WebSocket |
| `argon2` | 0.45.1 | [Manifest](https://github.com/ranisalt/node-argon2/blob/v0.45.1/package.json), [install/prebuilds](https://github.com/ranisalt/node-argon2#prebuilt-binaries); native addon, test target platform |
| `vite` | 8.3.4 | [Manifest](https://github.com/vitejs/vite/blob/v8.3.4/packages/vite/package.json); Node `^20.19.0 \|\| >=22.12.0` includes 24 |
| `create-vite` | 9.2.1 | [Vanilla template](https://github.com/vitejs/vite/tree/create-vite%409.2.1/packages/create-vite/template-vanilla); scaffolds Vite 8, tool version need not equal Vite major |
| `eslint` / `@eslint/js` | 10.13.0 / 10.0.1 | [ESLint](https://github.com/eslint/eslint/blob/v10.13.0/package.json), [JS config](https://github.com/eslint/eslint/blob/v10.13.0/packages/js/package.json); compatible v10 peer range |
| `prettier` | 3.9.10 | [Manifest](https://github.com/prettier/prettier/blob/3.9.10/package.json) |
| `pg` (later only) | 8.23.1 | [Manifest](https://github.com/brianc/node-postgres/blob/pg%408.23.1/packages/pg/package.json); not installed for SQLite prototype |

Fastify 5 requires full JSON schemas including `type`:
[v5 migration guide](https://github.com/fastify/fastify/blob/main/docs/Guides/Migration-Guide-V5.md).
ESLint 10 requires flat config, not `.eslintrc`:
[v10 migration guide](https://github.com/eslint/eslint/blob/v10.13.0/docs/src/use/migrate-to-10.0.0.md).
Do not copy old Vite internals: Vite 8 uses Rolldown/Oxc
([migration guide](https://github.com/vitejs/vite/blob/v8.3.4/docs/guide/migration.md)).

## Setup from scratch

Status: Planned

Prerequisites: Git, Node.js 24 with its bundled npm, and optionally Docker.
Examples use a POSIX shell (WSL on Windows) and the project root as working
directory. `node --version` must report `v24.x`.

If starting outside this repository, first create and enter a new directory:

```sh
mkdir open-agar.io
cd open-agar.io
git init
```

If already in this cloned repository, **skip those three commands**. In either
case, perform the following only once during phase 1:

```sh
node --version
npm --version
npm init -y
npm pkg set name=open-agar.io type=module
npm pkg set private=true --json
npm pkg set 'engines.node=>=24'
mkdir -p server/http server/net server/sim server/db server/tests \
  shared db/migrations db/data docs deploy
npm create --yes vite@9.2.1 client -- --template vanilla --no-interactive --no-immediate
rm client/package.json
mkdir -p client/src/input client/src/net client/src/render
npm install --save-exact fastify@5.12.7 ws@8.22.0 argon2@0.45.1
npm install --save-dev --save-exact vite@8.3.4 eslint@10.13.0 \
  @eslint/js@10.0.1 prettier@3.9.10
```

The [create-vite CLI flags](https://github.com/vitejs/vite/blob/create-vite%409.2.1/packages/create-vite/src/index.ts)
disable prompts and automatic installation/startup; npm's `--yes` separately
accepts downloading the initializer.
`rm client/package.json` removes **only the fresh scaffold's manifest** so there
is one root dependency graph/lockfile. Do not run it against an independently
developed client project. Do not run `npm install` inside `client`. Keep the
scaffold's `index.html`, `src/main.js`, CSS, and public assets as the starting UI;
replace demo content as the Canvas client is written.

Merge the following scripts and fields into the generated root `package.json`
(remove `npm init`'s placeholder test script). The resulting minimal manifest is:

```json
{
  "name": "open-agar.io",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {"node": ">=24"},
  "scripts": {
    "dev:server": "node --env-file=.env --watch server/index.js",
    "dev:client": "vite --config client/vite.config.js",
    "build": "vite build --config client/vite.config.js",
    "start": "node server/index.js",
    "db:migrate": "node --env-file-if-exists=.env server/db/migrate.js",
    "test": "node --test",
    "test:watch": "node --test --watch",
    "lint": "eslint server shared client/src client/vite.config.js",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "argon2": "0.45.1",
    "fastify": "5.12.7",
    "ws": "8.22.0"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.13.0",
    "prettier": "3.9.10",
    "vite": "8.3.4"
  }
}
```

Run `npm install` once after merging the manifest so the lockfile matches.
Thereafter use `npm ci` on clean installs/CI. No `nodemon`, `dotenv`, external test
runner, backend transpiler, or workspace configuration is required.

### Planned folder tree

Status: Planned

Every application path below is planned; `docs/` contains the blueprint files
listed in [README.md](README.md). Tests are colocated except integration tests.

```text
open-agar.io/
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── .prettierignore
├── eslint.config.js
├── Dockerfile
├── .dockerignore
├── server/
│   ├── index.js
│   ├── config.js
│   ├── http/routes.js
│   ├── net/gateway.js
│   ├── sim/arena.js
│   ├── sim/arena.test.js
│   ├── sim/worker.js
│   ├── db/worker.js
│   ├── db/repository.js
│   ├── db/migrate.js
│   └── tests/http.test.js
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── public/
│   └── src/
│       ├── main.js
│       ├── style.css
│       ├── input/controller.js
│       ├── input/pointer.js
│       ├── input/keyboard.js
│       ├── input/touch.js          (phase 6)
│       ├── net/connection.js
│       └── render/canvas.js
├── shared/
│   ├── constants.js
│   ├── protocol.js
│   └── protocol.test.js
├── db/
│   ├── migrations/001_initial.sql
│   └── data/                      (ignored runtime files)
├── deploy/nginx.conf
└── docs/                          (eleven blueprint documents)
```

### Planned local configuration

Status: Planned

Create `.env.example` from the development defaults in
[DEPLOYMENT.md](DEPLOYMENT.md#environment-contract); a minimal local version is:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
SQLITE_PATH=db/data/agar.sqlite
ARENA_ID=local-1
LOG_LEVEL=info
```

Then `cp .env.example .env`. `.env` is required by `dev:server`; production
`start` deliberately relies on injected environment. `db:migrate` optionally
loads `.env`; do not ship that file inside the image.

Create planned `client/vite.config.js`:

```js
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true, changeOrigin: false }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
```

Vite resolves `shared/` imports from the root project; keep them browser-safe.
Preserve the browser Origin through the proxy so local checks match production.
Production `server/index.js` serves `client/dist` with safe static routing and
hosts HTTP and WSS upgrades on port 3000. Unknown `/api` or `/ws` paths return
errors, not the HTML fallback.

Proposed `.gitignore`:

```gitignore
node_modules/
client/dist/
db/data/
coverage/
*.log
.env
.env.*
!.env.example
*.cpuprofile
*.heapprofile
```

Planned `.prettierignore` should contain `node_modules/`, `client/dist/`,
`db/data/`, `coverage/`, and `package-lock.json` on separate lines.

## Conventions, linting, and workflow

Status: Planned

Use ESM, explicit imports, camelCase values, PascalCase classes, UPPER_SNAKE_CASE
constants, named exports for shared utilities, and JSDoc for public boundaries.
Simulation functions receive `dt`, clock, and seeded PRNG; avoid global time/random.
Do not import server code into the client. Use seconds in mechanics, milliseconds
for wall clocks, explicit suffixes at boundaries.

Start planned `eslint.config.js` with this flat config, adding browser globals
only when actually used (never disable `no-undef` globally):

```js
import js from '@eslint/js';

export default [
  { ignores: ['client/dist/**', 'coverage/**', 'db/data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module' }
  },
  {
    files: ['client/src/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', WebSocket: 'readonly', fetch: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        performance: 'readonly', ResizeObserver: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        devicePixelRatio: 'readonly', URL: 'readonly'
      }
    }
  }
];
```

Import Node globals explicitly (`node:process`, `node:buffer`, `node:timers`,
`node:perf_hooks`, etc.) in server modules. Keep shared code limited to standard
ECMAScript built-ins such as DataView; inject time/network behavior.
Use Prettier for formatting and ESLint for correctness, not competing style rules.
No backend language besides JavaScript is planned.

Small feature branches and PRs: update owning docs/status, add focused tests, run
targeted checks first, then full checks once complete. Commit root lockfile, never
runtime data, secrets, or build output. Inspect `git diff --check`, test output,
and changed-file list before review.

## Testing strategy

Status: Planned

No tests/test tooling currently exist; add tests alongside implementation rather
than tests that merely assert that documentation contains words.

| Level | Planned coverage / method |
| --- | --- |
| Pure unit | `node:test` + `node:assert/strict`; geometry, formula boundaries, split/merge conservation |
| Deterministic simulation | Seeded PRNG/clock; fixed intent replay, collision tie-breaks, no duplicate results |
| Protocol | Golden byte fixtures, little-endian roundtrips, malformed/count/size/NaN limits |
| HTTP | Fastify `inject()`; schemas, cookies, CSRF, ownership, quotas; no listening port required |
| Storage | Temporary SQLite database via `node:os.tmpdir()`; migrate twice, checksums, rollback, indexes, result retries |
| Worker integration | Real worker lifecycle, bounded queues, crash/shutdown and result acknowledgment |
| WS integration | `ws` client, ephemeral local port; handshake, replay, partial snapshots, resume races |
| Browser/manual | Two tabs eat/split/eject; resize, DPR, hidden-tab reset, slow network, reconnect |
| Load/performance | Planned `server/tests/load.js`; seeded bot clients, capped duration, reports outside source tree |

Once these files exist, run focused tests, then completion checks:

```sh
node --test shared/protocol.test.js
node --test server/sim/arena.test.js
node --test server/tests/http.test.js
npm run lint
npm run format:check
npm test
npm run build
git diff --check
```

CI should later run those checks on Node.js 24 and build the Docker image; no CI
workflow is delivered by this design-only task. Never treat a zero-test run as
feature validation. This documentation PR is checked for links, parseable
examples, path/script consistency, and design coherence, not a nonexistent build.

## Profiling and debugging

Status: Planned

Start by recording tick histograms, entity counts, outbound bytes, and memory;
profile a realistic load before choosing a new transport or serialization scheme.
After entry points exist, with environment injected:

```sh
node --cpu-prof --cpu-prof-dir=/tmp server/index.js
node --heap-prof --heap-prof-dir=/tmp server/index.js
node --inspect=127.0.0.1:9229 server/index.js
```

Profiles are per isolate: capture simulation/DB worker profiles as well as the
gateway when needed; configure worker startup options explicitly. Inspect via
local DevTools, never expose inspector ports publicly. Use
`performance.mark/measure`, event-loop delay, allocation sampling, and a spatial
hash occupancy histogram. Check O(n²) collision hotspots and excess snapshot
allocation before micro-optimizing math. Profiles may contain user data; keep
them private, out of Git, and delete after analysis.
