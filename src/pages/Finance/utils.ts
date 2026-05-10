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
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
];

export const INVESTMENT_TYPES: { value: string; label: string }[] = [
  { value: 'sip', label: 'SIP' },
  { value: 'rd', label: 'RD' },
  { value: 'fd', label: 'FD' },
  { value: 'stock', label: 'Stocks' },
  { value: 'etf', label: 'ETF' },
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
