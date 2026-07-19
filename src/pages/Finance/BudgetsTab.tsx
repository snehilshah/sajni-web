import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, parse, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags, ChevronLeft, ChevronRight, Check } from '@/components/ui/icons';

import { finance, type BudgetDraft, type FinBudget, type FinCategory, type FinPocket } from '@/api';
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
import { SegmentedButton } from '@/components/ui/segmented-button';
import { useFinanceFormatters } from './useFinancePrivacy';
import { CardsSkeleton } from './Skeletons';
import CategoryManager from './CategoryManager';
import { cn } from '@/lib/utils';

interface Props {
  categories: FinCategory[];
  pockets: FinPocket[];
  reloadCategories: () => void;
}

const currentMonth = () => format(new Date(), 'yyyy-MM');

export default function BudgetsTab({ categories, pockets, reloadCategories }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinBudget | null>(null);
  const [creating, setCreating] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  // Which month the MONTHLY (rolling) budgets are windowed to. undefined =
  // current month (live view); 'YYYY-MM' = history. Custom budgets are
  // unaffected by this — their window is their stored date range.
  const [month, setMonth] = useState<string | undefined>(undefined);

  const { data: budgets = [], isSuccess } = useFinBudgets(month);
  const reload = () => qc.invalidateQueries({ queryKey: qk.finance.all });

  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  const monthly = budgets.filter((b) => b.period === 'monthly');
  const custom = budgets.filter((b) => b.period !== 'monthly');

  const shownMonth = month ?? currentMonth();
  const shownDate = parse(shownMonth, 'yyyy-MM', new Date());
  const atCurrent = shownMonth === currentMonth();
  const nav = (dir: -1 | 1) => {
    const next = format(dir === -1 ? subMonths(shownDate, 1) : addMonths(shownDate, 1), 'yyyy-MM');
    setMonth(next === currentMonth() ? undefined : next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Budgets</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setManageCats(true)}>
            <Tags className="size-4 mr-1" /> Categories
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> New budget
          </Button>
        </div>
      </div>

      {!isSuccess && budgets.length === 0 ? (
        <CardsSkeleton count={3} />
      ) : budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No budgets yet. A monthly budget rolls with the calendar on its own;
          a custom one covers a date range — a trip, a project.
        </div>
      ) : (
        <>
          {/* Monthly (rolling) */}
          {monthly.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Monthly</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => nav(-1)}
                    aria-label="Previous month"
                    className="grid size-9 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="min-w-[110px] text-center text-sm font-medium tabular-nums">
                    {format(shownDate, 'MMMM yyyy')}
                  </span>
                  <button
                    type="button"
                    onClick={() => nav(1)}
                    disabled={atCurrent}
                    aria-label="Next month"
                    className="grid size-9 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] disabled:opacity-35 disabled:pointer-events-none"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {monthly.map((b) => (
                  <BudgetCard key={b.id} budget={b} categories={categories} pockets={pockets} onOpen={() => setEditing(b)} />
                ))}
              </div>
            </section>
          )}

          {/* Trips & custom ranges */}
          {custom.length > 0 && (
            <section className="flex flex-col gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Trips &amp; custom</span>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {custom.map((b) => (
                  <BudgetCard key={b.id} budget={b} categories={categories} pockets={pockets} onOpen={() => setEditing(b)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <BudgetDialog
        open={creating || editing !== null}
        budget={editing}
        categories={expenseCats}
        pockets={pockets}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
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

function BudgetCard({ budget: b, categories, pockets, onOpen }: {
  budget: FinBudget;
  categories: FinCategory[];
  pockets: FinPocket[];
  onOpen: () => void;
}) {
  const { formatMoney, formatPercent } = useFinanceFormatters();
  const pct = b.total_amount > 0 ? Math.min((b.spent / b.total_amount) * 100, 100) : 0;
  const overBudget = b.spent > b.total_amount;
  // Progress tone escalates on tokens only: calm → attention (>80%) → over.
  const barColor = overBudget
    ? 'hsl(var(--destructive))'
    : pct > 80 ? 'hsl(var(--tertiary))' : 'hsl(var(--primary))';
  const filterPockets = b.pocket_ids
    .map((id) => pockets.find((p) => p.id === id))
    .filter((p): p is FinPocket => !!p);

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
      className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-[border-color,box-shadow] tap-highlight-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{b.name}</div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {b.period === 'monthly'
              ? format(new Date(b.window_start), 'MMMM yyyy') + ' · rolls monthly'
              : format(new Date(b.window_start), 'MMM d') + ' → ' + format(new Date(b.window_end), 'MMM d, yyyy')}
          </div>
        </div>
        <Pencil className="size-3.5 text-muted-foreground shrink-0 mt-1" />
      </div>

      {filterPockets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {filterPockets.map((p) => (
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

function BudgetDialog({ open, budget, categories, pockets, onClose, onSaved }: {
  open: boolean;
  budget: FinBudget | null;
  categories: FinCategory[];
  pockets: FinPocket[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formatMoney } = useFinanceFormatters();
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'custom'>('monthly');
  const [overall, setOverall] = useState('');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [pocketIds, setPocketIds] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<{ category_id: number | null; amount: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (budget) {
      setName(budget.name);
      setPeriod(budget.period);
      setOverall(budget.total_amount > 0 ? String(budget.total_amount) : '');
      setStartDate(budget.start_date);
      setEndDate(budget.end_date);
      setPocketIds(new Set(budget.pocket_ids));
      setItems(budget.items.map((i) => ({ category_id: i.category_id, amount: String(i.amount) })));
    } else {
      setName('');
      setPeriod('monthly');
      setOverall('');
      setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
      setPocketIds(new Set());
      setItems([]);
    }
  }, [budget, open]);

  const capsTotal = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const addItem = () => setItems([...items, { category_id: null, amount: '' }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<{ category_id: number | null; amount: string }>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const togglePocket = (id: number) =>
    setPocketIds((prev) => {
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
      // Monthly windows are computed per-month on read; the stored dates just
      // satisfy legacy readers, so pin them to the current month.
      const data: BudgetDraft = {
        name: name.trim(),
        period,
        start_date: period === 'monthly' ? format(startOfMonth(new Date()), 'yyyy-MM-dd') : startDate,
        end_date: period === 'monthly' ? format(endOfMonth(new Date()), 'yyyy-MM-dd') : endDate,
        total_amount: total,
        pocket_ids: period === 'custom' ? Array.from(pocketIds) : [],
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
          <SegmentedButton
            value={period}
            onChange={setPeriod}
            stretch
            aria-label="Budget period"
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'custom', label: 'Custom range' },
            ]}
          />
          <p className="text-xs text-muted-foreground -mt-1">
            {period === 'monthly'
              ? 'Rolls with the calendar month automatically — no dates to manage.'
              : 'Fixed date range — a trip, a project, a season.'}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={period === 'monthly' ? 'e.g. Household' : 'e.g. Goa Trip'} />
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
            {period === 'custom' && (
              <>
                <Field label="Start">
                  <DatePicker value={startDate} onChange={setStartDate} />
                </Field>
                <Field label="End">
                  <DatePicker value={endDate} onChange={setEndDate} />
                </Field>
              </>
            )}
          </div>

          {period === 'custom' && pockets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Count only these pockets
              </Label>
              <div className="flex flex-wrap gap-2">
                {pockets.filter((p) => !p.archived).map((p) => {
                  const on = pocketIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePocket(p.id)}
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
                Nothing selected = every expense in the range counts. General
                (unpocketed) spends are excluded once you pick pockets.
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
                {period === 'custom' && pocketIds.size > 0 && ' Caps count only the pockets selected above.'}
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
