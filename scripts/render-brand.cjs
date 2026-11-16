// Renders the StreamViewer logo assets (SVG -> PNG) into assets/ with headless Chrome.
// Usage: node scripts/render-brand.cjs   (set CHROME=/path/to/chrome if not on macOS)
// Then run `npm run prebuild:android` so the Android icons and TV banner are regenerated.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'assets');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-brand-'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const defs = `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#151A3D"/>
    <stop offset="0.55" stop-color="#0B0C18"/>
    <stop offset="1" stop-color="#07070C"/>
  </linearGradient>
  <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#22D3EE"/>
    <stop offset="0.45" stop-color="#3B82F6"/>
    <stop offset="1" stop-color="#A855F7"/>
  </linearGradient>
  <linearGradient id="play" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/>
    <stop offset="1" stop-color="#D6DEFF"/>
  </linearGradient>
  <radialGradient id="live" cx="0.35" cy="0.35" r="0.75">
    <stop offset="0" stop-color="#FF8FB1"/>
    <stop offset="1" stop-color="#F43F5E"/>
  </radialGradient>
  <linearGradient id="word" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#22D3EE"/>
    <stop offset="0.5" stop-color="#3B82F6"/>
    <stop offset="1" stop-color="#A855F7"/>
  </linearGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="haze" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="130"/></filter>
  <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
    <circle cx="16" cy="16" r="1.6" fill="#FFFFFF" fill-opacity="0.06"/>
  </pattern>
  <radialGradient id="dotsFade" cx="0.5" cy="0.5" r="0.6">
    <stop offset="0" stop-color="#fff" stop-opacity="1"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <mask id="dotsMask"><rect width="100%" height="100%" fill="url(#dotsFade)"/></mask>
</defs>`;

// Ring r=300 centred on (512,512); the gap is centred at the upper right (-45deg), where the live dot sits.
const C = 2 * Math.PI * 300;
const dash = `${(C * 300) / 360} ${(C * 60) / 360}`;
const tri = '433.8,366 433.8,658 690.3,512';
const mark = `
<g>
  <circle cx="512" cy="512" r="300" fill="none" stroke="url(#ring)" stroke-width="56" stroke-linecap="round"
          stroke-dasharray="${dash}" transform="rotate(-15 512 512)" filter="url(#glow)" opacity="0.75"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="url(#ring)" stroke-width="56" stroke-linecap="round"
          stroke-dasharray="${dash}" transform="rotate(-15 512 512)"/>
  <circle cx="724.1" cy="299.9" r="42" fill="#F43F5E" filter="url(#glow)" opacity="0.9"/>
  <circle cx="724.1" cy="299.9" r="40" fill="url(#live)"/>
  <polygon points="${tri}" fill="#3B82F6" stroke="#3B82F6" stroke-width="60" stroke-linejoin="round"
           filter="url(#glow)" opacity="0.85"/>
  <polygon points="${tri}" fill="url(#play)" stroke="url(#play)" stroke-width="60" stroke-linejoin="round"/>
</g>`;

const scaled = (s, cx = 512, cy = 512) =>
  `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-512 -512)">${mark}</g>`;

const background = (w, h) => `
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${w * 0.24}" cy="${h * 0.2}" r="${Math.min(w, h) * 0.36}" fill="#3B82F6" opacity="0.5" filter="url(#haze)"/>
  <circle cx="${w * 0.82}" cy="${h * 0.85}" r="${Math.min(w, h) * 0.36}" fill="#8B5CF6" opacity="0.5" filter="url(#haze)"/>
  <circle cx="${w * 0.85}" cy="${h * 0.15}" r="${Math.min(w, h) * 0.2}" fill="#EC4899" opacity="0.28" filter="url(#haze)"/>
  <rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#dotsMask)"/>`;

const svg = (w, h, body, viewBox = `0 0 ${w} ${h}`, outW = w, outH = h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${viewBox}">${defs}${body}</svg>`;

const assets = {
  // Full-bleed square icon (iOS, legacy Android launcher, web).
  'icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, background(1024, 1024) + scaled(0.86)) },
  // Android adaptive icon: background layer + foreground glyph inside the safe zone.
  'adaptive-icon-background.png': { w: 1024, h: 1024, svg: svg(1024, 1024, background(1024, 1024)) },
  'adaptive-icon.png': { w: 1024, h: 1024, svg: svg(1024, 1024, scaled(0.6)) },
  // Android TV launcher banner (16:9), with the app name.
  'tv-banner.png': {
    w: 1280, h: 720,
    svg: svg(1280, 720, background(1280, 720) + scaled(0.6, 330, 360) + `
      <g font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" font-weight="800" letter-spacing="-5">
        <text x="600" y="338" font-size="156" fill="#FFFFFF">Stream</text>
        <text x="600" y="490" font-size="156" fill="url(#word)">Viewer</text>
      </g>`),
  },
  // Browser tab icon: rounded square.
  'favicon.png': {
    w: 196, h: 196,
    svg: svg(1024, 1024, `<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath>
      <g clip-path="url(#r)">${background(1024, 1024)}${scaled(0.95)}</g>`, '0 0 1024 1024', 196, 196),
  },
  // Transparent mark for in-app use, cropped tight around the ring.
  'logo-mark.png': { w: 512, h: 512, svg: svg(1024, 1024, mark, '150 150 724 724', 512, 512) },
};

for (const [name, a] of Object.entries(assets)) {
  const html = path.join(TMP, name.replace('.png', '.html'));
  fs.writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${a.svg}</body></html>`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', `--window-size=${a.w},${a.h}`,
    `--screenshot=${path.join(OUT, name)}`, `file://${html}`,
  ], { stdio: 'ignore' });
  console.log('rendered', name);
}
