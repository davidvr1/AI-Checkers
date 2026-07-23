import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import selfsigned from 'selfsigned';
import { WebSocketServer, type WebSocket } from 'ws';
import { GameRoom } from '../src/net/gameRoom';
import { WS_PATH, type ClientMessage, type ServerMessage } from '../src/net/protocol';

const PORT = Number(process.env.PORT ?? 4173);
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

// Registered up front (before the top-level `await` below) so nothing a client
// sends -- and no async startup hiccup -- can take the process down uncaught.
process.on('uncaughtException', (err) => console.error('[server] uncaught exception (kept alive):', err));
process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection (kept alive):', err));

/** All non-internal IPv4 addresses of this host (its LAN addresses). */
function lanIPv4s(): string[] {
  const ips: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

/**
 * TLS material for the HTTPS server. The app is served over HTTPS because
 * browsers only grant camera access (getUserMedia, for the video feature) on a
 * secure origin. A real cert can be supplied via TLS_CERT_FILE/TLS_KEY_FILE
 * (e.g. mkcert, to avoid the browser warning); otherwise a self-signed cert is
 * generated in memory, valid for localhost and this host's LAN IPs -- browsers
 * will still show a one-time "not trusted" warning to click through on a LAN.
 */
async function loadTls(): Promise<{ cert: string | Buffer; key: string | Buffer; selfSigned: boolean }> {
  const certFile = process.env.TLS_CERT_FILE;
  const keyFile = process.env.TLS_KEY_FILE;
  if (certFile || keyFile) {
    if (certFile && keyFile) {
      try {
        return { cert: readFileSync(certFile), key: readFileSync(keyFile), selfSigned: false };
      } catch (err) {
        // Never crash on a bad path -- fall back to self-signed with a clear note.
        console.error(
          `[server] could not read TLS_CERT_FILE/TLS_KEY_FILE (${(err as Error).message}); using a self-signed certificate instead.`,
        );
      }
    } else {
      console.warn(
        '[server] both TLS_CERT_FILE and TLS_KEY_FILE are required for a custom certificate; using a self-signed one.',
      );
    }
  }
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'checkers.local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2 as const, value: 'localhost' },
          { type: 7 as const, ip: '127.0.0.1' },
          ...lanIPv4s().map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });
  return { cert: pems.cert, key: pems.private, selfSigned: true };
}

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

const tls = await loadTls();
const httpsServer = createHttpsServer({ cert: tls.cert, key: tls.key }, app);
// maxPayload caps a single frame at 64 KB. Signaling frames (SDP/ICE) are the
// largest legitimate payload but stay well under this; a move/chat is tiny.
const wss = new WebSocketServer({ server: httpsServer, path: WS_PATH, maxPayload: 64 * 1024 });

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
  // Replay recent chat so a joining player sees the conversation in progress.
  send(socket, { type: 'chat', messages: room.chatHistory() });

  socket.on('message', (raw) => {
    // Everything past JSON.parse is wrapped too: message payloads are arbitrary
    // client JSON, and no single malformed frame may ever crash the one shared
    // process. GameRoom's methods shape-check, but this is belt-and-braces.
    try {
      const message: ClientMessage = JSON.parse(raw.toString());
      if (message.type === 'chat') {
        const chatMessage = room.chat(socket, message.text);
        if (chatMessage) {
          for (const client of wss.clients) send(client, { type: 'chat', messages: [chatMessage] });
        }
        return;
      }
      if (message.type === 'signal') {
        // Relay opaque WebRTC signaling to the other player only (video is P2P).
        const opponent = room.opponentOf(socket);
        if (opponent) send(opponent, { type: 'signal', from: room.roleFor(socket), data: message.data });
        return;
      }
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

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Checkers online is running (HTTPS) on port ${PORT}.\n`);
  if (process.env.RUNNING_IN_DOCKER) {
    // Inside a container, os.networkInterfaces() reports the container's private
    // IPs, which no other device can reach. Point users at the host instead.
    console.log(`  On this computer:      https://localhost:${PORT}`);
    console.log('  On other devices:      https://<THIS-MACHINE-LAN-IP>:' + PORT);
    console.log('                         (run `ipconfig` / `ip addr` on the host to find its LAN IP)');
  } else {
    const ips = lanIPv4s();
    console.log(`  On this computer:      https://localhost:${PORT}`);
    if (ips.length > 0) {
      console.log('  On other WiFi devices:');
      for (const ip of ips) console.log(`                         https://${ip}:${PORT}`);
    } else {
      console.log('  (No LAN IPv4 address found -- are you connected to WiFi?)');
    }
  }
  console.log('\n  First device to open it plays Red, second plays Black. Others watch.');
  if (tls.selfSigned) {
    console.log('\n  NOTE: using a self-signed certificate, so each device shows a one-time');
    console.log('  "your connection is not private" warning -- click Advanced -> Proceed.');
    console.log('  (HTTPS is required for the camera feature to work.)');
  }
  console.log('');
});
