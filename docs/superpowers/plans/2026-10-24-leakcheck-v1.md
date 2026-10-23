# leakcheck v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build leakcheck so it runs on localhost: one Node server that serves the trilingual page, answers "who am I" lookups from local databases, and answers STUN. All scans run in the visitor's browser and no third party learns anything about the visitor.

**Architecture:** A single Node 24 process with three jobs: static files over HTTP, `GET /api/whoami`, and STUN over UDP. It refreshes its own DB-IP, Tor and Private Relay data on timers. The browser side is plain ES modules, one per page section. Logic lives in pure functions that Vitest tests directly. Playwright drives Chromium, Firefox and WebKit against the real server for everything that needs a browser.

**Tech Stack:** Node 24 LTS, JavaScript with JSDoc + `// @ts-check`, `mmdb-lib` (the only runtime dependency), Vitest, Playwright, TypeScript (`tsc --noEmit` only).

**Spec:** `docs/superpowers/specs/2026-10-24-leakcheck-v1-design.md` (the design), which builds on `leakcheck_website_specification.md` (the original spec). Implementers read both. Where they disagree, the design wins.

---

## How to read this plan

The plan has 15 tasks, in build order. Each task starts with a short **"What and why"**, lists its files and the names other tasks rely on (**Interfaces**), and then gives test-first steps: write the test, watch it fail, write the code, watch it pass, commit.

| # | Task | Delivers |
| --- | --- | --- |
| 1 | Project skeleton and config | `npm test` runs; config rules for dev mode |
| 2 | Security headers and static files | Server serves only allowlisted files with strict headers |
| 3 | Rate limiter | In-memory, per-IP, self-expiring |
| 4 | Tor and Private Relay lists | Is this IP a Tor exit or Apple relay? |
| 5 | `/api/whoami` | IP → country, city, AS, provider, Tor/Relay flags |
| 6 | Data refresh | Server downloads and swaps its data files itself |
| 7 | STUN server | Answers browsers' "what's my address?" over UDP |
| 8 | Server entry point | `npm start` runs everything; first end-to-end test |
| 9 | Page shell, themes, fonts, languages | `/en/ /fr/ /es/` pages, tokens, contrast test, language picker |
| 10 | Browser tests | 10 findings, LEAK/OK rules, summary tiles |
| 11 | Connection tests | IP, provider, location, VPN check (IPv4 and IPv6), VPN-off recheck |
| 12 | Local network probe | Router probe and permission findings |
| 13 | Fix plan | Threat question, ordered cards, ticks, rescan |
| 14 | French and Spanish text, fix steps | Complete strings in 3 languages, per-browser steps |
| 15 | Final verification | All suites in 3 engines, type check, manual LAN checklist |

Work happens on a branch `feat/leakcheck-v1`, never on `main`.

## Global Constraints

These apply to every task:

- Node `>=24` (`"engines": { "node": ">=24" }`); every `.js` file starts with `// @ts-check`; `"type": "module"`.
- Runtime dependencies: exactly `mmdb-lib`. Dev dependencies: exactly `vitest`, `@playwright/test`, `typescript`.
- No visitor IP or scan result is logged, written to disk, or sent anywhere except the visitor's own browser.
- No cookies, analytics, CDNs or Google Fonts. Every font and script is served by our server.
- Requests that leave the device run only after a click: the connection button triggers `/api/whoami` and STUN, and the probe button triggers the router requests.
- Colour tokens (spec, exact):
  - Dark: `bg #121212`, `fg #EDEDED`, `soft #CFCFCF`, `muted #A3A3A3`, `line #2E2E2E`, `panel #1C1C1C`, `red #FF7469`, `onRed #121212`, `safe #22D3EE`.
  - Light: `bg #FAFAFA`, `fg #111111`, `soft #333333`, `muted #545454`, `line #D4D4D4`, `panel #EFEFEF`, `red #A1201A`, `onRed #FFFFFF`, `safe #005A6B`.
- All text at least 7:1 contrast. Body 16px with line height 1.6, labels at least 13px. Targets at least 44 × 44px. A 3px visible focus outline. No animation.
- LEAK tag: filled red with ✕. OK tag: outlined cyan with ✓. Translated tags: LEAK → **FUITE** (fr), **FUGA** (es); OK stays OK.
- Router addresses (spec, exact): `192.168.1.1`, `192.168.0.1`, `10.0.0.1`, `192.168.1.254`.
- Pixel font (`'VCR OSD Mono', 'VT323', monospace`) only for titles, buttons, tags and big numbers. Body text is `'IBM Plex Mono'` at weights 400, 500 and 700.

## Review Focus

The spec doesn't spell these cases out, but a person using the site will run into them. Each one has a test in the task named:

1. **A visitor with no IPv6, or no IPv4.** The missing family's lookup fails within 3 s and its rows don't show. There's no error banner and no LEAK. Test in Task 11.
2. **An IP that DB-IP doesn't know** (a new range, or loopback in dev). `/api/whoami` returns `null` fields, and the page shows "unknown", never "undefined" and never a crash. Tests in Tasks 5 and 11.
3. **First start with no data files and no internet.** The page still loads. `/api/whoami` answers `503 {"error":"data-unavailable"}`, and the page says the lookup is unavailable. Tests in Tasks 5, 6 and 11.
4. **WebRTC disabled or missing** (`RTCPeerConnection` undefined, or uBlock/Brave blocking it). The local IP finding is OK ("WebRTC off") and the VPN check reads "no leak observable", with no hang. Tests in Tasks 10 and 11.
5. **Hostile or junk input.** A path with `..`, an encoded `%2e%2e`, an unknown method, a 1 MB request body, or random UDP bytes all get 404/405 or are ignored, and the server stays up. Tests in Tasks 2 and 7.

## Calls made for you (check these)

The design leaves these choices to the builder. Each one is pinned in the task named. Change any of them before execution starts.

| Call | Value | Task |
| --- | --- | --- |
| Neutral verdict for "can't tell" | Third tag state `unknown`: outlined `muted`, "?" icon, text **CAN'T TELL / INCERTAIN / INCIERTO** | 10 |
| Rate limits | `/api/whoami` 30 requests/min per IP; STUN 60 packets/min per IP | 3, 5, 7 |
| Ports | HTTP 8080, STUN UDP 3478 | 1 |
| Uniqueness thresholds | 0–2 leaking fingerprint signals = low, 3–5 = medium, 6–8 = high | 10 |
| Screen OK rule | Screen size equals the window's inner size (letterboxing/resist-fingerprinting) | 10 |
| Timezone OK rule | Reported zone is `UTC` or `Etc/UTC` | 10 |
| Languages OK rule | Exactly one language, and it is `en` or `en-US` | 10 |
| Graphics card OK rule | WebGL unavailable, or the renderer is one of `Mozilla`, `WebKit WebGL`, `Generic Renderer` | 10 |
| Fonts OK rule | Fewer than 5 fonts from the test list detected | 10 |
| Canvas/audio OK rule | Rendering the same thing twice in one load gives different hashes (noise) | 10 |
| CPU/memory OK rule | `deviceMemory` is hidden (undefined) | 10 |
| Text rendered by JS | Each language page is a small HTML shell. Visible text comes from the language's string file. | 9 |
| Test databases | MaxMind's public **test** `.mmdb` files stand in for DB-IP in automated tests | 5 |
| Glyph check | One-off `fc-query` check of the font, no code | 9 |

---

### Task 1: Project skeleton and config

**What and why:** Sets up the repo so tests can run. Also builds the one place that reads environment variables, including the rule that the dev-only IP override never works outside development.

**Files:**
- Create: `package.json`, `tsconfig.json`, `playwright.config.js`, `.gitignore`, `server/config.js`
- Test: `tests/unit/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env: Record<string, string|undefined>) → Config`, where
  `Config = { port: number, stunPort: number, dev: boolean, devClientIp4: string|null, devClientIp6: string|null, siteOrigin: string, v4Origin: string, v6Origin: string, dataDir: string, refresh: boolean }`
- Env names: `PORT` (default 8080), `STUN_PORT` (3478), `NODE_ENV` (`dev` is true only when it equals `development`), `LEAKCHECK_DEV_CLIENT_IP4`, `LEAKCHECK_DEV_CLIENT_IP6`, `LEAKCHECK_DATA_DIR` (default `data`), `LEAKCHECK_REFRESH` (refresh is on unless it is `0`), `SITE_ORIGIN` (default `http://localhost:<port>`), `V4_ORIGIN` (default `http://127.0.0.1:<port>`), `V6_ORIGIN` (default `http://[::1]:<port>`).

- [ ] **Step 1: Create the branch and skeleton**

```bash
git checkout -b feat/leakcheck-v1
npm init -y && npm pkg set type=module engines.node=">=24"
npm i mmdb-lib && npm i -D vitest @playwright/test typescript
npx playwright install chromium firefox webkit
```

Scripts in `package.json`: `"start": "node server/main.js"`, `"test": "vitest run"`, `"e2e": "playwright test"`, `"check": "tsc --noEmit"`.
`tsconfig.json`: `allowJs`, `checkJs`, `noEmit`, `strict`, `module`/`moduleResolution` `nodenext`, `target` `es2023`, `lib` `["es2023","dom"]`, include `server`, `public/js`, `scripts`.
`.gitignore`: `node_modules/`, `data/`, `test-results/`, `playwright-report/`.
`playwright.config.js`: projects `chromium`, `firefox`, `webkit`; `testDir: 'tests/e2e'`; `webServer` runs `npm start` with `NODE_ENV=development LEAKCHECK_DATA_DIR=tests/fixtures/data LEAKCHECK_REFRESH=0 LEAKCHECK_DEV_CLIENT_IP4=81.2.69.142 LEAKCHECK_DEV_CLIENT_IP6=2001:480::1` at `http://localhost:8080`.

- [ ] **Step 2: Write the failing tests** in `tests/unit/config.test.js`

```js
it('defaults', () => {
  const c = loadConfig({});
  expect(c).toMatchObject({ port: 8080, stunPort: 3478, dev: false, refresh: true,
    siteOrigin: 'http://localhost:8080', v4Origin: 'http://127.0.0.1:8080', v6Origin: 'http://[::1]:8080' });
});
it('ignores the dev IP override outside development', () => {
  expect(loadConfig({ LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142' }).devClientIp4).toBeNull();
  expect(loadConfig({ NODE_ENV: 'production', LEAKCHECK_DEV_CLIENT_IP6: '2001:480::1' }).devClientIp6).toBeNull();
});
it('accepts the dev IP override in development', () => {
  expect(loadConfig({ NODE_ENV: 'development', LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142' }).devClientIp4).toBe('81.2.69.142');
});
it('rejects an override that is not an IP of the right family', () => {
  expect(() => loadConfig({ NODE_ENV: 'development', LEAKCHECK_DEV_CLIENT_IP4: '2001:480::1' })).toThrow();
});
```

- [ ] **Step 3: Run and see it fail.** Run `npx vitest run tests/unit/config.test.js`. Expected: FAIL, "Cannot find module '../../server/config.js'".

- [ ] **Step 4: Implement `loadConfig` in `server/config.js`.** Validate the IP family with `net.isIPv4` and `net.isIPv6`.

- [ ] **Step 5: Run and see it pass**, then run `npm run check`. Expected: PASS, and no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json playwright.config.js .gitignore server/config.js tests/unit/config.test.js
git commit -m "chore: project skeleton and config"
```

---

### Task 2: Security headers and static file serving

**What and why:** This is the security baseline for anything the server sends. Only files that existed at startup can be served, so a crafted path can never reach other files. Every response carries the strict headers.

**Files:**
- Create: `server/headers.js`, `server/static.js`, `server/app.js`
- Test: `tests/unit/headers.test.js`, `tests/unit/app-static.test.js` (requests go to a real `http.Server` on port 0 that serves `tests/fixtures/public/`, a folder holding `index.html`, `en/index.html` and `css/a.css`)

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  - `securityHeaders(cfg: Config) → Record<string,string>`
  - `buildAllowlist(rootDir: string) → Promise<Map<string, {file: string, type: string}>>`. URL path `/` maps to `index.html`, `/en/` maps to `en/index.html`, and other files map to their own path.
  - `createApp(deps: {cfg: Config, staticMap: Map, whoami: (req, res) => void}) → (req, res) => void`. Task 5 supplies `whoami`; until then tests pass a stub.

- [ ] **Step 1: Write the failing tests**

`headers.test.js`, `it('sets the strict header set')`. For a default config, expect:
- `content-security-policy` to equal, word for word:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' http://127.0.0.1:8080 http://[::1]:8080 http://192.168.1.1 http://192.168.0.1 http://10.0.0.1 http://192.168.1.254; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`
- `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`

`app-static.test.js`:
- `it('serves allowlisted files with headers and content type')`: `GET /en/` returns 200, `text/html; charset=utf-8`, and the CSP header is present.
- `it('404s on traversal')`: each of `/../package.json`, `/%2e%2e/package.json` and `/en/..%2f..%2fpackage.json` returns 404.
- `it('405s on other methods')`: `POST /` and `DELETE /en/` return 405 with an `allow: GET, HEAD` header.
- `it('ignores query strings')`: `/en/?x=1` returns 200.
- `it('drops a large body without crashing')`: `POST /` with a 1 MB body returns 405, and a following `GET /` still returns 200.
- `it('HEAD has no body')`.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run tests/unit/headers.test.js tests/unit/app-static.test.js`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** `buildAllowlist` walks the folder once with `fs.readdir(…, {recursive: true})` and sets content types by extension (`.html`, `.css`, `.js`, `.woff2`, `.ttf`, `.json`). `createApp` strips the query string, then looks the path up in the map; there's no filesystem path joining at request time. It sends files with `fs.createReadStream`, uses `Cache-Control: no-cache`, routes `/api/whoami` to `deps.whoami`, and returns 404 for anything else.

- [ ] **Step 4: Run and see it pass.**

- [ ] **Step 5: Commit** `feat(server): security headers and allowlisted static files`

---

### Task 3: Rate limiter

**What and why:** Limits each IP's requests, holding IPs in memory only and forgetting them within two windows. Tasks 5 and 7 use it.

**Files:**
- Create: `server/ratelimit.js`
- Test: `tests/unit/ratelimit.test.js`

**Interfaces:**
- Produces: `createRateLimiter({limit: number, windowMs: number, now?: () => number}) → {hit(key: string): boolean, size(): number}`. `hit` returns `false` once the key has gone over the limit for the current window.

- [ ] **Step 1: Write the failing tests** (with a fake clock)
  - `it('allows up to the limit then refuses')`: with `limit: 3`, three `hit('a')` calls return true and the fourth returns false.
  - `it('keys are independent')`: `hit('b')` is still true after `a` is refused.
  - `it('resets after the window')`: after the clock moves forward by `windowMs`, `hit('a')` is true again.
  - `it('forgets old keys')`: after 2 × `windowMs` with no hits, `size()` is 0.

- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Implement** with a fixed window per key in a `Map`. Old entries are swept whenever `hit` is called.
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit** `feat(server): in-memory rate limiter`

---

### Task 4: Tor exit and Private Relay lists

**What and why:** Turns the two public lists into "is this IP on it?" checks, using Node's built-in `net.BlockList` so no address-maths code is needed.

**Files:**
- Create: `server/lists.js`
- Test: `tests/unit/lists.test.js`

**Interfaces:**
- Produces: `createIpLists({torText: string, relayCsv: string}) → {isTor(ip: string): boolean, isRelay(ip: string): boolean}`
  - `torText` has one IP per line (the format of `https://check.torproject.org/torbulkexitlist`).
  - `relayCsv` has rows of `prefix,country,region,city,` (the format of `https://mask-api.icloud.com/egress-ip-ranges.csv`). Only the first column, a CIDR, matters.

- [ ] **Step 1: Write the failing tests**
  - `it('matches Tor exits exactly')`: with `torText: '185.220.101.1\n2a0b:f4c2::1\n'`, `isTor('185.220.101.1')` and `isTor('2a0b:f4c2::1')` are true, and `isTor('185.220.101.2')` is false.
  - `it('matches relay ranges')`: with `relayCsv: '172.224.226.0/27,GB,GB-EN,London,\n2a02:26f7:b3c0:4000::/64,FR,FR-IDF,Paris,\n'`, `isRelay('172.224.226.5')` and `isRelay('2a02:26f7:b3c0:4000::9')` are true, and `isRelay('172.224.226.64')` is false.
  - `it('skips blank, comment and malformed lines')`: input with `#x`, an empty line and `not-an-ip` doesn't throw.
  - `it('handles IPv4-mapped IPv6')`: `isTor('::ffff:185.220.101.1')` is true.

- [ ] **Step 2: Run and see it fail.** Then **Step 3: implement** (strip a leading `::ffff:` before checking), **Step 4: run and see it pass**, **Step 5: commit** `feat(server): Tor and Private Relay lists`.

---

### Task 5: `/api/whoami`

**What and why:** This is the heart of the backend. It takes the visitor's IP from the connection itself (or from the dev override in development) and answers from local data. No one else is asked.

**Files:**
- Create: `server/whoami.js`
- Modify: `server/app.js` (pass the real handler)
- Create: `tests/fixtures/data/` holding `dbip-city-lite.mmdb` (a copy of MaxMind's `GeoIP2-City-Test.mmdb`), `dbip-asn-lite.mmdb` (a copy of `GeoLite2-ASN-Test.mmdb`), `tor-exits.txt` and `relay-ranges.csv`. The two test databases come from `github.com/maxmind/MaxMind-DB`, folder `test-data/`. First check that repo's licence. If it allows redistribution, commit the files with a `tests/fixtures/data/NOTICE`. If not, add a `pretest` script that downloads them, and git-ignore them.
- Test: `tests/unit/whoami.test.js`

**Interfaces:**
- Consumes: `createIpLists` (Task 4), `createRateLimiter` (Task 3), `Config` (Task 1).
- Produces:
  - `lookup(ip: string, data: Data) → Whoami`, where `Data = {city: Reader, asn: Reader, lists: IpLists}`, `Reader` is `mmdb-lib`'s `Reader` (anything with `get(ip)` works), and
    `Whoami = {ip: string, family: 4|6, country: string|null, city: string|null, asn: number|null, asOrg: string|null, tor: boolean, privateRelay: boolean}`
    Fields read: `country.iso_code`, `city.names.en`, `autonomous_system_number`, `autonomous_system_organization`.
  - `clientIp(req, cfg: Config) → string`: the socket address with `::ffff:` stripped. In development the override for that family replaces it.
  - `createWhoamiHandler({cfg, getData: () => Data|null, limiter}) → (req, res) => void`
- Response rules: `GET` only (405 otherwise). Over the limit (30/min) returns 429. `getData()` returning null gives `503 {"error":"data-unavailable"}`. Otherwise 200 with the JSON. Every response has `Cache-Control: no-store`, `Access-Control-Allow-Origin: <cfg.siteOrigin>` and `Vary: Origin`.

- [ ] **Step 1: Write the failing tests** (these load the fixture `.mmdb` files with `new Reader(fs.readFileSync(...))`)
  - `it('looks up city, country and AS')`: `lookup('81.2.69.142', data)` matches `{country: 'GB', city: 'London', family: 4}`, and `lookup('1.128.0.0', data).asn` is `1221`. Before writing the test, confirm these values, and the IPv6 address used by the dev override in `playwright.config.js` (`2001:480::1`), against the source JSON next to the test databases in `MaxMind-DB/source-data/`. If they differ, use addresses that are in the data, and update `playwright.config.js` and Task 8 to match.
  - `it('returns nulls for unknown IPs')`: `lookup('127.0.0.1', data)` matches `{country: null, city: null, asn: null, asOrg: null, tor: false, privateRelay: false}`.
  - `it('sets tor and privateRelay from the lists')`.
  - `it('uses the socket IP outside development')`: `clientIp` ignores `cfg.devClientIp4` when `cfg.dev` is false.
  - `it('never reads X-Forwarded-For')`: a request carrying `x-forwarded-for: 1.2.3.4` still reports the socket IP.
  - `it('503 when data is missing')`, `it('429 after 30 requests')`, `it('no-store and CORS for the site origin only')`.

- [ ] **Step 2: Run and see it fail.** Then **Step 3: implement**, **Step 4: run and see it pass**.
- [ ] **Step 5: Commit** `feat(server): whoami from local databases`

---

### Task 6: Data refresh

**What and why:** As decided, the server keeps its own data fresh. It downloads to a temporary file, then renames it into place so a half-written file is never read. If a download fails, it keeps using the last good copy.

**Files:**
- Create: `server/refresh.js`
- Test: `tests/unit/refresh.test.js` (uses a fake `fetch` and a temporary directory)

**Interfaces:**
- Consumes: `createIpLists` (Task 4), `Reader` from `mmdb-lib`.
- Produces: `createDataStore({dataDir: string, fetch: typeof fetch, now?: () => Date}) → {current(): Data|null, loadFromDisk(): Promise<void>, refreshAll(): Promise<void>, start(): void, stop(): void}`
- Sources, file names and refresh intervals (exact):

| File in `dataDir` | URL | Every |
| --- | --- | --- |
| `dbip-city-lite.mmdb` | `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz` (gunzip) | 7 days |
| `dbip-asn-lite.mmdb` | `https://download.db-ip.com/free/dbip-asn-lite-YYYY-MM.mmdb.gz` (gunzip) | 7 days |
| `tor-exits.txt` | `https://check.torproject.org/torbulkexitlist` | 1 hour |
| `relay-ranges.csv` | `https://mask-api.icloud.com/egress-ip-ranges.csv` | 1 day |

For the DB-IP files, if this month's file returns 404 (early in the month), the store tries the previous month.

- [ ] **Step 1: Write the failing tests**
  - `it('current() is null before any data')`.
  - `it('loads existing files from disk')`: once the four fixture files are copied in, `current()` is not null.
  - `it('downloads, gunzips and swaps atomically')`: after `refreshAll()`, no `.tmp` file is left behind and `current()` reflects the new list.
  - `it('falls back to last month for DB-IP')`: when the fake fetch returns 404 for `2026-10`, the store requests `2026-09`.
  - `it('keeps the last good copy when a download fails')`: a fetch that throws leaves `current()` unchanged and doesn't reject.
  - `it('sends no visitor data')`: every URL the fake fetch receives is in the table above.

- [ ] **Step 2: Run and see it fail.** Then **Step 3: implement** with `zlib.gunzipSync`, `fs.writeFile` to `<name>.tmp`, then `fs.rename`. Schedule with `setInterval(...).unref()`. **Step 4: run and see it pass.**
- [ ] **Step 5: Commit** `feat(server): self-refreshing data store`

---

### Task 7: STUN server

**What and why:** Browsers ask a STUN server "what address do you see me at?", and the VPN check needs that answer from our own server. Only RFC 5389 Binding requests get a reply. Anything else is silently dropped.

**Files:**
- Create: `server/stun.js`
- Test: `tests/unit/stun.test.js`

**Interfaces:**
- Consumes: `createRateLimiter` (Task 3).
- Produces:
  - `parseBindingRequest(buf: Buffer) → {transactionId: Buffer}|null`. Returns non-null only when the buffer is at least 20 bytes, the type is `0x0001`, the magic cookie is `0x2112A442`, and the length field equals `buf.length - 20`.
  - `buildBindingResponse(transactionId: Buffer, address: string, port: number) → Buffer`. The type is `0x0101` and it has one `XOR-MAPPED-ADDRESS` (`0x0020`) attribute. The port is XORed with `0x2112`. An IPv4 address is XORed with the cookie; an IPv6 address is XORed with the cookie plus the transaction ID.
  - `startStun({port: number, limiter}) → Promise<{close(): Promise<void>}>`. It binds one `udp4` socket and one `udp6` socket (with `ipv6Only: true`), allows 60 packets/min per IP, and logs nothing per packet.

- [ ] **Step 1: Write the failing tests**
  - `it('parses a valid binding request')`: a hand-built 20-byte header with a known 12-byte transaction ID.
  - `it('rejects junk')`: `null` for 0 bytes, 19 bytes, a wrong cookie, type `0x0111`, or a length that doesn't match.
  - `it('encodes XOR-MAPPED-ADDRESS for IPv4')`: for `192.0.2.1:54321`, check the exact expected bytes. The X-Port is `54321 ^ 0x2112`, and the address bytes are `192^0x21, 0^0x12, 2^0xA4, 1^0x42`.
  - `it('encodes XOR-MAPPED-ADDRESS for IPv6')`: decoding the result back gives `2001:db8::1`.
  - `it('answers over real UDP')`: start on port 0, send a request from a `dgram` client on `127.0.0.1`, and decode `127.0.0.1` from the reply.
  - `it('drops random bytes and stays up')`: send 100 random packets, then send a valid request and get a reply.

- [ ] **Step 2: Run and see it fail.** Then **Step 3: implement**, **Step 4: run and see it pass**.
- [ ] **Step 5: Commit** `feat(server): minimal STUN binding responder`

---

### Task 8: Server entry point

**What and why:** Connects Tasks 1–7 into `npm start` and adds the first end-to-end test. The HTTP server listens on `::` with dual-stack on, so `localhost`, `127.0.0.1` and `[::1]` all work.

**Files:**
- Create: `server/main.js`, `public/index.html` (a placeholder, replaced in Task 9)
- Test: `tests/e2e/server.spec.js`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: a running server. Its only log line is `leakcheck listening on <port> (stun <stunPort>)`.

- [ ] **Step 1: Write the failing e2e tests**
  - `it('serves the root with the CSP header')`.
  - `it('whoami answers from fixtures via the dev override')`: `GET /api/whoami` returns `country: 'GB'`.
  - `it('whoami answers on the IPv6 origin')`: `GET http://[::1]:8080/api/whoami` returns `family: 6`.
- [ ] **Step 2: Run and see it fail.** Run `npx playwright test tests/e2e/server.spec.js --project=chromium`.
- [ ] **Step 3: Implement `main.js`.** It loads the config, then the store (`loadFromDisk`, plus `start()` when `cfg.refresh` is on), the allowlist from `public/`, the whoami handler, `http.createServer(createApp(...))` with `listen({port, host: '::', ipv6Only: false})`, and `startStun`. Shutdown on `SIGTERM` is clean.
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit** `feat(server): entry point`

---

### Task 9: Page shell, themes, fonts and languages

**What and why:** Builds what the visitor sees before any scan: three language pages, the colours that follow the system theme, self-hosted fonts, the language picker, and the root page that picks a language inside the browser. A contrast test enforces the AAA rule.

**Files:**
- Create:
  - `public/index.html`, `public/en/index.html`, `public/fr/index.html`, `public/es/index.html`
  - `public/css/site.css`
  - `public/js/lang.js`, `public/js/i18n.js`, `public/js/i18n/en.js`, `public/js/i18n/fr.js`, `public/js/i18n/es.js`, `public/js/app.js`
  - `public/fonts/` (downloaded), `scripts/fetch-fonts.js`
- Test: `tests/unit/lang.test.js`, `tests/unit/contrast.test.js`, `tests/unit/i18n.test.js`, `tests/e2e/shell.spec.js`

**Interfaces:**
- Produces:
  - `pickLanguage(prefs: readonly string[]) → 'en'|'fr'|'es'`
  - `loadStrings(lang) → Promise<Strings>`, and `t(key: string, vars?: Record<string, string|number>) → string`. Placeholders look like `{name}`. A missing key throws in development.
  - Each string file exports a flat default object, for example `{ 'tag.leak': 'LEAK', 'tag.ok': 'OK', 'tag.unknown': "CAN'T TELL", ... }`. Task 9 creates every key; English is complete, and French and Spanish start as English copies that Task 14 replaces.
  - The page shell provides these anchors: `#browser`, `#connection`, `#localnet`, `#fix`, the skip link `#results`, a live region `#announce` (`aria-live="polite"`), the `RUN THE SCAN` button `#run-scan`, and the language picker `nav[aria-label]`.

- [ ] **Step 1: Fetch fonts.** `scripts/fetch-fonts.js` downloads:
  - VCR OSD Mono from `https://dl.dafont.com/dl/?f=vcr_osd_mono` (unzipped with the system `unzip`)
  - VT323 from the `google/fonts` GitHub repo, `ofl/vt323/VT323-Regular.ttf`
  - IBM Plex Mono 400, 500 and 700 woff2 from the `IBM/plex` GitHub releases

  Read the licence file in the VCR archive. If redistribution isn't clearly allowed, git-ignore `public/fonts/VCR*`, and running the script becomes a setup step in the README. Check glyph coverage once with `fc-query public/fonts/VCR_OSD_MONO*.ttf | grep -i charset` against é è ç œ ñ ¿ ¡ and note the result in the commit message. The CSS fallback to VT323 handles any gaps.

- [ ] **Step 2: Write the failing tests**
  - `lang.test.js`:
    - `pickLanguage(['fr-CA','en'])` gives `'fr'`, `pickLanguage(['de','es-MX'])` gives `'es'`, `pickLanguage(['de'])` gives `'en'`, and `pickLanguage([])` gives `'en'`.
  - `contrast.test.js`: parses the `--bg` etc. custom properties for both themes from `site.css`, and asserts a WCAG contrast of at least 7 for every text pair on `bg` and on `panel`: `fg`, `soft`, `muted`, `red`, `safe`, and `onRed` on `red`. It also asserts the token hex values equal the Global Constraints exactly.
  - `i18n.test.js`: `en`, `fr` and `es` have identical key sets; `tag.leak` is `LEAK`, `FUITE` and `FUGA` respectively; no value is empty.
  - `shell.spec.js` (all 3 engines):
    - `/` redirects to `/fr/` when the browser locale is `fr-FR`.
    - Each page has the right `<html lang>` and alternate `hreflang` links for en, fr and es.
    - The skip link is the first Tab stop.
    - The picker shows "English · Français · Español".
    - `prefers-color-scheme: light` gives the body background `rgb(250, 250, 250)`.
    - Before any click, every request goes to `http://localhost:8080`.
    - There are no CSP violations in the console.
    - At 320px width there's no horizontal scroll.
    - At 200% text size (root `font-size: 200%`), there's still no horizontal scroll and nothing clips.

- [ ] **Step 3: Run and see it fail.**
- [ ] **Step 4: Implement.**
  - Each language page has the same markup and differs only in `lang`, `<title>` and the alternate links. Visible text is filled in by `app.js` from `t()`, keyed by `data-i18n` attributes.
  - The root page loads `lang.js`, which calls `location.replace('/' + pickLanguage(navigator.languages) + '/')`. A `<noscript>` block links to all three languages.
  - In `site.css`, tokens live on `:root` and are redefined in `@media (prefers-color-scheme: light)`. It has `@font-face` rules for the three fonts, the button/tag/heading styles from the spec's Components section, a `:focus-visible` 3px outline, and a minimum height of 44px.
  - The footer shows "no cookies · no analytics · open source" and "IP data by DB-IP" linking to `https://db-ip.com`.
- [ ] **Step 5: Run and see it pass** (unit and e2e).
- [ ] **Step 6: Commit** `feat(site): page shell, themes, fonts, languages`

---

### Task 10: Browser tests

**What and why:** The ten findings that never leave the browser, plus the summary tiles. Collecting raw values needs a real browser; deciding LEAK, OK or CAN'T TELL is pure logic. So the two are split, and the logic is tested exhaustively.

**Files:**
- Create: `public/js/browser.js`, `public/js/render.js`
- Modify: `public/js/app.js` (wire `#run-scan`)
- Test: `tests/unit/browser.test.js` (pure logic), `tests/e2e/browser.spec.js` (collecting values and rendering). Rendering is tested only in Playwright, since a DOM library for Vitest would be an extra dependency.

**Interfaces:**
- Produces:
  - `Finding = {id: FindingId, verdict: 'leak'|'ok'|'unknown', value: string}`
  - `FindingId`: `'screen'|'timezone'|'languages'|'gpu'|'fonts'|'canvas'|'audio'|'cpu'|'webrtcLocal'|'gpc'|'publicIp'|'provider'|'location'|'vpn4'|'vpn6'|'router'|'lnaPrompt'|'otherDevices'`
  - `RawBrowser = {screen: {w, h, innerW, innerH, dpr}, timeZone: string, offsetMin: number, languages: string[], gpu: string|null, fontCount: number, canvas: [string, string], audio: [string, string]|null, cores: number|undefined, memory: number|undefined, localCandidates: string[]|null, gpc: boolean|undefined}`. `localCandidates` is null when WebRTC is unavailable.
  - `collectBrowser() → Promise<RawBrowser>`. It uses WebRTC with **no** `iceServers` (no network), and hashes with `crypto.subtle.digest('SHA-256')`, keeping the first 8 hex characters.
  - `judgeBrowser(raw: RawBrowser, t) → Finding[]`, in the spec's table order. GPC appears in the list.
  - `uniqueness(findings: Finding[]) → 'low'|'medium'|'high'`. It counts `leak` among `screen, timezone, languages, gpu, fonts, canvas, audio, cpu`: 0–2 is low, 3–5 medium, 6–8 high.
  - `renderFindings(listEl: HTMLUListElement, findings: Finding[], t)`. Each row is a real `<li>` with label, value and tag. Icons are `aria-hidden="true"`, and numbers are formatted with `Intl.NumberFormat(lang)`. The tag carries the icon and text (✕ LEAK, ✓ OK, ? CAN'T TELL). The row expands into the "why it matters / how to reduce it" panel through a `<button aria-expanded>`.
  - `renderSummary(el, findings, t)` shows three tiles: the leak count, the OK count, and uniqueness in words.
  - `announce(text)` writes to `#announce`.

- [ ] **Step 1: Write the failing unit tests** in `browser.test.js`, one `it` per rule from the "Calls made for you" table, each with a LEAK case and an OK case. For example:

```js
it('timezone OK only when UTC', () => {
  expect(v(judgeBrowser({...base, timeZone: 'UTC'}, t), 'timezone')).toBe('ok');
  expect(v(judgeBrowser({...base, timeZone: 'Europe/Paris'}, t), 'timezone')).toBe('leak');
});
it('webrtc local IP OK when only .local names or WebRTC off', () => {
  expect(v(judgeBrowser({...base, localCandidates: ['a1b2.local']}, t), 'webrtcLocal')).toBe('ok');
  expect(v(judgeBrowser({...base, localCandidates: ['192.168.1.23']}, t), 'webrtcLocal')).toBe('leak');
  expect(v(judgeBrowser({...base, localCandidates: null}, t), 'webrtcLocal')).toBe('ok');
});
it('uniqueness thresholds', () => { /* 2 leaks → low, 3 → medium, 6 → high */ });
```

  Also: `it('never shows "undefined"')`. With `cores` and `memory` undefined and `audio` null, no `value` contains `undefined`.

- [ ] **Step 2: Write the failing e2e tests** in `browser.spec.js`, for all 3 engines:
  - Clicking `#run-scan` creates 10 `#browser li` rows, each with a tag.
  - `#announce` holds the summary text.
  - The summary tiles add up to 10.
  - No request leaves `localhost:8080` during the scan.
  - The row toggle works with the keyboard (Enter) and sets `aria-expanded`.
  - With `RTCPeerConnection` deleted through `addInitScript`, the scan still finishes and `webrtcLocal` is OK.

- [ ] **Step 3: Run and see both fail.**
- [ ] **Step 4: Implement.**
  - Fonts: measure the width of a test string in 30 common fonts against `monospace`, `serif` and `sans-serif`.
  - Canvas: draw text plus shapes twice.
  - Audio: an `OfflineAudioContext` with an oscillator and a compressor, rendered twice, summing samples.
  - GPU: `WEBGL_debug_renderer_info` if present.
  - Verdict texts come from `t()`.
- [ ] **Step 5: Run and see it pass.**
- [ ] **Step 6: Commit** `feat(site): browser findings and summary`

---

### Task 11: Connection tests

**What and why:** Covers the public IP, provider, location and the VPN check for each IP family, plus the "Check again with VPN off" button. Everything goes only to our own server, and only after a click. The section says so before the click.

**Files:**
- Create: `public/js/connection.js`, `public/js/tz-countries.js` (generated), `scripts/gen-tz-countries.js`
- Modify: `public/js/app.js`, `server/app.js` (add `GET /api/origins`)
- Test: `tests/unit/connection.test.js`, `tests/unit/app-static.test.js` (one more case), `tests/e2e/connection.spec.js`

**Interfaces:**
- Consumes: `Whoami` shape (Task 5), `Finding`/`renderFindings` (Task 10).
- Produces:
  - `GET /api/origins` → `{v4: cfg.v4Origin, v6: cfg.v6Origin, stunPort: cfg.stunPort}` with `Cache-Control: no-store`. It's same-origin and carries no visitor data. The page builds its STUN URLs from these hostnames: `stun:<page hostname>:<port>`, `stun:127.0.0.1:<port>` and `stun:[::1]:<port>` in local development.
  - `fetchWhoami(origin: string, fetchFn = fetch, timeoutMs = 3000) → Promise<Whoami|null|'unavailable'>`. It returns null on timeout or network error, and `'unavailable'` on 503.
  - `gatherSrflx(stunUrls: string[], timeoutMs = 5000) → Promise<{v4: string|null, v6: string|null}|null>`. It returns null when `RTCPeerConnection` is missing.
  - `judgeConnection({main, v4, v6, srflx, timeZone, zoneCountries}, t) → Finding[]`, which returns `publicIp`, `provider`, `location`, `vpn4` and `vpn6`. A family whose lookup came back null is left out.
  - `maskIp(ip: string) → string`: `203.0.113.42` becomes `203.0.113.•••`, and `2001:db8:1:2::9` becomes `2001:db8:1:2:•••`.
  - `compareVpnOff(before: string, after: string) → 'hidden'|'same'`
  - `tz-countries.js`: `export default {'Europe/Paris': ['FR', 'MC'], ...}`, generated by `scripts/gen-tz-countries.js` from IANA `zone1970.tab` (`https://data.iana.org/time-zones/data/zone1970.tab`). The output is committed.
- Rules, from the design:
  - `publicIp`: `ok` if `tor || privateRelay`, otherwise `unknown`, with the "strong VPNs leave no sign" note and the VPN-off button.
  - `location` and `provider`: `ok` if `tor || privateRelay` or `!zoneCountries[timeZone]?.includes(country)`, otherwise `leak`. The location panel shows the warning that a VPN exiting in your own time zone still shows as LEAK.
  - `vpnN`: `leak` if `srflx.vN && whoami.vN && srflx.vN !== whoami.vN.ip`. `ok` if they're equal. `unknown` ("no leak observable") if `srflx.vN` is null.
  - The full IP appears only after a "reveal" button click (`aria-pressed`).

- [ ] **Step 1: Write the failing unit tests** in `connection.test.js`:
  - `maskIp` for v4 and v6.
  - Location OK when the zone is `Europe/Paris` and the country is `GB`; LEAK when the country is `FR`; OK when `tor` is true.
  - `vpn4` LEAK for `srflx.v4 = '203.0.113.42'` against `whoami.v4.ip = '198.51.100.7'`.
  - `vpn6` is omitted when the v6 lookup is null.
  - Null fields render as "unknown", never `null` or `undefined`.
  - `'unavailable'` gives one `unknown` finding with the "lookup unavailable" text.
  - `compareVpnOff('1.1.1.1', '2.2.2.2')` gives `'hidden'`.
  - `it('table generated from zone1970.tab')`: `tz-countries.js['Europe/Paris']` contains `'FR'`.

- [ ] **Step 2: Write the failing e2e tests** in `connection.spec.js`:
  - Before the click, the section text names only "leakcheck's own server".
  - The click results in requests only to the three own origins, and UDP only to our STUN server (assert the `iceServers` passed, by wrapping `RTCPeerConnection` in `addInitScript`).
  - With the dev override `81.2.69.142`, location shows London and GB.
  - The IP is masked until reveal is clicked.
  - With the v6 origin blocked through `page.route`, only v4 rows show and there's no error.
  - With `/api/whoami` returning 503 through `page.route`, the page shows "lookup unavailable".
  - The VPN-off recheck shows "same: your VPN isn't hiding your IP" when both lookups match.

- [ ] **Step 3: Run and see both fail.** Then **Step 4: implement** and generate the table with `node scripts/gen-tz-countries.js > public/js/tz-countries.js`. **Step 5: run and see it pass.**
- [ ] **Step 6: Commit** `feat(site): connection findings with IPv4/IPv6 VPN check`

---

### Task 12: Local network probe

**What and why:** Covers the router, permission prompt and other devices findings. It tries the four router addresses after a click, explains the browser prompt beforehand, and treats "refused" as a valid OK result.

**Files:**
- Create: `public/js/localnet.js`
- Modify: `public/js/app.js`
- Test: `tests/unit/localnet.test.js`, `tests/e2e/localnet.spec.js`

**Interfaces:**
- Produces:
  - `ROUTERS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254']`
  - `probeRouters(fetchFn = fetch, now = performance.now.bind(performance), timeoutMs = 3000) → Promise<{address: string, ms: number}|null>`. It fetches `http://<addr>/` with `{mode: 'no-cors', targetAddressSpace: 'local'}` for all four in parallel; the first to resolve wins.
  - `promptSupported() → Promise<boolean>`: `navigator.permissions.query({name: 'local-network-access'})` resolves, otherwise false.
  - `judgeLocalnet({router, promptSupported}, t) → Finding[]` returns `router`, `lnaPrompt` and `otherDevices`. `otherDevices` is always `ok` with "not visible from a web page".

- [ ] **Step 1: Write the failing unit tests**, using a fake `fetchFn` and clock:
  - `192.168.0.1` answering after 4 ms gives `{address: '192.168.0.1', ms: 4}`.
  - When all requests reject or time out, the result is null and `router` is `ok`.
  - `promptSupported` false gives `lnaPrompt` `leak` ("no prompt was shown").
  - The page text states that a website can't see MAC addresses, device names or Wi-Fi details.
- [ ] **Step 2: Write the failing e2e test.** Clicking `PROBE MY NETWORK` (with router requests stubbed through `page.route`) shows three rows. There are no requests before the click.
- [ ] **Step 3: Run and see it fail.** Then **Step 4: implement**, **Step 5: run and see it pass**.
- [ ] **Step 6: Commit** `feat(site): local network probe`

---

### Task 13: Fix plan

**What and why:** Turns the results into the ranked to-do list. The threat question promotes the matching fixes. Cards show the meter, effort, tags linked back to findings, and steps for the detected browser. Ticks live only in memory. Rescan shows counts before and after.

**Files:**
- Create: `public/js/fixes.js`
- Modify: `public/js/app.js`, `public/js/i18n/en.js` (card copy)
- Test: `tests/unit/fixes.test.js`, `tests/e2e/fixes.spec.js`

**Interfaces:**
- Consumes: `Finding`, `FindingId` (Task 10).
- Produces:
  - `FIXES: Fix[]`, where `Fix = {id: 'block'|'dns'|'perms'|'browser'|'ip'|'split'|'tor', tier: 'quick'|'week'|'strong', hides: 1|2|3, minutes: number, tags: {label: string, finding: FindingId|null}[]}`. Values follow the spec's v1 fixes table: hides "some" = 1, "a lot" = 2, "most" = 3. Minutes come from the mockup: block 2, dns 1, perms 2, browser 30, ip 15, split 10, tor 10. Tags with no v1 finding (`trackers`, `dns`, `cookies`, `profile linking`) have `finding: null`.
  - `orderFixes(threat: 'ads'|'network'|'targeted') → Fix[]`. Promoted fixes come first, in this order, then the rest in default order:
    - `ads`: `block`, `browser`
    - `network`: `dns`, `ip`
    - `targeted`: `tor`, `ip`
    - Default order: `block`, `dns`, `perms`, `browser`, `ip`, `split`, `tor`.
  - `detectBrowser(nav: {userAgent: string, brave?: unknown}) → 'chrome'|'firefox'|'safari'|'edge'|'brave'|'other'`
  - String keys `fix.<id>.title`, `.why`, `.tradeoff`, and `.steps.<browser>` (an array of strings). The "Hide your IP" card lists **criteria only**, with no brand names.

- [ ] **Step 1: Write the failing unit tests**
  - `orderFixes('targeted')` ids start with `['tor','ip']`; `orderFixes('ads')` ids start with `['block','browser']`.
  - `detectBrowser`: one real UA string per browser. Brave is detected from `nav.brave` with a Chrome UA, and Edge from `Edg/`.
  - `it('VPN card names no providers')`: the `fix.ip.*` strings in every language contain none of `/mullvad|proton|nord|express|ivpn|nym/i`.
  - Every `tags[].finding` is a valid `FindingId` or null.
- [ ] **Step 2: Write the failing e2e tests** in `fixes.spec.js`:
  - `SHOW MY FIXES` reveals `#fix` on the same page.
  - The threat question is a radio group (`role=radiogroup`) and arrow keys move between options.
  - Picking "someone looking for me" puts the Tor card first.
  - The "read this first" note is above the list.
  - The meter is readable without colour (`aria-label` "hides: most").
  - A tag link moves focus to its finding row.
  - Ticking a checkbox updates "1 / 7 done" and is gone after a reload.
  - `RESCAN TO VERIFY` shows before and after leak counts and reruns only the click-gated tests already run in this tab.
- [ ] **Step 3: Run and see it fail.** Then **Step 4: implement**, **Step 5: run and see it pass**.
- [ ] **Step 6: Commit** `feat(site): fix plan`

---

### Task 14: French and Spanish text, per-browser fix steps

**What and why:** A content task. It drafts every string in French and Spanish, and steps for Chrome, Firefox, Safari, Edge and Brave in all three languages, using menu names as they appear in each language's version of the browser. Both are marked for review before launch.

**Files:**
- Modify: `public/js/i18n/fr.js`, `public/js/i18n/es.js`, `public/js/i18n/en.js` (steps)
- Create: `docs/review-before-launch.md`, a checklist of strings needing native review and steps needing a check in each browser
- Test: `tests/unit/i18n.test.js` (extended)

- [ ] **Step 1: Extend the failing tests**
  - `it('fr and es differ from en')`: fewer than 10% of values are identical to English (allowing for brand names and `OK`).
  - `it('every fix has steps for every browser in every language')`.
  - The e2e test `tests/e2e/i18n.spec.js` checks that on `/fr/` and `/es/` at 320px width, no button or tag clips (its `scrollWidth` is no larger than its `clientWidth`).
- [ ] **Step 2: Run and see it fail.** Then **Step 3: write the text**, using the browser facts the spec lists (Safari 26, Firefox 145, Chrome 140 IP Protection described as narrower than a VPN). **Step 4: run and see it pass.**
- [ ] **Step 5: Commit** `content: French and Spanish strings, per-browser fix steps`

---

### Task 15: Final verification

**What and why:** Proves the whole thing works before calling it done, and leaves a short README so it can be started again later.

**Files:**
- Create: `README.md` (setup, `npm start`, dev override, tests, the LAN check)

- [ ] **Step 1: Run every check.**
  - `npm test`: all unit tests pass.
  - `npm run check`: no type errors.
  - `npm run e2e`: all specs pass in chromium, firefox and webkit.
  - `npm ls --omit=dev`: shows only `mmdb-lib`.
- [ ] **Step 2: Real run, no fixtures.** Start with `npm start` (refresh on) and confirm that `data/` fills with the four files. Then run `grep -rn "remoteAddress\|console.log" server/` and confirm no visitor IP is logged.
- [ ] **Step 3: Manual LAN check.** Run `NODE_ENV=development npm start`, open `http://<this machine's LAN IP>:8080/` from a phone on the same Wi-Fi, run all three sections, and toggle a VPN for the VPN-off recheck. Note the results in `docs/review-before-launch.md`.
- [ ] **Step 4: Commit** `docs: README and launch checklist`
- [ ] **Step 5: Request a whole-branch review** with superpowers:requesting-code-review before merging.
