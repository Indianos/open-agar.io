import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandom } from '../shared/random.js';

test('seeded random generators produce the same sequence', () => {
  const first = createRandom(123);
  const second = createRandom(123);

  assert.deepEqual(
    Array.from({ length: 5 }, () => first()),
    Array.from({ length: 5 }, () => second()),
  );
});

test('rejects seeds outside the unsigned 32-bit range', () => {
  assert.throws(() => createRandom(-1), RangeError);
  assert.throws(() => createRandom(0x1_0000_0000), RangeError);
});
