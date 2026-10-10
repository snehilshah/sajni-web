import { cn } from '@/lib/utils';

import { useFinancePrivacy } from './useFinancePrivacy';
import { MONEY_MASK, moneyParts } from './utils';

/** A money figure, typeset: Chubbo's fixed-width digits so columns line up,
 *  the ₹ a smaller muted glyph, paise a touch lighter (`.money` in index.css).
 *  Always formatMoney's exact two decimals. `sign` prefixes a +/− the caller
 *  derives from the transaction type; a negative value carries its own. */
export function Money({ value, currency = 'INR', sign, className, privacy: privacyOverride }: {
  value: number;
  currency?: string;
  sign?: string;
  className?: string;
  /** Force masking on/off; Finance's privacy toggle otherwise. Journal passes false. */
  privacy?: boolean;
}) {
  const privacyMode = useFinancePrivacy();
  const privacy = privacyOverride ?? privacyMode;
  const parts = moneyParts(value, currency, privacy);
  if (!parts) return <span className={cn('money', className)}>{sign}{MONEY_MASK}</span>;
  return (
    <span className={cn('money', className)}>
      {sign}{parts.sign}
      <span className="money-symbol">{parts.symbol}</span>
      {parts.whole}
      <span className="money-fraction">{parts.fraction}</span>
    </span>
  );
}
