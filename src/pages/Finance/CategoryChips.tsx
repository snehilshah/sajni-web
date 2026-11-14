import type { FinCategory } from '@/api';
import { HuePill, hueVar } from '@/components/ui/hue-pill';
import { cn } from '@/lib/utils';

// Category picker: every category as a chip tinted in its own colour (the
// colour is the category, no dot), the picked one deepened with a ring.
// Mirrors Android's tinted TonalChip row in the transaction sheet.
// rowOnPhone: below md, one sideways-scrolling row (bleeding to the sheet's
// edges) instead of four wrapped rows.
export function CategoryChips({ categories, value, onChange, rowOnPhone = false }: {
  categories: FinCategory[];
  value: string;
  onChange: (id: string) => void;
  rowOnPhone?: boolean;
}) {
  return (
    <div role="radiogroup" className={cn('flex flex-wrap gap-1.5',
      rowOnPhone && 'max-md:-mx-6 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-6 max-md:[scrollbar-width:none]')}>
      {categories.map((c) => (
        <HuePill key={c.id} tinted hue={c.color} selected={value === String(c.id)} onClick={() => onChange(String(c.id))} className="h-8">
          {c.name}
        </HuePill>
      ))}
    </div>
  );
}

// Read-only category label in the same tint, for lists (budgets, breakdowns).
export function CategoryPill({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  return (
    <span
      style={hueVar(color || 'hsl(var(--outline))')}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-[color-mix(in_oklab,var(--hue)_15%,transparent)] text-[color-mix(in_oklab,var(--hue)_65%,hsl(var(--on-surface)))]',
        className,
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
