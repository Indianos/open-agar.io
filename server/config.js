import process from 'node:process';
import { URL } from 'node:url';

const DEFAULTS = Object.freeze({
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: '3000',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:3000',
  SQLITE_PATH: 'db/data/agar.sqlite',
  ARENA_ID: 'local-1',
  LOG_LEVEL: 'info',
});

const LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function parseOrigin(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid origin`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== value ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(`${name} must contain only an http(s) origin`);
  }
  return parsed.origin;
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return port;
}

export function loadConfig(env = process.env) {
  const values = { ...DEFAULTS, ...env };
  if (!['development', 'test', 'production'].includes(values.NODE_ENV)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  if (!values.HOST.trim()) throw new Error('HOST must not be empty');
  const port = parsePort(values.PORT);
  const publicOrigin = parseOrigin(values.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN');
  const allowedOrigins = values.ALLOWED_ORIGINS.split(',').map((origin) =>
    parseOrigin(origin.trim(), 'ALLOWED_ORIGINS'),
  );
  if (new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new Error('ALLOWED_ORIGINS must not contain duplicates');
  }
  if (!allowedOrigins.includes(publicOrigin)) {
    throw new Error('ALLOWED_ORIGINS must include PUBLIC_ORIGIN');
  }
  if (
    values.NODE_ENV === 'production' &&
    (new URL(publicOrigin).protocol !== 'https:' ||
      allowedOrigins.some((origin) => new URL(origin).protocol !== 'https:'))
  ) {
    throw new Error('Production origins must use https');
  }
  if (!values.SQLITE_PATH.trim())
    throw new Error('SQLITE_PATH must not be empty');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(values.ARENA_ID)) {
    throw new Error('ARENA_ID must be 1-64 safe ASCII characters');
  }
  if (!LOG_LEVELS.has(values.LOG_LEVEL)) {
    throw new Error(`LOG_LEVEL must be one of: ${[...LOG_LEVELS].join(', ')}`);
  }
  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    host: values.HOST,
    port,
    publicOrigin,
    allowedOrigins: Object.freeze(allowedOrigins),
    sqlitePath: values.SQLITE_PATH,
    arenaId: values.ARENA_ID,
    logLevel: values.LOG_LEVEL,
  });
}
