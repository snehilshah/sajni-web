import { useQuery } from '@tanstack/react-query';
import { finance } from '@/api';
import { qk } from './keys';

// Finance reads. Heavy per-tab sets accept an `enabled` flag so FinancePage
// keeps the lazy-on-tab-activation behaviour while sharing one cache. Writes
// still run through the tab components + an invalidate of qk.finance.all, and
// the InvalidateBridge invalidates the same root on AI transaction_/biller_
// events — so every mounted finance view stays in sync.

export function useFinAccounts(enabled = true) {
  return useQuery({ queryKey: qk.finance.accounts(), queryFn: () => finance.listAccounts(), enabled });
}

export function useFinCategories(enabled = true) {
  return useQuery({ queryKey: qk.finance.categories(), queryFn: () => finance.listCategories(), enabled });
}

export function useFinTransactions(
  params: Parameters<typeof finance.listTransactions>[0] = { limit: 200 },
  enabled = true,
) {
  return useQuery({
    queryKey: qk.finance.transactions(params),
    queryFn: () => finance.listTransactions(params),
    enabled,
  });
}

export function useFinBudgets(enabled = true) {
  return useQuery({ queryKey: qk.finance.budgets(), queryFn: () => finance.listBudgets(), enabled });
}

export function useFinInvestments(enabled = true) {
  return useQuery({ queryKey: qk.finance.investments(), queryFn: () => finance.listInvestments(), enabled });
}

export function useFinSavings(enabled = true) {
  return useQuery({ queryKey: qk.finance.savings(), queryFn: () => finance.listSavings(), enabled });
}

export function useFinStatements(enabled = true) {
  return useQuery({ queryKey: qk.finance.statements(), queryFn: () => finance.listStatements(), enabled });
}

export function useFinOverview(enabled = true) {
  return useQuery({ queryKey: qk.finance.overview(), queryFn: () => finance.overview(), enabled });
}

export function useFinBillers(includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: qk.finance.billers(includeArchived),
    queryFn: () => finance.listBillers(includeArchived),
    enabled,
  });
}
