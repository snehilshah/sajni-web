import { authFetch, API_BASE } from '@/auth/client';

// ─── Privacy mode ──────────────────────────────────────────────────────────
// A single global flag. When on, every money formatter emits stable random
// digits instead of the real figure. "Stable" = seeded by the real value, so
// the same amount always renders the same decoy and nothing flickers between
// renders. Covers all finance tabs because every rupee flows through
// formatMoney / formatMoneyPrecise. Charts are shapes, not text, so they are
// intentionally unaffected.
//
// Reactivity note: this is a plain module flag, NOT a React store. The React
// Compiler memoizes each formatMoney(x) call on x alone and can't see this
// flag, so a re-render won't recompute figures. FinancePage instead remounts
// the tab subtree (via a key keyed on privacy) when the flag flips, giving a
// fresh compiler cache that recomputes everything against the current value.
const PRIVACY_KEY = 'sajni.finance.privacy';
// A reveal only lasts 30 minutes: turning privacy OFF stamps an expiry;
// FinancePage re-hides on a timer/visibility change, and the on-load check
// below catches reloads after the window lapsed.
const REVEAL_UNTIL_KEY = 'sajni.finance.privacy.revealUntil';
export const REVEAL_MS = 30 * 60 * 1000;

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

export function togglePrivacyMode(): void { setPrivacyMode(!privacyOn); }

// Deterministic decoy: same input → same output, sign + digit count preserved
// so the layout doesn't jump. mulberry-ish hash seeded by the rounded value.
function decoyAmount(amount: number): number {
  const real = Math.round(Math.abs(amount));
  const digits = real === 0 ? 1 : Math.floor(Math.log10(real)) + 1;
  let seed = (real ^ 0x9e3779b9) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  const rnd = ((seed ^ (seed >>> 13)) >>> 0) / 4294967296;
  const lo = digits === 1 ? 0 : Math.pow(10, digits - 1);
  const hi = Math.pow(10, digits) - 1;
  const val = Math.floor(lo + rnd * (hi - lo + 1));
  return amount < 0 ? -val : val;
}

export function formatMoney(amount: number, currency = 'INR'): string {
  if (privacyOn) amount = decoyAmount(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return currency + ' ' + Math.round(amount).toLocaleString('en-IN');
  }
}

export function formatMoneyPrecise(amount: number, currency = 'INR'): string {
  if (privacyOn) amount = decoyAmount(amount);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + ' ' + amount.toFixed(2);
  }
}

export const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'checking', label: 'Checking' },
  { value: 'salary', label: 'Salary' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
];

// Manual instruments — market trading was removed; sip/mutual_fund live on
// as manually valued entries alongside the guaranteed kinds.
export const INVESTMENT_TYPES: { value: string; label: string }[] = [
  { value: 'sip', label: 'SIP' },
  { value: 'rd', label: 'RD' },
  { value: 'fd', label: 'FD' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
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

export const _API_BASE = API_BASE;

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
