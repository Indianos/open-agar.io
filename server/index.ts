import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { loadConfig } from './config.js';
import { createGameServer } from './game-server.js';

const config = loadConfig();
const { app } = createGameServer({
  config,
  seed: randomBytes(4).readUInt32LE(),
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
