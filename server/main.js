// @ts-check
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

const cfg = loadConfig(process.env);

await fs.mkdir(cfg.dataDir, { recursive: true });
const store = createDataStore({ dataDir: cfg.dataDir, fetch });
await store.loadFromDisk();
if (cfg.refresh) {
  store.refreshAll();
  store.start();
}

const staticMap = await buildAllowlist(fileURLToPath(new URL('../public/', import.meta.url)));
const whoami = createWhoamiHandler({
  cfg,
  getData: () => store.current(),
  limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
});

const server = http.createServer(createApp({ cfg, staticMap, whoami }));
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen({ port: cfg.port, host: '::', ipv6Only: false }, () => resolve(undefined));
});

const stun = await startStun({
  port: cfg.stunPort,
  limiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
});

const addr = server.address();
const httpPort = typeof addr === 'object' && addr ? addr.port : cfg.port;
console.log(`leakcheck listening on ${httpPort} (stun ${stun.ports.udp4})`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  store.stop();
  await stun.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
