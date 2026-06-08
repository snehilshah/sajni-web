import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Landmark, ArrowLeftRight, PiggyBank,
  TrendingUp, CreditCard, Download, Receipt, CandlestickChart,
  Eye, VenetianMask,
} from 'lucide-react';

import {
  finance,
  type FinAccount, type FinCategory, type FinTransaction,
  type FinBudget, type FinInvestment, type FinSaving, type FinStatement,
} from '@/api';
import { useDataInvalidate } from '@/hooks/useDataInvalidate';
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

  const [data, setData] = useState<FinanceData>({
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    investments: [],
    savings: [],
    statements: [],
    loaded: {
      accounts: false, categories: false, transactions: false,
      budgets: false, investments: false, savings: false, statements: false,
    },
  });

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

  const loadAccounts = useCallback(async () => {
    try {
      const accounts = await finance.listAccounts();
      setData((d) => ({ ...d, accounts, loaded: { ...d.loaded, accounts: true } }));
    } catch { }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const categories = await finance.listCategories();
      setData((d) => ({ ...d, categories, loaded: { ...d.loaded, categories: true } }));
    } catch { }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const transactions = await finance.listTransactions({ limit: 200 });
      setData((d) => ({ ...d, transactions, loaded: { ...d.loaded, transactions: true } }));
    } catch { }
  }, []);

  const loadBudgets = useCallback(async () => {
    try {
      const budgets = await finance.listBudgets();
      setData((d) => ({ ...d, budgets, loaded: { ...d.loaded, budgets: true } }));
    } catch { }
  }, []);

  const loadInvestments = useCallback(async () => {
    try {
      const investments = await finance.listInvestments();
      setData((d) => ({ ...d, investments, loaded: { ...d.loaded, investments: true } }));
    } catch { }
  }, []);

  const loadSavings = useCallback(async () => {
    try {
      const savings = await finance.listSavings();
      setData((d) => ({ ...d, savings, loaded: { ...d.loaded, savings: true } }));
    } catch { }
  }, []);

  const loadStatements = useCallback(async () => {
    try {
      const statements = await finance.listStatements();
      setData((d) => ({ ...d, statements, loaded: { ...d.loaded, statements: true } }));
    } catch { }
  }, []);

  // Initial load — fetch the lightweight stuff every tab needs (accounts, categories).
  useEffect(() => {
    loadAccounts();
    loadCategories();
  }, [loadAccounts, loadCategories]);

  // Lazy-load on tab activation; subsequent visits use cached state instantly.
  useEffect(() => {
    if (active === 'transactions' && !data.loaded.transactions) loadTransactions();
    if (active === 'budgets' && !data.loaded.budgets) loadBudgets();
    if (active === 'investments' && !data.loaded.investments) loadInvestments();
    if (active === 'cards' && !data.loaded.statements) loadStatements();
    if (active === 'accounts' && !data.loaded.savings) loadSavings();
  }, [
    active, data.loaded,
    loadTransactions, loadBudgets, loadInvestments, loadStatements, loadSavings,
  ]);

  // AI finance mutations (transaction_* / biller_*) refresh the open tab.
  // Debounced so a multi-tool AI turn triggers one refetch, not several.
  // Always refresh the cheap shared sets (accounts balances + categories);
  // only re-fetch the heavy lazy sets that have actually been loaded so we
  // don't eagerly pull tabs the user never opened.
  useDataInvalidate(['transaction_', 'biller_'], () => {
    loadAccounts();
    loadCategories();
    if (data.loaded.transactions) loadTransactions();
    if (data.loaded.budgets) loadBudgets();
    if (data.loaded.investments) loadInvestments();
    if (data.loaded.savings) loadSavings();
    if (data.loaded.statements) loadStatements();
  });

  const setActive = (id: TabId) => {
    navigate(id === 'overview' ? '/finance' : '/finance/' + id, { replace: true });
  };

  // After a mutation in any tab, the affected loaders should refire.
  // We expose a unified `reload` map so children don't need to know about the others.
  const reloadAll = () => {
    loadAccounts();
    loadCategories();
    loadTransactions();
    loadBudgets();
    loadInvestments();
    loadSavings();
    loadStatements();
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden page-fade-in">
      <header className="border-b border-border bg-background/85 backdrop-blur sticky top-0 z-20 shrink-0">
        <div className="px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground leading-none">accounts · ledger · plans</div>
            <h1 className="serif text-base md:text-lg font-semibold tracking-tight leading-tight mt-0.5">Finance</h1>
          </div>
          <div className="flex items-center gap-2">
          <motion.button
            onClick={togglePrivacy}
            aria-pressed={privacy}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            title={privacy ? 'Privacy on — figures hidden. Tap to reveal.' : 'Hide all figures'}
            className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors tap-highlight-none ${
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
              className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-1.5 active:scale-[0.97] tap-highlight-none"
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
                  <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-[10px] text-muted-foreground font-mono">
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
  return (
    <motion.div
      // The `inert` attribute is what we actually rely on here; the
      // typings on React are still partial, hence the cast.
      {...({ inert: !active ? '' : undefined } as any)}
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
