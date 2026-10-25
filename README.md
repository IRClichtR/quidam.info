# ombre

ombre is a privacy-check website. One visit shows what a site can learn about you from three angles: your browser (screen, fonts, canvas, audio, graphics card and more), your connection (public IP, provider, location, VPN, Tor, Private Relay) and your local network (router and other devices reachable from the page). Each finding is tagged LEAK, OK or CAN'T TELL, with a plain explanation. The leaks are then grouped into a few problems, each with one basic fix that lists several tools in alphabetical order (never one brand, nothing sponsored), filtered to your platform. Pages are available in English, French and Spanish. It is a single Node server that serves the static pages, `/api/whoami` and a STUN endpoint, with a plain ES-module front end and no build step.

## Requirements

- Node >= 24 (`engines` in `package.json`). Tested on Node 24.22.1.
- Tested on Linux (Ubuntu).

## Setup

```sh
npm install
npm run fonts                 # downloads the self-hosted fonts into public/fonts/
npx playwright install        # browsers for the e2e tests
sudo npx playwright install-deps   # system libraries, needed for WebKit
```

VCR OSD Mono is git-ignored because its licence is unknown (see [the launch checklist](docs/Review-before-launch-v1.md), section F).

## Run

```sh
npm start
```

Open <http://localhost:8080/>. On first start the server downloads four data files into `data/`:

- `dbip-city-lite.mmdb` and `dbip-asn-lite.mmdb` (DB-IP Lite, refreshed weekly),
- `tor-exits.txt` (Tor exit list, hourly),
- `relay-ranges.csv` (iCloud Private Relay ranges, daily).

On a restart it downloads only the files that are missing or older than their interval. Until all four exist (for example on a first start with no internet), the pages still load but `/api/whoami` answers `503 {"error":"data-unavailable"}` and the connection check says the lookup is unavailable. Set `LEAKCHECK_REFRESH=0` to stay offline and use what is already in `data/`.

## Configuration

All settings are environment variables, read in `server/config.js`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port. |
| `STUN_PORT` | `3478` | STUN (UDP) port. |
| `HOST` | unset | Address the HTTP server listens on. Unset: every address, IPv6 and IPv4. Behind a reverse proxy on the same machine, set `127.0.0.1`. |
| `TRUST_PROXY` | unset | Comma-separated IP addresses of your own reverse proxy (for example `127.0.0.1,::1`). Only requests from these addresses have their `X-Forwarded-For` read, and only its right-most entry. Unset: the header is never read. |
| `NODE_ENV` | unset | `development` enables the two `LEAKCHECK_DEV_CLIENT_*` overrides. |
| `LEAKCHECK_DEV_CLIENT_IP4` | unset | Development only: pretend the visitor has this IPv4. Ignored unless `NODE_ENV=development`. |
| `LEAKCHECK_DEV_CLIENT_IP6` | unset | Development only: same, for IPv6. |
| `LEAKCHECK_DATA_DIR` | `data` | Where the downloaded data files live. |
| `LEAKCHECK_REFRESH` | on | `0` disables downloading and refreshing the data files. |
| `SITE_ORIGIN` | `http://localhost:$PORT` | Origin of the site itself. |
| `V4_ORIGIN` | `http://127.0.0.1:$PORT` | Origin reachable over IPv4 only, for the two-family check. |
| `V6_ORIGIN` | `http://ip6-localhost:$PORT` | Origin reachable over IPv6 only. `ip6-localhost` exists by default only on Debian/Ubuntu; elsewhere set this yourself. |

## Tests

```sh
npm test        # unit tests (vitest)
npm run check   # type check (tsc --noEmit)
npm run e2e     # Playwright in chromium, firefox and webkit
```

WebKit needs system libraries: run `sudo npx playwright install-deps` once. Without them, run `npm run e2e -- --project=chromium --project=firefox`. The e2e server first runs `npm run legal`, so the legal pages exist (with placeholders when `legal/owner.json` is missing).

## Manual LAN check

To try it from a phone on the same Wi-Fi, run `NODE_ENV=development npm start` and open `http://<this machine's LAN IP>:8080/en/` on the phone. Over plain http on a LAN IP `crypto.subtle` is unavailable, so the canvas and audio rows read CAN'T TELL. The "your VPN, checked" rows can only compare addresses if the phone can reach the single-family origins: the defaults (`127.0.0.1`, `ip6-localhost`) point at the phone itself, so set `SITE_ORIGIN`, `V4_ORIGIN` and `V6_ORIGIN` to names or addresses the phone can reach. `SITE_ORIGIN` must be the address you open on the phone (for example `http://192.168.1.20:8080`, it is also the CORS origin), `V4_ORIGIN` a name that resolves to this machine over IPv4 only, and `V6_ORIGIN` one that resolves to it over IPv6 only. Otherwise those rows read CAN'T TELL. Remaining manual checks are in [docs/Review-before-launch-v1.md](docs/Review-before-launch-v1.md).

## Other scripts

```sh
npm run pages      # rewrites public/fr/ and public/es/index.html from public/en/index.html and the string files
npm run legal      # writes the legal pages from legal/owner.json (placeholders if it's missing)
npm run preflight  # is everything ready to go online? add -- --production for the strict check
npm run loadtest -- http://localhost:8080 --seconds 20 --concurrency 50
npm run deploy     # puts the committed version on the server (see docs/Go_live.md)
```

Change page text in `public/js/i18n/*.js`, structure in `public/en/index.html`, then run `npm run pages`.

## Going online

[docs/Go_live.md](docs/Go_live.md) covers everything, step by step: domain, server, DNS, HTTPS, legal pages, deployment, monitoring, costs and the legal rules for a private individual. The server kit is in `deploy/`.

## Privacy

- No logs: the server writes nothing about requests.
- A visitor's IP is held only in memory, for rate limiting, and deleted one minute later.
- No access log: Caddy, in front in production, has none configured either.
- No third party is contacted about a visitor. The server's own downloads (DB-IP, Tor, Private Relay data) carry no visitor data.

## Attribution and licences

- IP data by [DB-IP](https://db-ip.com) (IP to City Lite and IP to ASN Lite, CC BY 4.0).
- Fonts: IBM Plex Mono and VT323 are under the SIL Open Font License (copies in `public/fonts/`). VCR OSD Mono has no known licence and is not committed.

## Design

- [Design v2](docs/leakcheck-design-v2.md) (current)
- [Design document v1](docs/superpowers/specs/2026-10-24-leakcheck-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-24-leakcheck-v1.md)
- [Review before launch](docs/Review-before-launch-v1.md)
