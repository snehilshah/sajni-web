import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Landmark, ArrowLeftRight, PiggyBank,
  TrendingUp, CreditCard, Download, Receipt, CandlestickChart,
  Eye, VenetianMask,
} from '@/components/ui/icons';

import {
  finance,
  type FinAccount, type FinCategory, type FinTransaction,
  type FinBudget, type FinInvestment, type FinSaving, type FinStatement,
} from '@/api';
import {
  useFinAccounts, useFinCategories, useFinTransactions, useFinBudgets,
  useFinInvestments, useFinSavings, useFinStatements,
} from '@/queries/finance';
import { qk } from '@/queries/keys';
import OverviewTab from './OverviewTab';
import AccountsTab from './AccountsTab';
import TransactionsTab from './TransactionsTab';
import BudgetsTab from './BudgetsTab';
import InvestmentsTab from './InvestmentsTab';
import TradingTab from './TradingTab';
import CardsTab from './CardsTab';
import BillersTab from './BillersTab';
import { downloadCSV, isPrivacyMode, setPrivacyMode } from './utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PageShell, { PageShellTabs } from '@/components/PageShell';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'budgets', label: 'Budgets', icon: PiggyBank },
  { id: 'billers', label: 'Billers', icon: Receipt },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'trading', label: 'Trading', icon: CandlestickChart },
  { id: 'cards', label: 'Cards', icon: CreditCard },
] as const;
type TabId = (typeof tabs)[number]['id'];

// Centralized data: every tab reads from this so navigation is instant.
// Each loader is lazy + cached so we only fetch on first need + on reload.
export interface FinanceData {
  accounts: FinAccount[];
  categories: FinCategory[];
  transactions: FinTransaction[];
  budgets: FinBudget[];
  investments: FinInvestment[];
  savings: FinSaving[];
  statements: FinStatement[];
  loaded: {
    accounts: boolean;
    categories: boolean;
    transactions: boolean;
    budgets: boolean;
    investments: boolean;
    savings: boolean;
    statements: boolean;
  };
}

export default function FinancePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const active: TabId = useMemo(
    () => (tabs.find((t) => t.id === tab)?.id as TabId) || 'overview',
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

  const accountsQ = useFinAccounts();
  const categoriesQ = useFinCategories();
  const transactionsQ = useFinTransactions({ limit: 200 }, want('transactions'));
  const budgetsQ = useFinBudgets(want('budgets'));
  const investmentsQ = useFinInvestments(want('investments') || want('trading'));
  const savingsQ = useFinSavings(want('accounts'));
  const statementsQ = useFinStatements(want('cards'));

  const data: FinanceData = {
    accounts: accountsQ.data ?? [],
    categories: categoriesQ.data ?? [],
    transactions: transactionsQ.data ?? [],
    budgets: budgetsQ.data ?? [],
    investments: investmentsQ.data ?? [],
    savings: savingsQ.data ?? [],
    statements: statementsQ.data ?? [],
    loaded: {
      accounts: accountsQ.isSuccess,
      categories: categoriesQ.isSuccess,
      transactions: transactionsQ.isSuccess,
      budgets: budgetsQ.isSuccess,
      investments: investmentsQ.isSuccess,
      savings: savingsQ.isSuccess,
      statements: statementsQ.isSuccess,
    },
  };

  // Tabs call these after their own writes; the InvalidateBridge calls the same
  // root on AI finance events. Either way every enabled finance query refetches.
  const reloadAll = () => qc.invalidateQueries({ queryKey: qk.finance.all });
  const loadCategories = () => qc.invalidateQueries({ queryKey: qk.finance.categories() });
  const loadAccounts = () => qc.invalidateQueries({ queryKey: qk.finance.accounts() });
  const loadSavings = () => qc.invalidateQueries({ queryKey: qk.finance.savings() });
  const loadTransactions = () => qc.invalidateQueries({ queryKey: qk.finance.transactions({ limit: 200 }) });
  const loadBudgets = () => qc.invalidateQueries({ queryKey: qk.finance.budgets() });
  const loadInvestments = () => qc.invalidateQueries({ queryKey: qk.finance.investments() });
  const loadStatements = () => qc.invalidateQueries({ queryKey: qk.finance.statements() });

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

  const setActive = (id: TabId) => {
    navigate(id === 'overview' ? '/finance' : '/finance/' + id, { replace: true });
  };

  return (
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
          options={tabs.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
          onChange={setActive}
        />
      }
    >
      {/* key changes with privacy so the whole tab subtree remounts on toggle.
          The React Compiler memoizes each formatMoney(x) on x alone - it can't
          see the module-level privacy flag - so a plain re-render reuses the
          cached (real) figures. Remounting gives a fresh compiler cache, which
          recomputes every figure against the current flag. The PageShell scroll
          container stays mounted, so scroll position is preserved. */}
      <div key={privacy ? 'priv' : 'real'} className="relative">
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
            transactions={data.transactions}
            loaded={data.loaded.transactions}
            reload={() => { loadTransactions(); loadAccounts(); }}
            reloadCategories={loadCategories}
          />
        </TabPanel>
        <TabPanel active={active === 'budgets'}>
          <BudgetsTab
            budgets={data.budgets}
            categories={data.categories}
            loaded={data.loaded.budgets}
            reload={loadBudgets}
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
        <TabPanel active={active === 'trading'}>
          <TradingTab
            accounts={data.accounts}
            investments={data.investments}
            loaded={data.loaded.investments}
            reload={() => { loadInvestments(); loadAccounts(); }}
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
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
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
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 3 }}
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
