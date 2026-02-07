# VAGUE — Word Imposter Game

A social-deduction word game where players try to identify the imposter among them. One player is secretly the imposter and doesn't know the secret word — they only get a vague hint. All players give one-word clues, then debate and vote to find the imposter.

## How to Run

Because the project uses ES modules (`type="module"`), you need a local HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js (npx, no install needed)
npx serve .

# VS Code — install the "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8000` in your browser.

> **Note:** Opening `index.html` directly via `file://` will not work in most browsers due to module CORS restrictions.

## Controls

| Action          | Keyboard P1     | Keyboard P2       | Gamepad        |
|-----------------|------------------|--------------------|----------------|
| Navigate        | W / A / S / D   | Arrow keys         | D-pad / Stick  |
| Confirm / Reveal| Space            | Enter              | A button       |
| Back / Cancel   | Escape / Q       | Backspace          | B button       |

## Game Modes

### Single Player / Local (Pass & Play)

1. **New Game** or **Multiplayer → Local**
2. Add 3+ player names and pick a category.
3. Pass the device — each player taps to see their role privately.
4. One player is the **Imposter** (sees "???" and a vague hint).
5. Everyone else is a **Civilian** (sees the secret word).
6. **Clue Phase** — each player gives a one-word clue that proves they know the word without giving it away.
7. **Debate Phase** — discuss and figure out who the imposter is.
8. **Finish Mission** to end, or **Next Round** to continue with the same word.

### Online Multiplayer (Peer-to-Peer, No Server)

Uses WebRTC with manual signalling — no backend required.

#### Hosting

1. Go to **Multiplayer → Host Online Game**.
2. Enter your name and choose a category.
3. Click **Generate Invite Code** — wait a few seconds for ICE gathering.
4. **Copy** the invite code and send it to a friend (any messaging app).
5. They will send you a **response code** — paste it and click **Connect Player**.
6. Repeat steps 3–5 for each additional player.
7. Click **Start Game** once you have 3+ players.

#### Joining

1. Go to **Multiplayer → Join Online Game**.
2. Enter your name.
3. Paste the host's **invite code**.
4. Click **Join Game** — wait a few seconds.
5. **Copy** your response code and send it back to the host.
6. Wait for the host to connect you and start the game.

#### How It Works Online

- Each player sees their role on **their own device** (no passing needed).
- The host controls game flow (next phase, finish mission).
- State syncs automatically every 3 seconds.
- Ping/pong keeps latency measured.

## Message Protocol (v1)

All messages are JSON with a `type` field:

| Type            | Direction    | Description                           |
|-----------------|-------------|---------------------------------------|
| `hello`         | Peer → Host | Peer announces name + protocol version |
| `welcome`       | Host → Peer | Acknowledges connection                |
| `lobby_update`  | Host → All  | Updated player list                    |
| `game_start`    | Host → Peer | Game config + individual role          |
| `phase_change`  | Host → All  | Phase transition + full state          |
| `sync`          | Host → All  | Periodic state snapshot + checksum     |
| `ready`         | Peer → Host | Peer has seen their role               |
| `input`         | Peer → Host | Player action                          |
| `ping`          | Both        | Latency measurement                    |
| `pong`          | Both        | Latency response                       |
| `error`         | Both        | Error notification                     |
| `disconnect`    | Both        | Graceful disconnect                    |

## Troubleshooting

| Problem                              | Solution                                          |
|--------------------------------------|---------------------------------------------------|
| Blank page / modules not loading     | Use a local HTTP server (see "How to Run" above). |
| Invite code generation hangs         | Check that you're online (STUN servers need internet). Try a different browser. |
| "Connection failed" on answer paste  | Make sure you copied the **entire** code with no extra spaces. |
| Game desyncs                         | The host is authoritative — trust the host's screen. Reconnect if needed. |
| Peer can't connect across networks   | WebRTC needs STUN. If behind a strict NAT/firewall, a TURN server may be needed (not included). |

## Project Structure

```
├── index.html          Entry point
├── app.js              Main coordinator — wires modules + game loop
├── style.css           All styles
├── data/
│   └── words.js        Word database (categories + hints)
├── js/
│   ├── game.js         Game state + logic
│   ├── render.js       DOM updates + screen management
│   ├── input.js        Keyboard + gamepad handling
│   ├── net.js          WebRTC networking + message protocol
│   └── utils.js        Shared helpers
└── README.md           This file
```

## What Was Changed (Upgrade Summary)

### Bugs Fixed
- **Multiplayer & Settings buttons** now work (previously had no event listeners).
- **XSS vulnerability** — player names are now escaped via `textContent` instead of `innerHTML`.
- **Global `window.removePlayer`** replaced with proper event delegation.
- **Restart Game** now returns to setup screen instead of silently restarting with stale settings.
- **Timer drift** — replaced `setInterval` with `requestAnimationFrame` + fixed-step accumulator.
- **Timer leak** — timer state properly cleaned up on all navigation paths.
- **Word repetition** — tracks used words per session; cycles through all before repeating.
- **Duplicate player names** — clear error toast instead of silent rejection.
- **Missing round tracking** — round counter now properly incremented.

### New Features
- **Online multiplayer** via WebRTC (peer-to-peer, manual signalling, no server).
- **Host/Join lobby screens** with step-by-step signalling UX.
- **Per-device role reveal** in online mode (no more passing the phone).
- **Settings screen** with control reference.
- **Keyboard shortcuts** — Space/Enter to confirm, Escape to back, WASD + Arrows for navigation.
- **Gamepad support** — D-pad + A/B buttons.
- **Toast notifications** for feedback on all actions.

### Architecture Improvements
- **Modular code** — split into 5 focused modules (`game`, `render`, `input`, `net`, `utils`).
- **Clean game loop** — `requestAnimationFrame` with fixed-step timer.
- **State management** — single source of truth in `game.js`, read-only by convention elsewhere.
- **No unnecessary DOM work** — text updates use `textContent`, player list built with DOM API.
- **Proper event cleanup** — `beforeunload` closes WebRTC connections.

### Accessibility
- ARIA labels on all interactive elements.
- Focus-visible outlines on buttons and inputs.
- `aria-live` regions for dynamic content.
- Keyboard-navigable reveal box (`tabindex`, `role="button"`).
- Screen headings focusable for screen reader announcements.
