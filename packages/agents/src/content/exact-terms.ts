/**
 * extractExactTerms
 *
 * Pulls high-signal tokens from a creator's free-text request so the
 * memory retrieval layer can run a targeted keyword search alongside the
 * existing semantic vector search.
 *
 * Four signal classes are extracted, in priority order:
 *   1. Quoted phrases  – text inside curly ("") or straight ("") double-quotes
 *   2. ALL_CAPS tokens – product abbreviations, campaign codes (≥ 3 chars)
 *   3. Title Case runs – 2–5 consecutive Title-Cased words (product/brand names)
 *   4. Hashtags / @mentions – stripped of their sigil
 *
 * Common stop-words and tokens shorter than 3 chars are discarded.
 * The returned array is deduplicated and order-stable (insertion order).
 */

const STOP_WORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Of', 'And', 'Or', 'But',
  'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Being', 'Have', 'Has', 'Had',
  'Do', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should', 'May', 'Might',
  'Its', 'It', 'This', 'That', 'With', 'From', 'By', 'As', 'Up', 'Out',
]);

export function extractExactTerms(text: string): string[] {
  const terms = new Set<string>();

  // 1. Quoted phrases — curly ("") and straight ("")
  //    Match at least 2 chars inside quotes to avoid lone-word noise.
  for (const m of text.matchAll(/[\u201c"]([^\u201d"]{2,})[\u201d"]/g)) {
    if (m[1]) terms.add(m[1].trim());
  }

  // 2. ALL_CAPS tokens ≥ 3 chars
  //    Intentionally excludes 1–2-char abbreviations (I, OK, US…) that add noise.
  for (const m of text.matchAll(/\b([A-Z]{3,})\b/g)) {
    if (m[1]) terms.add(m[1]);
  }

  // 3. Title Case runs of 2–5 words
  //    Each word: starts with uppercase, followed by one or more lowercase chars.
  for (const m of text.matchAll(/\b((?:[A-Z][a-z]+\s){1,4}[A-Z][a-z]+)\b/g)) {
    if (m[1]) terms.add(m[1].trim());
  }

  // 4. Hashtags (#word) and @mentions
  for (const m of text.matchAll(/[#@](\w+)/g)) {
    if (m[1]) terms.add(m[1]);
  }

  // Filter: drop stop-words and anything shorter than 3 chars
  return [...terms].filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}
