import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena } from '../server/sim/arena.js';

test('same seed and intents produce identical arena states', () => {
  const first = new Arena({
    seed: 42,
    config: { foodTarget: 3, worldSize: 500 },
  });
  const second = new Arena({
    seed: 42,
    config: { foodTarget: 3, worldSize: 500 },
  });
  const a = first.addPlayer();
  const b = second.addPlayer();

  first.setIntent(a.id, 0.6, 0.8);
  second.setIntent(b.id, 0.6, 0.8);
  first.step();
  second.step();

  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('movement intent is clamped and cells remain within world bounds', () => {
  const arena = new Arena({
    seed: 1,
    config: { foodTarget: 0, worldSize: 100 },
  });
  const player = arena.addPlayer();
  arena.setIntent(player.id, 3, 4);
  arena.step(1);

  const moved = arena.snapshot().players[0];
  assert.ok(moved.x <= 100 - arena.radius(moved.mass));
  assert.ok(moved.y <= 100 - arena.radius(moved.mass));
  assert.ok(Math.hypot(moved.dx, moved.dy) <= 1);
});

test('invalid movement and simulation durations are rejected', () => {
  const arena = new Arena({ seed: 1, config: { foodTarget: 0 } });
  const player = arena.addPlayer();

  assert.throws(() => arena.setIntent(player.id, Infinity, 0), /finite/);
  assert.throws(() => arena.step(0), /dt/);
  assert.throws(() => arena.setIntent(999, 0, 0), /Unknown player/);
});

test('rejects a seed outside the unsigned 32-bit range', () => {
  assert.throws(() => new Arena({ seed: -1 }), /unsigned 32-bit/);
});

test('consumed food adds authoritative mass and replenishes to target', () => {
  const arena = new Arena({
    seed: 0,
    config: { foodTarget: 1, worldSize: 500 },
  });
  const player = arena.addPlayer();
  const pellet = arena.food.values().next().value;
  assert.ok(pellet);
  const livePlayer = arena.players.get(player.id);
  assert.ok(livePlayer);
  livePlayer.x = pellet.x;
  livePlayer.y = pellet.y;

  arena.step();

  const updatedPlayer = arena.players.get(player.id);
  assert.ok(updatedPlayer);
  assert.equal(updatedPlayer.mass, player.mass + 1);
  assert.equal(arena.food.size, 1);
});
