// @ts-check
// Writes the legal pages from one file of personal details. Run with `npm run legal`.
//
// Input: legal/owner.json (git-ignored; copy legal/owner.example.json). Output, all git-ignored:
// - public/{en,fr,es}/legal/index.html: legal notice (French LCEN, art. 1-1) and privacy notice (GDPR art. 13);
// - public/.well-known/security.txt: where to report a security problem (RFC 9116);
// - legal/out/registre-des-traitements.md: the record of processing (GDPR art. 30), for you only, never published.
// Without legal/owner.json the pages are written with [[placeholders]], so the footer link works while
// developing; `npm run preflight -- --production` (run by deploy.sh) refuses to ship them.
//
// The texts describe what the code really does. If you change what the site collects or keeps,
// change them here too. This is not legal advice; docs/Go_live.md, step 5, says what each part is for.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const LANGS = /** @type {const} */ (['en', 'fr', 'es']);
/** @typedef {typeof LANGS[number]} Lang */
const NB = ' ';

/**
 * @typedef {{
 *   you: {fullName: string, email: string, publishHomeAddress: boolean, homeAddress?: string, phone?: string},
 *   site: {domain: string, sourceCode?: string, lastUpdated?: string},
 *   host: {name: string, address: string, phone: string, website: string, serverCountry: Record<Lang, string>},
 * }} Owner
 */

/** Placeholders used when legal/owner.json is missing. preflight.js looks for "[[". */
/** @type {Owner} */
const PLACEHOLDER = {
  you: { fullName: '[[YOUR NAME]]', email: '[[YOUR EMAIL]]', publishHomeAddress: false },
  site: { domain: '[[YOUR DOMAIN]]', sourceCode: '', lastUpdated: '' },
  host: {
    name: '[[HOST NAME]]', address: '[[HOST ADDRESS]]', phone: '[[HOST PHONE]]', website: 'https://example.org',
    serverCountry: { en: '[[COUNTRY]]', fr: '[[PAYS]]', es: '[[PAÍS]]' },
  },
};

/**
 * Check the owner file and say in plain words what is missing.
 * @param {any} o
 * @returns {string[]} problems, empty when the file is usable
 */
export function validateOwner(o) {
  /** @type {string[]} */
  const bad = [];
  const filled = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== '' && !/^only needed|^Prénom NOM$|example\.org/.test(v);
  if (!filled(o?.you?.fullName)) bad.push('you.fullName: your first name and surname');
  if (!filled(o?.you?.email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.you.email)) bad.push('you.email: an address where people can reach you');
  if (typeof o?.you?.publishHomeAddress !== 'boolean') bad.push('you.publishHomeAddress: true or false');
  if (o?.you?.publishHomeAddress === true) {
    if (!filled(o.you.homeAddress)) bad.push('you.homeAddress: needed because publishHomeAddress is true');
    if (!filled(o.you.phone)) bad.push('you.phone: needed because publishHomeAddress is true');
  }
  if (!filled(o?.site?.domain) || /^https?:|\//.test(o.site.domain)) bad.push('site.domain: the bare domain, such as mysite.fr (no https://, no slash)');
  for (const k of ['name', 'address', 'phone', 'website']) if (!filled(o?.host?.[k])) bad.push(`host.${k}`);
  for (const l of LANGS) if (!filled(o?.host?.serverCountry?.[l])) bad.push(`host.serverCountry.${l}`);
  return bad;
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} url @param {string} [text] */
const link = (url, text = url) => `<a href="${esc(url)}">${esc(text)}</a>`;
/** @param {string} email */
const mail = (email) => link(`mailto:${email}`, email);

/**
 * The page text for one language. Every value is HTML already escaped where it holds owner data.
 * @param {Lang} lang
 * @param {Owner} o
 * @param {string} date formatted for the language
 */
function texts(lang, o, date) {
  const { you, host, site } = o;
  const name = esc(you.fullName);
  const hostBlock = `${esc(host.name)}<br>${esc(host.address)}<br>${esc(host.phone)} · ${link(host.website)}`;
  const country = esc(host.serverCountry[lang]);
  const source = site.sourceCode ? link(site.sourceCode) : '';
  if (lang === 'fr') {
    return {
      title: `Mentions légales et confidentialité`,
      pageTitle: `ombre${NB}: mentions légales et confidentialité`,
      back: '← retour à ombre',
      legalTitle: 'mentions légales',
      legal: you.publishHomeAddress
        ? `<p>Ce site est édité à titre non professionnel par une personne physique, conformément à l'article 1-1 de la loi n°${NB}2004-575 du 21${NB}juin 2004 pour la confiance dans l'économie numérique (LCEN).</p>
<dl><dt>Éditeur et directeur de la publication</dt><dd>${name}<br>${esc(you.homeAddress ?? '')}<br>${esc(you.phone ?? '')}<br>${mail(you.email)}</dd>
<dt>Hébergeur</dt><dd>${hostBlock}</dd></dl>`
        : `<p>Ce site est édité à titre non professionnel par une personne physique, ${name}. Conformément à l'article 1-1 II de la loi n°${NB}2004-575 du 21${NB}juin 2004 pour la confiance dans l'économie numérique (LCEN), l'éditeur ne publie pas son adresse personnelle${NB}; ses éléments d'identification ont été communiqués à l'hébergeur.</p>
<dl><dt>Contact</dt><dd>${mail(you.email)}</dd>
<dt>Hébergeur</dt><dd>${hostBlock}</dd></dl>`,
      ip: `<p>Les données de géolocalisation IP proviennent de ${link('https://db-ip.com', 'DB-IP')} (IP to City Lite et IP to ASN Lite), sous licence ${link('https://creativecommons.org/licenses/by/4.0/deed.fr', 'CC BY 4.0')}. Les polices IBM Plex Mono et VT323 sont sous licence SIL Open Font License.${source ? ` Le code source du site est public${NB}: ${source}.` : ''}</p>
<p>Les noms de produits et de services cités dans les solutions appartiennent à leurs propriétaires${NB}; ils sont cités pour les décrire. Rien n'est sponsorisé et il n'y a aucun lien affilié.</p>`,
      privacyTitle: 'confidentialité',
      privacy: `<p>En bref${NB}: ombre ne dépose aucun cookie, ne stocke rien dans votre navigateur, ne fait aucune mesure d'audience et n'écrit l'adresse IP de personne sur un disque.</p>
<h3>Qui est responsable</h3>
<p>${name}, particulier, qui édite ce site à titre non commercial. Contact${NB}: ${mail(you.email)}.</p>
<h3>Ce que le site traite, et pourquoi</h3>
<ul>
<li><strong>Afficher les pages.</strong> Comme pour tout site, votre navigateur envoie votre adresse IP au serveur pour recevoir les pages. Elle sert à vous répondre, puis elle est oubliée. Aucun journal d'accès n'est tenu.</li>
<li><strong>Analyse du navigateur.</strong> Elle a lieu dans votre navigateur, seulement quand vous appuyez sur le bouton. Les caractéristiques lues (écran, polices, carte graphique, etc.) servent uniquement à vous montrer le résultat, à votre demande. Rien n'est envoyé au serveur et rien n'est conservé.</li>
<li><strong>Vérification de la connexion.</strong> Seulement quand vous appuyez sur le bouton. Le serveur d’ombre lit l'adresse IP de votre connexion, la cherche dans sa propre copie de bases publiques (DB-IP Lite, liste des sorties Tor, plages d'iCloud Private Relay), vous renvoie le résultat et l'oublie. Le serveur STUN du site vous renvoie de même l'adresse et le port qu'il voit. Aucun tiers n'est contacté à votre sujet.</li>
<li><strong>Protection contre les abus.</strong> Pour éviter qu'une seule adresse sature le service, le serveur garde en mémoire vive votre adresse IP et un compteur pendant une minute, puis les efface. Ils ne sont jamais écrits sur un disque.</li>
<li><strong>Réseau local.</strong> Votre navigateur contacte directement votre box${NB}; rien n'atteint le serveur d’ombre.</li>
<li><strong>Solutions cochées.</strong> Elles restent dans la mémoire de l'onglet et disparaissent quand vous le fermez.</li>
</ul>
<h3>Base légale</h3>
<p>L'intérêt légitime (article 6.1.f du RGPD)${NB}: vous fournir la vérification que vous demandez et garder le service disponible et sûr. La lecture des caractéristiques de votre appareil est strictement nécessaire au service que vous demandez expressément en appuyant sur le bouton (article 82 de la loi Informatique et Libertés)${NB}: aucun consentement ni bandeau n'est donc requis, et rien n'est lu avant votre clic.</p>
<h3>Destinataires et lieu</h3>
<p>Personne d'autre que l'éditeur n'accède à ces données. L'hébergeur, ${esc(host.name)}, fait fonctionner le serveur pour le compte de l'éditeur, dans le cadre d'un contrat de sous-traitance (article 28 du RGPD). Le serveur se trouve en ${country}. Aucune donnée n'est transférée hors de l'Union européenne.</p>
<h3>Durée de conservation</h3>
<p>Une minute, en mémoire vive, pour la protection contre les abus. Rien d'autre n'est conservé.</p>
<h3>Vos droits</h3>
<p>Vous disposez des droits d'accès, de rectification, d'effacement, de limitation et d'opposition (articles 15 à 21 du RGPD). Comme rien n'est conservé, il n'y a en général rien à vous communiquer, mais vous pouvez écrire à ${mail(you.email)}. Vous pouvez aussi adresser une réclamation à la ${link('https://www.cnil.fr/fr/plaintes', 'CNIL')} (3${NB}place de Fontenoy, TSA${NB}80715, 75334 Paris Cedex${NB}07) ou à l'autorité de protection des données de votre pays.</p>
<p>Aucune décision automatisée ayant un effet juridique n'est prise à votre égard.</p>`,
      updated: `Dernière mise à jour${NB}: ${date}`,
    };
  }
  if (lang === 'es') {
    return {
      title: 'Aviso legal y privacidad',
      pageTitle: 'ombre: aviso legal y privacidad',
      back: '← volver a ombre',
      legalTitle: 'aviso legal',
      legal: you.publishHomeAddress
        ? `<p>Este sitio lo publica, sin fines profesionales, una persona física, conforme al artículo 1-1 de la ley francesa n.º 2004-575 de 21 de junio de 2004 sobre la confianza en la economía digital (LCEN).</p>
<dl><dt>Editor y director de la publicación</dt><dd>${name}<br>${esc(you.homeAddress ?? '')}<br>${esc(you.phone ?? '')}<br>${mail(you.email)}</dd>
<dt>Alojamiento</dt><dd>${hostBlock}</dd></dl>`
        : `<p>Este sitio lo publica, sin fines profesionales, una persona física: ${name}. Conforme al artículo 1-1 II de la ley francesa n.º 2004-575 de 21 de junio de 2004 (LCEN), el editor no publica su domicilio; sus datos de identificación se han comunicado al proveedor de alojamiento.</p>
<dl><dt>Contacto</dt><dd>${mail(you.email)}</dd>
<dt>Alojamiento</dt><dd>${hostBlock}</dd></dl>`,
      ip: `<p>Los datos de geolocalización IP proceden de ${link('https://db-ip.com', 'DB-IP')} (IP to City Lite e IP to ASN Lite), con licencia ${link('https://creativecommons.org/licenses/by/4.0/deed.es', 'CC BY 4.0')}. Las fuentes IBM Plex Mono y VT323 tienen licencia SIL Open Font License.${source ? ` El código fuente del sitio es público: ${source}.` : ''}</p>
<p>Los nombres de productos y servicios citados en las soluciones pertenecen a sus propietarios; se citan para describirlos. Nada está patrocinado y no hay enlaces de afiliado.</p>`,
      privacyTitle: 'privacidad',
      privacy: `<p>En resumen: ombre no usa cookies, no guarda nada en tu navegador, no mide la audiencia y no escribe la dirección IP de nadie en un disco.</p>
<h3>Quién es responsable</h3>
<p>${name}, particular, que publica este sitio sin fines comerciales. Contacto: ${mail(you.email)}.</p>
<h3>Qué trata el sitio, y por qué</h3>
<ul>
<li><strong>Mostrar las páginas.</strong> Como en cualquier sitio, tu navegador envía tu dirección IP al servidor para recibir las páginas. Sirve para responderte y luego se olvida. No se lleva ningún registro de accesos.</li>
<li><strong>Análisis del navegador.</strong> Ocurre en tu navegador, solo cuando pulsas el botón. Las características leídas (pantalla, fuentes, tarjeta gráfica, etc.) solo sirven para mostrarte el resultado, a petición tuya. No se envía nada al servidor y no se guarda nada.</li>
<li><strong>Comprobación de la conexión.</strong> Solo cuando pulsas el botón. El servidor de ombre lee la dirección IP de tu conexión, la busca en su propia copia de bases públicas (DB-IP Lite, lista de salidas de Tor, rangos de iCloud Private Relay), te devuelve el resultado y la olvida. El servidor STUN del sitio también te devuelve la dirección y el puerto que ve. No se contacta a ningún tercero sobre ti.</li>
<li><strong>Protección contra abusos.</strong> Para evitar que una sola dirección sature el servicio, el servidor guarda en memoria tu dirección IP y un contador durante un minuto, y luego los borra. Nunca se escriben en un disco.</li>
<li><strong>Red local.</strong> Tu navegador contacta directamente con tu router; nada llega al servidor de ombre.</li>
<li><strong>Soluciones marcadas.</strong> Se quedan en la memoria de la pestaña y desaparecen al cerrarla.</li>
</ul>
<h3>Base jurídica</h3>
<p>El interés legítimo (artículo 6.1.f del RGPD): darte la comprobación que pides y mantener el servicio disponible y seguro. La lectura de las características de tu dispositivo es estrictamente necesaria para el servicio que pides expresamente al pulsar el botón: no hace falta consentimiento ni aviso de cookies, y no se lee nada antes de tu clic.</p>
<h3>Destinatarios y ubicación</h3>
<p>Nadie más que el editor accede a estos datos. El proveedor de alojamiento, ${esc(host.name)}, hace funcionar el servidor por cuenta del editor, con un contrato de encargo de tratamiento (artículo 28 del RGPD). El servidor está en ${country}. No se transfiere ningún dato fuera de la Unión Europea.</p>
<h3>Plazo de conservación</h3>
<p>Un minuto, en memoria, para la protección contra abusos. No se guarda nada más.</p>
<h3>Tus derechos</h3>
<p>Tienes derecho de acceso, rectificación, supresión, limitación y oposición (artículos 15 a 21 del RGPD). Como no se guarda nada, normalmente no hay nada que entregarte, pero puedes escribir a ${mail(you.email)}. También puedes presentar una reclamación ante la autoridad de protección de datos de tu país (en España, la ${link('https://www.aepd.es', 'AEPD')}; en Francia, la ${link('https://www.cnil.fr', 'CNIL')}).</p>
<p>No se toma ninguna decisión automatizada con efectos jurídicos sobre ti.</p>`,
      updated: `Última actualización: ${date}`,
    };
  }
  return {
    title: 'Legal notice and privacy',
    pageTitle: 'ombre: legal notice and privacy',
    back: '← back to ombre',
    legalTitle: 'legal notice',
    legal: you.publishHomeAddress
      ? `<p>This site is published on a non-professional basis by a private individual, under article 1-1 of French law no. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN).</p>
<dl><dt>Publisher and editor</dt><dd>${name}<br>${esc(you.homeAddress ?? '')}<br>${esc(you.phone ?? '')}<br>${mail(you.email)}</dd>
<dt>Host</dt><dd>${hostBlock}</dd></dl>`
      : `<p>This site is published on a non-professional basis by a private individual, ${name}. Under article 1-1 II of French law no. 2004-575 of 21 June 2004 (LCEN), the publisher does not publish a home address; their identification details have been given to the host.</p>
<dl><dt>Contact</dt><dd>${mail(you.email)}</dd>
<dt>Host</dt><dd>${hostBlock}</dd></dl>`,
    ip: `<p>IP geolocation data by ${link('https://db-ip.com', 'DB-IP')} (IP to City Lite and IP to ASN Lite), licensed under ${link('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0')}. The IBM Plex Mono and VT323 fonts are licensed under the SIL Open Font License.${source ? ` The site's source code is public: ${source}.` : ''}</p>
<p>Product and service names in the fixes belong to their owners and are used to describe them. Nothing is sponsored and there are no affiliate links.</p>`,
    privacyTitle: 'privacy',
    privacy: `<p>In short: ombre sets no cookie, stores nothing in your browser, runs no analytics and never writes anyone's IP address to disk.</p>
<h3>Who is responsible</h3>
<p>${name}, a private individual who runs this site on a non-commercial basis. Contact: ${mail(you.email)}.</p>
<h3>What the site processes, and why</h3>
<ul>
<li><strong>Showing the pages.</strong> As with any website, your browser sends your IP address to the server to receive the pages. It is used to answer you, then forgotten. No access log is kept.</li>
<li><strong>Browser scan.</strong> It runs in your browser, only when you press the button. The characteristics it reads (screen, fonts, graphics card and so on) are used only to show you the result, at your request. Nothing is sent to the server and nothing is kept.</li>
<li><strong>Connection check.</strong> Only when you press the button. ombre's server reads your connection's IP address, looks it up in its own copy of public databases (DB-IP Lite, the Tor exit list, the iCloud Private Relay ranges), sends you the result and forgets it. The site's STUN server likewise sends back the address and port it sees. No third party is contacted about you.</li>
<li><strong>Abuse protection.</strong> To stop one address from flooding the service, the server keeps your IP address and a counter in memory for one minute, then deletes them. They are never written to disk.</li>
<li><strong>Local network.</strong> Your browser contacts your router directly; nothing reaches ombre's server.</li>
<li><strong>Ticked fixes.</strong> They stay in the tab's memory and vanish when you close it.</li>
</ul>
<h3>Legal basis</h3>
<p>Legitimate interest (GDPR article 6(1)(f)): giving you the check you ask for, and keeping the service available and secure. Reading your device's characteristics is strictly necessary for the service you expressly request by pressing the button (French Data Protection Act, article 82, implementing the ePrivacy directive): no consent or cookie banner is needed, and nothing is read before you click.</p>
<h3>Recipients and location</h3>
<p>Nobody but the publisher has access to this data. The host, ${esc(host.name)}, runs the server on the publisher's behalf under a data processing agreement (GDPR article 28). The server is in ${country}. No data is transferred outside the European Union.</p>
<h3>Retention</h3>
<p>One minute, in memory, for abuse protection. Nothing else is kept.</p>
<h3>Your rights</h3>
<p>You have the rights of access, rectification, erasure, restriction and objection (GDPR articles 15 to 21). As nothing is kept, there is usually nothing to give you, but you can write to ${mail(you.email)}. You can also complain to the ${link('https://www.cnil.fr/en', 'CNIL')} (the French data protection authority) or to the data protection authority of your own country.</p>
<p>No automated decision with legal effects is made about you.</p>`,
    updated: `Last updated: ${date}`,
  };
}

/**
 * One legal page: the site's header and footer, and the text. No script: nothing runs on it.
 * @param {Lang} lang @param {Owner} o @param {Date} when
 */
export function legalPage(lang, o, when) {
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(when);
  const x = texts(lang, o, date);
  const NAMES = { en: 'English', fr: 'Français', es: 'Español' };
  const picker = LANGS.map((l) => `<a href="/${l}/legal/" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ''}>${NAMES[l]}</a>`)
    .join('<span class="picker-sep" aria-hidden="true"> · </span>');
  const label = { en: 'Language', fr: 'Langue', es: 'Idioma' }[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(x.pageTitle)}</title>
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="/${l}/legal/">`).join('\n')}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<header class="site-header">
<div class="wrap">
<a class="brand pixel brand-link" href="/${lang}/">ombre<span class="brand-cursor" aria-hidden="true">_</span></a>
<nav class="picker" aria-label="${label}">
${picker}
</nav>
</div>
</header>
<main class="wrap legal">
<p><a href="/${lang}/">${esc(x.back)}</a></p>
<h1>${esc(x.title)}</h1>
<section aria-labelledby="legal-notice">
<h2 id="legal-notice">${esc(x.legalTitle)}</h2>
${x.legal}
${x.ip}
</section>
<section aria-labelledby="privacy">
<h2 id="privacy">${esc(x.privacyTitle)}</h2>
${x.privacy}
</section>
<p class="hint">${esc(x.updated)}</p>
</main>
</body>
</html>
`;
}

/** security.txt (RFC 9116): who to tell about a security problem. Expires one year after generation. @param {Owner} o @param {Date} when */
export function securityTxt(o, when) {
  const expires = new Date(when.getTime() + 365 * 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z');
  return `Contact: mailto:${o.you.email}
Expires: ${expires}
Preferred-Languages: en, fr, es
Canonical: https://${o.site.domain}/.well-known/security.txt
`;
}

/** The record of processing (registre des traitements, GDPR art. 30), in French, for the publisher's own files. @param {Owner} o @param {Date} when */
export function registre(o, when) {
  const date = when.toISOString().slice(0, 10);
  return `# Registre des activités de traitement — ${o.site.domain}

Tenu par${NB}: ${o.you.fullName} (${o.you.email}), particulier, responsable du traitement. Mis à jour le ${date}.
Ce document reste privé (article 30 du RGPD). Il est à présenter à la CNIL si elle le demande.

| | Traitement 1${NB}: vérification de la connexion | Traitement 2${NB}: protection contre les abus |
|---|---|---|
| Finalité | Montrer au visiteur, à sa demande, ce que les sites voient de sa connexion | Empêcher une adresse de saturer le service |
| Base légale | Intérêt légitime (art. 6.1.f) | Intérêt légitime (art. 6.1.f) |
| Personnes concernées | Visiteurs qui appuient sur le bouton | Visiteurs du site |
| Données | Adresse IP, port source (STUN)${NB}; pays, ville, réseau déduits de l'IP | Adresse IP, nombre de requêtes |
| Source | Connexion du visiteur${NB}; bases DB-IP Lite, liste Tor, plages iCloud Private Relay (copies locales) | Connexion du visiteur |
| Destinataires | Le visiteur lui-même${NB}; aucun tiers | Aucun |
| Sous-traitant | ${o.host.name}, ${o.host.address} (contrat art. 28 signé en ligne) | idem |
| Transfert hors UE | Aucun | Aucun |
| Durée de conservation | Aucune${NB}: le résultat est renvoyé puis oublié | Une minute, en mémoire vive, puis effacement |
| Sécurité | HTTPS (TLS), pare-feu, aucun journal d'accès, mises à jour de sécurité automatiques, accès SSH par clé uniquement | idem |

Analyse du navigateur et du réseau local${NB}: effectuées dans le navigateur du visiteur, rien n'est transmis au serveur${NB}: pas de traitement par l'éditeur.
Cookies et traceurs${NB}: aucun.
`;
}

// Run only as a script (`npm run legal`), not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ownerPath = path.join(ROOT, 'legal', 'owner.json');
  /** @type {Owner} */
  let owner = PLACEHOLDER;
  const raw = await readFile(ownerPath, 'utf8').catch(() => null);
  if (raw === null) {
    console.warn('legal/owner.json not found: writing the pages with [[placeholders]] (fine for development, refused for production).');
  } else {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`legal/owner.json is not valid JSON: ${/** @type {Error} */ (e).message}`);
      process.exit(1);
    }
    const problems = validateOwner(parsed);
    if (problems.length) {
      console.error('legal/owner.json needs these fields:\n' + problems.map((p) => `  - ${p}`).join('\n'));
      process.exit(1);
    }
    owner = parsed;
  }

  const when = owner.site.lastUpdated ? new Date(owner.site.lastUpdated) : new Date();
  for (const lang of LANGS) {
    const dir = path.join(ROOT, 'public', lang, 'legal');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), legalPage(lang, owner, when));
  }
  await mkdir(path.join(ROOT, 'public', '.well-known'), { recursive: true });
  await writeFile(path.join(ROOT, 'public', '.well-known', 'security.txt'), securityTxt(owner, when));
  await mkdir(path.join(ROOT, 'legal', 'out'), { recursive: true });
  await writeFile(path.join(ROOT, 'legal', 'out', 'registre-des-traitements.md'), registre(owner, when));
  console.log('Wrote public/{en,fr,es}/legal/index.html, public/.well-known/security.txt and legal/out/registre-des-traitements.md');
}
