import { DEFAULT_ARENA_CONFIG } from '../../shared/constants.js';
import { createRandom } from '../../shared/random.js';

export type ArenaConfig = {
  [Key in keyof typeof DEFAULT_ARENA_CONFIG]: number;
};

export type PlayerCell = {
  id: number;
  x: number;
  y: number;
  mass: number;
  dx: number;
  dy: number;
};

export type FoodPellet = {
  id: number;
  x: number;
  y: number;
  mass: number;
};

export class Arena {
  readonly config: ArenaConfig;
  readonly players = new Map<number, PlayerCell>();
  readonly food = new Map<number, FoodPellet>();
  readonly random: () => number;
  tick = 0;
  private nextEntityId = 1;
  private readonly foodSpatialHash = new Map<string, Set<number>>();
  private readonly spatialCellSize = 100;

  constructor({
    seed,
    config = {},
  }: {
    seed: number;
    config?: Partial<ArenaConfig>;
  }) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new TypeError('Arena requires an unsigned 32-bit integer seed');
    }
    this.config = Object.freeze({ ...DEFAULT_ARENA_CONFIG, ...config });
    this.random = createRandom(seed);
    this.spawnFood(this.config.foodTarget);
  }

  addPlayer(): PlayerCell {
    if (this.players.size >= this.config.maxPlayers) {
      throw new Error('Arena is full');
    }
    const id = this.nextEntityId++;
    const radius = this.radius(this.config.startMass);
    let player: PlayerCell | undefined;
    const nearbyPlayers = [...this.players.values()];
    const spawnAnchor =
      nearbyPlayers[Math.floor(this.random() * nearbyPlayers.length)] ??
      undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance = 250 + this.random() * 250;
      const x = spawnAnchor
        ? spawnAnchor.x + Math.cos(angle) * distance
        : this.config.worldSize / 2;
      const y = spawnAnchor
        ? spawnAnchor.y + Math.sin(angle) * distance
        : this.config.worldSize / 2;
      if (
        x < radius ||
        y < radius ||
        x > this.config.worldSize - radius ||
        y > this.config.worldSize - radius
      ) {
        continue;
      }
      const isClear = [...this.players.values()].every(
        (other) =>
          Math.hypot(other.x - x, other.y - y) >=
          this.radius(other.mass) + radius,
      );
      if (isClear) {
        player = { id, x, y, mass: this.config.startMass, dx: 0, dy: 0 };
        break;
      }
    }
    for (let attempt = 0; !player && attempt < 20; attempt += 1) {
      const x = this.random() * (this.config.worldSize - 2 * radius) + radius;
      const y = this.random() * (this.config.worldSize - 2 * radius) + radius;
      const isClear = [...this.players.values()].every(
        (other) =>
          Math.hypot(other.x - x, other.y - y) >=
          this.radius(other.mass) + radius,
      );
      if (isClear) {
        player = { id, x, y, mass: this.config.startMass, dx: 0, dy: 0 };
      }
    }
    if (!player) throw new Error('Arena has no safe spawn location');
    this.players.set(id, player);
    return { ...player };
  }

  removePlayer(playerId: number): void {
    this.players.delete(playerId);
  }

  setIntent(playerId: number, dx: number, dy: number): void {
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

  step(dt = 1 / this.config.tickHz): void {
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

  snapshot(): { tick: number; players: PlayerCell[]; food: FoodPellet[] } {
    return {
      tick: this.tick,
      players: [...this.players.values()].map((player) => ({ ...player })),
      food: [...this.food.values()].map((pellet) => ({ ...pellet })),
    };
  }

  radius(mass: number): number {
    return this.config.radiusScale * Math.sqrt(mass);
  }

  speed(mass: number): number {
    return this.clamp(
      this.config.baseSpeed *
        (mass / this.config.startMass) ** -this.config.speedExponent,
      this.config.minSpeed,
      this.config.maxSpeed,
    );
  }

  private consumeFood(player: PlayerCell): void {
    const searchRadius =
      this.radius(player.mass) + this.radius(this.config.foodMass);
    const minimumCellX = Math.floor(
      (player.x - searchRadius) / this.spatialCellSize,
    );
    const maximumCellX = Math.floor(
      (player.x + searchRadius) / this.spatialCellSize,
    );
    const minimumCellY = Math.floor(
      (player.y - searchRadius) / this.spatialCellSize,
    );
    const maximumCellY = Math.floor(
      (player.y + searchRadius) / this.spatialCellSize,
    );
    const candidates = new Set<number>();
    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
      for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
        for (const id of this.foodSpatialHash.get(this.cellKey(cellX, cellY)) ??
          []) {
          candidates.add(id);
        }
      }
    }
    for (const id of candidates) {
      const pellet = this.food.get(id);
      if (!pellet) continue;
      const playerRadius = this.radius(player.mass);
      const pelletRadius = this.radius(pellet.mass);
      if (player.mass < this.config.eatRatio * pellet.mass) continue;
      if (
        Math.hypot(player.x - pellet.x, player.y - pellet.y) <=
        playerRadius - this.config.eatOverlap * pelletRadius
      ) {
        this.food.delete(pellet.id);
        this.unindexFood(pellet);
        player.mass = Math.min(
          this.config.maxCellMass,
          player.mass + pellet.mass,
        );
      }
    }
  }

  private spawnFood(count: number): void {
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
        const pellet = { id, x, y, mass: this.config.foodMass };
        this.food.set(id, pellet);
        this.indexFood(pellet);
        break;
      }
    }
  }

  private indexFood(pellet: FoodPellet): void {
    const cellX = Math.floor(pellet.x / this.spatialCellSize);
    const cellY = Math.floor(pellet.y / this.spatialCellSize);
    const key = this.cellKey(cellX, cellY);
    let bucket = this.foodSpatialHash.get(key);
    if (!bucket) {
      bucket = new Set();
      this.foodSpatialHash.set(key, bucket);
    }
    bucket.add(pellet.id);
  }

  private unindexFood(pellet: FoodPellet): void {
    const cellX = Math.floor(pellet.x / this.spatialCellSize);
    const cellY = Math.floor(pellet.y / this.spatialCellSize);
    const key = this.cellKey(cellX, cellY);
    const bucket = this.foodSpatialHash.get(key);
    bucket?.delete(pellet.id);
    if (bucket?.size === 0) this.foodSpatialHash.delete(key);
  }

  private cellKey(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }
}
