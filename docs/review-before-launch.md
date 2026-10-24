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
- [ ] Page `<title>` and `<meta name="description">`
- [ ] Header, navigation, language picker labels, skip link, "{n} octets stockés"
- [ ] Hero, scan button, summary tiles, footer (`hero.*`, `scan.*`, `results.*`, `summary.*`, `footer.*`)
- [ ] Section titles and subtitles (`section.*`), panel labels (`panel.*`), tags (`tag.*`)
- [ ] Browser findings: labels, values, "why" and "how to reduce it" (`finding.screen` … `finding.gpc`)
- [ ] Connection: intro, buttons, VPN-off check, findings (`connection.*`, `finding.publicIp/provider/location/vpn*`)
- [ ] Local network: intro, findings (`localnet.*`, `finding.router/lnaPrompt/otherDevices`)
- [ ] Fix plan chrome: CTA, threat question, progress, rescan, note, tiers, meters, tags (`fix.cta` … `fix.tradeoff.label`)
- [ ] Fix cards: title, why, trade-off, and steps for each browser, for `block`, `dns`, `perms`, `browser`, `ip`, `split`, `tor`
- [ ] Button labels are short enough and still natural: LANCER L'ANALYSE, VÉRIFIER MA CONNEXION, AFFICHER L'IP COMPLÈTE, REVÉRIFIER VPN COUPÉ, SONDER MON RÉSEAU, VOIR MES CORRECTIFS, RELANCER POUR VÉRIFIER
- [ ] Typography is consistent: plain spaces before `: ; ? !` (no U+202F), « » used only in `fix.perms.title`

### Spanish (`es.js`, `public/es/index.html`)
- [ ] Page `<title>` and `<meta name="description">`
- [ ] Header, navigation, language picker labels, skip link, "{n} bytes guardados"
- [ ] Hero, scan button, summary tiles, footer (`hero.*`, `scan.*`, `results.*`, `summary.*`, `footer.*`)
- [ ] Section titles and subtitles (`section.*`), panel labels (`panel.*`), tags (`tag.*`)
- [ ] Browser findings: labels, values, "why" and "how to reduce it" (`finding.screen` … `finding.gpc`)
- [ ] Connection: intro, buttons, VPN-off check, findings (`connection.*`, `finding.publicIp/provider/location/vpn*`)
- [ ] Local network: intro, findings (`localnet.*`, `finding.router/lnaPrompt/otherDevices`)
- [ ] Fix plan chrome: CTA, threat question, progress, rescan, note, tiers, meters, tags (`fix.cta` … `fix.tradeoff.label`)
- [ ] Fix cards: title, why, trade-off, and steps for each browser, for `block`, `dns`, `perms`, `browser`, `ip`, `split`, `tor`
- [ ] Button labels: INICIAR EL ANÁLISIS, COMPROBAR MI CONEXIÓN, MOSTRAR LA IP COMPLETA, COMPROBAR SIN LA VPN, EXPLORAR MI RED, VER MIS SOLUCIONES, ANALIZAR DE NUEVO
- [ ] Gender and number agreement in counts ("{leak} con fuga, {ok} protegidos", "{n} / {total} hechas")

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
- [ ] Firefox es: Ajustes (es-ES) or Configuración (es-MX/es-AR) (?); Privacidad & Seguridad; DNS sobre HTTPS, Protección aumentada, Protección máxima (?); Protección mejorada contra rastreo > Estricta, Estándar; Permisos > Ubicación > Configuración… (?); Agregar a Firefox (?).
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
- [ ] Local IP via WebRTC: recent Chrome, Edge, Firefox and Safari show a `.local` name; uBlock Origin and Brave can block it.
- [ ] Brave's canvas/audio noise ("changes each time") with default Shields.

## D. Local network probe

- [ ] Test with real routers, including ones that redirect to a hostname (for example `fritz.box`, `routerlogin.net`): the redirect is blocked by our CSP, so the row reads "no answer" and shows OK while the router is in fact reachable (false OK). Decide whether to reword or detect it.
- [ ] Chrome, Edge and Brave: the local network access prompt appears, and both "allow" and "block" give the expected rows.
- [ ] Firefox and Safari: confirm whether any prompt appears and what the rows show (no prompt is expected today).
- [ ] Once hosted on HTTPS: check mixed-content behaviour of the `http://` router requests in each browser (blocked outright, or allowed after the prompt), and that the rows still read correctly.

## E. Automated tests on WebKit

- [ ] On this machine WebKit cannot start: run `sudo npx playwright install-deps` (needs the user), then `npx playwright test --project=webkit`, and fix any failure. Chromium and Firefox already pass.

## F. Font licence

- [ ] VCR OSD Mono ships with no licence file. Confirm redistribution rights with the author, in writing, before committing the font file or shipping it. If that fails, fall back to VT323 (OFL) only.

## G. Dev and hosting origins

- [ ] The IPv6-only dev origin `ip6-localhost` exists only on Debian/Ubuntu hosts (`/etc/hosts`). Elsewhere, set `V6_ORIGIN` to an origin whose hostname resolves to IPv6 only.
- [ ] Hosting needs one IPv4-only hostname (A record only) and one IPv6-only hostname (AAAA record only) for the two-family check, with TLS for both.

## H. Legal pages

- [ ] Write the privacy notice in English, French and Spanish during the hosting step.
- [ ] Write the French legal notice (mentions légales: publisher, host, contact) during the hosting step.
- [ ] Link both from the footer of every language page.
