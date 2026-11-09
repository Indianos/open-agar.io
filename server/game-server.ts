import Fastify, { type FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { clearInterval, setInterval, setTimeout } from 'node:timers';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  decodeHello,
  decodeInput,
  encodeError,
  encodeSnapshot,
  encodeWelcome,
  OPCODE,
  readHeader,
} from '../shared/protocol.js';
import { loadConfig, type RuntimeConfig } from './config.js';
import { Arena } from './sim/arena.js';
import type { EntityRecord } from '../shared/protocol.js';
import type { FoodPellet, PlayerCell } from './sim/arena.js';

type Ticket = {
  expiresAt: number;
  origin: string;
};

type GameConnection = {
  socket: WebSocket;
  playerId: number;
  aspect: number;
  clientSequence: number;
  serverSequence: number;
  ackInputSequence: number;
  inputCount: number;
  inputWindowStart: number;
};

type CreateGameServerOptions = {
  config?: RuntimeConfig;
  seed?: number;
  logger?: boolean;
};

const TICKET_TTL_MS = 30_000;
const MAX_TICKET_REQUESTS_PER_MINUTE = 10;

function isNewerSequence(sequence: number, previous: number): boolean {
  const difference = (sequence - previous) >>> 0;
  return difference > 0 && difference < 0x8000_0000;
}

function colorForPlayer(id: number): [number, number, number] {
  const hue = (id * 137.508) % 360;
  const chroma = 0.72;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.18;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map((value) => Math.round((value + m) * 255)) as [
    number,
    number,
    number,
  ];
}

function withinView(
  entity: PlayerCell | FoodPellet,
  cameraX: number,
  cameraY: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  return (
    Math.abs(entity.x - cameraX) <= width / 2 + radius &&
    Math.abs(entity.y - cameraY) <= height / 2 + radius
  );
}

export function createGameServer(options: CreateGameServerOptions = {}): {
  app: FastifyInstance;
  arena: Arena;
  close: () => Promise<void>;
} {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ?? { level: config.logLevel } });
  const arena = new Arena({
    seed: options.seed ?? randomBytes(4).readUInt32LE(),
  });
  const tickets = new Map<string, Ticket>();
  const connections = new Map<WebSocket, GameConnection>();
  const acceptedOrigins = new WeakMap<WebSocket, string>();
  const ticketBuckets = new Map<string, { startedAt: number; count: number }>();
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: 256,
    perMessageDeflate: false,
    handleProtocols: (protocols) =>
      protocols.has('agar.v1') ? 'agar.v1' : false,
  });
  let accumulator = 0;
  let previousTime = performance.now();
  let lastSnapshotTick = -1;

  app.get('/health', async () => ({ status: 'ok', tick: arena.tick }));

  app.post<{ Body: { arenaId: string; mode: 'normal' } }>(
    '/api/v1/play/tickets',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['arenaId', 'mode'],
          properties: {
            arenaId: { type: 'string', minLength: 1, maxLength: 32 },
            mode: { type: 'string', enum: ['normal'] },
          },
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (
        typeof origin !== 'string' ||
        !config.allowedOrigins.includes(origin)
      ) {
        return reply.code(403).send({ error: 'Origin denied' });
      }
      if (
        request.body.arenaId !== config.arenaId ||
        request.body.mode !== 'normal'
      ) {
        return reply.code(400).send({ error: 'Invalid arena or mode' });
      }
      const now = Date.now();
      for (const [token, ticket] of tickets) {
        if (ticket.expiresAt <= now) tickets.delete(token);
      }
      for (const [ip, bucket] of ticketBuckets) {
        if (now - bucket.startedAt >= 60_000) ticketBuckets.delete(ip);
      }
      if (
        tickets.size + arena.players.size >= arena.config.maxPlayers ||
        (ticketBuckets.size >= 1024 && !ticketBuckets.has(request.ip))
      ) {
        return reply
          .header('Retry-After', '5')
          .code(503)
          .send({ error: 'Arena is busy' });
      }
      const bucket = ticketBuckets.get(request.ip);
      if (bucket && now - bucket.startedAt < 60_000) {
        if (bucket.count >= MAX_TICKET_REQUESTS_PER_MINUTE) {
          return reply
            .header('Retry-After', '60')
            .code(429)
            .send({ error: 'Ticket rate limit exceeded' });
        }
        bucket.count += 1;
      } else {
        ticketBuckets.set(request.ip, { startedAt: now, count: 1 });
      }
      const token = randomBytes(32).toString('base64url');
      tickets.set(token, { expiresAt: now + TICKET_TTL_MS, origin });
      return reply.code(201).send({
        ticket: token,
        expiresInSeconds: TICKET_TTL_MS / 1000,
        arenaId: config.arenaId,
        wsPath: `/ws/${config.arenaId}`,
        subprotocol: 'agar.v1',
      });
    },
  );

  const tickTimer = setInterval(() => {
    const now = performance.now();
    accumulator += (now - previousTime) / 1000;
    previousTime = now;
    let steps = 0;
    while (accumulator >= 1 / arena.config.tickHz && steps < 3) {
      arena.step(1 / arena.config.tickHz);
      accumulator -= 1 / arena.config.tickHz;
      steps += 1;
    }
    if (accumulator >= 1 / arena.config.tickHz) {
      accumulator %= 1 / arena.config.tickHz;
    }
    if (arena.tick !== lastSnapshotTick && arena.tick % 2 === 0) {
      lastSnapshotTick = arena.tick;
      sendSnapshots(arena, connections);
    }
  }, 1000 / arena.config.tickHz);

  app.server.on('upgrade', (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (
      pathname !== `/ws/${config.arenaId}` ||
      typeof origin !== 'string' ||
      !config.allowedOrigins.includes(origin) ||
      !request.headers['sec-websocket-protocol']
        ?.split(',')
        .map((protocol) => protocol.trim())
        .includes('agar.v1')
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      acceptedOrigins.set(webSocket, origin);
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', (socket: WebSocket) => {
    const origin = acceptedOrigins.get(socket);
    if (!origin) {
      socket.close(1008, 'Origin denied');
      return;
    }
    let connection: GameConnection | undefined;
    const helloTimer = setTimeout(() => {
      if (!connection) socket.close(1008, 'HELLO required');
    }, 5000);
    socket.on('message', (data: RawData, isBinary) => {
      const message = Array.isArray(data) ? Buffer.concat(data) : data;
      if (!isBinary || message.byteLength > 256) {
        socket.close(1009, 'Invalid message size');
        return;
      }
      try {
        const header = readHeader(message);
        if (!connection) {
          if (header.opcode !== OPCODE.hello || header.sequence !== 1) {
            throw new RangeError('HELLO required');
          }
          const hello = decodeHello(header.view);
          const ticket = tickets.get(hello.ticket);
          if (
            !ticket ||
            ticket.expiresAt <= Date.now() ||
            ticket.origin !== origin
          ) {
            tickets.delete(hello.ticket);
            socket.send(encodeError(1, 2, 'Ticket is invalid or expired'));
            socket.close(1008, 'Ticket is invalid or expired');
            return;
          }
          tickets.delete(hello.ticket);
          let player: PlayerCell;
          try {
            player = arena.addPlayer();
          } catch {
            socket.send(encodeError(1, 3, 'Arena is busy'));
            socket.close(1013, 'Arena is busy');
            return;
          }
          clearTimeout(helloTimer);
          connection = {
            socket,
            playerId: player.id,
            aspect: hello.aspect,
            clientSequence: header.sequence,
            serverSequence: 1,
            ackInputSequence: 0,
            inputCount: 0,
            inputWindowStart: Date.now(),
          };
          connections.set(socket, connection);
          socket.send(
            encodeWelcome(
              connection.serverSequence,
              player.id,
              arena.tick,
              arena.config.worldSize,
              randomBytes(32).toString('base64url'),
            ),
          );
          return;
        }
        if (!isNewerSequence(header.sequence, connection.clientSequence))
          return;
        if (header.opcode !== OPCODE.input) {
          throw new RangeError('Unsupported client message');
        }
        const now = Date.now();
        if (now - connection.inputWindowStart >= 1000) {
          connection.inputWindowStart = now;
          connection.inputCount = 0;
        }
        connection.inputCount += 1;
        if (connection.inputCount > 40) {
          socket.close(1008, 'Input rate exceeded');
          return;
        }
        const intent = decodeInput(header.view);
        arena.setIntent(connection.playerId, intent.dx, intent.dy);
        connection.clientSequence = header.sequence;
        connection.ackInputSequence = header.sequence;
      } catch {
        socket.send(
          encodeError(connection?.serverSequence ?? 1, 1, 'Invalid message'),
        );
        socket.close(1002, 'Invalid message');
      }
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (connection) {
        arena.removePlayer(connection.playerId);
        connections.delete(socket);
      }
    });
    socket.on('error', () => {
      clearTimeout(helloTimer);
    });
  });

  app.addHook('onClose', async () => {
    clearInterval(tickTimer);
    for (const connection of connections.values()) {
      connection.socket.close(1012, 'Server shutting down');
    }
    await new Promise<void>((resolve) => webSockets.close(() => resolve()));
  });

  return {
    app,
    arena,
    close: () => app.close(),
  };
}

function sendSnapshots(
  arena: Arena,
  connections: Map<WebSocket, GameConnection>,
): void {
  for (const connection of connections.values()) {
    if (connection.socket.readyState !== WebSocket.OPEN) continue;
    const player = arena.players.get(connection.playerId);
    if (!player) continue;
    const verticalSpan = Math.min(
      arena.config.cameraMaxSpan,
      Math.max(
        arena.config.cameraBaseSpan,
        arena.config.cameraBaseSpan *
          Math.sqrt(player.mass / arena.config.startMass),
      ),
    );
    const cameraX = player.x;
    const cameraY = player.y;
    const width = verticalSpan * connection.aspect;
    const entities: EntityRecord[] = [];
    for (const other of arena.players.values()) {
      const radius = arena.radius(other.mass);
      if (!withinView(other, cameraX, cameraY, width, verticalSpan, radius)) {
        continue;
      }
      const [red, green, blue] = colorForPlayer(other.id);
      entities.push({
        id: other.id,
        ownerId: other.id,
        x: other.x,
        y: other.y,
        mass: other.mass,
        red,
        green,
        blue,
        kind: 1,
      });
    }
    for (const food of arena.food.values()) {
      if (
        !withinView(
          food,
          cameraX,
          cameraY,
          width,
          verticalSpan,
          arena.radius(food.mass),
        )
      ) {
        continue;
      }
      entities.push({
        id: food.id,
        ownerId: 0,
        x: food.x,
        y: food.y,
        mass: food.mass,
        red: 106,
        green: 217,
        blue: 151,
        kind: 2,
      });
    }
    if (entities.length > 2400) entities.length = 2400;
    try {
      connection.socket.send(
        encodeSnapshot(
          nextSequence(connection),
          arena.tick,
          connection.ackInputSequence,
          cameraX,
          cameraY,
          verticalSpan,
          entities,
        ),
      );
    } catch {
      connection.socket.close(1011, 'Snapshot failed');
    }
  }
}

function nextSequence(connection: GameConnection): number {
  connection.serverSequence = (connection.serverSequence + 1) >>> 0;
  if (connection.serverSequence === 0) connection.serverSequence = 1;
  return connection.serverSequence;
}
