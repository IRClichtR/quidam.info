# leakcheck v1: design

2026-10-24 · builds on `leakcheck_website_specification.md` (the spec). Everything in the spec holds unless this document changes it. Decisions are marked **(Floriane)** when they were made in conversation and **(builder's call)** when Claude made them; the second kind can be overridden.

## Intent

leakcheck shows visitors, live, what their own browser and connection reveal, then gives a ranked plan to reduce it. The guiding principle behind this revision: **no third party ever learns anything about a visitor.** A minimal backend of our own replaces the outside IP-lookup service and public STUN server the spec planned to use.

This plan ends with the finished site **running on localhost** for local testing. Hosting, domain and the legal pages are a separate later step **(Floriane)**.

## Goals

- Every finding in the spec's browser, connection and local network tables works, except Secure DNS and third-party cookies (see changes).
- The fix plan with threat question, tiers, cards, in-memory ticks and rescan works.
- English, French and Spanish pages; dark and light themes; WCAG 2.2 AAA where it applies.
- Built test-first; the least code that meets the requirements.
- A security baseline built in and tested.

## Non-goals

- Hosting, domain, TLS certificates, deployment.
- Privacy notice and French legal notice (move to the hosting step) **(Floriane)**.
- DNS leak test and Secure DNS finding (roadmap) **(Floriane)**.
- Full threat model of the site (stays a separate document; only the baseline below is in scope).
- Native-speaker review of translations, and checking fix steps in each real browser: both flagged as pre-launch tasks, not done here.

## Anti-goals (would make it a failure even if it works)

- Any visitor data (IP, scan results) sent to a third party, logged, or written to disk.
- Cookies, analytics, CDN or Google Fonts calls from the live page.
- Runtime dependencies beyond the one allowed.
- Meaning carried by colour alone, or text under 7:1 contrast.

## Changes to the spec

| Spec says | Now |
| --- | --- |
| Static site, no server, statichost.eu | **One Node.js server** serves the pages, the IP endpoint and STUN **(Floriane)**. Hosting choice revisited in the hosting step. |
| Outside IP lookup service | Our server reads the visitor's IP from the connection and looks it up in **DB-IP Lite** databases stored on the server **(Floriane)**. |
| Public STUN server | Our server answers STUN binding requests over UDP itself **(Floriane)**. |
| Public IP "OK when it belongs to a VPN, Tor or relay" | OK when the IP is on the **Tor Project exit list** or **Apple iCloud Private Relay egress list** **(Floriane)**. Otherwise the page says it can't tell whether a VPN is used (strong VPNs such as Mullvad, Proton, Nym leave no sign) and offers leakcheck's own **"Check again with VPN off"** button **(Floriane)**. |
| Approximate location with accuracy radius | City and country only; DB-IP Lite has no radius. |
| Location "OK when city differs from the browser timezone, or is the relay's" | OK when the IP is Tor or Private Relay, **or when the IP's country has no time zone matching the browser's time zone** (country-to-zone table from IANA `zone1970.tab`, committed as a small JSON file). The page warns that a good VPN exiting in the visitor's own time zone will still show as LEAK **(Floriane)**. |
| Provider "OK when not the visitor's home ISP" | Same rule as Location: OK when Tor/Relay or the time zone mismatch suggests the IP isn't home **(builder's call, please check)**. |
| Third-party cookies finding | Moved to roadmap (needs a second site). The "Separate logged-in and anonymous browsing" fix card keeps its "Cookies" tag without a link to a result **(Floriane)**. |
| VPN check, one IP | **IPv6 leak detection in v1 (Floriane):** besides the main address, the page calls `/api/whoami` on an IPv4-only and an IPv6-only hostname of the same server, and compares each family with its matching STUN result. On localhost these are `127.0.0.1` and `[::1]`; the hosting step must provide two such hostnames. |
| Secure DNS finding | Removed from v1, moved to roadmap. The "Turn on secure DNS" fix card stays, without a scan tag **(Floriane)**. |
| Vite for live reload | Dropped; the Node server serves files directly **(Floriane)**. |
| Fix plan names VPNs (open question) | **Criteria only**, no brand names **(Floriane)**. |
| Fix plan as separate screen (mockup) | **Same page**, "SHOW MY FIXES" reveals the section **(Floriane)**. |
| "HOW IT WORKS" button (mockup) | Dropped in v1 **(Floriane)**. |
| Security out of scope | **Security baseline in scope** (below) **(Floriane)**. |

## Constraints

- **Language:** JavaScript everywhere, `// @ts-check` + JSDoc, checked with `tsc --noEmit` (spec).
- **Runtime:** Node **24 LTS** **(Floriane)**. Floriane has 22.17 installed and will install 24.
- **Runtime dependencies:** browser side zero; server side exactly one, **`mmdb-lib`** **(Floriane)**. Everything else uses Node built-ins (`node:http`, `node:dgram`, `node:fs`, `node:zlib`, global `fetch`).
- **Dev dependencies:** `vitest`, `@playwright/test`, `typescript` **(Floriane for the test tools)**.
- **Testing:** test-driven. Vitest for pure logic (server and browser modules); Playwright end-to-end in Chromium, Firefox and WebKit against the running server **(Floriane)**.
- **Execution:** one fresh agent per plan task writes tests first then code; a reviewer agent checks each task before the next; Claude coordinates **(Floriane)**.

## Architecture

One Node process, three jobs:

1. **Static files** over HTTP: `/en/`, `/fr/`, `/es/` pages, CSS, JS modules, fonts.
2. **`GET /api/whoami`** returns JSON for the requesting IP: `ip`, `asn`, `asOrg` (shown as provider), `city`, `country`, `tor` (bool), `privateRelay` (bool). Same origin, so no CORS. Called only after the visitor clicks.
3. **STUN** on UDP: answers RFC 5389 binding requests with the sender's address (`XOR-MAPPED-ADDRESS`). The page passes this server as its only `iceServers` entry.

**Data refresh (Floriane: the server refreshes itself):** on start and on timers, the server downloads DB-IP Lite City and ASN `.mmdb` files (monthly), the Tor bulk exit list (hourly) and Apple's egress IP ranges CSV (daily) into a git-ignored `data/` folder, swapping files atomically. If a download fails, the last good copy stays in use. These downloads carry no visitor data.

**Browser modules** (spec): `browser.js`, `connection.js`, `localnet.js`, `fixes.js`, plus small shared pieces (i18n strings, rendering) as needed.

## Decided behaviour

- **Connection section** names leakcheck's own server as the only service contacted, before the click.
- **VPN check:** compare the IPs from `/api/whoami` (main, IPv4-only and IPv6-only hostnames) with the `srflx` candidates from our STUN server, IPv4 with IPv4 and IPv6 with IPv6. Any family showing a different address = LEAK. No `srflx` within about 5 seconds (UDP blocked, WebRTC disabled) = "no leak observable". A family the visitor doesn't have is simply not shown.
- **Localhost testing (Floriane: both):** a dev-only environment variable makes the server treat requests as coming from a given IP so automated tests get real DB-IP, Tor and Relay answers. It is ignored unless the server runs in development mode, never read from a request header, and covered by a security test. Manual checks also run over the machine's LAN address. Trusting `X-Forwarded-For` behind a proxy waits for the hosting step.
- **"Check again with VPN off":** the tab keeps the first address in memory, runs a second lookup, and shows "different: your VPN hides your IP" or "same: your VPN isn't hiding your IP". Nothing stored.
- **"Likely unique" tile:** count of LEAK results among the fingerprint signals (screen, timezone, languages, graphics card, fonts, canvas, audio, CPU/memory) → 0–2 low, 3–5 medium, 6+ high; shown in words and explained as a rough estimate **(Floriane chose the counting method; thresholds builder's call)**.
- **Threat question promotes matching fixes (Floriane):** advertisers → content blocker and blending browser first; internet provider / Wi-Fi → secure DNS and hide IP first; someone looking for me → Tor and hide IP first.
- **Fonts:** Claude downloads VCR OSD Mono from dafont during the build **(Floriane)**. CSS stack `'VCR OSD Mono', 'VT323', monospace` so any missing French or Spanish glyph falls back per character **(Floriane)**; a test checks coverage. VT323 and IBM Plex Mono self-hosted from their official sources.
- **Translations:** Claude drafts French and Spanish; marked "needs native review" before release **(Floriane)**.
- **Fix steps per browser** (Chrome, Firefox, Safari, Edge, Brave, with menu names per language): Claude drafts; flagged "verify in each browser before launch" **(Floriane)**.
- **DB-IP credit:** a visible "IP data by DB-IP" link, required by CC BY 4.0.

## Security baseline (in scope)

- **No logs:** no access log; errors are logged without IPs or request details.
- **Visitor IPs held only in memory**, only for rate limiting, expiring within minutes.
- **Strict headers** on every response: Content-Security-Policy (`default-src 'self'`, no inline script or style, `connect-src` limited to self and the four router probe addresses, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`. HSTS waits for HTTPS in the hosting step.
- **Only expected requests:** `GET`/`HEAD` only; static files served from an allowlist built at startup (no path traversal possible); everything else 404/405. STUN replies only to well-formed binding requests and ignores the rest.
- **Rate limiting** on `/api/whoami` and STUN, per IP, in memory **(limits: builder's call)**.
- Each item above has a test.

## Builder's calls (overridable)

- Folder layout, file names beyond the spec's four modules, endpoint name `/api/whoami`.
- Rate-limit numbers; STUN on UDP 3478; uniqueness thresholds.
- Root `/` picks the language in the browser, as the spec says, even though the server could read `Accept-Language`.
- Fonts served in the format they ship in (no conversion tool).
- Contrast checked by a unit test over the colour tokens rather than adding an accessibility-testing dependency.
- Footer omits privacy and legal links until the hosting step writes those pages.
- **Rescan** reruns the browser tests, and reruns a click-gated test only if the visitor already ran it in this tab.
- Fix-card tags map to findings by a table in `fixes.js`; tags with no v1 finding (Trackers, DNS, Cookies) show without a link.
- **VCR OSD Mono licence:** check the licence in the downloaded archive. If redistribution isn't clearly allowed, the font file stays out of git and a script fetches it.
- The country-to-time-zone table is generated once from IANA `zone1970.tab` and committed.

## Known risks for the hosting step

- **Router probe from HTTPS:** a page served over HTTPS calling `http://192.168.1.1` is mixed content. Chrome's local network access allows it with a permission prompt; Firefox and Safari may simply block it (which the page would report as OK). Works on localhost over HTTP.
- STUN needs UDP open on the host, which rules out file-only hosts such as statichost.eu.
- IPv6 leak detection needs two extra hostnames (IPv4-only, IPv6-only) pointing at the server.
- Behind a reverse proxy the server must learn the real client IP safely (`X-Forwarded-For` from the proxy only).
- Chrome may not show the local network prompt for a page loaded from localhost, so the "Permission prompt" finding can read wrong in local tests.

## Left to the builder

Everything not stated above, as long as it follows the spec, the constraints and the anti-goals.
