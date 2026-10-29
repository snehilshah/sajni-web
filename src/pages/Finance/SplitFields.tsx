import { X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { DateBadge } from '@/components/ui/state-chip';
import { HuePill } from '@/components/ui/hue-pill';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { Money } from './Money';
import { PrefixedInput, SummaryRow, decimalOnly, personKey } from './TransactionDialog';
import { fromPaise, toPaise } from './utils';

// The Split add-on: everyone who owes part of a bill. Equally divides the
// bill between them (and the user, with Include me on: ½ for one person);
// Custom takes each person's share and leaves the rest as the user's part.
// One person with Include me off is the old "All": money lent.

export type SplitMode = 'equal' | 'custom';

export interface SplitState {
  /** People added as chips. */
  people: string[];
  /** A name still being typed; it counts as one more person. */
  draft: string;
  mode: SplitMode;
  includeMe: boolean;
  /** Custom shares as typed, by personKey. */
  custom: Record<string, string>;
}

export const emptySplit = (people: string[] = [], includeMe = true): SplitState =>
  ({ people, draft: '', mode: 'equal', includeMe, custom: {} });

/** Everyone in the split: the chips, then a name still being typed. */
export function splitNames(s: SplitState): string[] {
  const typed = s.draft.trim();
  const dup = s.people.some((p) => personKey(p) === personKey(typed));
  return typed && !dup ? [...s.people, typed] : s.people;
}

export interface SplitResult {
  shares: { borrower: string; share: number }[];
  /** The user's part of the bill. */
  mine: number;
  error: { person?: string; share?: string } | null;
}

/** Who owes what out of `total`. Equal shares round down to the paisa; the
 *  leftover paise are the user's, or the first person's when Include me is off. */
export function computeSplit(total: number, s: SplitState): SplitResult {
  const names = splitNames(s);
  const totalP = toPaise(total > 0 ? total : 0);
  if (names.length === 0) return { shares: [], mine: fromPaise(totalP), error: { person: 'Enter who owes this.' } };
  let shareP: number[];
  if (s.mode === 'equal') {
    const k = names.length + (s.includeMe ? 1 : 0);
    const each = Math.floor(totalP / k);
    shareP = names.map(() => each);
    if (!s.includeMe) shareP[0] += totalP - each * k;
  } else {
    shareP = names.map((n) => {
      const v = parseFloat(s.custom[personKey(n)] ?? '');
      return Number.isFinite(v) ? toPaise(v) : 0;
    });
  }
  const sumP = shareP.reduce((a, b) => a + b, 0);
  const shares = names.map((borrower, i) => ({ borrower, share: fromPaise(shareP[i]) }));
  const mine = fromPaise(totalP - sumP);
  if (shareP.some((p) => p <= 0)) {
    return { shares, mine, error: { share: names.length > 1 ? 'Every share has to be above zero.' : 'Their share has to be above zero.' } };
  }
  if (sumP > totalP) return { shares, mine, error: { share: 'The shares add up to more than the bill.' } };
  return { shares, mine, error: null };
}

/** One person, the whole bill, by Equally with Include me off: money lent. */
export const isAllTheirs = (s: SplitState) => s.mode === 'equal' && !s.includeMe && splitNames(s).length === 1;

export function SplitFields({ value, onChange, total, suggestions, errors, autoFocus, children }: {
  value: SplitState;
  onChange: (next: SplitState) => void;
  total: number;
  /** People who have owed before, to tap in. */
  suggestions: string[];
  errors?: { person?: string; share?: string };
  autoFocus?: boolean;
  /** Extra rows under the shares (due date, remind). */
  children?: React.ReactNode;
}) {
  const s = value;
  const names = splitNames(s);
  const result = computeSplit(total, s);
  const set = (patch: Partial<SplitState>) => onChange({ ...s, ...patch });
  const add = (name: string) => {
    const n = name.trim();
    if (!n || s.people.some((p) => personKey(p) === personKey(n))) { set({ draft: '' }); return; }
    set({ people: [...s.people, n], draft: '' });
  };
  const remove = (name: string) => {
    const custom = { ...s.custom };
    delete custom[personKey(name)];
    set({ people: s.people.filter((p) => p !== name), custom });
  };
  const offered = suggestions.filter((p) => !names.some((n) => personKey(n) === personKey(p))).slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className={cn(
        'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-transparent bg-[hsl(var(--surface-container-highest))] px-2 py-1.5',
        'focus-within:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
        errors?.person && 'border-destructive',
      )}>
        {s.people.map((p) => (
          <span key={p} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[hsl(var(--secondary-container))] pl-2.5 pr-1 text-sm font-medium text-[hsl(var(--on-secondary-container))]">
            {p}
            <button type="button" aria-label={`Remove ${p}`} onClick={() => remove(p)}
              className="grid size-6 place-items-center rounded-full outline-none hover:bg-[hsl(var(--on-secondary-container)/0.12)] focus-visible:ring-2 focus-visible:ring-ring/45">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <Input
          value={s.draft}
          onChange={(e) => {
            const v = e.target.value;
            // A comma finishes a name.
            if (v.endsWith(',')) add(v.slice(0, -1)); else set({ draft: v });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && s.draft.trim()) { e.preventDefault(); add(s.draft); }
            if (e.key === 'Backspace' && !s.draft && s.people.length) remove(s.people[s.people.length - 1]);
          }}
          onBlur={() => { if (s.draft.trim()) add(s.draft); }}
          placeholder={s.people.length ? 'Add someone' : 'Who owes this?'}
          aria-label="Who owes this"
          aria-invalid={!!errors?.person}
          autoFocus={autoFocus}
          className="h-8 min-w-[8rem] flex-1 border-0 bg-transparent px-1.5 shadow-none focus-visible:shadow-none"
        />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {offered.map((p) => <HuePill key={p} onClick={() => add(p)} className="h-8">{p}</HuePill>)}
        </div>
      )}
      {errors?.person && <p className="text-xs text-destructive">{errors.person}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedButton<SplitMode>
          aria-label="How to split"
          value={s.mode}
          onChange={(mode) => set({ mode })}
          options={[{ value: 'equal', label: 'Equally' }, { value: 'custom', label: 'Custom' }]}
          showCheck={false}
          className="h-11 bg-[hsl(var(--surface-container-highest))] p-1"
        />
        {s.mode === 'equal' && (
          <button
            type="button"
            aria-pressed={s.includeMe}
            onClick={() => set({ includeMe: !s.includeMe })}
            className={cn(
              'inline-flex h-11 items-center rounded-xl px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
              s.includeMe
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                : 'bg-[hsl(var(--surface-container-highest))] text-muted-foreground hover:text-foreground',
            )}
          >
            Include me
          </button>
        )}
      </div>

      {s.mode === 'custom' && names.map((n) => (
        <PrefixedInput
          key={personKey(n)}
          prefix={`${n} ₹`}
          value={s.custom[personKey(n)] ?? ''}
          onChange={(v) => set({ custom: { ...s.custom, [personKey(n)]: decimalOnly(v) } })}
          invalid={!!errors?.share}
        />
      ))}
      {errors?.share && <p className="text-xs text-destructive">{errors.share}</p>}
      {children}

      <SummaryRow>
        {total > 0 && names.length > 0 && !result.error && (<>
          {result.mine > 0 && <DateBadge>You <Money value={result.mine} /></DateBadge>}
          {result.shares.map((sh) => (
            <DateBadge key={personKey(sh.borrower)} tone="accent">{sh.borrower} owes <Money value={sh.share} /></DateBadge>
          ))}
        </>)}
      </SummaryRow>
    </div>
  );
}
