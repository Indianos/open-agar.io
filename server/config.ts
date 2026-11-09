import process from 'node:process';
import { URL } from 'node:url';

export type RuntimeConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  allowedOrigins: readonly string[];
  sqlitePath: string;
  arenaId: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
};

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
const NODE_ENVS = new Set(['development', 'test', 'production']);

function isNodeEnv(value: string): value is RuntimeConfig['nodeEnv'] {
  return NODE_ENVS.has(value);
}

function isLogLevel(value: string): value is RuntimeConfig['logLevel'] {
  return LOG_LEVELS.has(value);
}

function parseOrigin(value: string, name: string): string {
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

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return port;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const values = {
    NODE_ENV: env.NODE_ENV ?? DEFAULTS.NODE_ENV,
    HOST: env.HOST ?? DEFAULTS.HOST,
    PORT: env.PORT ?? DEFAULTS.PORT,
    PUBLIC_ORIGIN: env.PUBLIC_ORIGIN ?? DEFAULTS.PUBLIC_ORIGIN,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS ?? DEFAULTS.ALLOWED_ORIGINS,
    SQLITE_PATH: env.SQLITE_PATH ?? DEFAULTS.SQLITE_PATH,
    ARENA_ID: env.ARENA_ID ?? DEFAULTS.ARENA_ID,
    LOG_LEVEL: env.LOG_LEVEL ?? DEFAULTS.LOG_LEVEL,
  };
  if (!isNodeEnv(values.NODE_ENV)) {
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
  if (!isLogLevel(values.LOG_LEVEL)) {
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
