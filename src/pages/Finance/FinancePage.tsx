import { useEffect, useMemo, useState } from 'react';
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
    <div className="flex flex-col h-dvh overflow-hidden page-fade-in">
      <header className="border-b border-border bg-background sticky top-0 z-20 shrink-0">
        <div className="px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mono text-xs uppercase tracking-[0.22em] text-muted-foreground leading-none">accounts · ledger · plans</div>
            <h1 className="serif text-base md:text-lg font-semibold tracking-tight leading-tight mt-0.5">Finance</h1>
          </div>
          <div className="flex items-center gap-2">
          <motion.button
            onClick={togglePrivacy}
            aria-pressed={privacy}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            title={privacy ? 'Privacy on — figures hidden. Tap to reveal.' : 'Hide all figures'}
            className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors tap-highlight-none ${
              privacy
                ? 'bg-[hsl(var(--primary-container))] text-[hsl(var(--on-primary-container))] shadow-sm'
                : 'border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {privacy ? <VenetianMask className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="hidden sm:inline">{privacy ? 'Private' : 'Privacy'}</span>
            {privacy && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[hsl(var(--primary))] ring-2 ring-[hsl(var(--background))] motion-safe:animate-pulse" />
            )}
          </motion.button>
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-1.5 active:scale-[0.97] tap-highlight-none"
            >
              <Download className="size-3.5" /> Export
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-popover shadow-lg z-40 py-1 text-sm origin-top-right"
                >
                  {[
                    { label: 'Transactions (.csv)', kind: 'transactions' as const, file: 'sajni_transactions.csv' },
                    { label: 'Budgets (.csv)', kind: 'budgets' as const, file: 'sajni_budgets.csv' },
                    { label: 'Net worth history (.csv)', kind: 'networth' as const, file: 'sajni_networth.csv' },
                  ].map((opt) => (
                    <button
                      key={opt.kind}
                      onClick={async () => {
                        setExportOpen(false);
                        try { await downloadCSV(finance.exportUrl(opt.kind), opt.file); }
                        catch (e) { console.error(e); }
                      }}
                      className="block w-full text-left px-3 py-2 hover:bg-accent transition-colors active:bg-accent/80 tap-highlight-none"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-xs text-muted-foreground font-mono">
                    Open with Google Sheets → File › Import
                  </div>
                </motion.div>
              </>
            )}
          </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-2 md:px-8 mt-3 overflow-x-auto overflow-y-hidden no-scrollbar">
          <div className="flex gap-1 min-w-max">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-md transition-colors active:scale-[0.97] tap-highlight-none ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <Icon className="size-3.5 relative z-10" />
                  <span className="relative z-10">{t.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="finance-tab-underline"
                      className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* key changes with privacy so the whole tab subtree remounts on toggle.
            The React Compiler memoizes each formatMoney(x) on x alone — it can't
            see the module-level privacy flag — so a plain re-render reuses the
            cached (real) figures. Remounting gives a fresh compiler cache, which
            recomputes every figure against the current flag. The scroll
            container above stays mounted, so scroll position is preserved. */}
        <div key={privacy ? 'priv' : 'real'} className="max-w-6xl mx-auto px-3 md:px-8 py-5 relative">
          {/* All tabs always mounted; only active is visible.
              This eliminates the "wrong UI flash" entirely — content for every
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
