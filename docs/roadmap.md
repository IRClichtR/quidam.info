# leakcheck roadmap

What comes after v1. v1 runs on localhost and covers the browser, connection and local network tests plus the fix plan.

Each item says where it comes from: **spec** (the "Later" column of `leakcheck_website_specification.md`), **design** (moved out of v1 in `docs/superpowers/specs/2026-10-24-leakcheck-v1-design.md`), or **suggestion** (not decided yet, to discuss). The order inside each section is not a priority.

Launch checks for v1 itself (translations review, menu names, WebKit run, licences) are in `docs/review-before-launch.md`, not here.

## Next step: hosting (design)

Putting v1 on the internet. Needed before any new feature reaches visitors.

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

## Languages and reading comfort

- **More languages** if visitors ask for them (spec).
- **Plain-font toggle** for readers who find pixel fonts hard (spec).

## Suggestions (not decided)

- **Public status of the data lists.** Show the date of the DB-IP, Tor and Private Relay data in use, so visitors know how fresh the answers are.
