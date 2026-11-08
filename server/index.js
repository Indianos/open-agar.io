import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { clearInterval, setInterval } from 'node:timers';
import { loadConfig } from './config.js';
import { Arena } from './sim/arena.js';

const config = loadConfig();
const app = Fastify({ logger: { level: config.logLevel } });
const arena = new Arena({ seed: randomBytes(4).readUInt32LE() });
const tickIntervalMs = 1000 / arena.config.tickHz;
const stepSeconds = 1 / arena.config.tickHz;
let previousTime = performance.now();
let accumulator = 0;

app.get('/health', async () => ({ status: 'ok', tick: arena.tick }));

const timer = setInterval(() => {
  const now = performance.now();
  accumulator += (now - previousTime) / 1000;
  previousTime = now;
  let steps = 0;
  while (accumulator >= stepSeconds && steps < 3) {
    arena.step(stepSeconds);
    accumulator -= stepSeconds;
    steps += 1;
  }
  if (accumulator >= stepSeconds) accumulator %= stepSeconds;
}, tickIntervalMs);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  clearInterval(timer);
  app.log.error(error);
  process.exitCode = 1;
}
