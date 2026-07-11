import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { parseIncomingMessage } from '@chaos-parcel/shared';
import { RoomManager } from './roomManager.js';
import {
  handleConnectionMessage,
  handleDisconnect,
  handleHostRoomCreate,
} from './handlers/connection.js';
import type { ClientMeta } from './types.js';
import { createBillingRouter, handleStripeWebhook } from './billingRoutes.js';
import { verifyPartyPassToken } from './partyPass.js';
import { createDeviceProfileRouter } from './deviceProfileStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const WS_PATH = process.env.WS_PATH ?? '/ws';
const PARTY_MODE = process.env.PARTY_MODE === 'true';
const SERVE_CLIENT = process.env.SERVE_CLIENT === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Public site URL (Render sets RENDER_EXTERNAL_URL automatically). */
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  ''
).replace(/\/$/, '');

const JOIN_BASE_URL =
  process.env.JOIN_BASE_URL ??
  (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/join` : 'http://localhost:5173/join');

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const configuredOrigins = (
  process.env.CORS_ORIGIN ??
  (PUBLIC_BASE_URL || 'http://localhost:5173')
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (configuredOrigins.includes('*')) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (PUBLIC_BASE_URL && origin === PUBLIC_BASE_URL) return true;
  // LAN party only — do not set PARTY_MODE on public internet deploys
  if (PARTY_MODE && LAN_ORIGIN.test(origin)) return true;
  return false;
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }),
);

// Stripe webhooks need the raw body — register before express.json().
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    void handleStripeWebhook(req, res);
  },
);

app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), party_mode: PARTY_MODE });
});

app.use('/api/billing', createBillingRouter());
app.use('/api/device-profiles', createDeviceProfileRouter());

if (SERVE_CLIENT && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/(health|api|ws)).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: WS_PATH });
const roomManager = new RoomManager();

const connectionMeta = new WeakMap<WebSocket, ClientMeta>();

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
  const roleParam = url.searchParams.get('role');
  const role = roleParam === 'host' ? 'host' : 'player';

  const meta: ClientMeta = { role };
  connectionMeta.set(socket, meta);

  // Keepalive through mobile NATs / proxies (browser answers with pong automatically).
  const pingInterval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }, 25_000);

  socket.on('message', (data) => {
    const raw = data.toString();

    if (meta.role === 'host' && !meta.roomCode) {
      try {
        const message = parseIncomingMessage(JSON.parse(raw), 'host');
        if (message.event === 'ROOM_CREATE') {
          const joinBase = message.payload.client_base_url
            ? `${message.payload.client_base_url.replace(/\/$/, '')}/join`
            : JOIN_BASE_URL;
          const hasPass = Boolean(verifyPartyPassToken(message.payload.party_pass_token));
          handleHostRoomCreate(
            roomManager,
            socket,
            meta,
            message.payload.host_version,
            joinBase,
            { hasPass },
          );
          return;
        }
      } catch {
        roomManager.sendError(socket, 'INVALID_MESSAGE', 'Host must send ROOM_CREATE first.');
        return;
      }
    }

    handleConnectionMessage(roomManager, socket, meta, raw);
  });

  const cleanup = () => {
    clearInterval(pingInterval);
    handleDisconnect(roomManager, meta, socket);
    connectionMeta.delete(socket);
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, HOST, () => {
  const bind = HOST === '0.0.0.0' ? 'all interfaces' : HOST;
  console.log(`Chaos Parcel server listening on http://${bind}:${PORT}`);
  if (PUBLIC_BASE_URL) {
    const wsPublic = PUBLIC_BASE_URL.replace(/^http/, 'ws');
    console.log(`Public URL: ${PUBLIC_BASE_URL}`);
    console.log(`Host UI: ${PUBLIC_BASE_URL}/host`);
    console.log(`WebSocket: ${wsPublic}${WS_PATH}`);
  } else {
    console.log(`WebSocket endpoint: ws://<your-lan-ip>:${PORT}${WS_PATH}`);
    if (SERVE_CLIENT) {
      console.log(`Client UI: http://<your-lan-ip>:${PORT}/host`);
    }
  }
  if (PARTY_MODE) {
    if (IS_PRODUCTION && PUBLIC_BASE_URL) {
      console.warn(
        'WARNING: PARTY_MODE is on with a public URL — disable it for internet deploys',
      );
    } else {
      console.log('Party mode: LAN origins allowed for CORS');
    }
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process:`);
    console.error(`  lsof -ti:${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});
