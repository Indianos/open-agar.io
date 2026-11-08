import { DEFAULT_ARENA_CONFIG } from '../../shared/constants.js';
import { createRandom } from '../../shared/random.js';

export class Arena {
  constructor({ seed, config = {} }) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new TypeError('Arena requires an unsigned 32-bit integer seed');
    }
    this.config = Object.freeze({ ...DEFAULT_ARENA_CONFIG, ...config });
    this.random = createRandom(seed);
    this.tick = 0;
    this.nextEntityId = 1;
    this.players = new Map();
    this.food = new Map();
    this.spawnFood(this.config.foodTarget);
  }

  addPlayer() {
    const id = this.nextEntityId++;
    const radius = this.radius(this.config.startMass);
    const player = {
      id,
      x: this.random() * (this.config.worldSize - 2 * radius) + radius,
      y: this.random() * (this.config.worldSize - 2 * radius) + radius,
      mass: this.config.startMass,
      dx: 0,
      dy: 0,
    };
    this.players.set(id, player);
    return { ...player };
  }

  setIntent(playerId, dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      throw new TypeError('Movement intent must be finite');
    }
    const player = this.players.get(playerId);
    if (!player) throw new RangeError('Unknown player');

    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    player.dx = dx * scale;
    player.dy = dy * scale;
  }

  step(dt = 1 / this.config.tickHz) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) {
      throw new RangeError('dt must be finite and in (0, 1]');
    }
    for (const player of this.players.values()) {
      const speed = this.speed(player.mass);
      player.x = this.clamp(
        player.x + player.dx * speed * dt,
        this.radius(player.mass),
        this.config.worldSize - this.radius(player.mass),
      );
      player.y = this.clamp(
        player.y + player.dy * speed * dt,
        this.radius(player.mass),
        this.config.worldSize - this.radius(player.mass),
      );
      this.consumeFood(player);
    }
    this.tick = (this.tick + 1) >>> 0;
    this.spawnFood(Math.min(this.config.foodTarget - this.food.size, 100));
  }

  snapshot() {
    return {
      tick: this.tick,
      players: [...this.players.values()].map((player) => ({ ...player })),
      food: [...this.food.values()].map((pellet) => ({ ...pellet })),
    };
  }

  radius(mass) {
    return this.config.radiusScale * Math.sqrt(mass);
  }

  speed(mass) {
    return this.clamp(
      this.config.baseSpeed *
        (mass / this.config.startMass) ** -this.config.speedExponent,
      this.config.minSpeed,
      this.config.maxSpeed,
    );
  }

  consumeFood(player) {
    const playerRadius = this.radius(player.mass);
    for (const pellet of this.food.values()) {
      const pelletRadius = this.radius(pellet.mass);
      if (player.mass < this.config.eatRatio * pellet.mass) continue;
      if (
        Math.hypot(player.x - pellet.x, player.y - pellet.y) <=
        playerRadius - this.config.eatOverlap * pelletRadius
      ) {
        this.food.delete(pellet.id);
        player.mass += pellet.mass;
      }
    }
  }

  spawnFood(count) {
    for (let index = 0; index < count; index += 1) {
      const radius = this.radius(this.config.foodMass);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const x = this.random() * (this.config.worldSize - 2 * radius) + radius;
        const y = this.random() * (this.config.worldSize - 2 * radius) + radius;
        const overlapsPlayer = [...this.players.values()].some(
          (player) =>
            Math.hypot(player.x - x, player.y - y) <
            this.radius(player.mass) + radius,
        );
        if (overlapsPlayer) continue;

        const id = this.nextEntityId++;
        this.food.set(id, { id, x, y, mass: this.config.foodMass });
        break;
      }
    }
  }

  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
}
