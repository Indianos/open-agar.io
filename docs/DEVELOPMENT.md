# Development guide

Status: In progress

## Scope and verified runtime baseline

Status: Planned

The initial Node project, TypeScript tooling, configuration, client shell, and
arena simulation are implemented; network play and most planned paths remain
unfinished. Use a current patched **Node.js 24 LTS**; keep the requested
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
security or latest versions. The root manifest and lockfile use these versions.
Recheck advisories when updating dependencies.

| Package | Proposed exact version | Official source / compatibility |
| --- | --- | --- |
| `fastify` | 5.12.7 | [Manifest](https://github.com/fastify/fastify/blob/v5.12.7/package.json), [LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md); v5 supports Node 24 |
| `ws` | 8.22.0 | [Manifest](https://github.com/websockets/ws/blob/8.22.0/package.json), [usage](https://github.com/websockets/ws#usage-examples); browser uses native WebSocket |
| `vite` | 8.3.4 | [Manifest](https://github.com/vitejs/vite/blob/v8.3.4/packages/vite/package.json); Node `^20.19.0 \|\| >=22.12.0` includes 24 |
| `typescript` | 5.9.3 | Strict type-checking and server compilation |
| `tsx` | 4.23.15 | TypeScript execution for development and Node's built-in test runner |
| `create-vite` | 9.2.1 | [Vanilla template](https://github.com/vitejs/vite/tree/create-vite%409.2.1/packages/create-vite/template-vanilla); scaffolds Vite 8, tool version need not equal Vite major |
| `eslint` / `@eslint/js` | 10.13.0 / 10.0.1 | [ESLint](https://github.com/eslint/eslint/blob/v10.13.0/package.json), [JS config](https://github.com/eslint/eslint/blob/v10.13.0/packages/js/package.json); compatible v10 peer range |
| `prettier` | 3.9.10 | [Manifest](https://github.com/prettier/prettier/blob/3.9.10/package.json) |
| `pg` (later only) | 8.23.1 | [Manifest](https://github.com/brianc/node-postgres/blob/pg%408.23.1/packages/pg/package.json); not installed for SQLite prototype |

Fastify 5 requires full JSON schemas including `type`:
[v5 migration guide](https://github.com/fastify/fastify/blob/main/docs/Guides/Migration-Guide-V5.md).
ESLint 10 requires flat config, not `.eslintrc`:
[v10 migration guide](https://github.com/eslint/eslint/blob/v10.13.0/docs/src/use/migrate-to-10.0.0.md).
The root manifest overrides ESLint's vulnerable `minimatch` dependency to
11.0.5; retain that override until upstream dependency ranges include a patched
version, and verify lint plus `npm audit` when updating.
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

If already in this cloned repository, **skip those three commands**. The initial
scaffold has been created here; the following is retained as a reference and
should only be used when creating a fresh project:

```sh
node --version
npm --version
npm init -y
npm pkg set name=open-agar.io type=module
npm pkg set private=true --json
npm pkg set 'engines.node=>=24'
mkdir -p server/http server/net server/sim server/db tests \
  shared db/migrations db/data docs deploy
npm create --yes vite@9.2.1 client -- --template vanilla --no-interactive --no-immediate
rm client/package.json
mv client/src/main.js client/src/main.ts
sed -i 's|/src/main.js|/src/main.ts|' client/index.html
mkdir -p client/src/input client/src/net client/src/render
npm install --save-exact fastify@5.12.7 ws@8.22.0
npm install --save-dev --save-exact vite@8.3.4 eslint@10.13.0 \
  @eslint/js@10.0.1 prettier@3.9.10 typescript@5.9.3 \
  typescript-eslint@8.72.1 tsx@4.23.15 @types/node@24.19.2 jiti@2.6.1
```

The [create-vite CLI flags](https://github.com/vitejs/vite/blob/create-vite%409.2.1/packages/create-vite/src/index.ts)
disable prompts and automatic installation/startup; npm's `--yes` separately
accepts downloading the initializer.
`rm client/package.json` removes **only the fresh scaffold's manifest** so there
is one root dependency graph/lockfile. Do not run it against an independently
developed client project. Do not run `npm install` inside `client`. Keep the
scaffold's `index.html`, CSS, and public assets as the starting UI; use
`src/main.ts` and `vite.config.ts` for TypeScript browser code/configuration.

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
    "dev:server": "node --env-file=.env --watch --import tsx server/index.ts",
    "dev:client": "vite --config client/vite.config.ts",
    "build": "npm run build:server && npm run build:client",
    "build:server": "tsc -p tsconfig.build.json",
    "build:client": "vite build --config client/vite.config.ts",
    "start": "node build/server/index.js",
    "test": "tsx --test tests/*.test.ts",
    "test:watch": "tsx --test --watch tests/*.test.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint server shared client/src client/vite.config.ts tests eslint.config.ts"
  },
  "dependencies": {
    "fastify": "5.12.7",
    "ws": "8.22.0"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.19.2",
    "eslint": "10.13.0",
    "jiti": "2.6.1",
    "prettier": "3.9.10",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "typescript-eslint": "8.72.1",
    "vite": "8.3.4"
  }
}
```

Run `npm install` once after merging the manifest so the lockfile matches.
Thereafter use `npm ci` on clean installs/CI. No `nodemon`, `dotenv`, external test
runner, backend transpiler, or workspace configuration is required.

### Planned folder tree

Status: Planned

The tree lists both implemented foundation files and planned follow-on paths;
`docs/` contains the blueprint files listed in [README.md](README.md). Keep all
tests in the top-level `/tests` directory, separate from application code.

```text
open-agar.io/
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── .prettierignore
├── eslint.config.ts
├── tsconfig.json
├── tsconfig.build.json
├── Dockerfile
├── .dockerignore
├── server/
│   ├── index.ts
│   ├── config.ts
│   ├── http/routes.ts
│   ├── net/gateway.ts
│   ├── sim/arena.ts
│   ├── sim/worker.ts
│   ├── db/worker.ts
│   ├── db/repository.ts
│   └── db/migrate.ts
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/
│   └── src/
│       ├── main.ts
│       ├── style.css
│       ├── input/controller.ts
│       ├── input/pointer.ts
│       ├── input/keyboard.ts
│       ├── input/touch.ts          (phase 6)
│       ├── net/connection.ts
│       └── render/canvas.ts
├── admin/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/                       (React pages/components listed in ADMIN.md)
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/SpectatorCanvas.tsx
│       ├── net/admin-connection.ts
│       └── state/spectator-store.ts
├── control/
│   ├── index.ts
│   ├── router.ts
│   ├── process-manager.ts
│   ├── ipc.ts
│   ├── http/routes.ts
│   └── net/spectator.ts
├── shared/
│   ├── constants.ts
│   ├── protocol.ts
│   ├── server-config.ts
│   ├── admin-protocol.ts
│   └── render/canvas.ts
├── tests/
│   ├── arena.test.ts
│   ├── config.test.ts
│   ├── random.test.ts
│   ├── http.test.ts
│   ├── protocol.test.ts
│   ├── admin.test.ts
│   ├── admin-protocol.test.ts
│   └── fixtures/
│       └── game.ts
├── db/
│   ├── migrations/001_initial.sql
│   ├── migrations/002_admin.sql
│   └── data/                      (ignored runtime files)
├── deploy/nginx.conf
└── docs/                          (twelve blueprint documents, including ADMIN.md)
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

Create planned `client/vite.config.ts`:

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
Production `server/index.ts` serves `client/dist` with safe static routing and
hosts HTTP and WSS upgrades on port 3000. Unknown `/api` or `/ws` paths return
errors, not the HTML fallback.

Proposed `.gitignore`:

```gitignore
node_modules/
client/dist/
admin/dist/
db/data/
coverage/
*.log
.env
.env.*
!.env.example
*.cpuprofile
*.heapprofile
```

Planned `.prettierignore` should contain `node_modules/`, `client/dist/`, `admin/dist/`,
`db/data/`, `coverage/`, and `package-lock.json` on separate lines.

## Conventions, linting, and workflow

Status: Planned

Use TypeScript ESM, explicit imports, camelCase values, PascalCase classes, UPPER_SNAKE_CASE
constants, named exports for shared utilities, and JSDoc for public boundaries.
Simulation functions receive `dt`, clock, and seeded PRNG; avoid global time/random.
Do not import server code into the client. Use seconds in mechanics, milliseconds
for wall clocks, explicit suffixes at boundaries.

Start planned `eslint.config.ts` with this flat config, adding browser globals
only when actually used (never disable `no-undef` globally):

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['build/**', 'client/dist/**', 'coverage/**', 'db/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module' }
  },
  {
    files: ['client/src/**/*.ts'],
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
Use TypeScript for application and test code; keep browser presentation in
HTML/CSS and configuration in JSON where those formats are appropriate.

Small feature branches and PRs: update owning docs/status, add focused tests, run
targeted checks first, then full checks once complete. Commit root lockfile, never
runtime data, secrets, or build output. Inspect `git diff --check`, test output,
and changed-file list before review.

## Testing strategy

Status: Planned

Tests live in the top-level `/tests` directory, separate from application code.
Use TypeScript tests with Node's built-in `node:test` and `node:assert/strict`,
executed through `tsx`.

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
| Load/performance | Planned `tests/load.ts`; seeded bot clients, capped duration, reports outside source tree |

Once these files exist, run focused tests, then completion checks:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
git diff --check
```

`format:check` covers application source and configuration; existing blueprint
Markdown is preserved in its authored formatting.

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
node --cpu-prof --cpu-prof-dir=/tmp --import tsx server/index.ts
node --heap-prof --heap-prof-dir=/tmp --import tsx server/index.ts
node --inspect=127.0.0.1:9229 --import tsx server/index.ts
```

Profiles are per isolate: capture simulation/DB worker profiles as well as the
gateway when needed; configure worker startup options explicitly. Inspect via
local DevTools, never expose inspector ports publicly. Use
`performance.mark/measure`, event-loop delay, allocation sampling, and a spatial
hash occupancy histogram. Check O(n²) collision hotspots and excess snapshot
allocation before micro-optimizing math. Profiles may contain user data; keep
them private, out of Git, and delete after analysis.

## ACP development extension

Status: Planned

Add this at the ACP roadmap milestones, not by rerunning initial setup or
replacing the vanilla client. All paths/config remain planned. Reuse the single
root manifest/lockfile and the existing Vite/Fastify/ws pins. Official package
verification for this extension (2026-11-07):

| New package | Proposed pin | Official source / scope |
| --- | --- | --- |
| `react`, `react-dom` | 19.2.0 each | [React manifest](https://github.com/facebook/react/blob/v19.2.0/packages/react/package.json), [React DOM manifest](https://github.com/facebook/react/blob/v19.2.0/packages/react-dom/package.json); client-only React, no server components/backend framework |
| `@vitejs/plugin-react` | 6.1.1 | [Manifest](https://github.com/vitejs/vite-plugin-react/blob/plugin-react%406.1.1/packages/plugin-react/package.json); Vite `^8.0.0`, Node `^20.19.0 \|\| >=22.12.0`, compatible with retained Vite 8.3.4 and Node 24 |

Check advisories again when installing; these are compatible proposal pins,
not “latest” claims. React Canvas setup/cleanup follows official
[Effect lifecycle](https://react.dev/reference/react/useEffect) and
[refs](https://react.dev/reference/react/useRef); do not keep thousands of entity
updates in React state. Node's [24.0.0 fork docs](https://nodejs.org/docs/v24.0.0/api/child_process.html#child_processforkmodulepath-args-options)
support IPC and advanced serialization without extra flags; send callback is not
game acknowledgment. Use explicit message IDs, deadlines and bounded queues.
`worker_threads` is an alternative, not independent per-game CPU/RSS isolation.

Planned one-time ACP scaffolding at the project root (only if `admin/` is absent):

```sh
mkdir -p control/http control/net tests/fixtures shared/render
npm create --yes vite@9.2.1 admin -- --template react --no-interactive --no-immediate
rm admin/package.json admin/eslint.config.js
npm install --save-exact react@19.2.0 react-dom@19.2.0
npm install --save-dev --save-exact @vitejs/plugin-react@6.1.1
```

Remove only the freshly generated nested manifest/lint config; keep/rework
`admin/src/main.tsx`, `App.tsx`, CSS, and `index.html`. Do not install inside
`admin`, and do not copy the template's extra dependency ranges into the root.
Use the root lint policy extended for JSX below.

Merge these script updates into the existing manifest:

```json
{
  "scripts": {
    "dev:control": "node --env-file=.env --watch --import tsx control/index.ts",
    "dev:admin": "vite --config admin/vite.config.ts",
    "build:client": "vite build --config client/vite.config.ts",
    "build:admin": "vite build --config admin/vite.config.ts",
    "build": "npm run build:client && npm run build:admin",
    "start": "node build/control/index.js",
    "start:standalone": "node build/server/index.js",
    "lint": "eslint server control shared client/src admin/src tests",
    "test:admin": "tsx --test tests/admin.test.ts tests/admin-protocol.test.ts"
  }
}
```

Retain test, migration, formatting, dev:client and dev:server scripts. In managed
development run `dev:control`, `dev:client`, and `dev:admin` in three terminals,
**not** dev:server: control binds 3000/3001 and starts the default child in
3100..3199. Extend `.env.example`/`.env` with DEPLOYMENT.md control defaults and
apply migration 002 via `npm run db:migrate` before managed mode. Admin provisioning
must be resolved without default passwords before login can be exercised.

Planned `admin/vite.config.ts`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/admin/',
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: {
      '/admin/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
      '/admin/ws': { target: 'ws://127.0.0.1:3001', ws: true, changeOrigin: false }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
```

Open `http://localhost:5174/admin/`; production serves admin/dist under `/admin/`
on the separate admin origin. Shared Canvas imports must be browser-safe; separate
connection stores/codecs prevent spectator delta state leaking into player code.
Add `admin/dist/**` to root ESLint ignores and generated-output ignore files.
Extend the existing browser-global block's `files` to
`['client/src/**/*.ts', 'admin/src/**/*.{ts,tsx}']`, covering plain admin connection/
store modules as well as components. Add a separate JSX flat-config block using
`files: ['admin/src/**/*.tsx']`, parserOptions `ecmaFeatures: {jsx: true}`.
The existing core `no-unused-vars` rule cannot recognize JSX-only component uses:
scope `varsIgnorePattern: '^[A-Z]'` to that block, retaining other checks and
explicit JSX imports. React-specific hook lint rules remain a future tool choice;
do not blindly inherit a nested scaffold lint stack.

Tests remain built-in `node:test` for control/routes, IPC and pure spectator store:
viewer-denied writes, separate sessions, CSRF/IP rejection, preset validation,
version conflicts, spawn-ready/failure/stop/restart, stale generations, metrics
aging, idempotent command ACK/unknown outcomes, audit-before-dispatch, bans racing
joins, and zero subprocess creation for invalid inputs. Use fixture child
processes without production ports/secrets. Planned
`tests/fixtures/game.ts` implements the minimal test IPC lifecycle,
not a production launcher. Test admin codec golden bytes,
viewport/LOD entry-exit diffs, multipart atomicity, contiguous revision chains,
rapid pan, backpressure/reset, and generation change.

Canvas/React integration requires browser checks: mount/unmount and Strict Mode
do not double-subscribe; resize/DPR, pan/zoom, follow, click actions, safe text,
role menus, reconnect/reset all behave as specified. No new browser test runner
is required by this docs-only change; choose one separately if automating UI
tests. After implementation run `npm run test:admin`, `npm run lint`, `npm test`,
and both builds. Measure spectator load without exceeding the game tick budget.
