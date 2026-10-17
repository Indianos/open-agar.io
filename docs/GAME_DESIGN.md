# Game design

Status: Planned

## Arena, objective, and units

Status: Planned

An arena is a continuous free-for-all. Each life begins with one cell; death occurs
when no cells remain. Score is peak total owned mass during that life, not a value
supplied by the browser. One life produces one
[match result](DATABASE.md), even though the arena continues running.
Respawn requires a new ticket/life, never silently resurrects a result.

World coordinates and radii use world units (WU); speed uses WU/second and mass
uses abstract mass units. Mass is floating point in simulation. Radius is always
derived: `radius(m) = RADIUS_SCALE * sqrt(m)`. No separate mutable radius exists.

## Tunable constants (starting proposal)

Status: Planned

All gameplay tuning belongs in planned `shared/constants.js`; these values are
unmeasured starting points. Network/security/operational limits belong to their
own documents, not this table.

| Constant | Proposed value | Meaning |
| --- | --- | --- |
| `WORLD_SIZE` | 12,000 WU | Square bounds, origin at top-left |
| `MAX_PLAYERS` | 64 | Includes reconnect-reserved lives |
| `START_MASS` | 20 | One initial cell |
| `MIN_CELL_MASS` | 10 | Decay floor, not an immunity to eating |
| `MAX_CELL_MASS` | 20,000 | Reject further gains above cap; overflow is discarded |
| `MAX_CELLS` | 16 | Per player |
| `RADIUS_SCALE` | 4 WU / sqrt(mass) | Geometric conversion |
| `BASE_SPEED` | 220 WU/s | Speed at start mass |
| `SPEED_EXPONENT` | 0.25 | Larger cells move more slowly |
| `MIN_SPEED`, `MAX_SPEED` | 35, 300 WU/s | Clamps on unboosted speed |
| `STEERING_RADIUS` | 200 CSS px | Desktop pointer reaches full intent here |
| `EAT_RATIO` | 1.15 | Eater must have at least 115% of target mass |
| `EAT_OVERLAP` | 0.35 | Required target-radius penetration factor |
| `SPLIT_MIN_MASS` | 40 | Eligible parent mass |
| `SPLIT_BOOST_SPEED` | 650 WU/s | Added initial split velocity |
| `SPLIT_BOOST_TIME` | 0.6 s | Linear boost decay duration |
| `SPLIT_COOLDOWN` | 0.5 s | Per-player action gate |
| `MERGE_BASE`, `MERGE_PER_MASS` | 10 s, 0.02 s/mass | Timer computed at split/burst |
| `EJECT_MIN_MASS` | 35 | Eligible emitting cell |
| `EJECT_COST`, `EJECT_MASS` | 14, 12 | Difference is deliberate mass sink |
| `EJECT_SPEED`, `EJECT_BOOST_TIME` | 450 WU/s, 0.4 s | Pellet impulse and linear decay |
| `EJECT_COOLDOWN` | 0.15 s | Per-player action gate |
| `DECAY_RATE`, `DECAY_THRESHOLD` | 0.002/s, 100 mass | Decay only above threshold |
| `FOOD_TARGET`, `FOOD_MASS` | 2,000, 1 | Population and per-pellet mass |
| `FOOD_REFILL_RATE` | 100/s | Fractional spawn budget, bounded by target |
| `VIRUS_TARGET`, `VIRUS_MASS` | 30, 100 | Population and per-virus mass |
| `VIRUS_REFILL_RATE` | 1/s | No unbounded spawning loop |
| `VIRUS_FEED_COUNT` | 7 | Ejected pellets to create one daughter virus |
| `VIRUS_LAUNCH_SPEED`, `VIRUS_BOOST_TIME` | 300 WU/s, 0.5 s | Daughter impulse |
| `MAX_EJECTED`, `EJECTED_TTL` | 500, 20 s | Arena pellet cap and expiry |
| `SPAWN_ATTEMPTS`, `SPAWN_CLEARANCE` | 20, 3 radii | Bounded search away from larger enemies |
| `SIBLING_SEPARATION_TIME` | 0.6 s | Allow split siblings to overlap during boost |
| `CAMERA_BASE_SPAN` | 1,200 WU | Initial visible vertical world span |
| `CAMERA_MASS_SCALE` | 0.5 | Span exponent on total mass / start mass |
| `CAMERA_MAX_SPAN` | 3,000 WU | Normal maximum vertical span |
| `CAMERA_MAX_ASPECT` | 16/9 | Wider windows letterbox instead of gaining vision |
| `CAMERA_SMOOTH_TIME` | 0.15 s | Cosmetic camera easing |

## Movement and eating

Status: Planned

For each cell of mass `m`, unboosted speed is:

```text
speed(m) = clamp(BASE_SPEED * (m / START_MASS)^(-SPEED_EXPONENT),
                 MIN_SPEED, MAX_SPEED)
velocity = normalizedIntent * speed(m) + currentBoostVelocity
position += velocity * dt
```

Intent magnitude is 0..1; all owned cells use the same direction. Zero intent
stops normal movement. Clamp each center to `[radius, WORLD_SIZE - radius]`.
Boost velocity falls linearly to zero over its duration; clamp position at walls,
do not reflect or wrap. No acceleration or momentum exists outside boosts.

Use a spatial hash for candidate pairs, then exact circles. Eating requires both
`eaterMass >= EAT_RATIO * targetMass` and
`distance <= eaterRadius - EAT_OVERLAP * targetRadius`. This applies to food,
ejected pellets, enemy cells, and viruses; own cells merge by separate rules.
Consume the target once and add its mass up to `MAX_CELL_MASS`. Equal-sized cells
cannot eat each other. Non-eating enemy cells may overlap; this is not a rigid-body
physics game. Compute score after all gains/losses in a tick.

Decay per cell is
`m -= max(0, m - DECAY_THRESHOLD) * DECAY_RATE * dt`, clamped to
`MIN_CELL_MASS`. Never decay below the threshold from decay alone.

## Split, eject, merge

Status: Planned

**Split:** one action attempts to divide each eligible cell once, largest first,
ID breaking ties, until `MAX_CELLS`. Replace parent mass `m` with two cells `m/2`;
preserve parent ID and allocate a new child ID. Child starts tangent to the parent
in intent direction, clamped to bounds, and receives split boost. Zero intent
uses the last nonzero direction, or `(1, 0)` if none. Set both merge deadlines to
at least `now + MERGE_BASE + MERGE_PER_MASS * m`, using pre-split mass. Successful
action starts cooldown; rejected actions do not modify mass.

**Eject:** one action emits one pellet from each eligible cell in descending mass
order, subject to global pellet cap. Subtract 14, emit mass 12 just outside the
cell along the same direction rule, and boost the pellet. No mass is charged if
the cap prevents creation. Anyone, including the emitter, can eat it once the
geometric eating condition holds. Pellets expire after TTL; no refund.

**Merge:** after separation time, siblings not yet merge-ready are pushed apart
equally along their center vector (ID-based axis for coincident centers), then
clamped to bounds. At walls they may remain overlapped. Once both deadlines have
passed and circles overlap, merge into lower ID at mass-weighted center; sum mass
up to the cap, keep the later deadline, and delete the other. Splitting resets
deadlines only for participating cells.

## Viruses and spawning

Status: Planned

Eating a virus adds its mass, removes the virus, and divides the consuming cell
into `k = min(availableSlots + 1, floor(combinedMass / MIN_CELL_MASS))`
equal fragments. If `k=1`, the virus is simply consumed at the cell cap. Fragments
use evenly spaced directions starting from intent angle, split boost, and merge
deadlines based on pre-burst combined mass. This conserves mass before the cap.

A virus can absorb an overlapping ejected pellet regardless of `EAT_RATIO`.
Pellet mass is discarded; count feeds. At seven feeds, reset count and spawn one
100-mass daughter along the latest pellet's velocity, **only if below
`VIRUS_TARGET`**. If capped, discard the feed trigger without spawning. This is
an explicit source/sink rule, not mass conservation. Viruses do not eat players.

Initialize food/viruses to targets using seeded uniform positions. Refill from
per-second budgets after collisions; do not exceed targets, and do not spawn
inside cells. Each spawn has at most `SPAWN_ATTEMPTS`; failures defer budget
(cap retained budget at one second). Player spawn tries positions with no larger
enemy within `SPAWN_CLEARANCE * enemyRadius + ownRadius`; if none is found, reject
join with `ARENA_BUSY`, not temporary invincibility.

## Camera and presentation

Status: Planned

Center on owned cells' mass-weighted centroid. Desired vertical span is
`clamp(CAMERA_BASE_SPAN * (totalMass / START_MASS)^CAMERA_MASS_SCALE,
CAMERA_BASE_SPAN, CAMERA_MAX_SPAN)`. Expand as needed to include all owned cell
bounds plus 100 WU padding, up to the same cap; offscreen own cells get HUD arrows.
Server provides center/span; client eases visually but never requests unlimited
vision. Clamp effective aspect to `[1/2, CAMERA_MAX_ASPECT]`, letterbox outside
that range, and account for padding in [network culling](NETWORKING.md).
Low-bandwidth mode may reduce maximum span as documented there.
