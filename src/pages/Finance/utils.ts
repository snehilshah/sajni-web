import { authFetch } from '@/auth/client';

// ─── Privacy mode ──────────────────────────────────────────────────────────
// A single global flag. When on, money and percentage formatters emit explicit
// non-numeric masks instead of plausible-looking decoy figures. Charts are
// shapes, not text, so they are intentionally unaffected.
//
// Reactivity note: FinancePage exposes this value through FinancePrivacyContext.
// UI formatters receive privacy as an explicit argument, so toggling masks only
// the rendered figures and never remounts data-owning tabs.
const PRIVACY_KEY = 'sajni.finance.privacy';
// A reveal only lasts 30 minutes: turning privacy OFF stamps an expiry;
// FinancePage re-hides on a timer/visibility change, and the on-load check
// below catches reloads after the window lapsed.
const REVEAL_UNTIL_KEY = 'sajni.finance.privacy.revealUntil';
const REVEAL_MS = 30 * 60 * 1000;

// Default ON: figures are hidden unless the user has explicitly revealed them
// (stored '0') AND the 30-minute reveal window hasn't lapsed. Anything else —
// including a fresh device — starts private.
let privacyOn = (() => {
  try {
    if (localStorage.getItem(PRIVACY_KEY) !== '0') return true;
    const until = Number(localStorage.getItem(REVEAL_UNTIL_KEY) || 0);
    if (Date.now() >= until) {
      localStorage.setItem(PRIVACY_KEY, '1');
      localStorage.removeItem(REVEAL_UNTIL_KEY);
      return true;
    }
    return false;
  } catch { return true; }
})();

export function isPrivacyMode(): boolean { return privacyOn; }

export function setPrivacyMode(on: boolean): void {
  privacyOn = on;
  try {
    localStorage.setItem(PRIVACY_KEY, on ? '1' : '0');
    if (on) localStorage.removeItem(REVEAL_UNTIL_KEY);
    else localStorage.setItem(REVEAL_UNTIL_KEY, String(Date.now() + REVEAL_MS));
  } catch { /* ignore */ }
}

// Epoch ms when the current reveal lapses; null when privacy is on.
export function revealExpiry(): number | null {
  if (privacyOn) return null;
  try {
    const until = Number(localStorage.getItem(REVEAL_UNTIL_KEY) || 0);
    return until > 0 ? until : null;
  } catch { return null; }
}

// The one money formatter. Money is never rounded for display: every figure
// shows exactly two decimals (₹1,200.00), so columns line up and a total is
// always the sum of what's listed. No compact (₹34.3K) variant on purpose.
const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string): Intl.NumberFormat {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

export const MONEY_MASK = '***';

export function formatMoney(amount: number, currency = 'INR', privacy = privacyOn): string {
  if (privacy) return MONEY_MASK;
  try {
    return moneyFormatter(currency).format(amount);
  } catch {
    // Unknown currency code: keep the figure exact, prefix the code.
    return currency + ' ' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

/** formatMoney split for typesetting (web `Money`): sign, currency symbol,
 *  whole part with grouping, and ".50". Null when privacy masks the figure. */
export interface MoneyParts { sign: string; symbol: string; whole: string; fraction: string }

export function moneyParts(amount: number, currency = 'INR', privacy = privacyOn): MoneyParts | null {
  if (privacy) return null;
  try {
    const parts: MoneyParts = { sign: '', symbol: '', whole: '', fraction: '' };
    for (const part of moneyFormatter(currency).formatToParts(amount)) {
      if (part.type === 'minusSign') parts.sign = '−';
      else if (part.type === 'plusSign') parts.sign = '+';
      else if (part.type === 'currency') parts.symbol = part.value;
      else if (part.type === 'integer' || part.type === 'group') parts.whole += part.value;
      else if (part.type === 'decimal' || part.type === 'fraction') parts.fraction += part.value;
    }
    return parts;
  } catch {
    return null;
  }
}

// Money arithmetic in whole paise. Amounts arrive as JSON floats, and adding
// floats drifts (0.1 + 0.2 = 0.30000000000000004); adding integers doesn't.
// Sum and subtract through these whenever a figure is computed in the browser.
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const fromPaise = (paise: number): number => paise / 100;

/** Exact sum of `pick(item)` over `items`, to the paisa. */
export function sumMoney<T>(items: readonly T[], pick: (item: T) => number): number {
  let paise = 0;
  for (const item of items) paise += toPaise(pick(item));
  return fromPaise(paise);
}

/** Exact `a - b`, to the paisa. */
export const subMoney = (a: number, b: number): number => fromPaise(toPaise(a) - toPaise(b));

export function formatPercent(value: number, fractionDigits = 0, privacy = privacyOn): string {
  return privacy ? '%%%' : `${value.toFixed(fractionDigits)}%`;
}

export const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'salary', label: 'Salary' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
];

// Fixed deposits can be estimated from their rate; SIP remains manually
// valued because market performance cannot be derived from an expected rate.
export const INVESTMENT_TYPES: { value: string; label: string }[] = [
  { value: 'sip', label: 'SIP' },
  { value: 'rd', label: 'RD' },
  { value: 'fd', label: 'FD' },
  { value: 'other', label: 'Other' },
];

export const ACCOUNT_COLORS = [
  '#2D5A4F', '#A14B4F', '#C49A6C', '#4F6FA1',
  '#8B6FA1', '#7C9A92', '#6B7280', '#0EA5E9',
  '#84CC16', '#F59E0B',
];

export async function downloadCSV(path: string, filename: string) {
  const res = await authFetch(path);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Transaction time (txn_at) ──────────────────────────────────────────
// The API carries a transaction's instant as an RFC3339 string anchored to IST
// (+05:30). Every Sajni user is IST, so we render and compose in Asia/Kolkata
// explicitly — never the device timezone — keeping the wall clock stable on any
// device. Intl with timeZone:'Asia/Kolkata' does the conversion bulletproofly.
const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

// Split an instant into IST { date:'yyyy-MM-dd', time:'HH:MM' } for the
// Date + Time pickers. Falls back to "now" on an unparseable value.
export function txnAtToParts(iso: string): { date: string; time: string } {
  let d = new Date(iso);
  if (isNaN(d.getTime())) d = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IST_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour; // some engines emit 24h at midnight
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

// Build an IST-anchored RFC3339 the server stores verbatim. The explicit +05:30
// makes it device-timezone independent. Blank/invalid time → midnight.
export function partsToTxnAt(date: string, time: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '00:00';
  return `${date}T${t}:00${IST_OFFSET}`;
}

// "2 Jun 2026" in IST.
export function formatTxnDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

// "2:30 PM" in IST.
export function formatTxnTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}
