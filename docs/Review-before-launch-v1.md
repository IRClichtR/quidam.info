# Review before launch

Everything below must be ticked before leakcheck goes public. The French and Spanish text in
`public/js/i18n/fr.js`, `public/js/i18n/es.js`, `public/fr/index.html` and `public/es/index.html`
is a draft that no native speaker has checked yet. No fix step has been followed in a real browser yet.

## A. Native-speaker review of every French and Spanish string

Review each group in both languages. Check for plain, friendly wording a non-expert understands,
correct accents, `{placeholders}` kept exactly, and tags LEAK → FUITE / FUGA, OK kept as OK,
CAN'T TELL → INCERTAIN / INCIERTO. French uses "vous", Spanish uses "tú" (neutral, mostly Spain
vocabulary: "un Mac", "Añadir"). Decide whether Latin American variants are needed.

### French (`fr.js`, `public/fr/index.html`)
- [x] Page `<title>` and `<meta name="description">`
- [x] Header, navigation, language picker labels, skip link, "{n} octets stockés"
- [x] Hero, scan button, summary tiles, footer (`hero.*`, `scan.*`, `results.*`, `summary.*`, `footer.*`)
- [x] Section titles and subtitles (`section.*`), panel labels (`panel.*`), tags (`tag.*`)
- [x] Browser findings: labels, values, "why" and "how to reduce it" (`finding.screen` … `finding.gpc`)
- [x] Connection: intro, buttons, VPN-off check, findings (`connection.*`, `finding.publicIp/provider/location/vpn*`)
- [x] Local network: intro, findings (`localnet.*`, `finding.router/lnaPrompt/otherDevices`)
- [x] Fix plan chrome: CTA, threat question, progress, rescan, note, tiers, meters, tags (`fix.cta` … `fix.tradeoff.label`)
- [x] Strings added after the first review (VPN question redesign): `scan.intro`, `section.connection.title`, `connection.intro`, `connection.run`, `connection.vpn.*`, `finding.publicIp.local`, `finding.publicIp.fix`, `finding.provider.fix`, `finding.location.why`, `finding.location.fix`, `finding.vpn4.why`, `finding.vpn6.why`, and the last step of `fix.ip.steps.*`
- [x] Fix cards: title, why, trade-off, and steps for each browser, for `block`, `dns`, `perms`, `browser`, `ip`, `split`, `tor`
- [x] Button labels are short enough and still natural: LANCER L'ANALYSE, VÉRIFIER MON IP, AFFICHER L'IP COMPLÈTE, REVÉRIFIER VPN COUPÉ, SONDER MON RÉSEAU, VOIR MES CORRECTIFS, RELANCER POUR VÉRIFIER
- [x] Typography is consistent: a no-break space (U+00A0, not the narrow U+202F) before `: ; ? !` in `fr.js` values and in the static text of `public/fr/index.html` (a unit test enforces it), « » used only in `fix.perms.title`

### Spanish (`es.js`, `public/es/index.html`)
- [x] Page `<title>` and `<meta name="description">`
- [x] Header, navigation, language picker labels, skip link, "{n} bytes guardados"
- [x] Hero, scan button, summary tiles, footer (`hero.*`, `scan.*`, `results.*`, `summary.*`, `footer.*`)
- [x] Section titles and subtitles (`section.*`), panel labels (`panel.*`), tags (`tag.*`)
- [x] Browser findings: labels, values, "why" and "how to reduce it" (`finding.screen` … `finding.gpc`)
- [x] Connection: intro, buttons, VPN-off check, findings (`connection.*`, `finding.publicIp/provider/location/vpn*`)
- [x] Local network: intro, findings (`localnet.*`, `finding.router/lnaPrompt/otherDevices`)
- [x] Fix plan chrome: CTA, threat question, progress, rescan, note, tiers, meters, tags (`fix.cta` … `fix.tradeoff.label`)
- [x] Fix cards: title, why, trade-off, and steps for each browser, for `block`, `dns`, `perms`, `browser`, `ip`, `split`, `tor`
- [x] Button labels: INICIAR EL ANÁLISIS, COMPROBAR MI IP, MOSTRAR LA IP COMPLETA, COMPROBAR SIN LA VPN, EXPLORAR MI RED, VER MIS SOLUCIONES, ANALIZAR DE NUEVO
- [x] Gender and number agreement in counts ("{leak} con fuga, {ok} protegidos", "{n} / {total} hechas")

## B. Follow every fix step in each real browser and language

For each browser, switch its interface language to French, then Spanish, follow the steps word for word,
and correct any menu name that differs. Also re-check the English steps. Names marked (?) are the ones
the draft is least sure of.

| Fix | Chrome | Firefox | Safari (macOS and iOS) | Edge | Brave | Other |
| --- | --- | --- | --- | --- | --- | --- |
| block | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| dns | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| perms | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| browser | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| ip | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| split | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |
| tor | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es | [ ] en [ ] fr [ ] es |

Menu names to confirm:

- [ ] Chrome fr: Paramètres > Confidentialité et sécurité > Sécurité > Utiliser un DNS sécurisé; Paramètres des sites > Position (?), Caméra, Micro (?); Ajouter à Chrome; menu Extensions, épingler; profile menu Ajouter (?); "navigation privée" for Incognito.
- [ ] Chrome es: Configuración > Privacidad y seguridad > Seguridad > Usar DNS seguro; Configuración de sitios > Ubicación, Cámara, Micrófono; Añadir a Chrome (es-ES) or Agregar a Chrome (es-419) (?); Fijar (?); profile menu Añadir (?); "modo incógnito".
- [ ] Firefox fr: Paramètres > Vie privée et sécurité; DNS via HTTPS, Protection accrue, Protection maximale (?); Protection renforcée contre le pistage > Stricte, Standard; Permissions > Localisation > Paramètres…; Ajouter à Firefox.
- [ ] Firefox es: Ajustes (es-ES) or Configuración (es-MX/es-AR) (?); Privacidad & Seguridad; DNS sobre HTTPS, Protección aumentada, Protección máxima (?); Protección mejorada contra rastreo > Estricta, Estándar; Permisos > Ubicación > Ajustes… (the steps now say Ajustes throughout) (?); Agregar a Firefox (?).
- [ ] Safari fr: Safari > Réglages > Extensions, Sites web > Localisation, "Lors de la consultation d'autres sites web" > Demander, Caméra, Micro; Avancées (?) > Toute la navigation (?); Profils > Nouveau profil; iOS Réglages > Apps > Safari; Réglages > [nom] > iCloud > Relais privé.
- [ ] Safari es: Safari > Ajustes > Extensiones, Sitios web > Ubicación, "Al visitar otros sitios web" > Preguntar, Cámara, Micrófono; Avanzado (?) > En toda la navegación (?); Perfiles > Nuevo perfil; iOS Ajustes > Apps > Safari; Ajustes > [nombre] > iCloud > Relay privado (?).
- [ ] Safari 26 Advanced Fingerprinting Protection: the wording of the setting in fr and es ("protection avancée contre le suivi et les empreintes", "protección avanzada contra la toma de huellas digitales") (?).
- [ ] Edge fr: Paramètres > Confidentialité, recherche et services > Sécurité > Utiliser un DNS sécurisé; Cookies et autorisations de site > Emplacement > Demander avant d'accéder; Modules complémentaires Microsoft Edge > Obtenir; Ajouter un profil; favoris.
- [ ] Edge es: Configuración > Privacidad, búsqueda y servicios > Seguridad > Usar DNS seguro; Cookies y permisos del sitio > Ubicación > Preguntar antes de acceder; Complementos de Microsoft Edge > Obtener; Agregar perfil; favoritos.
- [ ] Brave fr/es: whether "Shields" is localized (the draft keeps "Shields"); Agressif / Agresivo; Paramètres des sites et de Shields / Configuración de sitios y Shields (?); Ajouter un profil / Añadir perfil nuevo (?); Fenêtre privée avec Tor / Ventana privada con Tor.
- [ ] Tor Browser fr/es: the Connect button reads Se connecter / Conectar (?).
- [ ] uBlock Origin Lite exists in the Safari App Store and in Edge Add-ons under publisher Raymond Hill; the AMO page says "auteur" / "autor".
- [ ] Browser facts the steps rely on are still current: Safari 26 fingerprinting protection on for all browsing; Firefox 145 protections in Private Browsing and Strict only; Chrome IP Protection only in Incognito and only against listed tracking domains, described as narrower than a VPN.

## C. Check the "how to reduce it" browser claims

- [ ] Canvas: Tor Browser and Mullvad Browser block or blank the read-back image; Firefox does the same with `privacy.resistFingerprinting` on. Run the scan in each and check the row reads OK or "changes each time".
- [ ] Audio: Tor Browser and Mullvad Browser give the same value as other users of the same version (the row may still read LEAK, as the text says).
- [ ] Fonts: Tor Browser and Mullvad Browser expose only their bundled font set.
- [ ] Graphics card: Tor Browser and Mullvad Browser report a generic WebGL renderer; Firefox Strict (145+) and Safari 26 too.
- [ ] Screen and time zone: Tor Browser and Mullvad Browser report the window size and UTC.
- [ ] CPU / memory: Firefox, Safari, Tor Browser and Mullvad Browser leave `deviceMemory` undefined (row OK); Chrome, Edge and Brave expose it (row LEAK). The text no longer promises an OK from Brave.
- [ ] Global Privacy Control: sent by Brave, Firefox (setting on), Mullvad Browser and Tor Browser.
- [ ] Local IP via WebRTC (answer the VPN question, then CHECK MY IP): recent Chrome, Edge, Firefox and Safari show a `.local` name; uBlock Origin and Brave can block it.
- [ ] Brave's canvas/audio noise ("changes each time") with default Shields.

## D. Local network probe

- [ ] Test with real routers, including ones that redirect to a hostname (for example `fritz.box`, `routerlogin.net`): the redirect is blocked by our CSP, so the row reads "no answer" and shows OK while the router is in fact reachable (false OK). Decide whether to reword or detect it.
- [ ] Chrome, Edge and Brave: the local network access prompt appears, and both "allow" and "block" give the expected rows.
- [ ] Firefox and Safari: confirm whether any prompt appears and what the rows show (no prompt is expected today).
- [ ] Once hosted on HTTPS: check mixed-content behaviour of the `http://` router requests in each browser (blocked outright, or allowed after the prompt), and that the rows still read correctly.

## E. Automated tests on WebKit

- [x] WebKit now starts on this machine: `npx playwright test --project=webkit` passes (58 tests, 2026-10-25), as do Chromium and Firefox.

## F. Font licence

- [ ] VCR OSD Mono ships with no licence file. Confirm redistribution rights with the author, in writing, before committing the font file or shipping it. If that fails, fall back to VT323 (OFL) only.

## G. Dev and hosting origins

- [ ] The IPv6-only dev origin `ip6-localhost` exists only on Debian/Ubuntu hosts (`/etc/hosts`). Elsewhere, set `V6_ORIGIN` to an origin whose hostname resolves to IPv6 only.
- [ ] Hosting needs one IPv4-only hostname (A record only) and one IPv6-only hostname (AAAA record only) for the two-family check, with TLS for both.

## H. Legal pages

- [x] Privacy notice in English, French and Spanish: generated by `npm run legal` from `legal/owner.json` (docs/Go_live.md, step 5).
- [x] French legal notice (LCEN art. 1-1): same page, same command.
- [x] Linked from the footer of every language page.
- [ ] Fill in `legal/owner.json`, run `npm run legal`, and have the three legal pages read once (by a native speaker for fr/es).
- [ ] Choose the repository licence: `LICENSE` is GPL-2.0 but `package.json` says ISC (docs/Go_live.md, step 0.2). `npm run preflight` warns until they agree.
- [ ] Decide about the name: "LeakCheck" (leakcheck.io) is an existing commercial service in the same field (docs/Go_live.md, step 0.1).

## I. Manual checks still to do

- [ ] Phone on the same Wi-Fi: start `NODE_ENV=development npm start` on the dev machine and open `http://<LAN IP>:8080/en/` (the server was confirmed to answer on the LAN address with curl, but no phone has loaded it yet).
- [ ] Run all three sections (browser, connection, local network) on the phone.
- [ ] Toggle a VPN on the phone and run the VPN-off recheck both ways.
- [ ] Expect CAN'T TELL on the canvas and audio rows: plain http over a LAN IP is not a secure context, so `crypto.subtle` is unavailable. This is not a bug; recheck on HTTPS once hosted.

## v2: new text and new claims to check

The v2 front end (docs/leakcheck-design-v2.md) added text that no native speaker has read and product facts that no one has checked against the products yet.

### Native-speaker review of the v2 strings (fr and es)
- [ ] Summary tiles: `summary.recog.*`, `fix.tile.*`.
- [ ] Connection: `section.connection.*`, `connection.intro`, `connection.run`, `conn.*` (result card, "is this you?", outcomes).
- [ ] "Your VPN, checked": `vpn.*`, including every answer and basic-fix line, and the double-check (`vpn.cmp.*`).
- [ ] Fix plan: `fix.title` … `fix.notOn`, `fix.platform.*`, `fix.opt.*`, `fix.where.alt.*`, and the five cards `fix.browser.*`, `fix.where.*`, `fix.home.*`, `fix.gpc.*`, `fix.webrtc.*` (titles, descriptions, steps, trade-offs, tip).
- [ ] Rewritten finding texts that now name tool types instead of uBlock Origin: `finding.webrtcLocal.fix`, `finding.router.fix`, `finding.lnaPrompt.fix`.
- [ ] Page titles and descriptions: `page.title`, `page.description` (then `npm run pages`).
- [ ] The legal page (`npm run legal`), in all three languages.
- [ ] Plural forms read naturally: "0 fuite / 1 fuite / 2 fuites", "1 / 4 réglés", "{n} fuga(s)".

### Facts on the cards (design v2, section 10)
- [ ] Each browser option really does what its note says, on each platform: Brave, DuckDuckGo, Firefox (Strict), Mullvad Browser, Safari 26, Tor Browser. Run the scan in each and keep only what the scan confirms; in particular "only Mullvad Browser and Tor Browser also hide your screen, timezone and languages" (`fix.browser.further`).
- [ ] Platform availability in `public/js/fixes.js` (`OPTIONS`): DuckDuckGo not on Linux; Mullvad Browser desktop only; Tor Browser not on iOS; Safari Apple only.
- [ ] VPN notes: Mullvad (Sweden, no email, cash), NymVPN (Switzerland, 5-hop mixnet mode), Proton VPN (Switzerland, free plan, majority owned by the Proton Foundation), each with a published independent audit: check against each provider's site and latest audit report.
- [ ] GPC: on by default in Brave and DuckDuckGo; the Firefox setting name in en/fr/es ("Tell websites not to sell or share my data"); DuckDuckGo Privacy Essentials and Privacy Badger still send it; Safari has no way to send it.
- [ ] "Recent browsers hide the local address behind a random .local name" (webrtc card): check in current Chrome, Edge, Firefox, Safari.

### Behaviour to check by hand
- [ ] "Is this you?" with a real VPN (on a phone and a laptop): the three answers, TEST MY VPN, and the double-check both ways (VPN off and on again).
- [ ] With iCloud Private Relay on (Safari): the question is skipped and the outcome says so.
- [ ] Screen reader pass on the problem cards (done/undo moves focus), the radio group (arrow keys), and the live outcome text.
