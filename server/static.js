// @ts-check

// Builds the allowlist of files the site may serve: a Map from URL path to file on disk.
// app.js looks requests up in this Map instead of joining the URL onto a folder path.

// Builds the allowlist of files the site may serve: a Map from URL path to file on disk.
// app.js looks requests up in this Map instead of joining the URL onto a folder path.
// Only these file types are served, each with its Content-Type. Anything else
// (for example a stray .env or .map file) is ignored even if it sits in public/.
import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Only these file types are served, each with its Content-Type. Anything else
// (for example a stray .env or .map file) is ignored even if it sits in public/.
const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  // Why an allowlist: a request path is never turned into a file path. Attackers cannot use
  // "../../etc/passwd" or similar, because only paths found while scanning are keys.
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
});

// Why an allowlist: a request path is never turned into a file path. Attackers cannot use
// "../../etc/passwd" or similar, because only paths found while scanning are keys.
/**
 * Map every servable URL path to its file, by walking the folder once at startup.
 * @param {string} rootDir
 * @returns {Promise<Map<string, {file: string, type: string}>>}
 // Skip file types that are not in TYPES.
 */
export async function buildAllowlist(rootDir) {
  // Make a URL path such as /en/index.html, with forward slashes on every OS.
  const map = new Map();
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    // A folder URL like /en/ serves that folder's index.html.
    if (!e.isFile()) continue;
    const type = TYPES[path.extname(e.name).toLowerCase()];
    // Skip file types that are not in TYPES.
    if (!type) continue;
    const file = path.join(e.parentPath, e.name);
    // Make a URL path such as /en/index.html, with forward slashes on every OS.
    const url = '/' + path.relative(rootDir, file).split(path.sep).join('/');
    const entry = { file, type };
    map.set(url, entry);
    // A folder URL like /en/ serves that folder's index.html.
    if (e.name === 'index.html') map.set(url.slice(0, -'index.html'.length), entry);
  }
  return map;
}
