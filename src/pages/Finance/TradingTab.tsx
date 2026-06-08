import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, CircleDollarSign, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { finance, type FinAccount, type FinInvestment } from '@/api';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INVESTMENT_TYPES, TRADING_TYPES, TRADING_TYPE_VALUES, formatMoney } from './utils';
import { ListSkeleton } from './Skeletons';

interface Props {
  accounts: FinAccount[];
  investments: FinInvestment[];
  loaded: boolean;
  reload: () => void;
}

// Types whose price is auto-fetched EOD — they require a market symbol.
const PRICED_TYPES = ['stock', 'etf'];
const EXCHANGES = [{ value: 'NSE', label: 'NSE' }, { value: 'BSE', label: 'BSE' }];

// Compact "x ago" for price freshness. Input is RFC3339 with an IST offset,
// so Date parsing is reliable across browsers.
function priceAge(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 90) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export default function TradingTab({ accounts, investments, loaded, reload }: Props) {
  const [editing, setEditing] = useState<FinInvestment | null>(null);
  const [creating, setCreating] = useState(false);
  const [selling, setSelling] = useState<FinInvestment | null>(null);
  useEffect(() => {}, []);

  const tradingAccounts = useMemo(() => accounts.filter((a) => a.type === 'trading' && !a.archived), [accounts]);

  // Holdings = market instruments only. Open positions show as cards; closed
  // ones drop out but their realized P/L stays in the totals.
  const holdings = useMemo(
    () => investments.filter((i) => TRADING_TYPE_VALUES.includes(i.type)),
    [investments],
  );
  const open = useMemo(() => holdings.filter((i) => i.status !== 'closed'), [holdings]);
  const closed = useMemo(() => holdings.filter((i) => i.status === 'closed'), [holdings]);

  const totals = useMemo(() => {
    let invested = 0, current = 0, realized = 0;
    for (const i of holdings) realized += i.realized_pl;
    for (const i of open) { invested += i.invested_amount; current += i.current_value; }
    const cash = tradingAccounts.reduce((s, a) => s + a.balance, 0);
    const unrealized = current - invested;
    return {
      invested, current, realized, cash,
      unrealized,
      unrealizedPct: invested > 0 ? (unrealized / invested) * 100 : 0,
      assets: cash + current,
    };
  }, [holdings, open, tradingAccounts]);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Invested (open)" value={formatMoney(totals.invested)} />
        <SummaryCard label="Current value" value={formatMoney(totals.current)} tone="primary" />
        <SummaryCard
          label={totals.unrealized >= 0 ? 'Unrealized gain' : 'Unrealized loss'}
          value={(totals.unrealized >= 0 ? '+' : '') + formatMoney(totals.unrealized) + ' · ' + totals.unrealizedPct.toFixed(1) + '%'}
          tone={totals.unrealized >= 0 ? 'primary' : 'destructive'}
        />
        <SummaryCard
          label="Realized P/L"
          value={(totals.realized >= 0 ? '+' : '') + formatMoney(totals.realized)}
          tone={totals.realized >= 0 ? 'primary' : 'destructive'}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Trading cash" value={formatMoney(totals.cash)} icon={Wallet} />
        <SummaryCard label="Total trading assets" value={formatMoney(totals.assets)} icon={CircleDollarSign} tone="primary" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">Trading</h2>
        <Button size="sm" onClick={() => setCreating(true)} disabled={tradingAccounts.length === 0}>
          <Plus className="size-4 mr-1" /> Add trade
        </Button>
      </div>

      {tradingAccounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm text-muted-foreground">
          You need a <strong>trading account</strong> before you can add trades. Create an account of type
          "Trading" in the Accounts tab, then come back here.
        </div>
      )}

      {!loaded && open.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : open.length === 0 && tradingAccounts.length > 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No open positions. Add a stock, ETF, SIP or mutual fund — buying debits your trading account's cash.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {open.map((inv) => {
            const gain = inv.current_value - inv.invested_amount;
            const gainPct = inv.invested_amount > 0 ? (gain / inv.invested_amount) * 100 : 0;
            const positive = gain >= 0;
            return (
              <motion.div
                key={inv.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{inv.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                      {inv.symbol && <span className="text-foreground/60">{inv.symbol}·{inv.exchange} · </span>}
                      {INVESTMENT_TYPES.find((t) => t.value === inv.type)?.label}
                      {inv.quantity > 0 && ' · ' + inv.quantity + ' @ ' + formatMoney(inv.avg_buy_price)}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing(inv)}
                    className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 tap-highlight-none"
                    aria-label="Edit holding"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <div className="font-serif text-2xl font-semibold tabular-nums">
                    {formatMoney(inv.current_value)}
                  </div>
                  <div className={`font-mono text-xs tabular-nums inline-flex items-center gap-1 ${positive ? 'text-primary' : 'text-destructive'}`}>
                    {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {positive ? '+' : ''}{formatMoney(gain)} ({gainPct.toFixed(1)}%)
                  </div>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  Invested {formatMoney(inv.invested_amount)}
                  {inv.realized_pl !== 0 && ' · realized ' + (inv.realized_pl >= 0 ? '+' : '') + formatMoney(inv.realized_pl)}
                </div>

                {/* Auto-priced instruments: last traded price + freshness, or a
                    badge when the last EOD fetch failed (e.g. a bad symbol). */}
                {inv.symbol && (
                  <div className="font-mono text-[10px] mt-1">
                    {inv.price_error ? (
                      <span
                        title={inv.price_error}
                        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5"
                      >
                        <AlertTriangle className="size-2.5" /> price error
                      </span>
                    ) : inv.last_price > 0 ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1.5">
                        <span>LTP <span className="text-foreground tabular-nums">{formatMoney(inv.last_price)}</span></span>
                        {inv.price_at && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                            <Clock className="size-2.5" /> {priceAge(inv.price_at)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70">awaiting first price…</span>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border/50 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setSelling(inv)}>
                    <CircleDollarSign className="size-3.5 mr-1" /> Sell
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <div className="mt-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Closed positions</h3>
          <div className="flex flex-col gap-1.5">
            {closed.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-sm truncate">{inv.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground ml-2">
                    {INVESTMENT_TYPES.find((t) => t.value === inv.type)?.label}
                  </span>
                </div>
                <span className={`font-mono text-xs tabular-nums shrink-0 ${inv.realized_pl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {inv.realized_pl >= 0 ? '+' : ''}{formatMoney(inv.realized_pl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TradeDialog
        open={creating || editing !== null}
        holding={editing}
        tradingAccounts={tradingAccounts}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); reload(); }}
      />
      <SellDialog
        holding={selling}
        onClose={() => setSelling(null)}
        onSold={() => { setSelling(null); reload(); }}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone = 'default', icon: Icon, className = '' }: {
  label: string; value: string; tone?: 'primary' | 'destructive' | 'default'; icon?: typeof Wallet; className?: string;
}) {
  const tones: Record<string, string> = {
    primary: 'text-primary',
    destructive: 'text-destructive',
    default: 'text-foreground',
  };
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {Icon && <Icon className="size-2.5" />}
        {label}
      </div>
      <div className={`font-serif text-xl md:text-2xl font-semibold tabular-nums mt-1 ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function TradeDialog({ open, holding, tradingAccounts, onClose, onSaved }: {
  open: boolean;
  holding: FinInvestment | null;
  tradingAccounts: FinAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('stock');
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('NSE');
  const [accountId, setAccountId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [current, setCurrent] = useState('');
  const [frequency, setFrequency] = useState('lumpsum');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-priced instruments require a market symbol (validated on submit).
  const priced = PRICED_TYPES.includes(type);

  useEffect(() => {
    if (holding) {
      setName(holding.name);
      setType(holding.type);
      setSymbol(holding.symbol || '');
      setExchange(holding.exchange || 'NSE');
      setAccountId(holding.account_id ? String(holding.account_id) : '');
      setQuantity(holding.quantity ? String(holding.quantity) : '');
      setBuyPrice(holding.avg_buy_price ? String(holding.avg_buy_price) : '');
      setCurrent(String(holding.current_value));
      setFrequency(holding.frequency);
      setStartDate(holding.start_date || '');
      setNotes(holding.notes);
    } else {
      setName(''); setType('stock');
      setSymbol(''); setExchange('NSE');
      setAccountId(tradingAccounts[0] ? String(tradingAccounts[0].id) : '');
      setQuantity(''); setBuyPrice(''); setCurrent('');
      setFrequency('lumpsum'); setStartDate(''); setNotes('');
    }
  }, [holding, open, tradingAccounts]);

  // Default frequency mirrors the backend: SIPs recur monthly, the rest are
  // one-off (lumpsum).
  useEffect(() => {
    if (!holding) setFrequency(type === 'sip' ? 'monthly' : 'lumpsum');
  }, [type, holding]);

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(buyPrice) || 0;
  const invested = qty > 0 && price > 0 ? qty * price : 0;

  const save = async () => {
    if (!name.trim() || !accountId) return;
    if (priced && !symbol.trim()) {
      toast.error('Enter the stock symbol, e.g. RELIANCE');
      return;
    }
    const data: any = {
      name: name.trim(),
      type,
      account_id: parseInt(accountId),
      quantity: qty,
      avg_buy_price: price,
      invested_amount: invested,
      current_value: parseFloat(current) || invested,
      frequency,
      start_date: startDate || null,
      notes,
      symbol: priced ? symbol.trim().toUpperCase() : '',
      exchange: priced ? exchange : '',
    };
    setSaving(true);
    try {
      // createInvestment validates the symbol on the server (validate-on-submit):
      // a typo surfaces here as the thrown error message.
      if (holding) {
        await finance.updateInvestment(holding.id, data);
      } else {
        await finance.createInvestment(data);
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the trade');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!holding) return;
    if (!(await confirmDialog('Delete this holding? This does not refund the trading account.'))) return;
    await finance.deleteInvestment(holding.id);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{holding ? 'Edit holding' : 'New trade'}</DialogTitle>
        </DialogHeader>
        {!holding && (
          <div className="text-xs text-muted-foreground -mt-2">
            Buying debits the trading account's cash by {formatMoney(invested)}.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. INFY, Nifty 50 ETF" />
          </Field>
          {priced && (
            <>
              <Field label="Symbol">
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. RELIANCE"
                  className="font-mono uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Exchange">
                <Select value={exchange} onValueChange={(v) => setExchange(v ?? 'NSE')} items={EXCHANGES}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXCHANGES.map((x) => (
                      <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType(v ?? 'stock')} items={TRADING_TYPES}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRADING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Trading account">
            <Select
              value={accountId}
              onValueChange={(v) => setAccountId(v ?? '')}
              items={tradingAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
            >
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {tradingAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quantity (units)">
            <Input type="number" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 10" />
          </Field>
          <Field label="Buy price / unit">
            <Input type="number" inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="e.g. 1450" />
          </Field>
          <Field label="Invested">
            <Input value={formatMoney(invested)} disabled />
          </Field>
          <Field label="Current value">
            <Input type="number" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Defaults to invested" />
          </Field>
          <Field label="Frequency">
            <Select value={frequency} onValueChange={(v) => setFrequency(v ?? 'lumpsum')}
              items={[{ value: 'lumpsum', label: 'Lumpsum' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }]}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lumpsum">Lumpsum</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Buy date">
            <DatePicker value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {holding ? (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name.trim() || !accountId || (priced && !symbol.trim())}>
              {saving ? 'Saving…' : holding ? 'Save' : 'Buy'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SellDialog({ holding, onClose, onSold }: {
  holding: FinInvestment | null;
  onClose: () => void;
  onSold: () => void;
}) {
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  const hasUnits = !!holding && holding.quantity > 0;

  useEffect(() => {
    if (holding) {
      setUnits(holding.quantity ? String(holding.quantity) : '');
      setPrice('');
      setAmount('');
      setDate('');
    }
  }, [holding]);

  if (!holding) return null;

  const sellUnits = parseFloat(units) || 0;
  const sellPrice = parseFloat(price) || 0;
  const proceeds = hasUnits ? sellUnits * sellPrice : (parseFloat(amount) || 0);
  const costSold = hasUnits ? sellUnits * holding.avg_buy_price : holding.invested_amount;
  const estGain = proceeds - costSold;
  const fullExit = !hasUnits || sellUnits >= holding.quantity;

  const sell = async () => {
    if (proceeds <= 0) return;
    await finance.sellInvestment(holding.id, hasUnits
      ? { units: sellUnits, price: sellPrice, date: date || undefined }
      : { amount: proceeds, date: date || undefined });
    onSold();
  };

  return (
    <Dialog open={!!holding} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sell · {holding.name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          Proceeds are credited to the trading account. {hasUnits ? `${holding.quantity} units held @ ${formatMoney(holding.avg_buy_price)}.` : 'No unit tracking — sell the whole holding by total amount.'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {hasUnits ? (
            <>
              <Field label="Units to sell">
                <Input type="number" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} placeholder={String(holding.quantity)} />
              </Field>
              <Field label="Sell price / unit">
                <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 1600" />
              </Field>
            </>
          ) : (
            <Field label="Total proceeds" className="col-span-2">
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 18000" />
            </Field>
          )}
          <Field label="Date" className="col-span-2">
            <DatePicker value={date} onChange={setDate} />
          </Field>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-sm flex flex-col gap-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Proceeds</span><span className="tabular-nums">{formatMoney(proceeds)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cost of sold</span><span className="tabular-nums">{formatMoney(costSold)}</span></div>
          <div className="flex justify-between font-medium">
            <span>Realized {estGain >= 0 ? 'gain' : 'loss'}</span>
            <span className={`tabular-nums ${estGain >= 0 ? 'text-primary' : 'text-destructive'}`}>{estGain >= 0 ? '+' : ''}{formatMoney(estGain)}</span>
          </div>
          {fullExit && <div className="font-mono text-[10px] text-muted-foreground">Closes the position.</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={sell} disabled={proceeds <= 0}>Sell</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
