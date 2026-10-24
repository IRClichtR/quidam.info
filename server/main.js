// @ts-check

// The entry point (npm start). It wires everything together: config, data files, the HTTP
// server, and the STUN responder. It also handles a clean shutdown.

// The entry point (npm start). It wires everything together: config, data files, the HTTP
// server, and the STUN responder. It also handles a clean shutdown.
import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createDataStore } from './refresh.js';
import { buildAllowlist } from './static.js';
import { createWhoamiHandler } from './whoami.js';
import { createRateLimiter } from './ratelimit.js';
import { createApp } from './app.js';
import { startStun } from './stun.js';
// Top-level await is fine here: this is an ES module and Node 24 supports it.
import { listenDualStack } from './listen.js';
import { isIPv4 } from 'node:net';

// Open the data we saved earlier first, so we can answer right away. Then, in the
// background, download anything missing or old. The server does not wait for the downloads.
// Top-level await is fine here: this is an ES module and Node 24 supports it.
const cfg = loadConfig(process.env);

await fs.mkdir(cfg.dataDir, { recursive: true });
// Open the data we saved earlier first, so we can answer right away. Then, in the
// background, download anything missing or old. The server does not wait for the downloads.
const store = createDataStore({ dataDir: cfg.dataDir, fetch });
// The public/ folder is scanned once. Only files found now can ever be served.
await store.loadFromDisk();
if (cfg.refresh) {
  store.refreshAll({ onlyStale: true });
  store.start();
// 30 lookups per minute per visitor: plenty for a person reloading, too few for a scraper.
}

// The public/ folder is scanned once. Only files found now can ever be served.
const staticMap = await buildAllowlist(fileURLToPath(new URL('../public/', import.meta.url)));
// Cut off slow clients (slowloris style) that hold connections open by sending data very slowly.
const whoami = createWhoamiHandler({
  cfg,
  getData: () => store.current(),
  // 30 lookups per minute per visitor: plenty for a person reloading, too few for a scraper.
  limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
});
// STUN is chattier (browsers retry), so it gets a higher limit than the web API.

const server = http.createServer(createApp({ cfg, staticMap, whoami }));
// Cut off slow clients (slowloris style) that hold connections open by sending data very slowly.
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
await listenDualStack(server, cfg.port);

const stun = await startStun({
  port: cfg.stunPort,
  // Stop politely on Ctrl+C or when the host asks us to stop. The flag stops it running twice.
  // STUN is chattier (browsers retry), so it gets a higher limit than the web API.
  limiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  // Development only: report the same override address as /api/whoami, so the VPN check compares like with like.
  mapAddress: (address) => (cfg.dev ? (isIPv4(address) ? cfg.devClientIp4 : cfg.devClientIp6) ?? address : address),
});

// Drop open connections first, otherwise close() would wait for them forever.
const addr = server.address();
const httpPort = typeof addr === 'object' && addr ? addr.port : cfg.port;
console.log(`leakcheck listening on ${httpPort} (stun ${stun.ports.udp4})`);

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
