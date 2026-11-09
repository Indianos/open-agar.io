# open-agar.io

A small, server-authoritative agar-style multiplayer game. The desktop MVP is
under development; gameplay currently includes anonymous joining, pointer
steering, food, world bounds, and multiplayer snapshots.

## Run locally

Requires Node.js 24 or newer. From the repository root:

```sh
npm ci
cp .env.example .env
npm run dev:server
```

In a second terminal:

```sh
npm run dev:client
```

Open the Vite URL (usually <http://localhost:5173>) in two desktop tabs or
browsers. Choose **Play as guest** in each tab and move the pointer to steer.
Both clients join the same local arena; food consumption and movement are
decided by the server.

Run the TypeScript checks and tests with:

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

See [the development guide](docs/DEVELOPMENT.md) for the architecture and
remaining MVP scope.