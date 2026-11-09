import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeHello,
  decodeInput,
  decodeSnapshot,
  decodeWelcome,
  encodeHello,
  encodeInput,
  encodeSnapshot,
  encodeWelcome,
  OPCODE,
  readHeader,
  type EntityRecord,
} from '../shared/protocol.js';

test('HELLO round-trips a fresh one-use ticket', () => {
  const ticket = 'A'.repeat(43);
  const header = readHeader(encodeHello(1, ticket, 1.25));
  const hello = decodeHello(header.view);

  assert.equal(hello.ticket, ticket);
  assert.equal(hello.aspect, 1.25);
});

test('INPUT normalizes the client direction and rejects reserved fields', () => {
  const input = decodeInput(readHeader(encodeInput(2, 1, 1)).view);
  assert.ok(Math.abs(Math.hypot(input.dx, input.dy) - 1) < 0.0001);

  const invalid = new DataView(encodeInput(2, 0, 0));
  invalid.setUint8(12, 0x80);
  assert.throws(() => decodeInput(invalid), /INPUT fields/);
});

test('WELCOME and full snapshot preserve player state and validate lengths', () => {
  const welcome = readHeader(encodeWelcome(1, 23, 12, 12_000, 'B'.repeat(43)));
  assert.deepEqual(decodeWelcome(welcome.view), {
    playerId: 23,
    worldSize: 12_000,
  });
  const entities: EntityRecord[] = [
    {
      id: 23,
      ownerId: 23,
      x: 100,
      y: 200,
      mass: 20,
      red: 120,
      green: 180,
      blue: 220,
      kind: 1,
    },
    {
      id: 24,
      ownerId: 0,
      x: 150,
      y: 200,
      mass: 1,
      red: 106,
      green: 217,
      blue: 151,
      kind: 2,
    },
  ];
  const snapshot = readHeader(
    encodeSnapshot(2, 15, 1, 100, 200, 1200, entities),
  );
  assert.deepEqual(decodeSnapshot(snapshot.view), {
    tick: 15,
    ackInputSequence: 1,
    cameraX: 100,
    cameraY: 200,
    verticalSpan: 1200,
    entities,
  });

  const truncated = new DataView(snapshot.view.buffer.slice(0, -1));
  assert.throws(() => decodeSnapshot(truncated), /SNAPSHOT fields/);
});

test('packet decoder rejects version, size, and sequence violations', () => {
  const message = encodeInput(4, 0, 0);
  const wrongVersion = new DataView(message.slice(0));
  wrongVersion.setUint8(1, 2);
  assert.throws(() => readHeader(wrongVersion), /version/);

  const wrongSequence = new DataView(message.slice(0));
  wrongSequence.setUint32(4, 0, true);
  assert.throws(() => readHeader(wrongSequence), /sequence/);

  const wrongSize = new DataView(message.slice(0));
  wrongSize.setUint16(2, 7, true);
  assert.throws(() => readHeader(wrongSize), /size/);
  assert.equal(OPCODE.input, 2);
});
