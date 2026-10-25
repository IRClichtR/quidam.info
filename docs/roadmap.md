# leakcheck roadmap

What comes after v1. v1 runs on localhost and covers the browser, connection and local network tests plus the fix plan.

Each item says where it comes from: **spec** (the "Later" column of `leakcheck_website_specification.md`), **design** (moved out of v1 in `docs/superpowers/specs/2026-10-24-leakcheck-v1-design.md`), or **suggestion** (not decided yet, to discuss). The order inside each section is not a priority.

Launch checks (translations review, menu names, licences, v2 facts) are in `docs/Review-before-launch-v1.md`, not here.

## Hosting: done in v2, see docs/Go_live.md

The items below are built (the deploy kit in `deploy/`, `TRUST_PROXY`, HSTS, legal page generator) and the guide walks through each one. What remains is doing it: buying the domain, creating the server, and the launch checklist (docs/Go_live.md, step 10).

- **Host and domain.** A host that allows a Node process and open UDP for STUN (file-only hosts such as statichost.eu can't). European registrar with WHOIS privacy on (spec).
- **HTTPS and HSTS.** TLS certificate, then turn on the `Strict-Transport-Security` header.
- **Two extra hostnames** for the IPv6 leak check: one with only an IPv4 address, one with only an IPv6 address, set through `V4_ORIGIN` and `V6_ORIGIN`.
- **Real client IP behind a proxy.** If a reverse proxy sits in front, read `X-Forwarded-For` only from that proxy. Today the header is never read.
- **Router probe from HTTPS.** Check how Chrome, Firefox and Safari handle a call from an HTTPS page to `http://192.168.1.1`, and what the page reports when it's blocked.
- **Privacy notice and French legal notice** (mentions légales), then add their links to the footer.
- **Public source repository** on GitHub or Codeberg, with a chosen licence (spec).

## New tests

- **DNS leak test** (spec, design). Shows which DNS servers really answer for the visitor. Needs our own DNS server, so a small European VPS.
- **Secure DNS check** (design). Tells whether the browser uses encrypted DNS (DoH/DoT). The "Turn on secure DNS" fix card already exists; this would give it a scan result.
- **Third-party cookies** (design). Tells whether cookies from another site are accepted. Needs a second site under a different domain. The "Separate logged-in and anonymous browsing" fix card would then link its "Cookies" tag to a result.
- **More fingerprint signals as browsers change** (spec).

## Fix plan

- **Steps per operating system for every fix** (spec). Today steps are per browser.
- **Share results as an image** (spec). Made in the browser; nothing is sent to the server.
- **Save results to a file.** Download the scan as a file kept on the visitor's device, to compare before and after a fix without anything stored on the server.
- **"How it works" page.** The button was dropped from v1; a short page explaining each test could come back.
- **Fix cards for what no scan measures yet** (suggestion). v2 builds cards only from leaks the scans find, so v1's "secure DNS", "separate logged-in browsing" and "Tor Browser" cards are gone. They could come back once the DNS and third-party cookie tests below exist.

## Languages and reading comfort

- **More languages** if visitors ask for them (spec).
- **Plain-font toggle** for readers who find pixel fonts hard (spec).

## Suggestions (not decided)

- **Public status of the data lists.** Show the date of the DB-IP, Tor and Private Relay data in use, so visitors know how fresh the answers are.

## Performance (suggestions)

- **Subset the fonts to Latin.** Fonts are about 70% of a first visit (257 KB in total). Keeping only the Latin characters of IBM Plex Mono would roughly halve a first visit.
- **Make the whoami rate limit a setting.** 30 lookups a minute per address can be reached by a school or a mobile network sharing one address; today it is changed in `server/main.js`.
