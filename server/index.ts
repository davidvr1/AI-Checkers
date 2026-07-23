import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameRoom } from '../src/net/gameRoom';
import { WS_PATH, type ClientMessage, type ServerMessage } from '../src/net/protocol';

const PORT = Number(process.env.PORT ?? 4173);
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

// One shared match for the whole server (a home-WiFi, two-player scenario). All
// authoritative game/seat logic lives in GameRoom -- this file is just the
// WebSocket adapter around it. Browsers only ever render what we broadcast.
const room = new GameRoom<WebSocket>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastSync(wss: WebSocketServer): void {
  const message: ServerMessage = { type: 'sync', state: room.state, players: room.presence() };
  for (const client of wss.clients) send(client, message);
}

// --- HTTP (serves the built app) + WebSocket (game sync) on one port ----------
const app = express();
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: return index.html only for extension-less GET paths (client
  // routes). A missing hashed asset (e.g. a stale /assets/*.js) should 404, not
  // silently return HTML -- otherwise a build/deploy mismatch surfaces on the
  // second device as a cryptic "unexpected token '<'" instead of a clear 404.
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.includes('.')) {
      res.sendFile(join(distDir, 'index.html'));
    } else {
      res.status(404).type('text/plain').send('Not found');
    }
  });
} else {
  app.use((_req, res) =>
    res
      .status(503)
      .type('text/plain')
      .send('The app has not been built yet. Run `npm run build`, then restart the server.'),
  );
}

const httpServer = createServer(app);
// maxPayload caps a single frame at 64 KB -- a move/reset is tiny, so this just
// denies an unauthenticated LAN client an easy memory-pressure lever.
const wss = new WebSocketServer({ server: httpServer, path: WS_PATH, maxPayload: 64 * 1024 });

// Liveness sockets that die without a clean TCP close (a phone leaving WiFi, iOS
// suspending the tab) would otherwise hold their seat forever. We ping every
// client periodically; anyone who missed the previous pong is terminated, which
// fires `close` and frees the seat for a reconnecting device.
const alive = new WeakMap<WebSocket, boolean>();
const HEARTBEAT_MS = 15_000;
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (alive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (socket) => {
  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  const role = room.join(socket);
  send(socket, { type: 'welcome', role });
  broadcastSync(wss);

  socket.on('message', (raw) => {
    // Everything past JSON.parse is wrapped too: `message.move` is arbitrary
    // client JSON, and no single malformed frame may ever crash the one shared
    // process. GameRoom.move already shape-checks, but this is belt-and-braces.
    try {
      const message: ClientMessage = JSON.parse(raw.toString());
      const changed =
        message.type === 'move'
          ? room.move(socket, message.move)
          : message.type === 'reset'
            ? room.reset(socket)
            : false;
      if (changed) broadcastSync(wss);
    } catch {
      // ignore malformed / unparseable frames
    }
  });

  socket.on('close', () => {
    room.leave(socket);
    broadcastSync(wss);
  });

  // A per-socket error (reset by peer, etc.) must not bubble to an uncaught
  // exception; closing lets the normal close handler free the seat.
  socket.on('error', () => socket.close());
});

// Last-resort guard: nothing a client can send should take the server down.
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception (kept alive):', err);
});

function lanUrls(): string[] {
  const urls: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) urls.push(`http://${addr.address}:${PORT}`);
    }
  }
  return urls;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls();
  console.log(`\n  Checkers online is running on port ${PORT}.\n`);
  console.log(`  On this computer:      http://localhost:${PORT}`);
  if (urls.length > 0) {
    console.log('  On other WiFi devices:');
    for (const url of urls) console.log(`                         ${url}`);
  } else {
    console.log('  (No LAN IPv4 address found -- are you connected to WiFi?)');
  }
  console.log('\n  First device to open it plays Red, second plays Black. Others watch.\n');
});
