// @ts-check
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
});

/**
 * Map every servable URL path to its file, by walking the folder once at startup.
 * @param {string} rootDir
 * @returns {Promise<Map<string, {file: string, type: string}>>}
 */
export async function buildAllowlist(rootDir) {
  const map = new Map();
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const type = TYPES[path.extname(e.name).toLowerCase()];
    if (!type) continue;
    const file = path.join(e.parentPath, e.name);
    const url = '/' + path.relative(rootDir, file).split(path.sep).join('/');
    const entry = { file, type };
    map.set(url, entry);
    if (e.name === 'index.html') map.set(url.slice(0, -'index.html'.length), entry);
  }
  return map;
}
