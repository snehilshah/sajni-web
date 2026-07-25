import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, startOfMonth, subMonths } from 'date-fns';
import {
  LayoutDashboard, Landmark, ArrowLeftRight, PiggyBank,
  TrendingUp, CreditCard, Download, Receipt, Wallet,
  Eye, VenetianMask,
} from '@/components/ui/icons';

import {
  finance,
  type FinAccount, type FinCategory, type FinTransaction,
  type FinInvestment, type FinSaving, type FinStatement,
} from '@/api';
import {
  useFinAccounts, useFinCategories, useFinTransactions,
  useFinInvestments, useFinSavings, useFinStatements, useFinSlates,
} from '@/queries/finance';
import { qk } from '@/queries/keys';
import OverviewTab from './OverviewTab';
import AccountsTab from './AccountsTab';
import TransactionsTab from './TransactionsTab';
import BudgetsTab from './BudgetsTab';
import InvestmentsTab from './InvestmentsTab';
import CardsTab from './CardsTab';
import BillersTab from './BillersTab';
import SlatesTab from './SlatesTab';
import { FinancePrivacyProvider } from './FinancePrivacyProvider';
import { downloadCSV, isPrivacyMode, setPrivacyMode, revealExpiry } from './utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { cn } from '@/lib/utils';

/** Server-side max for GET /finance/transactions. */
const TXN_LIMIT = 1000;

// Exported so other Finance screens render the same secondary bar.
export const financeTabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'slates', label: 'Slates', icon: Wallet },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank },
  { id: 'billers', label: 'Billers', icon: Receipt },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'cards', label: 'Cards', icon: CreditCard },
] as const;
type TabId = (typeof financeTabs)[number]['id'];

// Centralized data: every tab reads from this so navigation is instant.
// Each loader is lazy + cached so we only fetch on first need + on reload.
export interface FinanceData {
  accounts: FinAccount[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  investments: FinInvestment[];
  savings: FinSaving[];
  statements: FinStatement[];
  loaded: {
    accounts: boolean;
    categories: boolean;
    transactions: boolean;
    investments: boolean;
    savings: boolean;
    statements: boolean;
  };
}

export default function FinancePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const active: TabId = useMemo(
    () => (financeTabs.find((t) => t.id === tab)?.id as TabId) || 'overview',
    [tab],
  );

  const qc = useQueryClient();

  // Heavy per-tab sets load lazily: a query turns on once its tab has been
  // visited, then stays cached. accounts + categories are cheap and always on.
  const [activated, setActivated] = useState<Set<string>>(() => new Set([active]));
  useEffect(() => {
    setActivated((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);
  const want = (k: string) => activated.has(k);

  // Slate filter: null = off, N = that slate. Plain is a real row, no sentinel.
  // The transactions query is params-keyed, so each filter caches separately.
  const [slateFilter, setSlateFilter] = useState<number | null>(null);
  // The ledger reports per-day/week/month totals, so a bare row cap is not just
  // truncation — it silently produces a WRONG total for whichever period the
  // cap lands inside. Bounding by date instead makes every period returned a
  // complete one. TXN_LIMIT is the server's max and only a backstop; if it is
  // ever hit, TransactionsTab drops its oldest (provably partial) day.
  const [monthsBack, setMonthsBack] = useState(2);
  const txnParams = useMemo(() => {
    const from = format(startOfMonth(subMonths(new Date(), monthsBack)), 'yyyy-MM-dd');
    return slateFilter === null
      ? { from, limit: TXN_LIMIT }
      : { from, limit: TXN_LIMIT, slate_id: slateFilter };
  }, [slateFilter, monthsBack]);

  const accountsQ = useFinAccounts();
  const categoriesQ = useFinCategories();
  // Archived slates are opt-in. Every other consumer filters `!archived`, so
  // pulling them in only affects the Slates tab, which is what asked for them.
  const [showArchived, setShowArchived] = useState(false);
  const slatesQ = useFinSlates(showArchived); // cheap; powers the Slates tab + txn dialogs
  const transactionsQ = useFinTransactions(txnParams, want('transactions'));
  const investmentsQ = useFinInvestments(want('investments'));
  const savingsQ = useFinSavings(want('accounts'));
  const statementsQ = useFinStatements(want('cards'));

  const data: FinanceData = {
    accounts: accountsQ.data ?? [],
    categories: categoriesQ.data ?? [],
    transactions: transactionsQ.data ?? [],
    investments: investmentsQ.data ?? [],
    savings: savingsQ.data ?? [],
    statements: statementsQ.data ?? [],
    loaded: {
      accounts: accountsQ.isSuccess,
      categories: categoriesQ.isSuccess,
      transactions: transactionsQ.isSuccess,
      investments: investmentsQ.isSuccess,
      savings: savingsQ.isSuccess,
      statements: statementsQ.isSuccess,
    },
  };
  const slates = slatesQ.data ?? { items: [] };

  // Tabs call these after their own writes; the InvalidateBridge calls the same
  // root on AI finance events. Either way every enabled finance query refetches.
  const reloadAll = () => qc.invalidateQueries({ queryKey: qk.finance.all });
  const loadCategories = () => qc.invalidateQueries({ queryKey: qk.finance.categories() });
  const loadAccounts = () => qc.invalidateQueries({ queryKey: qk.finance.accounts() });
  const loadSavings = () => qc.invalidateQueries({ queryKey: qk.finance.savings() });
  // Prefix (no params) so every slate-filtered variant refetches too.
  const loadTransactions = () => qc.invalidateQueries({ queryKey: ['finance', 'transactions'] });
  const loadInvestments = () => qc.invalidateQueries({ queryKey: qk.finance.investments() });
  const loadStatements = () => qc.invalidateQueries({ queryKey: qk.finance.statements() });
  // Prefix (no flag) so the archived-inclusive variant refetches too.
  const loadSlates = () => qc.invalidateQueries({ queryKey: ['finance', 'slates'] });

  const [exportOpen, setExportOpen] = useState(false);
  // Local state is the re-render driver. setPrivacyMode() updates the module flag
  // (read by every formatMoney across all tabs) + localStorage; setPrivacy() then
  // forces this component — and its always-mounted tab children — to re-render,
  // so figures flip live without a reload.
  const [privacy, setPrivacy] = useState<boolean>(isPrivacyMode());
  const togglePrivacy = () => {
    const next = !privacy;
    setPrivacyMode(next);
    setPrivacy(next);
  };

  // A reveal only lasts 30 minutes. While revealed, arm a timer to the stored
  // expiry, and re-check on visibilitychange — a laptop that slept through the
  // window re-hides the moment the tab is visible again (suspended timers
  // don't fire on time). Privacy state lives at the page root so the timer can
  // re-hide figures without disturbing tab state or cached data.
  useEffect(() => {
    if (privacy) return;
    const rehide = () => { setPrivacyMode(true); setPrivacy(true); };
    const until = revealExpiry();
    if (until === null || Date.now() >= until) { rehide(); return; }
    const timer = setTimeout(rehide, until - Date.now());
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const u = revealExpiry();
      if (u === null || Date.now() >= u) rehide();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [privacy]);

  const setActive = (id: TabId) => {
    navigate(id === 'overview' ? '/finance' : '/finance/' + id, { replace: true });
  };

  return (
    <FinancePrivacyProvider value={privacy}>
      <PageShell
      title="Finance"
      hideScrollbar
      contentClassName="max-w-6xl w-full mx-auto px-3 md:px-8 py-5 pb-20 relative"
      actions={
        <FinanceHeaderActions
          privacy={privacy}
          onTogglePrivacy={togglePrivacy}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
        />
      }
      navigation={
        <PageShellTabs
          bare
          ariaLabel="Finance sections"
          value={active}
          options={financeTabs.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
          onChange={setActive}
        />
      }
      >
      <div className="relative">
        {/* Privacy is context-driven so this data-owning subtree stays mounted
            and its fetch effects do not run again when figures are toggled. */}

        {/* All tabs always mounted; only active is visible.
            This eliminates the "wrong UI flash" entirely - content for every
            tab is already in the DOM by the time the user taps it. */}
        <TabPanel active={active === 'overview'}>
          <OverviewTab accounts={data.accounts} />
        </TabPanel>
        <TabPanel active={active === 'accounts'}>
          <AccountsTab
            accounts={data.accounts}
            categories={data.categories}
            savings={data.savings}
            loaded={data.loaded.accounts}
            reload={() => { loadAccounts(); loadSavings(); loadTransactions(); }}
          />
        </TabPanel>
        <TabPanel active={active === 'transactions'}>
          <TransactionsTab
            accounts={data.accounts}
            categories={data.categories}
            slates={slates.items}
            transactions={data.transactions}
            loaded={data.loaded.transactions}
            slateFilter={slateFilter}
            onSlateFilter={setSlateFilter}
            truncated={data.transactions.length >= TXN_LIMIT}
            canLoadEarlier={data.loaded.transactions}
            onLoadEarlier={() => setMonthsBack((n) => n + 3)}
            reload={() => { loadTransactions(); loadAccounts(); loadSlates(); }}
            reloadCategories={loadCategories}
          />
        </TabPanel>
        <TabPanel active={active === 'slates'}>
          <SlatesTab
            slates={slates.items}
            loaded={slatesQ.isSuccess}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
            // Opening a slate is just the ledger filtered to it — same list,
            // same sweep, no second implementation of a transaction list.
            onOpenSlate={(id) => { setSlateFilter(id); setActive('transactions'); }}
          />
        </TabPanel>
        <TabPanel active={active === 'budgets'}>
          <BudgetsTab
            categories={data.categories}
            slates={slates.items}
            reloadCategories={loadCategories}
          />
        </TabPanel>
        <TabPanel active={active === 'investments'}>
          <InvestmentsTab
            accounts={data.accounts}
            investments={data.investments}
            loaded={data.loaded.investments}
            reload={loadInvestments}
          />
        </TabPanel>
        <TabPanel active={active === 'billers'}>
          <BillersTab accounts={data.accounts} categories={data.categories} />
        </TabPanel>
        <TabPanel active={active === 'cards'}>
          <CardsTab
            accounts={data.accounts}
            statements={data.statements}
            loaded={data.loaded.statements}
            reload={loadStatements}
          />
        </TabPanel>

        {/* Hidden absolute reload helper for global refresh after deep mutations */}
        <Input type="hidden" data-reload-all onClick={reloadAll} />
      </div>
      </PageShell>
    </FinancePrivacyProvider>
  );
}

function FinanceHeaderActions({
  privacy,
  onTogglePrivacy,
  exportOpen,
  setExportOpen,
}: {
  privacy: boolean;
  onTogglePrivacy: () => void;
  exportOpen: boolean;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={privacy ? 'tonal' : 'outline'}
        size="sm"
        onClick={onTogglePrivacy}
        aria-pressed={privacy}
        title={privacy ? 'Privacy on - figures hidden. Tap to reveal.' : 'Hide all figures'}
        className={cn(
          'relative h-10 w-10 px-0 sm:w-auto sm:px-3 sm:gap-1.5 font-mono text-xs uppercase tracking-wider',
          privacy && 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))]',
        )}
      >
        {privacy ? <VenetianMask className="size-3.5" /> : <Eye className="size-3.5" />}
        <span className="hidden sm:inline">{privacy ? 'Private' : 'Privacy'}</span>
        {privacy && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[hsl(var(--primary))] ring-2 ring-[hsl(var(--surface-container-low))] motion-safe:animate-pulse" />
        )}
      </Button>

      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExportOpen((v) => !v)}
          className="h-10 w-10 px-0 sm:w-auto sm:px-3 sm:gap-1.5 font-mono text-xs uppercase tracking-wider"
          aria-expanded={exportOpen}
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>

        {exportOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
            <motion.div
              initial={{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }}
              animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 mt-2 w-60 rounded-2xl border border-[hsl(var(--outline-variant))] bg-[hsl(var(--surface-container-high))] shadow-[var(--m3-elev-2)] z-40 p-1.5 text-sm origin-top-right"
            >
              {[
                { label: 'Transactions (.csv)', kind: 'transactions' as const, file: 'sajni_transactions.csv' },
                { label: 'Budgets (.csv)', kind: 'budgets' as const, file: 'sajni_budgets.csv' },
                { label: 'Net worth history (.csv)', kind: 'networth' as const, file: 'sajni_networth.csv' },
              ].map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={async () => {
                    setExportOpen(false);
                    try { await downloadCSV(finance.exportUrl(opt.kind), opt.file); }
                    catch (e) { console.error(e); }
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--on-surface)/0.08)] active:bg-[hsl(var(--on-surface)/0.12)]"
                >
                  {opt.label}
                </button>
              ))}
              <div className="mx-1 mt-1 border-t border-border px-2 py-2 text-xs text-muted-foreground font-mono">
                Open with Google Sheets, then File / Import
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Hidden tabs stay mounted (instant re-entry, preserved scroll) but
  // become `inert` so their descendants are unfocusable. Previously we
  // only set `tabIndex={-1}` on the wrapper — descendants (the M3
  // SelectTriggers in TransactionsTab et al.) stayed focusable, so
  // when the user switched tabs the browser would walk down DOM order
  // and land on a hidden dropdown, opening it on Space/Enter.
  //
  // `inert` blocks all interaction + focus + tabbing in one shot and is
  // supported in every shipped browser at this point. We keep
  // aria-hidden for assistive-tech parity.
  const inertProps: { inert?: boolean } = active ? {} : { inert: true };
  return (
    <motion.div
      {...inertProps}
      initial={false}
      animate={{ opacity: active ? 1 : 0, transform: active ? 'translateY(0)' : 'translateY(3px)' }}
      transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        position: active ? 'relative' : 'absolute',
        top: active ? 'auto' : 0,
        left: active ? 'auto' : 0,
        right: active ? 'auto' : 0,
        pointerEvents: active ? 'auto' : 'none',
      }}
      aria-hidden={!active}
    >
      {children}
    </motion.div>
  );
}
