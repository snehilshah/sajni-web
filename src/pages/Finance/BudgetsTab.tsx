import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags, Check, Copy } from '@/components/ui/icons';

import { finance, type BudgetDraft, type FinBudget, type FinCategory, type FinSlate } from '@/api';
import { useFinBudgets } from '@/queries/finance';
import { qk } from '@/queries/keys';
import { confirmDialog } from '@/lib/confirm';
import { msg } from '@/lib/errors';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceFormatters } from './useFinancePrivacy';
import { CardsSkeleton } from './Skeletons';
import CategoryManager from './CategoryManager';
import { cardClass } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// A budget is a lens, not a container: many budgets can read the same
// transaction. There is no period and nothing resets — a budget owns the window
// it was created for, and next month's budget is a deliberate duplicate. The
// slate multi-select is what it reads; empty means Plain only, i.e. normal life.

interface Props {
  categories: FinCategory[];
  slates: FinSlate[];
  reloadCategories: () => void;
}

/** A draft to prefill the dialog with — a duplicate, or blank for a new one. */
type Prefill = Omit<BudgetDraft, 'items'> & { items: { category_id: number | null; amount: string }[] };

export default function BudgetsTab({ categories, slates, reloadCategories }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinBudget | null>(null);
  const [creating, setCreating] = useState<Prefill | null>(null);

  const [manageCats, setManageCats] = useState(false);

  const { data: budgets = [], isSuccess } = useFinBudgets();
  const reload = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  // Nothing rolls, so the only split that matters is whether the window has
  // closed. Past budgets stay readable but drop out of the way.
  const today = format(new Date(), 'yyyy-MM-dd');
  const current = budgets.filter((b) => !b.end_date || b.end_date >= today);
  const past = budgets.filter((b) => !!b.end_date && b.end_date < today);

  // Duplicating a closed budget shifts the window forward by its own length, so
  // a month becomes the next month and a week the next week without asking the
  // user to restate the shape.
  const duplicate = (b: FinBudget) => {
    let start = '';
    let end = '';
    if (b.start_date && b.end_date) {
      const s = new Date(b.start_date);
      const e = new Date(b.end_date);
      const span = e.getTime() - s.getTime() + 86400000; // inclusive of both ends
      start = format(new Date(e.getTime() + 86400000), 'yyyy-MM-dd');
      end = format(new Date(e.getTime() + span), 'yyyy-MM-dd');
    }
    setCreating({
      name: b.name,
      start_date: start,
      end_date: end,
      total_amount: b.total_amount,
      slate_ids: b.slate_ids ?? [],
      items: b.items.map((i) => ({ category_id: i.category_id, amount: String(i.amount) })),
    });
  };

  const blank: Prefill = {
    name: '', start_date: '', end_date: '', total_amount: 0, slate_ids: [], items: [],
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Budgets</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageCats(true)}>
            <Tags className="size-4 mr-1" /> Categories
          </Button>
          <Button size="sm" onClick={() => setCreating(blank)}>
            <Plus className="size-4 mr-1" /> New budget
          </Button>
        </div>
      </div>

      {!isSuccess && budgets.length === 0 ? (
        <CardsSkeleton count={3} />
      ) : budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No budgets yet. A budget is a limit over a set of transactions — this
          month's food, this week's spending, a trip. Dates are optional, and
          nothing resets on its own.
        </div>
      ) : (
        <>
          {current.length > 0 && (
            <section className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Running</span>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {current.map((b) => (
                  <BudgetCard
                    key={b.id} budget={b} categories={categories} slates={slates}
                    onOpen={() => setEditing(b)} onDuplicate={() => duplicate(b)}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Closed</span>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {past.map((b) => (
                  <BudgetCard
                    key={b.id} budget={b} categories={categories} slates={slates}
                    onOpen={() => setEditing(b)} onDuplicate={() => duplicate(b)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <BudgetDialog
        open={creating !== null || editing !== null}
        budget={editing}
        prefill={creating}
        categories={expenseCats}
        slates={slates}
        onClose={() => { setCreating(null); setEditing(null); }}
        onSaved={() => { setCreating(null); setEditing(null); reload(); }}
      />
      <CategoryManager
        open={manageCats}
        categories={categories}
        onClose={() => setManageCats(false)}
        onChanged={reloadCategories}
      />
    </div>
  );
}

function BudgetCard({ budget: b, categories, slates, onOpen, onDuplicate }: {
  budget: FinBudget;
  categories: FinCategory[];
  slates: FinSlate[];
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const { formatMoney, formatPercent } = useFinanceFormatters();
  const pct = b.total_amount > 0 ? Math.min((b.spent / b.total_amount) * 100, 100) : 0;
  const overBudget = b.spent > b.total_amount;
  // Progress tone escalates on tokens only: calm → attention (>80%) → over.
  const barColor = overBudget
    ? 'hsl(var(--destructive))'
    : pct > 80 ? 'hsl(var(--tertiary))' : 'hsl(var(--primary))';
  // Empty slate_ids = Plain only, which is the default lens.
  const filterSlates = (b.slate_ids ?? [])
    .map((id) => slates.find((p) => p.id === id))
    .filter((p): p is FinSlate => !!p);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      whileTap={{ transform: 'scale(0.99)' }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      className={cardClass({ interactive: true }, 'group p-4')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{b.name}</div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {b.start_date && b.end_date
              ? format(new Date(b.start_date), 'MMM d') + ' → ' + format(new Date(b.end_date), 'MMM d, yyyy')
              : 'no date limit'}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {/* Budgets never reset, so "next month" is an explicit copy. */}
          <button
            type="button"
            aria-label={`Duplicate ${b.name} for the next period`}
            title="Duplicate for next period"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="grid size-11 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          >
            <Copy className="size-4" />
          </button>
          <Pencil aria-hidden className="size-3.5 text-muted-foreground" />
        </div>
      </div>

      {filterSlates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {filterSlates.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--secondary-container)/0.6)] px-1.5 py-0.5 font-mono text-xs text-foreground/80"
            >
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className={`font-serif text-2xl font-semibold tabular-nums ${overBudget ? 'text-destructive' : ''}`}>
          {formatMoney(b.spent)}
        </div>
        <div className="font-mono text-xs text-muted-foreground tabular-nums">
          of {formatMoney(b.total_amount)}
        </div>
      </div>
      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full"
          style={{ width: pct + '%', backgroundColor: barColor }}
        />
      </div>
      <div className="font-mono text-xs text-muted-foreground mt-1">
        {formatPercent(pct)} used{overBudget && ' · over by ' + formatMoney(b.spent - b.total_amount)}
      </div>

      {b.items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
          {b.items.map((it) => {
            const cat = categories.find((c) => c.id === it.category_id);
            const ipct = it.amount > 0 ? Math.min((it.spent / it.amount) * 100, 100) : 0;
            const iover = it.spent > it.amount;
            return (
              <div key={it.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color || 'hsl(var(--outline))' }} />
                    <span className="text-xs truncate">{cat?.name || 'Uncategorized'}</span>
                  </div>
                  <span className={`font-mono text-xs tabular-nums ${iover ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {formatMoney(it.spent)} / {formatMoney(it.amount)}
                  </span>
                </div>
                <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: ipct + '%',
                      backgroundColor: iover ? 'hsl(var(--destructive))' : (cat?.color || 'hsl(var(--primary))'),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/** Window presets. Pure convenience — they only fill the two dates; there is no
 *  stored period and nothing re-derives them later. */
const WINDOWS: { label: string; range: () => [string, string] }[] = [
  { label: 'This week', range: () => [
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  ] },
  { label: 'This month', range: () => [
    format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  ] },
  { label: 'This year', range: () => [
    format(startOfYear(new Date()), 'yyyy-MM-dd'),
    format(endOfYear(new Date()), 'yyyy-MM-dd'),
  ] },
];

function BudgetDialog({ open, budget, prefill, categories, slates, onClose, onSaved }: {
  open: boolean;
  budget: FinBudget | null;
  /** Values for a new budget — blank, or a duplicate of an existing one. */
  prefill: Prefill | null;
  categories: FinCategory[];
  slates: FinSlate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [name, setName] = useState('');
  const [overall, setOverall] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [slateIds, setSlateIds] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<{ category_id: number | null; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = budget
      ? {
          name: budget.name,
          start_date: budget.start_date,
          end_date: budget.end_date,
          total_amount: budget.total_amount,
          slate_ids: budget.slate_ids ?? [],
          items: budget.items.map((i) => ({ category_id: i.category_id, amount: String(i.amount) })),
        }
      : prefill ?? { name: '', start_date: '', end_date: '', total_amount: 0, slate_ids: [], items: [] };
    setName(src.name);
    setOverall(src.total_amount > 0 ? String(src.total_amount) : '');
    setStartDate(src.start_date);
    setEndDate(src.end_date);
    setSlateIds(new Set(src.slate_ids));
    setItems(src.items);
  }, [budget, prefill, open]);

  const capsTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const addItem = () => setItems([...items, { category_id: null, amount: '' }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<{ category_id: number | null; amount: string }>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const toggleSlate = (id: number) =>
    setSlateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Overall amount is the budget; caps are soft sub-targets. When the user
  // skips the overall field, fall back to the caps sum (old behaviour).
  const total = parseFloat(overall) || capsTotal;
  const canSave = name.trim() !== '' && total > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // The stored window is the real one, and it is optional — a slate-scoped
      // budget is defined by its slate, not by dates.
      const data: BudgetDraft = {
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        total_amount: total,
        slate_ids: Array.from(slateIds),
        items: items
          .filter((i) => parseFloat(i.amount) > 0)
          .map((i) => ({ category_id: i.category_id, amount: parseFloat(i.amount) })),
      };
      if (budget) await finance.updateBudget(budget.id, data);
      else await finance.createBudget(data);
      onSaved();
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!budget) return;
    if (!(await confirmDialog('Delete this budget?'))) return;
    await finance.deleteBudget(budget.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? 'Edit budget' : 'New budget'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Household, Goa trip" />
            </Field>
            <Field label="Overall amount">
              <Input
                type="number"
                inputMode="decimal"
                value={overall}
                onChange={(e) => setOverall(e.target.value)}
                placeholder={capsTotal > 0 ? String(capsTotal) : '0'}
              />
            </Field>
          </div>

          {/* Optional window. Nothing here rolls forward: a budget covers the
              dates you give it, forever. Next month gets its own copy. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Dates <span className="normal-case tracking-normal">(optional)</span>
              </Label>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="rounded-md px-1.5 py-0.5 font-mono text-xs text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {WINDOWS.map((w) => {
                const [s, e] = w.range();
                const on = startDate === s && endDate === e;
                return (
                  <button
                    key={w.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setStartDate(s); setEndDate(e); }}
                    className={cn(
                      'h-9 rounded-full border text-sm font-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                      on
                        ? 'border-transparent bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                        : 'border-[hsl(var(--outline-variant))] text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="">
                <DatePicker value={startDate} onChange={setStartDate} />
              </Field>
              <Field label="">
                <DatePicker value={endDate} onChange={setEndDate} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {startDate && endDate
                ? 'Counts only transactions in this range. It will not roll into the next one — duplicate the budget when the window closes.'
                : 'No dates means every transaction counts, whenever it happened.'}
            </p>
          </div>

          {slates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Count spending from these slates
              </Label>
              <div className="flex flex-wrap gap-2">
                {slates.filter((p) => !p.archived).map((p) => {
                  const on = slateIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSlate(p.id)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]',
                        on
                          ? 'border-transparent bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                          : 'border-[hsl(var(--outline-variant))] text-foreground hover:bg-[hsl(var(--on-surface)/0.06)]',
                      )}
                    >
                      {on
                        ? <Check className="size-3.5" />
                        : <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.color }} />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave this empty and the budget counts Plain only — your normal
                life, with outliers kept out. Pick a slate to budget the outlier
                instead: select Goa trip and nothing else, and this becomes the
                trip's budget.
              </p>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Category caps{capsTotal > 0 ? ` · ${formatMoney(capsTotal)}` : ''}
              </Label>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-3.5 mr-1" /> Add cap
              </Button>
            </div>
            {items.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-2">
                Optional soft caps per category — they warn, they don't block.
                {slateIds.size > 0 && ' Caps count only the slates selected above.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <Select
                      value={it.category_id == null ? 'none' : String(it.category_id)}
                      onValueChange={(v) => updateItem(idx, { category_id: !v || v === 'none' ? null : parseInt(v) })}
                      items={[{ value: 'none', label: '— category —' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="— category —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— category —</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={it.amount}
                      onChange={(e) => updateItem(idx, { amount: e.target.value })}
                      placeholder="Amount"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => removeItem(idx)} aria-label="Remove cap">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {budget ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !canSave}>
              {saving ? 'Saving…' : budget ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>}
      {children}
    </div>
  );
}
