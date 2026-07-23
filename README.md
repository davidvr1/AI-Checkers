# AI-Checkers

A browser-playable checkers/draughts game — **local two-player**, **vs an AI**
(minimax + alpha-beta), and **online two-player over your LAN**. React + TypeScript
(Vite) client with a small authoritative Node (Express + `ws`) server for online play.
English / Hebrew UI with full right-to-left support.

**Rules:** a house variant — international-style *flying kings* (slide any distance
along a diagonal) with *forward-only* captures for men, mandatory captures,
multi-jump chains, and draws by the 50-move rule, threefold repetition, or
insufficient material.

## Run it

### Play online (two devices on the same network)

**With Docker (recommended — runs anywhere):**

```bash
docker compose up -d --build      # or: docker build -t ai-checkers . && docker run -d -p 4173:4173 ai-checkers
```

Then on any device on the same network, open **`http://<HOST-MACHINE-LAN-IP>:4173`**
(find the host's IP with `ipconfig` on Windows or `ip addr` on Linux/macOS).
The first device to open it plays **Red**, the second plays **Black**, and anyone
else can watch. To use a different port: `docker run -d -e PORT=3000 -p 3000:3000 ai-checkers`.

**Without Docker** (Node 20+):

```bash
npm install
npm run serve      # builds the app, then starts the server; it prints the LAN URLs to open
```

> On Windows, allow Node through the firewall (Private networks) the first time,
> or other devices can't connect.

### Local development

```bash
npm install
npm run dev        # Vite dev server (single-device local & vs-AI play)
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (client only) |
| `npm run build` | Type-check + build the client into `dist/` |
| `npm run serve` | Build, then start the online server (serves `dist/` + WebSocket) |
| `npm run server` | Start the server against an existing `dist/` (no rebuild) |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run typecheck:server` | Type-check the Node server |
| `npx playwright test` | Run the end-to-end tests |

## How online play works

The server holds the single authoritative game state and validates every move
through the same rules engine the client uses; clients render what the server
broadcasts and never advance the game locally. Dropped connections are detected
(heartbeat) and clients auto-reconnect and reclaim their seat, resuming the game.
It has **no authentication** — it trusts everyone who can reach it, so run it only
on a trusted private network, not exposed to the internet.
