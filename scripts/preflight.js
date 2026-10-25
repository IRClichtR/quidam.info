// @ts-check
// Checks the project is ready to go online. Run with `npm run preflight` (deploy.sh runs it with
// --production and stops on any error). Each line says what is wrong and how to fix it.
// Without --production, problems that only matter online are warnings.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const production = process.argv.includes('--production');
/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];
/** Online-only problems: errors in production, warnings otherwise. @param {string} msg */
const prod = (msg) => (production ? errors : warnings).push(msg);

/** @param {string} rel */
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8').catch(() => null);
/** @param {string} rel */
const exists = (rel) => stat(path.join(ROOT, rel)).then(() => true, () => false);

// 1. Personal details and the pages generated from them.
const ownerRaw = await read('legal/owner.json');
/** @type {any} */
let owner = null;
if (ownerRaw === null) prod('legal/owner.json is missing: copy legal/owner.example.json to legal/owner.json, fill in the "you" part, then run npm run legal (docs/Go_live.md, step 5).');
else {
  try {
    owner = JSON.parse(ownerRaw);
  } catch {
    errors.push('legal/owner.json is not valid JSON (a missing comma or quote?). Open it in an editor that shows errors.');
  }
}
for (const lang of ['en', 'fr', 'es']) {
  const page = await read(`public/${lang}/legal/index.html`);
  if (page === null) prod(`public/${lang}/legal/index.html is missing: run npm run legal.`);
  else if (page.includes('[[')) prod(`public/${lang}/legal/index.html still has [[placeholders]]: fill in legal/owner.json, then run npm run legal.`);
  else if (owner && !page.includes(owner.you?.email ?? '\0')) prod(`public/${lang}/legal/index.html is older than legal/owner.json: run npm run legal.`);
}
const security = await read('public/.well-known/security.txt');
if (security === null) prod('public/.well-known/security.txt is missing: run npm run legal.');
else {
  const expires = /^Expires: (.+)$/m.exec(security)?.[1];
  if (!expires || new Date(expires) < new Date(Date.now() + 30 * 86_400_000)) prod('public/.well-known/security.txt expires within 30 days: run npm run legal again.');
}

// 2. The deploy settings agree with the legal file.
const config = await read('deploy/config.sh');
const domain = config ? /^DOMAIN="([^"]*)"/m.exec(config)?.[1] : null;
if (production && config === null) errors.push('deploy/config.sh is missing: copy deploy/config.example.sh to deploy/config.sh and fill it in.');
if (domain && owner?.site?.domain && domain !== owner.site.domain) errors.push(`deploy/config.sh says DOMAIN="${domain}" but legal/owner.json says site.domain "${owner.site.domain}": make them the same.`);
if (domain === 'example.org') prod('deploy/config.sh still has DOMAIN="example.org": put your own domain.');

// 3. Fonts: the free ones must be there; the one with an unknown licence must not ship by accident.
const fonts = await readdir(path.join(ROOT, 'public', 'fonts')).catch(() => /** @type {string[]} */ ([]));
for (const f of ['VT323-Regular.ttf', 'IBMPlexMono-Regular.woff2', 'IBMPlexMono-Medium.woff2', 'IBMPlexMono-Bold.woff2']) {
  if (!fonts.includes(f)) errors.push(`public/fonts/${f} is missing: run npm run fonts.`);
}
const shipVcr = config ? /^SHIP_VCR_FONT=1/m.test(config) : false;
if (shipVcr) warnings.push('SHIP_VCR_FONT=1: only keep this if you have the font author\'s written permission (docs/Review-before-launch-v1.md, section F).');

// 4. Licence: the repository says two different things.
const pkg = JSON.parse(/** @type {string} */ (await read('package.json')));
const licence = (await read('LICENSE')) ?? '';
if (/GNU GENERAL PUBLIC LICENSE\s+Version 2/.test(licence) && pkg.license !== 'GPL-2.0-only' && pkg.license !== 'GPL-2.0-or-later') {
  warnings.push(`package.json says "license": "${pkg.license}" but LICENSE is the GPL version 2: pick one and make both say it (docs/Go_live.md, step 0.2).`);
}

// 5. Nothing a visitor should never see is in public/.
/** @param {string} dir @returns {Promise<string[]>} */
const walk = async (dir) => (await readdir(dir, { recursive: true })).map((f) => path.join(dir, String(f)));
for (const f of await walk(path.join(ROOT, 'public'))) {
  if (/(\.env|\.map|\.pem|\.key|owner\.json)$/.test(f)) errors.push(`${path.relative(ROOT, f)} must not be in public/.`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) to fix before going online.`);
  process.exit(1);
}
console.log(`preflight: ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}${production ? ', ready for production' : ''}.`);
