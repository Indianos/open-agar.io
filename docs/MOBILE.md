# Mobile support (later phase)

Status: Planned

## Scope and architectural seams

Status: Planned

Mobile support is **phase 6**, not a prototype acceptance requirement. Preserve
device-independent intent, server authority, world-unit geometry, and snapshot
buffers from day one; do not ship a separate mobile simulation or backend.
See [ARCHITECTURE.md](ARCHITECTURE.md) and
[NETWORKING.md](NETWORKING.md) for those contracts.

## Touch controls and responsive layout

Status: Planned

Planned `client/src/input/touch.js` implements the same `readIntent/reset` contract
as pointer/keyboard. Proposed defaults:

| Planned control/layout | Starting value / behavior |
| --- | --- |
| Movement | Left-side floating virtual joystick |
| Joystick radius/deadzone | 60 CSS px / 8 CSS px; scale remaining radius to 0..1 |
| Split/eject | Right-side buttons, ≥48×48 CSS px, ≥12 px separation |
| Action semantics | One edge per press; no held turbo-eject in v1 |
| Multi-touch | Capture joystick pointer ID independently of action fingers |
| Placement | Respect `env(safe-area-inset-*)`; configurable left/right layout |
| Orientation | Portrait and landscape; do not require orientation lock |
| Menus/HUD | Responsive HTML overlay; readable names, high-contrast controls |

Use Pointer Events, pointer capture, and `touch-action: none` **only on the game
surface/control elements**. Handle `pointercancel`, lost capture, blur, and adapter
switch by resetting movement/actions. Prevent browser scroll/zoom during active
game gestures without disabling accessible page zoom in menus. Don't hijack
typing in login fields. Keep focusable labeled action buttons and optional
keyboard access.

Use `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`;
do not set `user-scalable=no`. Observe canvas CSS size with `ResizeObserver`;
backing-store size is CSS size × effective DPR, while pointer mapping uses CSS
coordinates. Clamp world aspect to the server's negotiated value and letterbox
outside the allowed range. Rotate/rescale without reconnecting; send bounded
SETTINGS updates after debouncing (≤1/s).

## Rendering and memory budget

Status: Planned

| Planned quality tier | Effective DPR cap | Render target | Cosmetic policy |
| --- | --- | --- | --- |
| High | 2 | 60 FPS | Simple outlines/text, limited effects |
| Balanced | 1.5 | 60 FPS | Fewer labels/effects |
| Battery/low | 1 | 30 FPS | No particles/shadows; cached labels |

Automatic downgrade after sustained frame-time p95 >20 ms for 5 seconds; upgrade
only after 30 seconds stable to prevent oscillation. Always offer manual override.
Pool short-lived render records, reuse buffers, cull offscreen drawing, and cache
text. Do not lower simulation correctness, hide visible enemies, or alter hit
radii for performance. Keep the 6,000-entity assembly cap from the protocol.
Measure on actual lower-end devices, not only desktop CPU throttling.

## Network, battery, and background behavior

Status: Planned

Offer low-bandwidth mode explicitly, using 5 Hz snapshots, ≤15 Hz inputs, 250 ms
interpolation, and reduced camera span as defined in NETWORKING.md. Missing
Network Information API support is normal: treat it as an optional hint, not an
availability gate. Switch based on sustained RTT/jitter/buffer pressure, not
user-agent detection. Suggested downgrade trigger: RTT >250 ms or >100 ms jitter
for 10 seconds; recovery needs 30 seconds below thresholds plus user preference.
No mobile-only movement advantages.

On `visibilitychange` to hidden: reset intent and send neutral INPUT if possible,
stop `requestAnimationFrame`, close the game socket deliberately, and start no
reconnect loop. There is no promise that a final message or unload handler runs.
The server's 30-second edible-body grace remains authoritative regardless.
On return show a resume button; after user consent request a fresh resume ticket.
If the body expired/died, show respawn, not “continue offline.”

Never depend on background timers, service workers, or background sync to keep
an arena session alive. Avoid wake locks by default; optional opt-in only during
visible play with feature detection. No continuous polling when disconnected.
Measure sustained thermal throttling, battery drain, and cellular data use in
20-minute sessions before claiming support.

## Optional PWA

Status: Planned

Later planned files: `client/public/manifest.webmanifest` and
`client/public/sw.js`. PWA installation is optional, not required to play.
Service worker caches only hashed static assets and a minimal offline information
page. Never cache `/api`, ticket/session responses, WSS data, or replay secrets.
No offline gameplay/ranked scores. An offline fallback should say a connection
is required, not start a fake live arena.

Version caches and prompt for updates between lives, not mid-match. Validate
scope, logout privacy, and a working unregister/update recovery path. HTTPS and
platform-specific install limitations must be tested before adding install UI.

## Device test checklist

Status: Planned

- [ ] Real iPhone Safari (current/previous supported OS), including small screen/notch.
- [ ] Real iPad Safari, multitouch and external keyboard.
- [ ] Real low/mid-range Android Chrome plus a high-DPR Android device.
- [ ] Portrait/landscape, browser toolbar expansion, safe areas, software keyboard.
- [ ] Joystick + simultaneous split/eject; finger leaves surface; pointercancel.
- [ ] Pinch/scroll behavior in menus versus game; focus, labels, contrast.
- [ ] Wi-Fi → cellular IP change, 250+ ms RTT, jitter, intermittent loss.
- [ ] Background 5 seconds/35 seconds, screen lock, call interruption, killed tab.
- [ ] Resume-token rotation, no duplicated body/actions, honest expiry UI.
- [ ] 20-minute thermal/battery/data run; DPR/FPS downgrade and recovery.
- [ ] Optional installed PWA update/offline/logout paths on each supported platform.

Record device/OS/browser versions, frame-time p95, memory, RTT, and bytes/minute.
Mobile “Done” means this matrix passes, not merely that a touch listener exists.
