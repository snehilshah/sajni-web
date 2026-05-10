// Lightweight fuzzy scorer + type-prefix parser for the global palette.

export type SearchType =
  | 'memo' | 'task' | 'note' | 'journal' | 'habit'
  | 'media' | 'tag' | 'account' | 'transaction';

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  memo: 'Memo',
  task: 'Task',
  note: 'Note',
  journal: 'Journal',
  habit: 'Habit',
  media: 'Media',
  tag: 'Tag',
  account: 'Account',
  transaction: 'Transaction',
};

// Aliases the user can type at the start of the query to bias results.
// Plurals and short forms are accepted.
const TYPE_ALIASES: Record<string, SearchType> = {
  memo: 'memo', memos: 'memo',
  task: 'task', tasks: 'task', todo: 'task', todos: 'task',
  note: 'note', notes: 'note',
  journal: 'journal', journals: 'journal',
  habit: 'habit', habits: 'habit',
  media: 'media', movie: 'media', movies: 'media',
  show: 'media', shows: 'media', book: 'media', books: 'media',
  tag: 'tag', tags: 'tag',
  account: 'account', accounts: 'account', finance: 'account',
  transaction: 'transaction', transactions: 'transaction', txn: 'transaction',
};

export interface ParsedQuery {
  typeBoost: SearchType | null;
  query: string;
  raw: string;
  // aiMode is set when the input starts with @sajni (or @s ) — it tells
  // the palette to switch from search to "ask Sajni" mode.
  aiMode: boolean;
}

// AI_TRIGGERS is the set of prefixes that flip the palette into AI mode.
// We accept @sajni (full), @s (short), and @ai for parity.
const AI_TRIGGERS = ['@sajni', '@ai', '@s'];

export function parseQuery(input: string): ParsedQuery {
  const raw = input;
  const trimmed = input.trim();
  if (!trimmed) return { typeBoost: null, query: '', raw, aiMode: false };

  // Detect @sajni first — wins over type prefixes.
  const lower = trimmed.toLowerCase();
  for (const trig of AI_TRIGGERS) {
    if (lower === trig) {
      return { typeBoost: null, query: '', raw, aiMode: true };
    }
    if (lower.startsWith(trig + ' ')) {
      return {
        typeBoost: null,
        query: trimmed.slice(trig.length).trimStart(),
        raw,
        aiMode: true,
      };
    }
  }

  const parts = trimmed.split(/\s+/);
  const first = parts[0].toLowerCase();
  if (TYPE_ALIASES[first] && parts.length > 1) {
    return {
      typeBoost: TYPE_ALIASES[first],
      query: parts.slice(1).join(' '),
      raw,
      aiMode: false,
    };
  }
  if (TYPE_ALIASES[first]) {
    return { typeBoost: TYPE_ALIASES[first], query: trimmed, raw, aiMode: false };
  }
  return { typeBoost: null, query: trimmed, raw, aiMode: false };
}

// fuzzyScore returns a score in [0, 1].
//   - 0  : no match
//   - 1  : exact equality
//   - 0.6+: substring match, with prefix/word-start boosts
//   - 0.1..0.5: subsequence match, denser = higher
export function fuzzyScore(text: string, q: string): number {
  if (!q) return 0.4; // empty query treats every item as a weak match
  if (!text) return 0;
  const t = text.toLowerCase();
  const ql = q.toLowerCase();

  if (t === ql) return 1;

  const idx = t.indexOf(ql);
  if (idx >= 0) {
    // Substring: weight by relative position (earlier = better).
    let score = 0.7 + 0.25 * (1 - idx / Math.max(t.length, 1));
    if (idx === 0) score += 0.05;
    else if (/\W|_/.test(t[idx - 1])) score += 0.03;
    // Slight penalty when match consumes only a small fraction of the text.
    score -= 0.1 * Math.max(0, 1 - ql.length / t.length);
    return Math.min(score, 0.99);
  }

  // Subsequence (gappy) match.
  let qi = 0;
  let firstHit = -1;
  let lastHit = -1;
  for (let i = 0; i < t.length && qi < ql.length; i++) {
    if (t[i] === ql[qi]) {
      if (firstHit < 0) firstHit = i;
      lastHit = i;
      qi++;
    }
  }
  if (qi < ql.length) return 0;
  const span = lastHit - firstHit + 1;
  const density = ql.length / Math.max(span, 1);
  return Math.max(0.1, 0.45 * density);
}

// Combined score for a hit against a parsed query.
// Boosts hits whose type matches the explicit prefix (if any).
export function rankHit(
  title: string,
  subtitle: string | undefined,
  type: string,
  parsed: ParsedQuery,
): number {
  const titleScore = fuzzyScore(title, parsed.query);
  const subScore = subtitle ? 0.6 * fuzzyScore(subtitle, parsed.query) : 0;
  let score = Math.max(titleScore, subScore);
  if (parsed.typeBoost && parsed.typeBoost === type) {
    score = Math.min(1, score + 0.4);
  }
  return score;
}

// Highlight matched characters. Returns a list of { text, hit } segments.
export function highlight(text: string, q: string): { text: string; hit: boolean }[] {
  if (!q || !text) return [{ text, hit: false }];
  const t = text;
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();

  const idx = tl.indexOf(ql);
  if (idx >= 0) {
    return [
      ...(idx > 0 ? [{ text: t.slice(0, idx), hit: false }] : []),
      { text: t.slice(idx, idx + ql.length), hit: true },
      ...(idx + ql.length < t.length ? [{ text: t.slice(idx + ql.length), hit: false }] : []),
    ];
  }

  // Fallback: highlight subsequence chars
  const out: { text: string; hit: boolean }[] = [];
  let qi = 0;
  let buf = '';
  let bufHit: boolean | null = null;
  for (let i = 0; i < t.length; i++) {
    const isHit = qi < ql.length && tl[i] === ql[qi];
    if (isHit) qi++;
    if (bufHit === null) bufHit = isHit;
    if (isHit !== bufHit) {
      out.push({ text: buf, hit: bufHit });
      buf = '';
      bufHit = isHit;
    }
    buf += t[i];
  }
  if (buf) out.push({ text: buf, hit: !!bufHit });
  return out;
}
