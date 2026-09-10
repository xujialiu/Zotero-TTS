import type { Timestamp } from './providers/types';

export type TimedWord = {
  text: string;
  /** seconds */
  start: number;
  /** seconds */
  end: number;
};

/**
 * What aligning a server's word list to the text produced, for the debug
 * line: the timestamps, and how they came about.
 */
export type AlignReport = {
  timestamps: Timestamp[];
  /** Server words paired with a word of the text — their own span, their own time. */
  paired: number;
  /** Timestamps laid over the text between two paired words, for the words the server spelled differently. */
  bridged: number;
  /** Server words that ended in no timestamp: a run with no text between its neighbors, or a list with no pair at all. */
  dropped: number;
};

/**
 * Align the word text produced by the TTS engine back to the source text,
 * deriving character offsets.
 *
 * The engine only tells us "the word spoken at 1.2 s is quick", not where
 * quick sits in the original text — and what it says is not always what it
 * was given. Kokoro-FastAPI rewrites its input before speaking it (issue
 * #86): `29.83` becomes `twenty-nine point eight three`, `3` becomes
 * `three`, a typographic apostrophe is straightened, and the comma and the
 * period come back as words of their own. A substring search from a cursor
 * lost every such word, and worse: the `point` of a decimal matched inside
 * a later `branchpoints`, the cursor moved past it, and the highlight
 * jumped two lines down and never came back.
 *
 * So the pairing is done on tokens, by longest common subsequence — the
 * pairing with the most equal tokens in order, walked from the front so
 * every pair lands as early as it can. A word that also occurs later cannot
 * pull the pairing ahead: a pair that would forfeit the pairs between it
 * loses. A run of server words with no pair, between two paired ones, is
 * bridged: one timestamp with the server's own start and end over the text
 * between the two neighbors, which is exactly what was spoken then. Nothing
 * is estimated — the time is the server's, the text lies between two words
 * that are certainly right — and a run with no text between its neighbors
 * is dropped, a list with no pair at all returns nothing (the whole-segment
 * stand-in of remote-interface.ts then applies). A server word made of
 * punctuation extends the word before it rather than lighting a comma.
 */
export function alignWordsToText(words: TimedWord[], sourceText: string): Timestamp[] {
  return alignWords(words, sourceText).timestamps;
}

/** The parenthetical for the debug line — `5 bridged, 1 dropped` — or null when every word paired. */
export function describeAlignment(report: AlignReport): string | null {
  const parts: string[] = [];
  if (report.bridged) parts.push(`${report.bridged} bridged`);
  if (report.dropped) parts.push(`${report.dropped} dropped`);
  return parts.length ? parts.join(', ') : null;
}

/** A token of a text: what it compares by, and where it sits (source tokens only). */
interface Token {
  key: string;
  start: number;
  end: number;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const DIGIT = /\p{Nd}/u;
const SYMBOL = /\p{S}/u;
/** Scripts written without spaces between words: every character is a token, so a word is a run of them. */
const SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const APOSTROPHE = /['’‘ʼ′]/u;

/**
 * Lowercase per code point (not the whole string: 'ΑΣ' would fold to 'ας'
 * as a word but 'ασ' letter by letter, and the two sides must agree),
 * after NFKC so a ligature or a full-width form compares as its letters;
 * apostrophes are dropped, so `authors'`, `authors’` and `authors` are one
 * key.
 */
function keyOf(token: string): string {
  let out = '';
  for (const ch of token.normalize('NFKC')) {
    if (APOSTROPHE.test(ch)) continue;
    out += ch.toLowerCase();
  }
  return out;
}

/**
 * The tokens of a text, in order, each with its char span (code units,
 * the offsets Zotero draws by). A token is a run of letters, marks and
 * digits — a `.` or `,` between two digits stays inside (`29.83`,
 * `1,000`), an apostrophe after a letter stays inside (`don't`, the
 * possessive `authors’`) — or one symbol (`×`, `−`, `$`), or, in a script
 * without spaces, one character. Punctuation and whitespace separate; a
 * hyphen separates too, so `pre-trained` pairs whether the server keeps
 * it whole or splits it.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let runStart = -1;
  let runText = '';
  const flush = () => {
    if (runStart >= 0 && runText) tokens.push({ key: keyOf(runText), start: runStart, end: i });
    runStart = -1;
    runText = '';
  };
  const chars = Array.from(text);
  let prev = '';
  for (let c = 0; c < chars.length; c++) {
    const ch = chars[c];
    const next = chars[c + 1] ?? '';
    if (SPACELESS.test(ch)) {
      flush();
      tokens.push({ key: keyOf(ch), start: i, end: i + ch.length });
    } else if (WORD_CHAR.test(ch)) {
      if (runStart < 0) runStart = i;
      runText += ch;
    } else if (runStart >= 0 && (ch === '.' || ch === ',') && DIGIT.test(prev) && DIGIT.test(next)) {
      runText += ch;
    } else if (runStart >= 0 && APOSTROPHE.test(ch) && WORD_CHAR.test(prev)) {
      runText += ch;
    } else {
      flush();
      if (SYMBOL.test(ch)) tokens.push({ key: keyOf(ch), start: i, end: i + ch.length });
    }
    prev = ch;
    i += ch.length;
  }
  flush();
  return tokens;
}

/** Above this many cells the LCS table is not built; the pairing walks a window instead. */
const MAX_LCS_CELLS = 4_000_000;
const GREEDY_WINDOW = 40;

/**
 * Pairs between the server's tokens and the source's, as a map from server
 * token index to source token index, monotonic in both. LCS when the table
 * fits; else a bounded forward search, which still pairs whole tokens only.
 */
function pairTokens(server: string[], source: string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const n = server.length;
  const m = source.length;
  if (!n || !m) return pairs;
  if (n * m > MAX_LCS_CELLS) {
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const limit = Math.min(m, cursor + GREEDY_WINDOW);
      for (let j = cursor; j < limit; j++) {
        if (server[i] === source[j]) {
          pairs.set(i, j);
          cursor = j + 1;
          break;
        }
      }
    }
    return pairs;
  }
  // L[i][j] = the length of the longest common subsequence of server[i..] and source[j..]
  const width = m + 1;
  const L = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * width + j] = server[i] === source[j] ? L[(i + 1) * width + j + 1] + 1 : Math.max(L[(i + 1) * width + j], L[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const here = L[i * width + j];
    if (server[i] === source[j] && here === L[(i + 1) * width + j + 1] + 1) {
      pairs.set(i, j);
      i++;
      j++;
    } else if (L[i * width + j + 1] === here) {
      j++;
    } else {
      i++;
    }
  }
  return pairs;
}

export function alignWords(words: TimedWord[], sourceText: string): AlignReport {
  const source = tokenize(sourceText);
  // The server's side, in order: every token of every word, carrying its
  // word's time (a word's tokens share it), and every word with no token —
  // punctuation — as a marker. Kokoro glues a symbol to the number after
  // it (`×three` for `×3`), so the pieces of one word are placed one by one
  // and put back together below.
  type Item = { word: number; key: string | null; start: number; end: number };
  const items: Item[] = [];
  const wordsWithTokens = new Set<number>();
  words.forEach((word, w) => {
    const keys = tokenize(word.text).map((t) => t.key);
    if (!keys.length) {
      items.push({ word: w, key: null, start: word.start, end: word.end });
      return;
    }
    wordsWithTokens.add(w);
    for (const key of keys) items.push({ word: w, key, start: word.start, end: word.end });
  });
  const tokenItems = items.filter((item) => item.key !== null);
  const pairs = pairTokens(
    tokenItems.map((item) => item.key as string),
    source.map((t) => t.key),
  );

  const report: AlignReport = { timestamps: [], paired: 0, bridged: 0, dropped: 0 };
  if (!pairs.size) {
    report.dropped = wordsWithTokens.size;
    return report;
  }

  // Each timestamp with the source tokens it covers, so pieces can be joined
  const out: { stamp: Timestamp; first: number; last: number }[] = [];
  const reached = new Set<number>();
  const pairedWords = new Set<number>();
  let consumed = -1;
  let run: { start: number; end: number; words: Set<number> } | null = null;
  const bridge = (upTo: number) => {
    if (!run) return;
    const from = consumed + 1;
    if (upTo > from) {
      out.push({ stamp: { start: run.start, end: run.end, charStart: source[from].start, charEnd: source[upTo - 1].end }, first: from, last: upTo - 1 });
      report.bridged += 1;
      for (const w of run.words) reached.add(w);
      consumed = upTo - 1;
    }
    run = null;
  };
  let index = 0;
  for (const item of items) {
    if (item.key === null) {
      // Punctuation belongs to what was just said
      if (run) run.end = Math.max(run.end, item.end);
      else if (out.length) out[out.length - 1].stamp.end = Math.max(out[out.length - 1].stamp.end, item.end);
      continue;
    }
    const j = pairs.get(index++);
    if (j === undefined) {
      if (run) {
        run.end = Math.max(run.end, item.end);
        run.words.add(item.word);
      } else run = { start: item.start, end: item.end, words: new Set([item.word]) };
      continue;
    }
    bridge(j);
    out.push({ stamp: { start: item.start, end: item.end, charStart: source[j].start, charEnd: source[j].end }, first: j, last: j });
    reached.add(item.word);
    pairedWords.add(item.word);
    consumed = j;
  }
  bridge(source.length);

  // The pieces of one spoken word back into one span: consecutive
  // timestamps that start together over adjacent tokens (`pre` + `trained`,
  // `×` + `3`, the characters of a Chinese word) are one highlight
  for (const entry of out) {
    const previous = report.timestamps.length ? out[report.timestamps.length - 1] : null;
    const joined = report.timestamps[report.timestamps.length - 1];
    if (previous && joined && entry.stamp.start === joined.start && entry.first === previous.last + 1) {
      joined.end = Math.max(joined.end, entry.stamp.end);
      joined.charEnd = entry.stamp.charEnd;
      previous.last = entry.last;
      continue;
    }
    report.timestamps.push(entry.stamp);
    out[report.timestamps.length - 1] = entry;
  }
  // The ends stay in order: a punctuation word the server times over the
  // word after it (a `]` spoken across the `A` that follows) would
  // otherwise leave a timestamp ending after the next one starts, and
  // Zotero's resume picks the active word by the first end past the offset
  for (let i = 0; i + 1 < report.timestamps.length; i++) {
    const stamp = report.timestamps[i];
    const next = report.timestamps[i + 1];
    if (stamp.end > next.start && next.start >= stamp.start) stamp.end = next.start;
  }
  report.paired = pairedWords.size;
  report.dropped = wordsWithTokens.size - reached.size;
  return report;
}
