// @ts-check
// The entry point (npm start). It wires everything together: config, data files, the HTTP
// server, and the STUN responder. It also handles a clean shutdown.
// Top-level await is fine here: this is an ES module and Node 24 supports it.
import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isIPv4 } from 'node:net';
import { loadConfig } from './config.js';
import { createDataStore } from './refresh.js';
import { buildAllowlist } from './static.js';
import { createWhoamiHandler } from './whoami.js';
import { createRateLimiter } from './ratelimit.js';
import { createApp } from './app.js';
import { startStun } from './stun.js';
import { listenDualStack } from './listen.js';

const cfg = loadConfig(process.env);

// Open the data we saved earlier first, so we can answer right away. Then, in the
// background, download anything missing or old. The server does not wait for the downloads.
await fs.mkdir(cfg.dataDir, { recursive: true });
const store = createDataStore({ dataDir: cfg.dataDir, fetch });
await store.loadFromDisk();
// Build the lookup bundle now, so the first visitor does not wait for it.
store.current();
if (cfg.refresh) {
  store.refreshAll({ onlyStale: true });
  store.start();
}

// The public/ folder is scanned and read into memory once. Only files found now can ever be served.
const staticMap = await buildAllowlist(fileURLToPath(new URL('../public/', import.meta.url)));
const whoami = createWhoamiHandler({
  cfg,
  getData: () => store.current(),
  // 30 lookups per minute per visitor: plenty for a person reloading, too few for a scraper.
  limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
});

const server = http.createServer(createApp({ cfg, staticMap, whoami, hasData: () => store.current() !== null }));
// Cut off slow clients (slowloris style) that hold connections open by sending data very slowly.
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
// Idle keep-alive connections close after 5 s, and past 20 000 open connections new ones are
// refused, so a flood runs out of connections before it runs out of memory.
server.keepAliveTimeout = 5_000;
server.maxConnections = 20_000;
await listenDualStack(server, cfg.port, cfg.host);

const stun = await startStun({
  port: cfg.stunPort,
  // STUN is chattier (browsers retry), so it gets a higher limit than the web API.
  limiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  // Development only: report the same override address as /api/whoami, so the VPN check compares like with like.
  mapAddress: (address) => (cfg.dev ? (isIPv4(address) ? cfg.devClientIp4 : cfg.devClientIp6) ?? address : address),
});

// One line at startup, about the server only: nothing about visitors is ever logged.
const addr = server.address();
const httpPort = typeof addr === 'object' && addr ? addr.port : cfg.port;
console.log(`quidam listening on ${cfg.host ?? '*'}:${httpPort} (stun ${stun.ports.udp4}, trust proxy ${cfg.trustProxy.length ? cfg.trustProxy.join(' ') : 'off'}, hsts ${cfg.hsts ? 'on' : 'off'})`);

// Stop politely on Ctrl+C or when the host asks us to stop. The flag stops it running twice.
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  store.stop();
  await stun.close();
  // Drop open connections first, otherwise close() would wait for them forever.
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
