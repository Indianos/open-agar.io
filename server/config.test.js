import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.js';

test('loads validated development defaults', () => {
  assert.deepEqual(loadConfig({}), {
    nodeEnv: 'development',
    host: '127.0.0.1',
    port: 3000,
    publicOrigin: 'http://localhost:5173',
    allowedOrigins: ['http://localhost:5173', 'http://localhost:3000'],
    sqlitePath: 'db/data/agar.sqlite',
    arenaId: 'local-1',
    logLevel: 'info',
  });
});

test('rejects invalid ports and non-origin URLs', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /PORT/);
  assert.throws(() => loadConfig({ PORT: '3e3' }), /PORT/);
  assert.throws(
    () => loadConfig({ PUBLIC_ORIGIN: 'http://example.test/path' }),
    /origin/,
  );
});

test('requires secure origins in production', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }),
    /Production origins must use https/,
  );
  assert.doesNotThrow(() =>
    loadConfig({
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://game.example.test',
      ALLOWED_ORIGINS: 'https://game.example.test',
    }),
  );
});

test('rejects unsafe arena identifiers and duplicate origins', () => {
  assert.throws(() => loadConfig({ ARENA_ID: '../other' }), /ARENA_ID/);
  assert.throws(
    () =>
      loadConfig({
        ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5173',
      }),
    /duplicates/,
  );
  assert.throws(
    () => loadConfig({ ALLOWED_ORIGINS: 'http://localhost:3000' }),
    /include PUBLIC_ORIGIN/,
  );
});
