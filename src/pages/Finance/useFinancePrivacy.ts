import { useCallback, useContext } from 'react';

import { FinancePrivacyContext } from './finance-privacy-context';
import { formatMoney as formatMoneyValue, formatPercent as formatPercentValue, isPrivacyMode } from './utils';

export function useFinancePrivacy(): boolean {
  const privacy = useContext(FinancePrivacyContext);
  return privacy ?? isPrivacyMode();
}

// Privacy is an explicit formatter dependency so React Compiler cannot reuse a
// real figure after the toggle changes. Consumers rerender through context;
// data-owning tabs stay mounted, so no fetch effect runs again.
export function useFinanceFormatters() {
  const privacy = useFinancePrivacy();
  const formatMoney = useCallback(
    (amount: number, currency = 'INR') => formatMoneyValue(amount, currency, privacy),
    [privacy],
  );
  const formatPercent = useCallback(
    (value: number, fractionDigits = 0) => formatPercentValue(value, fractionDigits, privacy),
    [privacy],
  );
  return { formatMoney, formatPercent };
}
