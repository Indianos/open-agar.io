export const OPCODE = {
  hello: 0x01,
  input: 0x02,
  welcome: 0x81,
  snapshot: 0x82,
  error: 0xff,
} as const;

export const PROTOCOL_VERSION = 1;
export const HEADER_BYTES = 8;
export const MAX_CLIENT_MESSAGE_BYTES = 256;
export const MAX_SERVER_MESSAGE_BYTES = 61_440;
export const MAX_SNAPSHOT_PART_ENTITIES = 2_400;

export type EntityRecord = {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  mass: number;
  red: number;
  green: number;
  blue: number;
  kind: 1 | 2;
};

export type PacketHeader = {
  opcode: number;
  sequence: number;
  view: DataView;
};

export function readHeader(
  message: ArrayBuffer | ArrayBufferView,
): PacketHeader {
  const view =
    message instanceof ArrayBuffer
      ? new DataView(message)
      : new DataView(message.buffer, message.byteOffset, message.byteLength);
  if (
    view.byteLength < HEADER_BYTES ||
    view.byteLength > MAX_SERVER_MESSAGE_BYTES
  ) {
    throw new RangeError('Invalid message size');
  }
  const opcode = view.getUint8(0);
  if (view.getUint8(1) !== PROTOCOL_VERSION)
    throw new RangeError('Unsupported protocol version');
  if (view.getUint16(2, true) !== view.byteLength - HEADER_BYTES) {
    throw new RangeError('Message payload size does not match header');
  }
  const sequence = view.getUint32(4, true);
  if (sequence === 0) throw new RangeError('Message sequence must be nonzero');
  return { opcode, sequence, view };
}

function packet(
  opcode: number,
  sequence: number,
  payloadBytes: number,
): DataView<ArrayBuffer> {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 0xffff_ffff) {
    throw new RangeError('Sequence must be a nonzero unsigned 32-bit integer');
  }
  const buffer = new ArrayBuffer(HEADER_BYTES + payloadBytes);
  const view = new DataView(buffer);
  view.setUint8(0, opcode);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, payloadBytes, true);
  view.setUint32(4, sequence, true);
  return view;
}

export function encodeWelcome(
  sequence: number,
  playerId: number,
  tick: number,
  worldSize: number,
  resumeToken: string,
): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(resumeToken)) {
    throw new TypeError('Resume token must be 43 base64url characters');
  }
  const view = packet(OPCODE.welcome, sequence, 60);
  view.setUint32(8, playerId, true);
  view.setUint32(12, tick, true);
  view.setUint8(16, 30);
  view.setUint8(17, 15);
  view.setUint8(18, 0);
  view.setUint8(19, 0);
  view.setFloat32(20, worldSize, true);
  view.setUint8(24, 43);
  new Uint8Array(view.buffer, 25, 43).set(
    new TextEncoder().encode(resumeToken),
  );
  return view.buffer;
}

export function encodeSnapshot(
  sequence: number,
  tick: number,
  ackInputSequence: number,
  cameraX: number,
  cameraY: number,
  verticalSpan: number,
  entities: EntityRecord[],
): ArrayBuffer {
  if (entities.length > MAX_SNAPSHOT_PART_ENTITIES) {
    throw new RangeError('Snapshot contains too many entities');
  }
  const view = packet(OPCODE.snapshot, sequence, 28 + entities.length * 24);
  view.setUint32(8, tick, true);
  view.setUint32(12, ackInputSequence, true);
  view.setFloat32(16, cameraX, true);
  view.setFloat32(20, cameraY, true);
  view.setFloat32(24, verticalSpan, true);
  view.setUint16(28, 0, true);
  view.setUint16(30, 1, true);
  view.setUint16(32, entities.length, true);
  view.setUint16(34, 0, true);
  let offset = 36;
  for (const entity of entities) {
    view.setUint32(offset, entity.id, true);
    view.setUint32(offset + 4, entity.ownerId, true);
    view.setFloat32(offset + 8, entity.x, true);
    view.setFloat32(offset + 12, entity.y, true);
    view.setFloat32(offset + 16, entity.mass, true);
    view.setUint8(offset + 20, entity.red);
    view.setUint8(offset + 21, entity.green);
    view.setUint8(offset + 22, entity.blue);
    view.setUint8(offset + 23, entity.kind);
    offset += 24;
  }
  return view.buffer;
}

export function decodeHello(view: DataView): {
  ticket: string;
  aspect: number;
} {
  if (
    view.getUint8(0) !== OPCODE.hello ||
    view.byteLength !== HEADER_BYTES + 49
  ) {
    throw new RangeError('Invalid HELLO message');
  }
  const payload = HEADER_BYTES;
  const mode = view.getUint8(payload);
  const aspect = view.getUint16(payload + 1, true);
  if (
    mode !== 0 ||
    aspect < 500 ||
    aspect > 1778 ||
    view.getUint8(payload + 3) !== 43
  ) {
    throw new RangeError('Invalid HELLO fields');
  }
  const ticketBytes = new Uint8Array(
    view.buffer,
    view.byteOffset + payload + 4,
    43,
  );
  const ticket = new TextDecoder('ascii', { fatal: true }).decode(ticketBytes);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
    view.getUint8(payload + 47) !== 0
  ) {
    throw new RangeError('Invalid fresh-join ticket');
  }
  return { ticket, aspect: aspect / 1000 };
}

export function decodeInput(view: DataView): { dx: number; dy: number } {
  if (
    view.getUint8(0) !== OPCODE.input ||
    view.byteLength !== HEADER_BYTES + 8
  ) {
    throw new RangeError('Invalid INPUT message');
  }
  const payload = HEADER_BYTES;
  const rawX = view.getInt16(payload, true);
  const rawY = view.getInt16(payload + 2, true);
  if (
    rawX === -32768 ||
    rawY === -32768 ||
    view.getUint8(payload + 4) !== 0 ||
    view.getUint8(payload + 5) !== 0 ||
    view.getUint16(payload + 6, true) !== 0
  ) {
    throw new RangeError('Invalid INPUT fields');
  }
  const dx = rawX / 32767;
  const dy = rawY / 32767;
  const length = Math.hypot(dx, dy);
  const scale = length > 1 ? 1 / length : 1;
  return { dx: dx * scale, dy: dy * scale };
}

export function encodeHello(
  sequence: number,
  ticket: string,
  aspect: number,
): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket))
    throw new TypeError('Invalid ticket');
  const view = packet(OPCODE.hello, sequence, 49);
  view.setUint8(8, 0);
  view.setUint16(
    9,
    Math.max(500, Math.min(1778, Math.round(aspect * 1000))),
    true,
  );
  view.setUint8(11, 43);
  new Uint8Array(view.buffer, 12, 43).set(new TextEncoder().encode(ticket));
  view.setUint8(55, 0);
  return view.buffer;
}

export function encodeInput(
  sequence: number,
  dx: number,
  dy: number,
): ArrayBuffer {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new TypeError('Movement intent must be finite');
  }
  const length = Math.hypot(dx, dy);
  const scale = length > 1 ? 1 / length : 1;
  const view = packet(OPCODE.input, sequence, 8);
  view.setInt16(8, Math.round(dx * scale * 32767), true);
  view.setInt16(10, Math.round(dy * scale * 32767), true);
  view.setUint8(12, 0);
  view.setUint8(13, 0);
  view.setUint16(14, 0, true);
  return view.buffer;
}

export function encodeError(
  sequence: number,
  code: number,
  message: string,
): ArrayBuffer {
  const text = new TextEncoder().encode(message);
  if (text.byteLength > 120) throw new RangeError('Error message is too long');
  const view = packet(OPCODE.error, sequence, 3 + text.byteLength);
  view.setUint16(8, code, true);
  view.setUint8(10, text.byteLength);
  new Uint8Array(view.buffer, 11).set(text);
  return view.buffer;
}

export function decodeWelcome(view: DataView): {
  playerId: number;
  worldSize: number;
} {
  if (
    view.getUint8(0) !== OPCODE.welcome ||
    view.byteLength !== HEADER_BYTES + 60 ||
    view.getUint8(16) !== 30 ||
    view.getUint8(17) !== 15 ||
    view.getUint8(24) !== 43
  ) {
    throw new RangeError('Invalid WELCOME message');
  }
  const playerId = view.getUint32(8, true);
  const worldSize = view.getFloat32(20, true);
  if (playerId === 0 || !Number.isFinite(worldSize) || worldSize <= 0) {
    throw new RangeError('Invalid WELCOME fields');
  }
  return { playerId, worldSize };
}

export type Snapshot = {
  tick: number;
  ackInputSequence: number;
  cameraX: number;
  cameraY: number;
  verticalSpan: number;
  entities: EntityRecord[];
};

export function decodeSnapshot(view: DataView): Snapshot {
  if (
    view.getUint8(0) !== OPCODE.snapshot ||
    view.byteLength < HEADER_BYTES + 28
  ) {
    throw new RangeError('Invalid SNAPSHOT message');
  }
  const count = view.getUint16(32, true);
  if (
    view.getUint16(28, true) !== 0 ||
    view.getUint16(30, true) !== 1 ||
    view.getUint16(34, true) !== 0 ||
    count > MAX_SNAPSHOT_PART_ENTITIES ||
    view.byteLength !== HEADER_BYTES + 28 + count * 24
  ) {
    throw new RangeError('Invalid SNAPSHOT fields');
  }
  const entities: EntityRecord[] = [];
  for (let index = 0, offset = 36; index < count; index += 1, offset += 24) {
    const entity: EntityRecord = {
      id: view.getUint32(offset, true),
      ownerId: view.getUint32(offset + 4, true),
      x: view.getFloat32(offset + 8, true),
      y: view.getFloat32(offset + 12, true),
      mass: view.getFloat32(offset + 16, true),
      red: view.getUint8(offset + 20),
      green: view.getUint8(offset + 21),
      blue: view.getUint8(offset + 22),
      kind: view.getUint8(offset + 23) as EntityRecord['kind'],
    };
    if (
      entity.id === 0 ||
      ![entity.x, entity.y, entity.mass].every(Number.isFinite) ||
      entity.mass <= 0 ||
      (entity.kind !== 1 && entity.kind !== 2)
    ) {
      throw new RangeError('Invalid snapshot entity');
    }
    entities.push(entity);
  }
  const snapshot = {
    tick: view.getUint32(8, true),
    ackInputSequence: view.getUint32(12, true),
    cameraX: view.getFloat32(16, true),
    cameraY: view.getFloat32(20, true),
    verticalSpan: view.getFloat32(24, true),
    entities,
  };
  if (
    ![snapshot.cameraX, snapshot.cameraY, snapshot.verticalSpan].every(
      Number.isFinite,
    ) ||
    snapshot.verticalSpan <= 0
  ) {
    throw new RangeError('Invalid snapshot camera');
  }
  return snapshot;
}
