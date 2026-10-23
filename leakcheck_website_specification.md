# leakcheck — website specification

Oct 23, 2026 · @FloThé

## Overview

leakcheck is a single-page website that shows visitors, live, what their own browser and connection reveal to any website, then gives them a ranked plan to reduce it. "leakcheck" is a working name.

**Audience:** non-experts who want to understand their exposure, plus curious technical users. Every result is explained in plain language.

**Product principles**

- **Show, don't tell.** Each leak is the visitor's own real value, not a generic warning.
- **Nothing leaves the tab.** Tests run in the visitor's browser; the site stores no results and no personal data.
- **Ask before reaching out.** Tests that contact an outside service or the local network run only after a click.
- **Honest advice.** No sponsored products, no affiliate links, trade-offs stated for every fix.
- **Accessible by default.** WCAG AAA contrast, no meaning carried by color alone.

## Scope

Version 1 is a static site covering browser, connection and local network tests plus the fix plan. Anything needing our own server comes later.

| Area | v1 | Later |
| --- | --- | --- |
| Browser tests | All tests in this spec | More fingerprint signals as browsers change |
| Connection tests | Public IP, provider, location, VPN check, secure DNS check | DNS leak test (needs our own DNS server) |
| Local network | Router probe with browser permission | None planned |
| Fix plan | Threat question, tiered fixes, rescan | Per-OS steps for every fix, share results as an image |
| Languages | English, French, Spanish | More languages if there is demand |
| Themes | Dark and light, follows system setting | Plain-font toggle for readers who find pixel fonts hard |

**Out of scope for this document:** security requirements (Content-Security-Policy, HTTP headers, dependency policy, threat model of the site itself). They get their own investigation.

## Page structure and user flow

The site is one page with an anchor per section (browser, connection, local network, fix it), plus a privacy notice and a legal notice. Only browser tests run on the first click; anything that leaves the device waits for its own click.

&#91;embedded content: user flow · one page, 3 click-gated tests, 1 loop\]

The fix plan loops back through "Rescan to verify", so the visitor sees which LEAK results turned OK.

## Browser tests

These run entirely in the visitor's browser with no network request, after the visitor clicks **Run the scan**. Each finding is marked LEAK or OK.

| Finding | What we show | How we read it | OK when |
| --- | --- | --- | --- |
| Screen | Resolution and pixel ratio | `screen`, `devicePixelRatio` | Value is rounded or standardized by the browser |
| Timezone | Zone name and UTC offset | `Intl.DateTimeFormat().resolvedOptions()` | Reports UTC while the clock says otherwise |
| Languages | Preferred languages in order | `navigator.languages` | Only one generic language |
| Graphics card | GPU vendor and model | WebGL renderer string | Masked or generic |
| Installed fonts | Number of fonts detected | Measuring text against a list of common fonts | Standard list returned |
| Canvas fingerprint | Short hash of a drawn image | Hash of a canvas rendering | Hash changes on every load (noise added) |
| Audio fingerprint | Short hash | Offline audio rendering | Hash changes on every load |
| CPU and memory | Cores and memory in GB | `hardwareConcurrency`, `deviceMemory` | Rounded or hidden |
| Third-party cookies | Blocked or allowed | Test cookie set and deleted at once | Blocked |
| Local IP via WebRTC | Shown or hidden | WebRTC candidate gathering, no outside server | Hidden behind a `.local` name |
| Global Privacy Control | Sent or not | `navigator.globalPrivacyControl` | Sent |

The summary card "likely unique" is an estimate from how many signals are distinctive. It never compares the visitor against a stored database, since we keep none.

## Connection tests

These need outside services, so they run only when the visitor clicks, and the section names which services are contacted before the click.

| Finding | What we show | How we get it | OK when |
| --- | --- | --- | --- |
| Public IP | Address, last part masked on screen | IP lookup service | Belongs to a VPN, Tor or relay |
| Provider | ISP name and network number (AS) | Same lookup | Not the visitor's home ISP |
| Approximate location | City, country, accuracy radius | Same lookup | City differs from the browser timezone, or is the relay's |
| VPN check | Detected or not | Compare the IP seen by the lookup with the one WebRTC reports through a public STUN server | Both match a VPN address, no real IP leaks |
| Secure DNS | On or off | Indirect check, wording must say it is an estimate | On |

Display rule: the full IP is shown only after a "reveal" click, so it never appears in a screenshot by accident.

The lookup service and STUN server are still to choose (see Open questions).

## Local network tests

The page tries to reach the visitor's router, which makes the browser ask for permission. Both outcomes are results: a found router is a LEAK, a refused permission is OK.

**Flow**

1. The visitor clicks **Probe my network**. The section explains beforehand that the browser will show a prompt and that saying no is a valid answer.
2. The page requests common router addresses: `192.168.1.1`, `192.168.0.1`, `10.0.0.1`, `192.168.1.254`.
3. It records which one answers and the response time in milliseconds. Nothing is read from the device itself.
4. Results stay on screen only.

**Findings**

| Finding | LEAK when | OK when |
| --- | --- | --- |
| Router | An address answered | No answer or permission refused |
| Permission prompt | No prompt was shown (older browser) | The browser asked first |
| Other devices | Never tested | Always shown as "not visible from a web page" |

**What we state plainly on the page:** a website cannot see MAC addresses, device names or Wi-Fi details. Only an installed app can.

Since late 2025, Chrome asks permission before a website can reach the local network ([Risky Bulletin](https://news.risky.biz/risky-bulletin-chrome-gets-a-new-prompt-to-prevent-sneaky-local-network-attacks/)). Firefox and Safari behaviour must be tested before launch.

## Fix plan

The fix plan turns the scan into a ranked to-do list, tailored to the visitor's threat and browser.

**Threat question.** "Who are you hiding from?" with three answers: advertisers and trackers, my internet provider or Wi-Fi, someone looking for me. The answer reorders the tiers; "someone looking for me" puts strong measures first.

**"Read this first" note** above the list: changing many settings by hand can make a visitor easier to recognize. The strongest fixes make everyone look the same.

**Each fix card shows**

- Title and one-line reason
- How much it hides: a 3-block meter (some, a lot, most), readable without color
- Effort in minutes
- Which scan findings it fixes, as tags linked back to the results
- Expandable steps for the detected browser, and a trade-off line
- A checkbox; ticks live in memory only and vanish when the tab closes

**v1 fixes**

| Tier | Fix | Hides | Fixes findings |
| --- | --- | --- | --- |
| In 5 minutes | Install a content blocker (uBlock Origin Lite or uBlock Origin) | a lot | Trackers, fingerprint scripts |
| In 5 minutes | Turn on secure DNS | a lot | DNS |
| In 5 minutes | Set location and camera permissions to "ask" | some | Location |
| This week | Switch to a browser that blends you in | most | Screen, fonts, graphics card, canvas |
| This week | Hide your IP (VPN with audited no-logs policy, or iCloud Private Relay) | most | Public IP, provider, location |
| This week | Separate logged-in and anonymous browsing | a lot | Cookies, profile linking |
| Strong anonymity | Use Tor Browser | most | IP, fingerprint, DNS |

**Browser facts the steps rely on** (re-check before launch)

- Safari 26 (iOS 26, macOS Tahoe 26) has Advanced Fingerprinting Protection on for all browsing by default ([iGeeksBlog](https://www.igeeksblog.com/safari-anti-tracking-tool/)).
- Firefox 145 added protections covering GPU, fonts, CPU cores and more, on in Private Browsing and Strict mode only for now ([Mozilla](https://blog.mozilla.org/en/firefox/fingerprinting-protections/)).
- Chrome 140 IP Protection hides the IP only from a list of known tracking domains, only in Incognito ([Chromium](https://groups.google.com/a/chromium.org/g/blink-dev/c/EbdlJ3pc3NM/m/onR2VnBgAgAJ)). Present it as narrower than a VPN.

**Rescan to verify** reruns the tests and shows before and after counts.

## Visual design

The look is a terminal screen: near-black and off-white, pixel titles, a monospace body, red for actions and leaks, cyan for protection.

**Color tokens**

| Token | Role | Dark | Light |
| --- | --- | --- | --- |
| `bg` | Page background | `#121212` | `#FAFAFA` |
| `fg` | Main text, borders | `#EDEDED` | `#111111` |
| `soft` | Secondary text | `#CFCFCF` | `#333333` |
| `muted` | Labels, hints | `#A3A3A3` | `#545454` |
| `line` | Dividers | `#2E2E2E` | `#D4D4D4` |
| `panel` | Explanation panels | `#1C1C1C` | `#EFEFEF` |
| `red` | Buttons, LEAK | `#FF7469` | `#A1201A` |
| `onRed` | Text on red | `#121212` | `#FFFFFF` |
| `safe` | OK, protected | `#22D3EE` | `#005A6B` |

The theme follows the visitor's system setting.

**Typography**

- **Titles, buttons, tags, big numbers:** VCR OSD Mono by Riciery Leal, listed as 100% free on [dafont](https://www.dafont.com/fr/vcr-osd-mono.font). The mockups use VT323 as a stand-in until the file is added. Its coverage of é, è, ç, œ, ñ, ¿ and ¡ must be checked before launch.
- **Body:** IBM Plex Mono, 400 / 500 / 700, 16px base, line height 1.6.
- Both fonts are self-hosted.

**Components**

- **Primary button:** filled red, dark text, square corners, pixel font in capitals, at least 48px tall.
- **Secondary button:** outlined in `fg`, transparent fill.
- **LEAK tag:** filled red with a ✕ icon. **OK tag:** outlined cyan with a ✓ icon.
- **Section heading:** pixel font with a red `>` prompt, thick rule underneath.
- **Finding row:** label, value, tag; expands into a "why it matters / how to reduce it" panel.
- **Summary tiles:** three counts (leaking, protected, fingerprint uniqueness).

## Accessibility

The target is WCAG 2.2 level AAA wherever it applies to a page like this.

- **Contrast:** all text at least 7:1 against its background, in both themes, including red and cyan.
- **No pure black on pure white:** dark grey and off-white reduce glare for readers with astigmatism or dyslexia.
- **Color never carries meaning alone:** LEAK is filled with ✕, OK is outlined with ✓; meters use filled and empty blocks.
- **Text size:** body 16px minimum, labels 13px minimum, scalable to 200% without loss.
- **Targets:** buttons, links and checkboxes at least 44 × 44px.
- **Keyboard:** every control reachable by Tab, visible 3px focus outline, a "Skip to results" link first.
- **Screen readers:** results as real lists, threat question as a radio group, decorative icons hidden, results announced when a scan finishes.
- **Motion:** no animation by default; anything added later respects reduced-motion settings.
- **Pixel font:** used only for short text; long text stays in IBM Plex Mono.

## Languages

The site launches in English, French and Spanish, with the same content and features in each.

- **One static page per language:** `/en/`, `/fr/`, `/es/`. The address carries the choice, so nothing is stored and a link opens in the right language.
- **First visit:** the root page reads the browser's preferred languages in the visitor's own browser and opens the matching version, English as fallback. Nothing is sent anywhere.
- **Language picker** in the header, as text in each language's own name: English · Français · Español. No flags, since languages are not countries.
- **Each page declares its language** (`lang` attribute and alternate-language links) so screen readers pronounce it correctly.
- **Translated tags:** LEAK becomes FUITE in French and FUGA in Spanish; OK stays OK.
- **Longer text:** French and Spanish run about 20–30% longer than English. Buttons, tags and the finding rows must wrap without clipping.
- **Numbers and dates** use each language's format through the browser's built-in formatting.
- **Fix steps** quote browser menu names as they appear in that language's version of Chrome, Firefox, Safari, Edge and Brave.
- **Legal pages:** privacy notice in all three languages; the French legal notice (mentions légales) is required.
- **Review:** every translation checked by a native speaker before release.

The browser's language list is itself one of the findings the scan shows, which the page can point out.

## Mockups

All screens are on one design canvas: [Leak Check mockup](https://claude.ai/artifact/CHzEQCTSyLsw2qmDt5ReRh). Values in the mockups are examples, not real scan data.

| Board | Shows | Status |
| --- | --- | --- |
| Dark, accessible (cyan) | Results page: header, hero with scan button, summary tiles, the three test sections, one expanded finding, fix call-to-action, footer | Reference design |
| Light mode, accessible | Same page in the light palette | Reference design |
| Fix plan | Threat question, progress bar with rescan, "read this first" note, three tiers of fix cards, one expanded with steps; clickable | Reference design |
| Body font options | IBM Plex Mono, Atkinson Hyperlegible Mono, Martian Mono side by side | Decided: IBM Plex Mono |
| Third color: phosphor green | Results page with green as the protected color | Rejected: red and green are hard to tell apart for color-blind readers |
| Third color: amber | Results page with amber as the protected color | Rejected: reads as "warning", blurs with red |

The canvas is private until shared from its Share menu.

## Privacy and data

The site keeps no visitor data. GDPR still applies because IP addresses are personal data, so the design keeps obligations minimal. This is a product summary, not legal advice.

- **All tests in the browser.** No scan result is ever sent to our server.
- **No cookies, no analytics, no tracking.** So no cookie banner is needed; the test cookie is set and deleted at once.
- **Device reading only on request.** Tests start on a click, which is what keeps them within the "strictly necessary for a service the user asked for" exemption.
- **Outside services named and opt-in.** The IP lookup and STUN server are contacted only after a click, with their names shown first.
- **Fonts and scripts self-hosted.** No Google Fonts or CDN calls from the live site.
- **Nothing shared through a server.** A future "share results" feature generates an image in the browser.
- **Hosting logs minimal.** Host chosen for logs without personal data; data processing agreement signed.
- **Open source,** so anyone can check that nothing is sent.

**Pages to write:** privacy notice (GDPR Article 13: who, what, why, how long, third parties, rights, CNIL complaint) and the French legal notice (mentions légales).

## Tech stack and hosting

Plain HTML, CSS and JavaScript with zero runtime dependencies, hosted on statichost.eu.

| Choice | Decision | Why |
| --- | --- | --- |
| Framework | None | Small page, easy to audit, no third-party code in visitors' browsers |
| Language | JavaScript with JSDoc types and `// @ts-check` | Type checking without a build step; published code is exactly the source |
| Modules | Native ES modules: `browser.js`, `connection.js`, `localnet.js`, `fixes.js` | One file per section, no bundler |
| Dev tools | Vite for live reload, TypeScript `tsc` for checks | Used on the developer's machine only |
| Hosting | [statichost.eu](https://statichost.eu/pricing), free Hobby plan | Swedish company, logs hold no personal information and are kept 7 days at most ([FAQ](https://www.statichost.eu/faq)), configurable headers, deploy on Git push |
| Source code | Public repo on GitHub or Codeberg | Open source; the site itself is not served from there |
| Domain | European registrar, WHOIS privacy on | Keeps the owner's details private |
| Later | Small European VPS for the DNS leak test | Needs a server we control |

GitHub Pages was rejected because it cannot set custom HTTP headers.

## Open questions and next steps

- [ ] Final product name and domain
- [ ] Add the VCR OSD Mono file and check its French and Spanish characters; translate all copy into French and Spanish
- [ ] Choose the IP lookup service (EU-based, clear privacy policy) and the STUN server
- [ ] Decide whether the fix plan names VPNs: criteria only, or criteria plus independently audited examples with a no-commercial-link note
- [ ] Test the local network probe and its prompt in Chrome, Firefox and Safari
- [ ] Write fix steps for each browser: Chrome, Firefox, Safari, Edge, Brave
- [ ] Write the privacy notice and legal notice
- [ ] Security requirements investigation (CSP, headers, dependency policy) — separate document
- [ ] Remove the rejected green and amber boards from the canvas once this spec is approved
