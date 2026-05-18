import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { Plus, Pencil, Trash2 } from 'lucide-react';

import { finance, type FinBudget, type FinCategory } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from './utils';
import { CardsSkeleton } from './Skeletons';

interface Props {
  budgets: FinBudget[];
  categories: FinCategory[];
  loaded: boolean;
  reload: () => void;
}

export default function BudgetsTab({ budgets, categories, loaded, reload }: Props) {
  const [editing, setEditing] = useState<FinBudget | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {}, []);
  const expenseCats = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Budgets</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> New budget
        </Button>
      </div>

      {!loaded && budgets.length === 0 ? (
        <CardsSkeleton count={3} />
      ) : budgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No budgets yet. Create one to plan a month or campaign.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {budgets.map((b) => {
            const pct = b.total_amount > 0 ? Math.min((b.spent / b.total_amount) * 100, 100) : 0;
            const overBudget = b.spent > b.total_amount;
            return (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setEditing(b)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditing(b); }}
                className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all tap-highlight-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {format(new Date(b.start_date), 'MMM d')} → {format(new Date(b.end_date), 'MMM d, yyyy')}
                    </div>
                  </div>
                  <Pencil className="size-3.5 text-muted-foreground shrink-0 mt-1" />
                </div>

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
                    className="h-full transition-all"
                    style={{
                      width: pct + '%',
                      backgroundColor: overBudget ? 'hsl(var(--destructive))' : pct > 80 ? '#F59E0B' : 'hsl(var(--primary))',
                    }}
                  />
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  {pct.toFixed(0)}% used{overBudget && ' · over by ' + formatMoney(b.spent - b.total_amount)}
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
                              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color || '#6B7280' }} />
                              <span className="text-xs truncate">{cat?.name || 'Uncategorized'}</span>
                            </div>
                            <span className={`font-mono text-[10px] tabular-nums ${iover ? 'text-destructive' : 'text-muted-foreground'}`}>
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
          })}
        </div>
      )}

      <BudgetDialog
        open={creating || editing !== null}
        budget={editing}
        categories={expenseCats}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />
    </div>
  );
}

function BudgetDialog({ open, budget, categories, onClose, onSaved }: {
  open: boolean;
  budget: FinBudget | null;
  categories: FinCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [items, setItems] = useState<{ category_id: number | null; amount: string }[]>([]);

  useEffect(() => {
    if (budget) {
      setName(budget.name);
      setPeriod(budget.period);
      setStartDate(budget.start_date);
      setEndDate(budget.end_date);
      setItems(budget.items.map((i) => ({ category_id: i.category_id, amount: String(i.amount) })));
    } else {
      setName('');
      setPeriod('monthly');
      setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
      setItems([]);
    }
  }, [budget, open]);

  // When period changes, snap to current month
  useEffect(() => {
    if (period === 'monthly' && !budget) {
      setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    }
  }, [period, budget]);

  const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const addItem = () => setItems([...items, { category_id: null, amount: '' }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<{ category_id: number | null; amount: string }>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      period,
      start_date: startDate,
      end_date: endDate,
      total_amount: total,
      items: items
        .filter((i) => parseFloat(i.amount) > 0)
        .map((i) => ({ category_id: i.category_id, amount: parseFloat(i.amount) })),
    };
    if (budget) {
      await finance.updateBudget(budget.id, data);
    } else {
      await finance.createBudget(data);
    }
    onSaved();
  };

  const remove = async () => {
    if (!budget) return;
    if (!window.confirm('Delete this budget?')) return;
    await finance.deleteBudget(budget.id);
    onSaved();
  };

  const nextMonth = () => {
    const next = addMonths(new Date(startDate), 1);
    setStartDate(format(startOfMonth(next), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(next), 'yyyy-MM-dd'));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? 'Edit budget' : 'New budget'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. May 2026" />
          </Field>
          <Field label="Period">
            <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {period === 'monthly' && !budget && (
            <Field label="">
              <Button variant="outline" size="sm" onClick={nextMonth}>Next month →</Button>
            </Field>
          )}
          <Field label="Start">
            <DatePicker value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="End">
            <DatePicker value={endDate} onChange={setEndDate} />
          </Field>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Category caps · Total {formatMoney(total)}
            </Label>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="size-3.5 mr-1" /> Add cap
            </Button>
          </div>
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">
              Optional — leave empty to track as one overall pool.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <Select
                    value={it.category_id == null ? 'none' : String(it.category_id)}
                    onValueChange={(v) => updateItem(idx, { category_id: !v || v === 'none' ? null : parseInt(v) })}
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
                  <Button variant="ghost" size="icon-sm" onClick={() => removeItem(idx)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {budget ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>{budget ? 'Save' : 'Create'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>}
      {children}
    </div>
  );
}
