import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import {
  decodeSnapshot,
  decodeWelcome,
  encodeHello,
  encodeInput,
  OPCODE,
  readHeader,
} from '../shared/protocol.js';
import { loadConfig } from '../server/config.js';
import { createGameServer } from '../server/game-server.js';

function nextMessage(socket: WebSocket, opcode: number): Promise<DataView> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for opcode ${opcode}`));
    }, 3000);
    const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) return;
      try {
        const header = readHeader(
          Array.isArray(data) ? Buffer.concat(data) : data,
        );
        if (header.opcode !== opcode) return;
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(header.view);
      } catch (error) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        reject(error);
      }
    };
    socket.on('message', onMessage);
  });
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('close', onClose);
      reject(new Error('Timed out waiting for WebSocket close'));
    }, 3000);
    const onClose = (code: number) => {
      clearTimeout(timer);
      resolve(code);
    };
    socket.once('close', onClose);
  });
}

test('guest ticket joins the authoritative arena and valid input moves the cell', async () => {
  const { app, arena, close } = createGameServer({
    config: loadConfig({ NODE_ENV: 'test' }),
    seed: 123,
    logger: false,
  });
  let socket: WebSocket | undefined;
  let secondSocket: WebSocket | undefined;
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = 'http://localhost:5173';
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/play/tickets',
      headers: { origin: 'https://not-allowed.example' },
      payload: { arenaId: 'local-1', mode: 'normal' },
    });
    assert.equal(denied.statusCode, 403);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/play/tickets',
      headers: { origin },
      payload: { arenaId: 'local-1', mode: 'normal' },
    });
    assert.equal(response.statusCode, 201);
    const ticket = response.json<{
      ticket: string;
      wsPath: string;
      subprotocol: string;
    }>();
    assert.match(ticket.ticket, /^[A-Za-z0-9_-]{43}$/);
    socket = new WebSocket(
      `ws://127.0.0.1:${address.port}${ticket.wsPath}`,
      ticket.subprotocol,
      { origin },
    );
    await waitForOpen(socket);
    socket.send(encodeHello(1, ticket.ticket, 1.25));
    const welcome = decodeWelcome(await nextMessage(socket, OPCODE.welcome));
    assert.equal(arena.players.size, 1);
    assert.equal(welcome.playerId, [...arena.players.keys()][0]);

    const firstSnapshot = nextMessage(socket, OPCODE.snapshot);
    socket.send(encodeInput(2, 1, 0));
    const before = decodeSnapshot(await firstSnapshot).entities.find(
      (entity) => entity.ownerId === welcome.playerId,
    );
    const after = decodeSnapshot(
      await nextMessage(socket, OPCODE.snapshot),
    ).entities.find((entity) => entity.ownerId === welcome.playerId);
    assert.ok(before);
    assert.ok(after);
    assert.ok(after.x > before.x);

    const secondTicketResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/play/tickets',
      headers: { origin },
      payload: { arenaId: 'local-1', mode: 'normal' },
    });
    const secondTicket = secondTicketResponse.json<{
      ticket: string;
      wsPath: string;
      subprotocol: string;
    }>();
    secondSocket = new WebSocket(
      `ws://127.0.0.1:${address.port}${secondTicket.wsPath}`,
      secondTicket.subprotocol,
      { origin },
    );
    await waitForOpen(secondSocket);
    secondSocket.send(encodeHello(1, secondTicket.ticket, 1.25));
    const secondWelcome = decodeWelcome(
      await nextMessage(secondSocket, OPCODE.welcome),
    );
    assert.equal(arena.players.size, 2);
    const visibleSnapshot = nextMessage(socket, OPCODE.snapshot);
    const visiblePlayers = decodeSnapshot(
      await visibleSnapshot,
    ).entities.filter((entity) => entity.kind === 1);
    assert.ok(
      visiblePlayers.some((entity) => entity.ownerId === welcome.playerId),
    );
    assert.ok(
      visiblePlayers.some(
        (entity) => entity.ownerId === secondWelcome.playerId,
      ),
    );

    const replay = new WebSocket(
      `ws://127.0.0.1:${address.port}${ticket.wsPath}`,
      ticket.subprotocol,
      { origin },
    );
    await waitForOpen(replay);
    const replayClosed = waitForClose(replay);
    replay.send(encodeHello(1, ticket.ticket, 1.25));
    assert.equal(await replayClosed, 1008);
    assert.equal(arena.players.size, 2);
  } finally {
    if (socket) await closeSocket(socket);
    if (secondSocket) await closeSocket(secondSocket);
    await close();
  }
});
