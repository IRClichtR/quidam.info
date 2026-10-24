// @ts-check
// Browser findings: collecting raw values needs a real browser; judging them is pure logic.

// How this file is split: `collectBrowser()` (bottom) reads raw values from the browser;
// `judgeBrowser()` (top) turns them into LEAK / OK / CAN'T TELL findings. The judging is pure
// logic, so tests can run it without a browser.
// A fingerprint is the mix of small, harmless-looking details (screen, fonts, GPU...) that together
// single out one browser, so a site can recognise you without cookies. The more of these a
// browser shows in a distinctive way, the more unique it is.
/** @typedef {'screen'|'timezone'|'languages'|'gpu'|'fonts'|'canvas'|'audio'|'cpu'|'webrtcLocal'|'gpc'|'publicIp'|'provider'|'location'|'vpn4'|'vpn6'|'router'|'lnaPrompt'|'otherDevices'} FindingId */
/** @typedef {'leak'|'ok'|'unknown'} Verdict */
/** @typedef {{id: FindingId, verdict: Verdict, value: string}} Finding */
/** @typedef {(key: string, vars?: Record<string, string|number|undefined>) => string} T */
/**
 * `offsetMin` is minutes east of UTC (Paris in summer: 120). `localCandidates` is null when WebRTC is unavailable.
 * `canvas` is null when readback is blocked or blank, and 'unknown' when the test itself failed.
 * @typedef {{
 *   screen: {w: number, h: number, innerW: number, innerH: number, dpr: number},
 *   timeZone: string, offsetMin: number, languages: string[], gpu: string|null, fontCount: number,
 *   canvas: [string, string]|null|'unknown', audio: [string, string]|null, cores: number|undefined, memory: number|undefined,
 *   localCandidates: string[]|null, gpc: boolean|undefined
 * }} RawBrowser
 */

// Fonts we test for. Which ones are installed differs by system, so the count is a fingerprint signal.
/** Widely installed fonts across Windows, macOS and Linux. */
export const FONTS = [
  'Arial', 'Verdana', 'Helvetica Neue', 'Segoe UI', 'Calibri', 'Cambria', 'Georgia', 'Tahoma', 'Trebuchet MS', 'Courier New',
  'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Roboto', 'Menlo', 'Monaco', 'Consolas', 'Gill Sans', 'Futura',
  'Avenir', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Impact', 'Lucida Grande', 'Optima', 'Cantarell', 'Fira Sans',
];

// Only these findings count towards uniqueness (not IP, WebRTC or GPC, which are about other things).
/** The leaks that make up a fingerprint. */
const SIGNALS = ['screen', 'timezone', 'languages', 'gpu', 'fonts', 'canvas', 'audio', 'cpu'];
// Renderer names that many devices share, so they identify nobody.
const GENERIC_GPU = ['Mozilla', 'WebKit WebGL', 'Generic Renderer'];

/** @param {boolean} ok @returns {Verdict} */
const verdict = (ok) => (ok ? 'ok' : 'leak');

/** @param {number} min minutes east of UTC */
function utcOffset(min) {
  if (!min) return '';
  const abs = Math.abs(min);
  const m = abs % 60;
  return (min < 0 ? '-' : '+') + Math.floor(abs / 60) + (m ? ':' + String(m).padStart(2, '0') : '');
}

// Verdict rules in short:
// LEAK = this signal makes you easier to recognise. OK = hidden, blocked or shared by many people.
// CAN'T TELL = the test itself could not run, so we will not guess.
/**
 * Decide each browser finding, in the spec's table order.
 * @param {RawBrowser} raw
 * @param {T} t
 * @param {string} [lang] page language, for number formatting
 * @returns {Finding[]}
 */
export function judgeBrowser(raw, t, lang = 'en') {
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  // Resolutions read as 2560 × 1440, without a thousands separator.
  const px = new Intl.NumberFormat(lang, { useGrouping: false });
  const { screen, canvas, audio, localCandidates: cands } = raw;
  // Chrome and Safari hide your real local address behind a random '.local' name (mDNS).
  // Those names reveal nothing. Any other address is a real local IP, so it leaks.
  const leakingIps = (cands ?? []).filter((c) => !c.endsWith('.local'));
  return [
    {
      id: 'screen',
      // Browsers that resist fingerprinting round or pad the window size, so it differs from the
      // real screen. When the two match, the true screen resolution is exposed: LEAK.
      verdict: verdict(screen.w === screen.innerW && screen.h === screen.innerH),
      value: t('finding.screen.value', { w: px.format(screen.w), h: px.format(screen.h), dpr: num.format(screen.dpr) }),
    },
    {
      id: 'timezone',
      // Everyone in UTC looks alike, so UTC is the only OK. Any other zone narrows you to a region.
      // (A zone that is unknown is judged later, in connection.js, where it is compared with the IP.)
      verdict: verdict(raw.timeZone === 'UTC' || raw.timeZone === 'Etc/UTC'),
      value: t('finding.timezone.value', { zone: raw.timeZone, offset: utcOffset(raw.offsetMin) }),
    },
    {
      id: 'languages',
      // A long, specific language list is distinctive. A single 'en' / 'en-US' is the most common value.
      verdict: verdict(raw.languages.length === 1 && ['en', 'en-US'].includes(raw.languages[0])),
      value: raw.languages.length ? raw.languages.join(', ') : t('finding.languages.none'),
    },
    {
      id: 'gpu',
      // The graphics card model is readable through WebGL. No GPU info or a generic name is OK.
      verdict: verdict(raw.gpu === null || GENERIC_GPU.includes(raw.gpu)),
      value: raw.gpu === null ? t('finding.gpu.off') : t('finding.gpu.value', { gpu: raw.gpu }),
    },
    {
      id: 'fonts',
      // Few detectable fonts = a common, plain system. Many = a rarer mix that stands out.
      verdict: verdict(raw.fontCount < 5),
      value: t('finding.fonts.value', { n: num.format(raw.fontCount), total: num.format(FONTS.length) }),
    },
    // Canvas fingerprinting: a site draws hidden text and shapes, then reads the pixels back.
    // Tiny differences in GPU, drivers and fonts make the result differ from machine to machine.
    // We draw twice. Null (blocked or a blank image) reads OK: a blank canvas carries no
    // fingerprint. Two different hashes mean the browser adds random noise: that protects you, so OK.
    // Same hash twice means the pixels are stable and readable, so LEAK.
    // 'unknown' means the test crashed, so CAN'T TELL.
    canvas === null ? { id: 'canvas', verdict: 'ok', value: t('finding.canvas.blocked') }
      : canvas === 'unknown' ? { id: 'canvas', verdict: 'unknown', value: t('finding.canvas.unavailable') }
      : {
          id: 'canvas',
          verdict: verdict(canvas[0] !== canvas[1]),
          value: t(canvas[0] !== canvas[1] ? 'finding.canvas.noise' : 'finding.canvas.value', { hash: canvas[0] }),
        },
    // Audio fingerprinting: the same idea with sound. The browser processes a generated tone
    // and the tiny numeric differences identify the audio stack. Noise between two runs = OK;
    // identical runs = LEAK. No audio support means we could not test, so CAN'T TELL
    // (unlike canvas, a missing result is not proof of blocking).
    audio === null
      ? { id: 'audio', verdict: 'unknown', value: t('finding.audio.unavailable') }
      : {
          id: 'audio',
          verdict: verdict(audio[0] !== audio[1]),
          value: t(audio[0] !== audio[1] ? 'finding.audio.noise' : 'finding.audio.value', { hash: audio[0] }),
        },
    {
      id: 'cpu',
      // Core count and RAM size narrow down the device. `deviceMemory` exists only in Chromium,
      // so we judge by it: still readable means LEAK, hidden or absent means OK.
      verdict: verdict(raw.memory === undefined),
      value: [
        raw.cores === undefined ? t('finding.cpu.coresHidden') : t('finding.cpu.cores', { n: num.format(raw.cores) }),
        raw.memory === undefined ? t('finding.cpu.memoryHidden') : t('finding.cpu.memory', { n: num.format(raw.memory) }),
      ].join(' · '),
    },
    {
      // WebRTC (browser video calls) can reveal local network addresses to any page.
      id: 'webrtcLocal',
      verdict: verdict(leakingIps.length === 0),
      value: cands === null ? t('finding.webrtcLocal.off')
        : leakingIps.length ? t('finding.webrtcLocal.shown', { ips: leakingIps.join(', ') })
        : t('finding.webrtcLocal.hidden'),
    },
    {
      id: 'gpc',
      // GPC (Global Privacy Control) is a signal that tells sites not to sell or share your data.
      // Sending it is the good state.
      verdict: verdict(raw.gpc === true),
      value: t(raw.gpc === true ? 'finding.gpc.sent' : 'finding.gpc.notSent'),
    },
  ];
}

// More leaking fingerprint signals means a more unique browser: 6+ is high, 3-5 medium.
/**
 * Rough uniqueness from the number of leaking fingerprint signals.
 * @param {Finding[]} findings
 * @returns {'low'|'medium'|'high'}
 */
export function uniqueness(findings) {
  const n = findings.filter((f) => f.verdict === 'leak' && SIGNALS.includes(f.id)).length;
  return n >= 6 ? 'high' : n >= 3 ? 'medium' : 'low';
}

/* ---------- collecting (browser only) ---------- */

// A short fingerprint of a value, to compare two runs without keeping the raw data.
/** First 8 hex characters of the SHA-256 of `text`. @param {string} text */
async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Give a promise at most `ms` milliseconds; after that, resolve with `fallback` so nothing hangs.
/** @template T @param {Promise<T>} p @param {number} ms @param {T} fallback @returns {Promise<T>} */
function within(p, ms, fallback) {
  return Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// The UNMASKED renderer is the real GPU name. Without that extension, the plain one is often generic.
/** @returns {string|null} */
function gpuRenderer() {
  try {
    const gl = /** @type {WebGLRenderingContext|null} */ (document.createElement('canvas').getContext('webgl'));
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof r === 'string' && r ? r : null;
  } catch {
    return null;
  }
}

// Font detection by measuring: text in a missing font falls back to the base font and has
// the same width. If the width changes, the font is installed.
function countFonts() {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  const sample = 'mmmmmmmmmmlli WwQq@#0123';
  const bases = ['monospace', 'serif', 'sans-serif'];
  /** @param {string} font */
  const width = (font) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(sample).width;
  };
  const baseWidths = bases.map(width);
  return FONTS.filter((name) => bases.some((b, i) => width(`"${name}", ${b}`) !== baseWidths[i])).length;
}

// Draw a fixed mix of text, a colour and overlapping shapes: the more varied the drawing,
// the more the hardware shows through.
/**
 * The drawing as a data URL, or null when readback is blocked or the image is blank.
 * @returns {string|null}
 */
function drawCanvas() {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 60;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.textBaseline = 'top';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = '#f60';
  ctx.fillRect(100, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('leakcheck, 0123 \u{1F50D}', 2, 15);
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx.beginPath();
  ctx.arc(50, 30, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(255, 0, 255)';
  ctx.beginPath();
  ctx.arc(80, 30, 20, 0, Math.PI * 2);
  ctx.fill();
  try {
    // A blocking browser hands back a uniform image: every pixel the same.
    const px = new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
    if (px.every((p) => p === px[0])) return null;
    return c.toDataURL();
  } catch {
    return null;
  }
}

// Render 5000 samples offline (no sound plays), then add up the end of the signal as a
// number that depends on how this browser does the maths.
/** @returns {Promise<string|null>} */
async function renderAudio() {
  const Ctx = /** @type {typeof OfflineAudioContext|undefined} */ (
    globalThis.OfflineAudioContext ?? /** @type {any} */ (globalThis).webkitOfflineAudioContext
  );
  if (!Ctx) return null;
  try {
    const ctx = new Ctx(1, 5000, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -50;
    comp.knee.value = 40;
    comp.ratio.value = 12;
    comp.attack.value = 0;
    comp.release.value = 0.25;
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const buf = await within(ctx.startRendering(), 2000, null);
    if (!buf) return null;
    const data = buf.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < data.length; i++) sum += Math.abs(data[i]);
    return String(sum);
  } catch {
    return null;
  }
}

// ICE candidates are the network addresses WebRTC could use to connect. With no ICE server
// only addresses of this device appear, so nothing leaves it. 'host' candidates are local IPs.
/**
 * Local addresses offered by WebRTC with no ICE server (nothing leaves the device).
 * @returns {Promise<string[]|null>}
 */
async function localCandidates() {
  if (typeof RTCPeerConnection === 'undefined') return null;
  /** @type {RTCPeerConnection} */
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
  } catch {
    return null;
  }
  /** @type {Set<string>} */
  const found = new Set();
  try {
    await within(new Promise((resolve) => {
      pc.onicecandidate = (e) => {
        if (!e.candidate) return resolve(undefined);
        // An empty candidate means gathering is finished. Otherwise take the address (field 5 of the candidate line).
        const addr = e.candidate.address ?? e.candidate.candidate.split(' ')[4];
        if (addr) found.add(addr);
      };
      pc.createDataChannel('leakcheck');
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve(undefined));
    }), 2000, undefined);
  } finally {
    pc.close();
  }
  return [...found];
}

// The three slow probes run in parallel to keep the scan quick.
/** @returns {Promise<RawBrowser>} */
export async function collectBrowser() {
  const nav = /** @type {Navigator & {deviceMemory?: number, globalPrivacyControl?: boolean}} */ (navigator);
  // Each probe degrades on its own: a failure gives its unknown (or off) form, never a rejected scan.
  const [canvas, audio, cands] = await Promise.all([
    (async () => {
      try {
        const a = drawCanvas();
        const b = drawCanvas();
        return a === null || b === null ? null : /** @type {[string, string]} */ ([await hash(a), await hash(b)]);
      } catch {
        return /** @type {'unknown'} */ ('unknown');
      }
    })(),
    (async () => {
      try {
        const a = await renderAudio();
        const b = a === null ? null : await renderAudio();
        return a === null || b === null ? null : /** @type {[string, string]} */ ([await hash(a), await hash(b)]);
      } catch {
        return null;
      }
    })(),
    localCandidates().catch(() => null),
  ]);
  return {
    screen: { w: screen.width, h: screen.height, innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMin: -new Date().getTimezoneOffset(),
    languages: [...(navigator.languages ?? [navigator.language])].filter(Boolean),
    gpu: gpuRenderer(),
    fontCount: countFonts(),
    canvas,
    audio,
    cores: navigator.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
    localCandidates: cands,
    gpc: nav.globalPrivacyControl,
  };
}
