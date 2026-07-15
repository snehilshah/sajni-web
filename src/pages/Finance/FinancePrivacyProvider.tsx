import type { ReactNode } from 'react';

import { FinancePrivacyContext } from './finance-privacy-context';

export function FinancePrivacyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <FinancePrivacyContext.Provider value={value}>{children}</FinancePrivacyContext.Provider>;
}
