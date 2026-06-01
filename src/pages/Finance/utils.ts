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
