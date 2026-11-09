import './style.css';
import {
  decodeSnapshot,
  decodeWelcome,
  encodeHello,
  encodeInput,
  OPCODE,
  readHeader,
  type Snapshot,
} from '../../shared/protocol.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const playButton = document.querySelector<HTMLButtonElement>('#play');
const statusMessage = document.querySelector<HTMLElement>('#status');
const joinPanel = document.querySelector<HTMLElement>('#join-panel');
const scoreLabel = document.querySelector<HTMLElement>('#score');
const connectionLabel = document.querySelector<HTMLElement>('#connection');
const context = canvas?.getContext('2d');

if (
  !canvas ||
  !playButton ||
  !statusMessage ||
  !joinPanel ||
  !scoreLabel ||
  !connectionLabel ||
  !context
) {
  throw new Error('Game UI could not be initialized');
}

type TimedSnapshot = { state: Snapshot; receivedAt: number };
let socket: WebSocket | undefined;
let playerId = 0;
let worldSize = 12_000;
let sequence = 1;
let pointerX = 0;
let pointerY = 0;
let previous: TimedSnapshot | undefined;
let latest: TimedSnapshot | undefined;
let frame = 0;
let inputTimer: number | undefined;
let canvasWidth = 0;
let canvasHeight = 0;
let pixelRatio = 0;

function resizeCanvas(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas!.clientWidth);
  const height = Math.max(1, canvas!.clientHeight);
  if (
    width === canvasWidth &&
    height === canvasHeight &&
    ratio === pixelRatio
  ) {
    return;
  }
  canvasWidth = width;
  canvasHeight = height;
  pixelRatio = ratio;
  canvas!.width = Math.round(width * ratio);
  canvas!.height = Math.round(height * ratio);
  context!.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function setStatus(message: string, connected = false): void {
  statusMessage!.textContent = message;
  connectionLabel!.textContent = connected ? 'Playing' : message;
}

function nextSequence(): number {
  sequence = (sequence + 1) >>> 0;
  if (sequence === 0) sequence = 1;
  return sequence;
}

async function joinArena(): Promise<void> {
  playButton!.disabled = true;
  setStatus('Getting a guest ticket…');
  try {
    const ticketResponse = await fetch('/api/v1/play/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arenaId: 'local-1', mode: 'normal' }),
    });
    if (!ticketResponse.ok) {
      const message =
        ticketResponse.status === 503
          ? 'The arena is full. Try again shortly.'
          : 'Could not join the arena.';
      throw new Error(message);
    }
    const ticket = (await ticketResponse.json()) as {
      ticket: string;
      wsPath: string;
      subprotocol: string;
    };
    const url = new URL(ticket.wsPath, window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(url, ticket.subprotocol);
    connection.binaryType = 'arraybuffer';
    socket = connection;
    connection.addEventListener('open', () => {
      const aspect = canvas!.clientWidth / Math.max(1, canvas!.clientHeight);
      connection.send(encodeHello(1, ticket.ticket, aspect));
      sequence = 1;
      inputTimer = window.setInterval(sendIntent, 1000 / 30);
      setStatus('Entering arena…');
    });
    connection.addEventListener(
      'message',
      (event: MessageEvent<ArrayBuffer>) => {
        try {
          const header = readHeader(event.data);
          if (header.opcode === OPCODE.welcome) {
            const welcome = decodeWelcome(header.view);
            playerId = welcome.playerId;
            worldSize = welcome.worldSize;
            joinPanel!.classList.add('hidden');
            setStatus('Steer with your pointer. Eat green cells.', true);
            startRendering();
            return;
          }
          if (header.opcode === OPCODE.snapshot) {
            previous = latest;
            latest = {
              state: decodeSnapshot(header.view),
              receivedAt: performance.now(),
            };
            const ownCell = latest.state.entities.find(
              (entity) => entity.ownerId === playerId,
            );
            if (ownCell)
              scoreLabel!.textContent = `Mass ${Math.floor(ownCell.mass)}`;
          } else if (header.opcode === OPCODE.error) {
            throw new Error('The server rejected the connection.');
          }
        } catch {
          connection.close(1002, 'Invalid server message');
          setStatus('The server sent an invalid response.');
        }
      },
    );
    connection.addEventListener('error', () => {
      setStatus('Could not connect. Check that the server is running.');
    });
    connection.addEventListener('close', () => {
      if (inputTimer !== undefined) window.clearInterval(inputTimer);
      inputTimer = undefined;
      stopRendering();
      socket = undefined;
      playerId = 0;
      joinPanel!.classList.remove('hidden');
      playButton!.disabled = false;
      setStatus('Disconnected. Play again to rejoin.');
    });
  } catch (error) {
    playButton!.disabled = false;
    setStatus(
      error instanceof Error ? error.message : 'Could not join the arena.',
    );
  }
}

function sendIntent(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || playerId === 0) return;
  const distance = Math.hypot(pointerX, pointerY);
  const scale = distance > 200 ? 200 / distance : 1;
  socket.send(
    encodeInput(
      nextSequence(),
      (pointerX * scale) / 200,
      (pointerY * scale) / 200,
    ),
  );
}

function onPointerMove(event: PointerEvent): void {
  const bounds = canvas!.getBoundingClientRect();
  pointerX = event.clientX - (bounds.left + bounds.width / 2);
  pointerY = event.clientY - (bounds.top + bounds.height / 2);
}

function draw(now: number): void {
  frame = requestAnimationFrame(draw);
  resizeCanvas();
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  context!.clearRect(0, 0, width, height);
  context!.fillStyle = '#111c23';
  context!.fillRect(0, 0, width, height);
  if (!latest || playerId === 0) return;

  const current = latest.state;
  const last = previous?.state.tick !== current.tick ? previous : undefined;
  const interval = last ? Math.max(1, latest.receivedAt - last.receivedAt) : 1;
  const mix = last
    ? Math.max(0, Math.min(1, (now - latest.receivedAt + 70) / interval))
    : 1;
  const scale = height / current.verticalSpan;
  const cameraX = last
    ? last.state.cameraX + (current.cameraX - last.state.cameraX) * mix
    : current.cameraX;
  const cameraY = last
    ? last.state.cameraY + (current.cameraY - last.state.cameraY) * mix
    : current.cameraY;
  const centerX = width / 2;
  const centerY = height / 2;
  const worldToScreen = (x: number, y: number) => ({
    x: centerX + (x - cameraX) * scale,
    y: centerY + (y - cameraY) * scale,
  });

  context!.save();
  context!.beginPath();
  context!.rect(0, 0, width, height);
  context!.clip();
  context!.strokeStyle = 'rgba(190, 218, 228, 0.055)';
  context!.lineWidth = 1;
  const gridSize = 100;
  const startX =
    centerX -
    cameraX * scale +
    Math.ceil((cameraX - width / scale / 2) / gridSize) * gridSize * scale;
  const startY =
    centerY -
    cameraY * scale +
    Math.ceil((cameraY - height / scale / 2) / gridSize) * gridSize * scale;
  for (let x = startX; x < width; x += gridSize * scale) {
    context!.beginPath();
    context!.moveTo(x, 0);
    context!.lineTo(x, height);
    context!.stroke();
  }
  for (let y = startY; y < height; y += gridSize * scale) {
    context!.beginPath();
    context!.moveTo(0, y);
    context!.lineTo(width, y);
    context!.stroke();
  }

  const previousEntities = new Map(
    (last?.state.entities ?? []).map((entity) => [entity.id, entity]),
  );
  for (const entity of current.entities) {
    const old = previousEntities.get(entity.id);
    const x = old ? old.x + (entity.x - old.x) * mix : entity.x;
    const y = old ? old.y + (entity.y - old.y) * mix : entity.y;
    const point = worldToScreen(x, y);
    const radius = Math.max(2, 4 * Math.sqrt(entity.mass) * scale);
    context!.beginPath();
    context!.arc(point.x, point.y, radius, 0, Math.PI * 2);
    if (entity.kind === 2) {
      context!.fillStyle = '#6ad997';
      context!.fill();
    } else {
      context!.fillStyle = `rgb(${entity.red} ${entity.green} ${entity.blue})`;
      context!.fill();
      context!.lineWidth = entity.ownerId === playerId ? 3 : 1.5;
      context!.strokeStyle =
        entity.ownerId === playerId ? '#f5fbff' : 'rgba(255,255,255,.55)';
      context!.stroke();
      context!.fillStyle = '#10212b';
      context!.font = `600 ${Math.max(10, Math.min(18, radius * 0.8))}px system-ui`;
      context!.textAlign = 'center';
      context!.textBaseline = 'middle';
      context!.fillText(
        entity.ownerId === playerId ? 'YOU' : '●',
        point.x,
        point.y,
      );
    }
  }

  context!.strokeStyle = '#51646d';
  context!.lineWidth = 3;
  context!.strokeRect(
    -cameraX * scale + centerX,
    -cameraY * scale + centerY,
    worldSize * scale,
    worldSize * scale,
  );
  context!.restore();
}

function startRendering(): void {
  if (frame === 0) frame = requestAnimationFrame(draw);
}

function stopRendering(): void {
  if (frame !== 0) cancelAnimationFrame(frame);
  frame = 0;
  previous = undefined;
  latest = undefined;
}

playButton.addEventListener('click', () => void joinArena());
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerleave', () => {
  pointerX = 0;
  pointerY = 0;
});
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
connectionLabel.textContent = 'Ready';
