# leakcheck

leakcheck is a privacy-check website. One visit shows what a site can learn about you from three angles: your browser (screen, fonts, canvas, audio, graphics card and more), your connection (public IP, provider, location, VPN, Tor, Private Relay) and your local network (router and other devices reachable from the page). Each finding is tagged LEAK, OK or CAN'T TELL, with a plain explanation and a fix plan for your browser. Pages are available in English, French and Spanish. It is a single Node server that serves the static pages, `/api/whoami` and a STUN endpoint, with a plain ES-module front end and no build step.

## Requirements

- Node >= 24 (`engines` in `package.json`). Development so far ran on Node 22.17 without using Node 24-only APIs.
- Linux or macOS.

## Setup

```sh
npm install
npm run fonts                 # downloads the self-hosted fonts into public/fonts/
npx playwright install        # browsers for the e2e tests
sudo npx playwright install-deps   # system libraries, needed for WebKit
```

VCR OSD Mono is git-ignored because its licence is unknown (see [the launch checklist](docs/review-before-launch.md), section F).

## Run

```sh
npm start
```

Open <http://localhost:8080/>. On first start the server downloads DB-IP Lite (city and ASN), the Tor exit list and the Private Relay ranges into `data/`. Set `LEAKCHECK_REFRESH=0` to stay offline and use what is already in `data/`.

## Configuration

All settings are environment variables, read in `server/config.js`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port. |
| `STUN_PORT` | `3478` | STUN (UDP) port. |
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

## Manual LAN check

To try it from a phone on the same Wi-Fi, run `NODE_ENV=development npm start` and open `http://<this machine's LAN IP>:8080/en/` on the phone. Over plain http on a LAN IP `crypto.subtle` is unavailable, so the canvas and audio rows read CAN'T TELL. Remaining manual checks are in [docs/review-before-launch.md](docs/review-before-launch.md).

## Privacy

- No logs: the server writes nothing about requests.
- A visitor's IP is held only in memory, for rate limiting.
- No third party is contacted about a visitor. The server's own downloads (DB-IP, Tor, Private Relay data) carry no visitor data.

## Attribution and licences

- IP data by [DB-IP](https://db-ip.com) (IP to City Lite and IP to ASN Lite, CC BY 4.0).
- Fonts: IBM Plex Mono and VT323 are under the SIL Open Font License (copies in `public/fonts/`). VCR OSD Mono has no known licence and is not committed.

## Design

- [Design document](docs/superpowers/specs/2026-10-24-leakcheck-v1-design.md)
- [Implementation plan](docs/superpowers/plans/2026-10-24-leakcheck-v1.md)
- [Review before launch](docs/review-before-launch.md)
