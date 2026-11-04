// @ts-check
// Dev script: downloads the self-hosted fonts into public/fonts/. Run with `npm run fonts`.
// Fonts are served from our own origin (the CSP allows no outside fonts), so the site
// never makes a request to a font company when a visitor loads it.
// Fonts are served from our own origin (the CSP allows no outside fonts), so the site
// never makes a request to a font company when a visitor loads it.
// VCR OSD Mono ships without a licence file, so it stays out of git (see .gitignore).
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'public', 'fonts');
const PLEX = 'https://raw.githubusercontent.com/IBM/plex/master/packages/plex-mono';
const VT323 = 'https://raw.githubusercontent.com/google/fonts/main/ofl/vt323';

/** @type {[string, string][]} url, file name in public/fonts */
const FILES = [
  [`${VT323}/VT323-Regular.ttf`, 'VT323-Regular.ttf'],
  [`${VT323}/OFL.txt`, 'OFL-VT323.txt'],
  [`${PLEX}/fonts/complete/woff2/IBMPlexMono-Regular.woff2`, 'IBMPlexMono-Regular.woff2'],
  [`${PLEX}/fonts/complete/woff2/IBMPlexMono-Medium.woff2`, 'IBMPlexMono-Medium.woff2'],
  [`${PLEX}/fonts/complete/woff2/IBMPlexMono-Bold.woff2`, 'IBMPlexMono-Bold.woff2'],
  [`${PLEX}/LICENSE.txt`, 'OFL-IBMPlexMono.txt'],
];
const VCR_ZIP = 'https://dl.dafont.com/dl/?f=vcr_osd_mono';
// Fetch a URL into memory; a non-200 answer is an error so we never save an error page as a font.

/** @param {string} url */
// Fetch a URL into memory; a non-200 answer is an error so we never save an error page as a font.
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(OUT, { recursive: true });
for (const [url, name] of FILES) {
  await writeFile(path.join(OUT, name), await download(url));
  // VCR OSD Mono comes in a zip, so unpack it in a throwaway folder and copy out the .ttf.
  // The folder is removed in `finally`, even if something above failed.
  console.log(name);
}

// VCR OSD Mono comes in a zip, so unpack it in a throwaway folder and copy out the .ttf.
// The folder is removed in `finally`, even if something above failed.
const tmp = await mkdtemp(path.join(tmpdir(), 'vcr-'));
try {
  const zip = path.join(tmp, 'vcr.zip');
  await writeFile(zip, await download(VCR_ZIP));
  execFileSync('unzip', ['-o', '-q', zip, '-d', path.join(tmp, 'x')]);
  const ttf = (await readdir(path.join(tmp, 'x'))).find((f) => /^VCR_OSD_MONO.*\.ttf$/i.test(f));
  if (!ttf) throw new Error('VCR OSD Mono .ttf not found in the archive');
  await copyFile(path.join(tmp, 'x', ttf), path.join(OUT, 'VCR_OSD_MONO.ttf'));
  console.log(`VCR_OSD_MONO.ttf (from ${ttf})`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
