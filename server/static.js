// @ts-check
// Builds the allowlist of files the site may serve: a Map from URL path to the file, read
// into memory once at startup with its compressed copies and ETag. app.js looks requests
// up in this Map instead of joining the URL onto a folder path, and never touches the disk.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * `br`/`gz` are the compressed bodies, present only when smaller. `etag` is the identity
 * ETag; a compressed body's ETag adds a suffix (see app.js).
 * @typedef {{file: string, type: string, body: Buffer, br: Buffer|null, gz: Buffer|null,
 *   etag: string, cacheControl: string}} StaticEntry
 */

// Only these file types are served, each with its Content-Type. Anything else
// (for example a stray .env or .map file) is ignored even if it sits in public/.
const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
});

// Text changes with each release and there is no build step to rename files, so the browser
// asks again every time (no-cache) and gets a tiny 304 when nothing changed.
// Fonts and images never change in place, so they may be reused for 30 days.
/** @param {string} type */
const cacheControl = (type) => (/^(font|image)\//.test(type) ? 'public, max-age=2592000' : 'no-cache');

// Compression only pays for text; .ttf compresses well too, woff2 is already compressed.
/** @param {string} type */
const compressible = (type) => /^text\/|^application\/json|^image\/svg|^font\/ttf/.test(type);

/** @param {Buffer} body */
function brotli(body) {
  // Best quality is slow on big files; startup must stay quick, so big files get a lighter setting.
  const quality = body.length < 1_000_000 ? 11 : 5;
  return zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality } });
}

/**
 * @param {string} file
 * @param {string} type
 * @returns {Promise<StaticEntry>}
 */
async function load(file, type) {
  const body = await readFile(file);
  const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"`;
  /** @param {Buffer} b */
  const ifSmaller = (b) => (b.length < body.length ? b : null);
  const zip = compressible(type) && body.length > 256;
  return {
    file, type, body, etag,
    br: zip ? ifSmaller(brotli(body)) : null,
    gz: zip ? ifSmaller(zlib.gzipSync(body, { level: 9 })) : null,
    cacheControl: cacheControl(type),
  };
}

// Why an allowlist: a request path is never turned into a file path. Attackers cannot use
// "../../etc/passwd" or similar, because only paths found while scanning are keys.
/**
 * Map every servable URL path to its file, by walking the folder once at startup.
 * @param {string} rootDir
 * @returns {Promise<Map<string, StaticEntry>>}
 */
export async function buildAllowlist(rootDir) {
  /** @type {Map<string, StaticEntry>} */
  const map = new Map();
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    // Skip file types that are not in TYPES.
    const type = TYPES[path.extname(e.name).toLowerCase()];
    if (!type) continue;
    const file = path.join(e.parentPath, e.name);
    // Make a URL path such as /en/index.html, with forward slashes on every OS.
    const url = '/' + path.relative(rootDir, file).split(path.sep).join('/');
    const entry = await load(file, type);
    map.set(url, entry);
    // A folder URL like /en/ serves that folder's index.html.
    if (e.name === 'index.html') map.set(url.slice(0, -'index.html'.length), entry);
  }
  return map;
}
