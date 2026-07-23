import { createServer as createHttpServer } from 'node:http';
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

// --- Game sessions, keyed by a short share code -------------------------------
// Each code is an independent match (its own GameRoom + connected clients), so a
// public URL can be shared safely: only people with your code join your game.
// Codes avoid look-alike characters (no O/0, I/1/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
/** How long an empty session is kept before it's swept (allows brief drop/rejoin). */
const EMPTY_SESSION_TTL_MS = 10 * 60_000;

interface Session {
  room: GameRoom<WebSocket>;
  clients: Set<WebSocket>;
  /** When the session became client-less, for the sweeper; null while occupied. */
  emptySince: number | null;
}

const sessions = new Map<string, Session>();

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercases and validates a client-supplied code; null if it isn't well-formed. */
function normalizeCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null;
}

function getOrCreateSession(code: string): Session {
  let session = sessions.get(code);
  if (!session) {
    session = { room: new GameRoom<WebSocket>(), clients: new Set(), emptySince: Date.now() };
    sessions.set(code, session);
  }
  return session;
}

/** Reserves and returns a code that isn't already in use. */
function reserveNewCode(): string {
  let code = randomCode();
  while (sessions.has(code)) code = randomCode();
  getOrCreateSession(code);
  return code;
}

// Drop sessions that have sat empty past the TTL, so codes and memory don't leak.
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (session.clients.size === 0 && session.emptySince !== null && now - session.emptySince > EMPTY_SESSION_TTL_MS) {
      sessions.delete(code);
    }
  }
}, 60_000).unref?.();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Broadcasts to one session's clients only -- never across games. */
function broadcastSync(session: Session): void {
  const message: ServerMessage = {
    type: 'sync',
    state: session.room.state,
    players: session.room.presence(),
  };
  for (const client of session.clients) send(client, message);
}

// --- HTTP (serves the built app) + WebSocket (game sync) on one port ----------
const app = express();

// Hands the client a fresh, unused game code (and reserves it). Registered before
// the static/SPA handlers so it isn't swallowed by the index.html fallback.
app.get('/api/new-code', (_req, res) => {
  res.json({ code: reserveNewCode() });
});

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

/**
 * Behind a TLS-terminating proxy (a Cloudflare/ngrok tunnel, or a cloud host) the
 * public HTTPS is provided for us, so the origin must speak plain HTTP. Set
 * HTTP_ONLY=1 for that. Direct LAN use keeps HTTPS, which browsers require for
 * camera access on a non-localhost address.
 */
const httpOnly = process.env.HTTP_ONLY === '1' || process.env.HTTP_ONLY === 'true';
const tls = httpOnly ? null : await loadTls();
const httpServer = httpOnly
  ? createHttpServer(app)
  : createHttpsServer({ cert: tls!.cert, key: tls!.key }, app);
// maxPayload caps a single frame at 64 KB. Signaling frames (SDP/ICE) are the
// largest legitimate payload but stay well under this; a move/chat is tiny.
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

wss.on('connection', (socket, request) => {
  // Route this socket to the game named by ?g=CODE. Without a valid code there's
  // no game to join, so close rather than dumping the client into someone else's.
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const code = normalizeCode(requestUrl.searchParams.get('g'));
  if (!code) {
    socket.close(1008, 'missing or invalid game code');
    return;
  }
  const session = getOrCreateSession(code);
  const room = session.room;
  session.clients.add(socket);
  session.emptySince = null;

  alive.set(socket, true);
  socket.on('pong', () => alive.set(socket, true));

  const role = room.join(socket);
  send(socket, { type: 'welcome', role });
  broadcastSync(session);
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
          for (const client of session.clients) send(client, { type: 'chat', messages: [chatMessage] });
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
      if (changed) broadcastSync(session);
    } catch {
      // ignore malformed / unparseable frames
    }
  });

  socket.on('close', () => {
    room.leave(socket);
    session.clients.delete(socket);
    // Start the sweep clock once nobody is left in this game.
    if (session.clients.size === 0) session.emptySince = Date.now();
    broadcastSync(session);
  });

  // A per-socket error (reset by peer, etc.) must not bubble to an uncaught
  // exception; closing lets the normal close handler free the seat.
  socket.on('error', () => socket.close());
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const scheme = httpOnly ? 'http' : 'https';
  console.log(`\n  Checkers online is running (${scheme.toUpperCase()}) on port ${PORT}.\n`);
  if (httpOnly) {
    console.log(`  Origin:                http://localhost:${PORT}`);
    console.log('  HTTP_ONLY=1 -- expecting a tunnel/proxy in front to provide public HTTPS.');
  } else if (process.env.RUNNING_IN_DOCKER) {
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
  console.log('\n  Create a game to get a code, then share the code (or link) with your opponent.');
  if (tls?.selfSigned) {
    console.log('\n  NOTE: using a self-signed certificate, so each device shows a one-time');
    console.log('  "your connection is not private" warning -- click Advanced -> Proceed.');
    console.log('  (HTTPS is required for the camera feature to work.)');
  }
  console.log('');
});
