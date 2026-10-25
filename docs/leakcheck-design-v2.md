# leakcheck — design v2

Status: approved for implementation · 2026-10-25
Applies to: branch after `feat/leakcheck-v1`
Visual reference: design canvas "Leak Check mockup" (https://claude.ai/artifact/CHzEQCTSyLsw2qmDt5ReRh), boards **Fix A**, **IP A**, **IP A, step 2**. Boards Fix B, Fix C and IP B are rejected alternatives; ignore them.

This document lists every change from v1. Anything not mentioned here stays as it is in v1 (palette, fonts, accessibility rules, privacy rules, tech stack: plain HTML/CSS/JS with JSDoc `// @ts-check`, no new runtime dependency).

---

## 1. Summary of changes

| Area | v1 | v2 |
|---|---|---|
| Fingerprint tile in scan summary | "likely unique / probablement unique" | 3-level scale: "hard to / fairly / easy to recognize" |
| Fix entry point | `#fix-cta` box at the bottom: "fix the top 3 first" | Third summary tile: "4 problems · each with a basic fix" + button to `#fix` |
| Fix plan | Solution-first cards, threat question, "read this first" box, 3 effort tiers | Problem → basic fix cards, one per problem, each fix offers several options |
| Product mentions | One product per fix (e.g. uBlock Origin Lite) | Never one brand: 2–4 options per fix, alphabetical, filtered by platform |
| Connection section | VPN question must be answered before the check | Check first, then ask "is this you?" |
| VPN checks | Jargon rows (`vpn check, ipv4`…), `CAN'T TELL` until a VPN-off recheck | Separate step "your VPN, checked": 3 plain questions; VPN-off compare is optional |
| Local IP via WebRTC | In the connection section | Moved to the local network section |
| Layout bugs | Button jumps when a VPN answer is picked; FR tile word breaks mid-word | Fixed (see §6) |

---

## 2. Global rules

### 2.1 Fingerprint tile (scan summary)
Replace the "likely unique" tile with a 3-level scale. Keep the existing estimate logic in `browser.js`; map its output to a level.

| Level | key | en | fr | es |
|---|---|---|---|---|
| low | `summary.recog.low` | hard to recognize | difficile à reconnaître | difícil de reconocer |
| medium | `summary.recog.mid` | fairly recognizable | assez reconnaissable | bastante reconocible |
| high | `summary.recog.high` | easy to recognize | facile à reconnaître | fácil de reconocer |
| sub-line | `summary.recog.sub` | sites can tell your browser apart without cookies | les sites peuvent distinguer votre navigateur sans cookies | los sitios pueden distinguir tu navegador sin cookies |

Never use "unique", "fingerprint" or "trackable" in visible copy of the summary.

### 2.2 Plurals
All counts ("13 leaks", "4 problems", "1 / 4 fixed") go through `Intl.PluralRules(lang)`. Add a helper in `i18n.js`:
```js
/** @param {string} key  @param {number} n */
export function tPlural(key, n) { /* looks up `${key}.one` / `${key}.other`, replaces {n} */ }
```

### 2.3 French typography
Use a non-breaking space (` `) before `: ; ? !` and inside `« »` in all French strings. Add a unit test that fails if a French string contains ` :`, ` ?`, ` !` or `« ` with a regular space.

### 2.4 Product policy (all sections)
- Name tools by type in titles ("use a browser that blends you in"), never a brand.
- Each fix with products lists **2–4 options in alphabetical order**.
- Show a one-line policy above the fix list (key `fix.policy`): "We name tools, never one brand: each fix lists several options, in alphabetical order. Nothing is sponsored and there are no affiliate links."
- Filter options by detected platform (`navigator.userAgentData` with UA fallback). Options not available on the platform are hidden and named in a note: "Not on Linux, so not shown: DuckDuckGo, Safari."
- VPN selection criteria are stated in the copy: published independent audit, owners who don't make money from ads or data. Do not name excluded companies anywhere on the site.
- Opera is not listed (no fingerprinting protection; its built-in "VPN" covers only the browser).

---

## 3. Fix section ("how to fix it")

Reference: board **Fix A**.

### 3.1 Remove
- `#fix-cta` section and its strings (`fix the top 3 first`, `commencez par les 3 premiers`, `empieza por las 3 primeras`).
- The threat question ("who are you hiding from?") and its radio group.
- The "read this first" box (its content moves into the fingerprint card's tip, §3.5).
- Effort tiers ("in 5 minutes / this week / strong anonymity").

### 3.2 Entry point
Third tile in the scan summary (`#results`):
- big text: `fix.tile.count` → "{n} problems" (plural)
- sub-line: `fix.tile.sub` → "each with a basic fix"
- link styled as primary button to `#fix`: `fix.tile.cta` → "SEE THE FIXES ↓"

The tile appears only after the first scan. The "protected" count does **not** change when a fix is ticked; only a rescan changes counts.

### 3.3 Grouping findings into problems
Add `problems.js` (pure logic, `// @ts-check`). Input: the list of findings with LEAK status from all sections. Output: ordered problems. Each finding belongs to exactly one problem.

| Problem id | Findings it groups | Basic fix (type) | Options shown |
|---|---|---|---|
| `browser` | screen, timezone, languages, graphics card, fonts, canvas, audio, cpu/memory | use a browser that blends you in | Brave, DuckDuckGo*, Firefox (Strict mode), Mullvad Browser, Safari*, Tor Browser |
| `where` | public ip, provider, approx. location | hide your address with a VPN | Mullvad, NymVPN, Proton VPN · free alternatives: Tor Browser, iCloud Private Relay* |
| `home` | router answered | answer Block when a site asks for your network | none (browser setting) |
| `gpc` | global privacy control not sent | send the Global Privacy Control signal | Firefox setting; Chrome: DuckDuckGo Privacy Essentials, Privacy Badger |
| `webrtc` | local IP via WebRTC shown (moved here from connection) | turn on your browser's WebRTC protection | same browser options as `browser` |

\* platform-dependent: DuckDuckGo (Windows, macOS, iOS, Android), Safari and iCloud Private Relay (Apple only).

Rules:
- A problem with zero LEAK findings is not shown.
- Order: most leaks first; ties keep the table order.
- The first card gets a "START HERE" badge (`fix.startHere`).
- Lead sentence (`fix.lead`): "Your {leaks} leaks come down to {problems} problems. Each one has a basic fix you can do today."

### 3.4 Card anatomy
Two columns separated by a large `→` (stacks on narrow screens):

**Left — problem**
1. index "1 / 4" + START HERE badge (first card)
2. tag `✕ PROBLEM` (filled red, same style as LEAK) + "{n} leaks" in red
3. title (pixel font), e.g. "your browser is easy to recognize"
4. one-sentence description
5. chips with the visitor's own values (labelled `aria-label="what sites see"`)

**Right — basic fix**
1. tag `✓ BASIC FIX` (outlined teal, same style as OK) + effort ("10 min")
2. fix title (bold body font)
3. one-sentence description
4. options list (if any): label "pick one", rows `name | one-line note`, then the platform/alternatives note
5. coverage: for `where`, `home`, `gpc` a square meter + "closes {a} of {b}"; for `browser` the sentence "Each hides different things. Rescan in the one you pick to see what changed." (no score, coverage differs per browser)
6. optional "go further:" line
7. `HOW TO DO IT` toggle button (`aria-expanded`) + "done" checkbox

**Expanded panel** (panel background): numbered steps for the detected browser/OS, "trade-off" text, and for `browser` a "tip": "Don't change lots of settings by hand: it makes you stand out more. A browser that gives everyone the same answers works better."

**Done state**: ticking "done" collapses the card to one line: `✓ FIXED` tag + "problem → fix" + "undo" button. Progress row above the list: "{d} / {n} fixed", a segmented bar, and `RESCAN TO CHECK` (reruns all tests the visitor already ran). Ticks live in memory only, as in v1.

The first card is expanded by default; others are collapsed.

### 3.5 Copy
Full EN/FR/ES copy for the four example problems is in board Fix A (open it in Play mode and use the language picker). Use it verbatim as the starting point; native speakers review FR/ES before release. Key strings:

| key | en | fr | es |
|---|---|---|---|
| `fix.title` | how to fix it | comment y remédier | cómo solucionarlo |
| `fix.sub` | biggest effect first | les plus efficaces d'abord | primero, lo que más protege |
| `fix.problem` | PROBLEM | PROBLÈME | PROBLEMA |
| `fix.basicFix` | BASIC FIX | SOLUTION SIMPLE | SOLUCIÓN SENCILLA |
| `fix.startHere` | START HERE | COMMENCEZ ICI | EMPIEZA AQUÍ |
| `fix.how` / `fix.hide` | HOW TO DO IT / HIDE THE STEPS | COMMENT FAIRE / MASQUER LES ÉTAPES | CÓMO HACERLO / OCULTAR LOS PASOS |
| `fix.pickOne` | pick one | au choix | elige una |
| `fix.further` | go further: | pour aller plus loin : | para ir más lejos: |
| `fix.done` / `fix.fixed` / `fix.undo` | done / FIXED / undo | fait / RÉGLÉ / annuler | hecho / RESUELTO / deshacer |
| `fix.rescan` | RESCAN TO CHECK | RELANCER POUR VÉRIFIER | VOLVER A COMPROBAR |
| `fix.tile.cta` | SEE THE FIXES ↓ | VOIR LES SOLUTIONS ↓ | VER LAS SOLUCIONES ↓ |

Problem titles:

| id | en | fr | es |
|---|---|---|---|
| browser | your browser is easy to recognize | votre navigateur est facile à reconnaître | tu navegador es fácil de reconocer |
| where | sites can tell where you are | les sites savent où vous êtes | los sitios saben dónde estás |
| home | your home network answers websites | votre réseau domestique répond aux sites web | tu red doméstica responde a los sitios web |
| gpc | you don't say "don't sell my data" | vous ne dites pas « ne vendez pas mes données » | no dices «no vendan mis datos» |
| webrtc | your browser shares your home address on the network | votre navigateur partage votre adresse sur le réseau local | tu navegador comparte tu dirección en la red local |

Note: the `webrtc` problem has no board yet; follow the same card pattern.

---

## 4. Connection section ("what sites see about your connection")

Reference: board **IP A**.

### 4.1 Remove
- The VPN radio question before the check, its hint ("Answer the question first…") and the gating of `#run-connection`.
- Rows `vpn check, ipv4`, `vpn check, ipv6` and `local ip via webrtc` from this section (see §4.4 and §5).

### 4.2 Flow
1. Intro + primary button `SHOW WHAT SITES SEE` (`conn.run`). Same privacy line as v1 under the title: "on a click · asks only leakcheck's server · keeps nothing".
2. On result, show a **result card** (2px border):
   - eyebrow `conn.sees`: "sites see"
   - two lines in the pixel font: "a {provider} connection" / "near {city}, {country}"
   - details: ip address (masked, `show` button keeps v1 reveal behaviour), network (ASN), accuracy (±km)
3. Below the card, the question **"is this you?"** (`conn.q`) as a radio group of 3 large options:
   - `yes` — "yes, {provider} is my provider and I'm near {city}"
   - `vpn` — "no, that's my VPN, Tor or iCloud Private Relay"
   - `unsure` — "I'm not sure"
4. Outcome panel (`aria-live="polite"`):
   - `yes` → LEAK for ip, provider, location + text + link "basic fix: hide your address with a VPN →" (to `#fix`, card `where`)
   - `unsure` → same as `yes`, with: "If you didn't turn on a VPN, Tor or iCloud Private Relay, this is you. That's the case for most people."
   - `vpn` → OK for ip, provider, location + text + primary link `TEST MY VPN →` that reveals step 2 (§4.3)
5. **Auto-detection**: if `whoami.tor` or `whoami.privateRelay` is true, skip the question, mark OK and show "Sites see a Tor exit / iCloud Private Relay, not you." Step 2 is not offered for these.
6. The verdict feeds the scan summary counts and the fix grouping (§3.3). Until the visitor answers, connection findings are not counted.

Local testing (loopback/private address, `isLocalIp`): keep v1 behaviour, but show it in the result card ("this machine or your local network: leakcheck can't see your public address from here") and hide the question.

### 4.3 Step 2: "your VPN, checked"
Reference: board **IP A, step 2**. Shown only after the `vpn` answer.

- Recap line: "sites see: a {provider} connection near {city}" + chip "you said: that's my VPN".
- Title `vpn.title`: "your VPN, checked"; sub: "3 questions, answered automatically".
- Intro: "A good VPN leaves no sign a site can see, so we check what usually goes wrong."
- Summary in the pixel font: "{ok} OK · {leak} leak".
- Three rows, each: question (bold), answer, OK/LEAK tag, one explanatory line, and for LEAK a "basic fix:" line.

| # | question | data source (existing `connection.js`) | OK when |
|---|---|---|---|
| 1 | does your VPN hide your address? | visitor's `vpn` answer; or `compareVpnOff` result if the optional double-check ran | answer is `vpn` (or VPN-off address differs) |
| 2 | can video calls reveal your real address? | srflx vs lookup comparison per family (`vpn.same` / `vpn.other`) | every srflx address equals what the site sees |
| 3 | does all your traffic go through the VPN? | IPv6 on another network than IPv4 (`vpn.otherNetwork`) | no IPv6, or IPv6 on the same network |

Basic fixes for LEAK rows: row 2 "use your VPN's own app rather than a browser extension, and turn on its WebRTC protection if it has one"; row 3 "turn on IPv6 leak protection in your VPN app".

When a row cannot be measured (no STUN answer of that family), show `CAN'T TELL` with the reason in plain words. `CAN'T TELL` is never used just because the visitor has a VPN.

**Optional double-check** (collapsed by default, toggle link on row 1: "double-check without your VPN ↓"):
1. Three numbered steps: "Turn your VPN off." / "Press COMPARE." / "Turn your VPN back on." (step 3 emphasised with a thick border)
2. Reassurance: "For this one request, leakcheck's server sees your real address. It keeps nothing."
3. `COMPARE` button → existing `compareVpnOff`.
4. Result: two cards side by side, "with your VPN" (teal border) and "without your VPN" (red border), each with provider · city and masked IP, then the verdict ("different addresses: your VPN hides your real one" / "same address: your VPN isn't hiding it").
5. Inverted banner: "Done? Turn your VPN back on."

Full EN/FR/ES copy for IP A and step 2 is in the boards (language picker in Play mode).

### 4.4 Wording changes
| v1 | v2 |
|---|---|
| check my ip address | what sites see about your connection |
| vpn check, ipv4 / ipv6 | the plain questions in §4.3 |
| INCERTAIN / CAN'T TELL (VPN pending) | removed; replaced by the "is this you?" answer |

FR title: "ce que les sites voient de votre connexion". ES title: "lo que los sitios ven de tu conexión".

---

## 5. Local network section
- Add the `local ip via webrtc` row here (it is about the home network, not what sites see). Same judgment logic as v1.
- No other change.

---

## 6. Layout fixes
1. **Button jump**: no control may change position when a radio option is selected. Reserve space for helper text or remove it (v2 removes the VPN question entirely; apply the rule to the "is this you?" options and any future radio group).
2. **Word breaks in tiles**: big summary text uses `overflow-wrap: normal; hyphens: manual;` and `font-size: clamp(32px, 4vw, 56px)`. No word may break mid-word at 320 px width in any language.
3. Longest-string check: FR and ES run 20–30% longer. Buttons, tags and card titles must wrap without clipping at 320 px.

---

## 7. Accessibility (additions to v1 rules)
- Problem/fix cards: `<ol>` of `<li>`; tags use icon + word (✕ PROBLEM / ✓ BASIC FIX), never color alone.
- "is this you?": `role="radiogroup"` with `aria-labelledby` on the question; options are buttons with `role="radio"` and `aria-checked`, arrow-key navigation.
- Outcome panels and step-2 verdicts: `aria-live="polite"`.
- `HOW TO DO IT` buttons: `aria-expanded`; the panel follows the button in DOM order.
- All targets ≥ 44 × 44 px; contrast ≥ 7:1 in both themes (tokens unchanged from v1).

---

## 8. Files likely touched
- `js/app.js` — wiring: summary tile, new connection flow, step 2, rescan of everything already run
- `js/connection.js` — judging no longer depends on a pre-check answer; expose the 3 step-2 checks
- `js/problems.js` — new: findings → problems (§3.3)
- `js/fixes.js` — card data, options per platform, steps per browser/OS
- `js/render.js` — card, result card, radio group, step-2 rows
- `js/i18n/{en,fr,es}.js` — new keys, removed keys, plural forms
- `index.html` per language, `css/site.css`

---

## 9. Acceptance criteria (Playwright)
1. After a scan, the summary shows a third tile with "{n} problems" and a working link to `#fix`.
2. No string "top 3", "3 premiers" or "3 primeras" remains in any language file.
3. Each fix with products shows ≥ 2 options, sorted alphabetically; on a Linux UA, DuckDuckGo and Safari are absent from the list and named in the note.
4. Ticking "done" collapses the card and updates "{d} / {n} fixed"; "undo" restores it; nothing is written to storage (assert `localStorage.length === 0` and no cookies).
5. `#run-connection` is enabled on page load without answering anything.
6. After the connection check, "is this you?" appears; choosing each option shows the matching outcome; choosing `vpn` reveals step 2.
7. With a mocked `whoami` returning `tor: true`, the question is skipped and the result is OK.
8. Step 2 shows exactly three rows; with mocked differing srflx/lookup addresses, row 2 is LEAK.
9. The `local ip via webrtc` row is in `#localnet`, not `#connection`.
10. At 320 px width, in en/fr/es: no horizontal page scroll, no mid-word breaks in summary tiles, no control moves when a radio option is selected.
11. French strings pass the non-breaking-space test (§2.3).

---

## 10. To verify before release
- Coverage claims per browser: run the scan in each listed browser and keep only claims the scan confirms ("only Mullvad Browser and Tor Browser also hide your screen, timezone and languages").
- VPN facts on the cards (jurisdiction, payment, free plan, ownership) against each provider's site and latest audit.
- Menu names in steps, in each browser's English, French and Spanish UI.
- Native-speaker review of all FR and ES copy.

---

## 11. Implementation notes (2026-10-25)

Choices made while building v2, where the boards or this document were silent or contradicted each other. Each one is easy to change.

**Open questions for the designer**
1. **Number of options.** §2.4 says 2–4 options per fix, but the §3.3 table gives 5 browsers on Windows (Brave, DuckDuckGo, Firefox, Mullvad Browser, Tor Browser) and 6 on macOS (plus Safari). The build follows the table; `OPTIONS` in `public/js/fixes.js` is the one place to trim if 4 is a hard limit.
2. **Accuracy (±km).** DB-IP Lite has no accuracy radius, so the result card says "city level, not your street" instead of a number.
3. **Tile order.** The scan summary shows four tiles: leaks, protected, problems (with SEE THE FIXES), recognisability. The board Fix A shows three; §2.1 keeps the recognisability tile.

**Decisions**
- The browser card's description no longer says "Yours is likely unique" (board copy), to stay consistent with the 3-level scale of §2.1.
- The fix tile and the fix plan appear only after a check has run; the tile only after the browser scan (§3.2). Before that, the fix section says "Run the scan first".
- The `lnaPrompt` finding ("no prompt was shown") is grouped under `home`. The `home` card's meter then shows honestly that answering Block closes the router leak but not the missing prompt ("closes 1 of 2"), and its steps add the content-blocker option.
- `webrtc` card: coverage shown as a count, like `where`/`home`/`gpc`; options are the browser options.
- Step 2 rows are not counted in the summary tiles or the fix plan: they have their own basic-fix lines, and counting them would make "Your {n} leaks come down to …" disagree with the cards.
- "That's my VPN" stays OK unless the optional double-check sees the same address; a double-check of another address family reads "can't compare".
- A rescan from the same public address keeps the "is this you?" answer and the double-check; a new address clears them.
- The GPC extensions are hidden in Safari (they don't exist there), with the "Not on Safari, so not shown" note; the Safari steps say so.
- Option and alternative notes: `fix.where.alt.*` adapts the free alternatives to the platform (Tor Browser isn't on iOS; iCloud Private Relay only on Apple).
- Lead sentence: three variants (one leak; one problem; several), since "{leaks} leaks come down to 1 problems" can't be fixed by plural rules alone.
- `npm run pages` writes the fr/es pages from the English page and the string files; a unit test fails when they drift.
