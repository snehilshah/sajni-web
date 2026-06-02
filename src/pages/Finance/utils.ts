import { authFetch, API_BASE } from '@/auth/client';

export function formatMoney(amount: number, currency = 'INR'): string {
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
  { value: 'trading', label: 'Trading' },
  { value: 'cash', label: 'Cash' },
];

// All instrument labels (lookup map). Guaranteed instruments live under the
// Investments tab; the rest are market trades shown under Trading.
export const INVESTMENT_TYPES: { value: string; label: string }[] = [
  { value: 'sip', label: 'SIP' },
  { value: 'rd', label: 'RD' },
  { value: 'fd', label: 'FD' },
  { value: 'stock', label: 'Stocks' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
  { value: 'other', label: 'Other' },
];

// Guaranteed-return instruments — the only kinds allowed under Investments.
export const GUARANTEED_TYPES: { value: string; label: string }[] = [
  { value: 'fd', label: 'FD' },
  { value: 'rd', label: 'RD' },
  { value: 'other', label: 'Other' },
];

// Market instruments — bought against a trading account, shown under Trading.
export const TRADING_TYPES: { value: string; label: string }[] = [
  { value: 'stock', label: 'Stocks' },
  { value: 'etf', label: 'ETF' },
  { value: 'sip', label: 'SIP' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
];

export const TRADING_TYPE_VALUES = TRADING_TYPES.map((t) => t.value);

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
