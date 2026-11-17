/** ISO 639-2 (3 letters, as in video files) → ISO 639-1 for the common languages. */
const TWO_LETTERS: Record<string, string> = {
  fre: 'fr', fra: 'fr', eng: 'en', spa: 'es', ger: 'de', deu: 'de', ita: 'it', por: 'pt', dut: 'nl', nld: 'nl',
  ara: 'ar', tur: 'tr', pol: 'pl', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', swe: 'sv', dan: 'da',
  nor: 'no', nob: 'no', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', hin: 'hi', rum: 'ro', ron: 'ro', hun: 'hu',
  cze: 'cs', ces: 'cs', bul: 'bg', hrv: 'hr', srp: 'sr', ukr: 'uk', tha: 'th', vie: 'vi', ind: 'id', may: 'ms', msa: 'ms',
};

const NAMES: Record<string, string> = {
  fr: 'French', en: 'English', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  ar: 'Arabic', tr: 'Turkish', pl: 'Polish', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', el: 'Greek', he: 'Hebrew', hi: 'Hindi',
  ro: 'Romanian', hu: 'Hungarian', cs: 'Czech', bg: 'Bulgarian', hr: 'Croatian', sr: 'Serbian', uk: 'Ukrainian',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay',
};

/** "fre" / "fr" / "fr-FR" → "fr"; '' when unknown or undetermined. */
export function normalizeLanguage(code: string | undefined | null): string {
  const c = (code ?? '').toLowerCase().split(/[-_]/)[0];
  if (!c || c === 'und' || c === 'unk') return '';
  return TWO_LETTERS[c] ?? c;
}

/** "fre" → "French"; the code itself when not in the list; '' when unknown. */
export function languageName(code: string | undefined | null): string {
  const c = normalizeLanguage(code);
  return c ? NAMES[c] ?? c.toUpperCase() : '';
}
