/**
 * Language and quality of a movie or show, read from the provider's naming.
 *
 * The provider publishes no track list (its probe data covers at most the first audio track,
 * and only for some titles), but its names and categories follow conventions:
 * - a prefix gives the version: "FR - " dubbed in French, "EN - " English, "NF - " / "A+ - " /
 *   "D+ - " Netflix / Apple / Disney originals with many subtitles ("[MULTISUB]" categories);
 * - tags give subtitles and quality: "VOSTFR", "(SUBT-ENGL)", "MULTI-SUBS", "1080p", "TELESYNC"…;
 * - without a prefix, the category tells the language ("… [FR]", "ENGLISH 4K").
 * Everything shown as a badge is removed from the title.
 */

export interface MediaInfo {
  /** Name without the version prefix and the tags shown as badges. */
  title: string;
  /** Year from the name, e.g. "(2024)". */
  year?: string;
  /** Spoken language: 'FR', 'EN' (or another code, e.g. 'ES'), 'VO' (original version, language not stated) or 'Multi'. */
  audio?: string;
  /** Subtitles: 'FR', 'EN' or 'Multi' (many languages). */
  subs?: string;
  /** '4K', '1080p', '720p', 'HQ', 'LQ', possibly followed by 'HEVC'. */
  quality?: string;
  /** Camera / telesync recording: poor picture and sound. */
  cam?: boolean;
}

type Lang = 'FR' | 'EN' | 'MULTISUB' | 'ENSUB';

/** Language of a provider category, from its name. */
export function categoryLanguage(categoryName: string | undefined): Lang | undefined {
  if (!categoryName) return undefined;
  const n = categoryName.toUpperCase().replace(/\s+/g, ' ');
  if (/\bENGLISH SUBS?\b/.test(n) || (/\bSUBS?\b/.test(n) && /\[EN\]/.test(n))) return 'ENSUB';
  if (/MULTISUB/.test(n)) return 'MULTISUB';
  if (/\[(FR|QC)\]|\bFRENCH\b/.test(n)) return 'FR';
  if (/\[EN\]|\bENGLISH\b/.test(n)) return 'EN';
  return undefined;
}

const PREFIX = /^[\s‎‏]*(FR|EN|VF|VO|NF|A ?\+|D ?\+|4K|SC|MULTI|ES|DE|IT|PT|NL|PL|TR|AR)\s*[-|:]\s*/i;
/** Other languages the provider prefixes titles with ("ES - …"), shown as the spoken language. */
const OTHER_LANGUAGES = new Set(['ES', 'DE', 'IT', 'PT', 'NL', 'PL', 'TR', 'AR']);

/** [pattern, effect]. Patterns are tried in order; each match is removed from the title. */
const TAGS: [RegExp, (i: MediaInfo, match: string) => void][] = [
  [/\bVOST(?:[- ]?FR)?\b/gi, (i) => { i.subs = 'FR'; i.audio = 'VO'; }],
  [/\b(?:SUBT[- ]?ENGL?|ENG(?:LISH)?[- ]?SUBS?|SUBS[- ]?ENGLISH|SUBSENGLISH)\b/gi, (i) => { i.subs = 'EN'; if (i.audio !== 'FR') i.audio = 'VO'; }],
  [/\bMULTI[- ]?SUBS?\b/gi, (i) => { i.subs = 'Multi'; }],
  [/\bMULTI[- ]?AUDIO\b|\bMULTI\b/g, (i) => { i.audio = 'Multi'; }],
  [/\bENG[- ]?DUB\b/gi, (i) => { i.audio = 'EN'; }],
  [/\b(?:TRUEFRENCH|VFF|VFQ|VF)\b/g, (i) => { i.audio = 'FR'; }],
  [/\b(?:2160p|UHD|4K)\b/gi, (i) => { i.quality = '4K'; }],
  [/\b(?:1080p|FHD)\b/gi, (i) => { i.quality = i.quality ?? '1080p'; }],
  [/\b720p\b/gi, (i) => { i.quality = i.quality ?? '720p'; }],
  [/\b(?:HQ|LQ)\b/g, (i, m) => { i.quality = i.quality ?? m; }],
  [/\b(?:HEVC|[xh]\.?265)\b/gi, (i) => { i.quality = i.quality ? `${i.quality} HEVC` : 'HEVC'; }],
  [/\b(?:HD)?CAM\b|\bHDAM\b|\bTELESYNC\b|\bHDTS\b/g, (i) => { i.cam = true; }],
];

const cache = new Map<string, MediaInfo>();

export function describeMedia(name: string, categoryName?: string): MediaInfo {
  const cacheKey = `${categoryName ?? ''}\u0000${name}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const info: MediaInfo = { title: name };
  let t = name;

  const prefix = PREFIX.exec(t);
  if (prefix) {
    t = t.slice(prefix[0].length);
    const p = prefix[1].toUpperCase().replace(' ', '');
    if (p === 'FR' || p === 'VF') info.audio = 'FR';
    else if (p === 'EN') info.audio = 'EN';
    else if (p === 'VO') info.audio = 'VO';
    else if (p === 'MULTI') info.audio = 'Multi';
    else if (p === '4K') info.quality = '4K';
    else if (OTHER_LANGUAGES.has(p)) info.audio = p;
    else { info.audio = 'VO'; info.subs = 'Multi'; } // NF, A+, D+, SC: originals with many subtitles
  }

  for (const [re, apply] of TAGS) {
    t = t.replace(re, (m) => { apply(info, m); return ' '; });
  }

  // No language from the name: use the category's.
  const lang = categoryLanguage(categoryName);
  if (lang === 'ENSUB') { info.subs = info.subs ?? 'EN'; if (!info.audio || info.audio === 'EN') info.audio = 'VO'; }
  if (lang === 'MULTISUB') { info.subs = info.subs ?? 'Multi'; info.audio = info.audio ?? 'VO'; }
  if (!info.audio && (lang === 'FR' || lang === 'EN')) info.audio = lang;

  const year = /\((\d{4})\)/.exec(t);
  if (year) { info.year = year[1]; t = t.replace(year[0], ' '); }
  // Shows end with the production country, e.g. "(US)".
  t = t.replace(/\s*\([A-Z]{2}\)\s*$/, ' ');
  info.title = t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').replace(/\s+([:,.!?])/g, '$1').replace(/[\s\-–|:]+$/, '').trim() || name;

  if (cache.size > 5000) cache.clear();
  cache.set(cacheKey, info);
  return info;
}
