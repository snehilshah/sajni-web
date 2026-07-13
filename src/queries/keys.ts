// Central query-key factory. One source of truth for every cached resource,
// shared by the per-resource hook modules and the InvalidateBridge.
//
// Convention: the first element is the resource root (e.g. 'tasks'). Calling
// `queryClient.invalidateQueries({ queryKey: qk.tasks.all })` matches every
// sub-key by prefix, so invalidating a root refreshes its lists, details,
// and derived queries in one shot.

export const qk = {
  tasks: {
    all: ['tasks'] as const,
    list: (params?: unknown) => ['tasks', 'list', params ?? {}] as const,
    detail: (id: number) => ['tasks', 'detail', id] as const,
    subtasks: (id: number) => ['tasks', 'subtasks', id] as const,
    missed: (date: string) => ['tasks', 'missed', date] as const,
    history: (id: number) => ['tasks', 'history', id] as const,
    events: (id: number) => ['tasks', 'events', id] as const,
    reminders: (id: number) => ['tasks', 'reminders', id] as const,
  },
  taskLists: {
    all: ['taskLists'] as const,
    list: () => ['taskLists', 'list'] as const,
  },
  habits: {
    all: ['habits'] as const,
    list: () => ['habits', 'list'] as const,
    status: (date: string) => ['habits', 'status', date] as const,
    recentLogs: (days: number) => ['habits', 'recentLogs', days] as const,
    logs: (id: number, days: number) => ['habits', 'logs', id, days] as const,
  },
  memos: {
    all: ['memos'] as const,
    list: (params?: unknown) => ['memos', 'list', params ?? {}] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (params?: unknown) => ['notes', 'list', params ?? {}] as const,
    detail: (id: number) => ['notes', 'detail', id] as const,
    folders: () => ['notes', 'folders'] as const,
  },
  thinking: {
    all: ['thinking'] as const,
    projects: () => ['thinking', 'projects'] as const,
    project: (id: number) => ['thinking', 'project', id] as const,
  },
  journal: {
    all: ['journal'] as const,
    list: () => ['journal', 'list'] as const,
    entry: (date: string) => ['journal', 'entry', date] as const,
    weeks: () => ['journal', 'weeks'] as const,
    week: (year: number, week: number) => ['journal', 'week', year, week] as const,
    weekSummary: (year: number, week: number) => ['journal', 'weekSummary', year, week] as const,
  },
  media: {
    all: ['media'] as const,
    list: (params?: unknown) => ['media', 'list', params ?? {}] as const,
    events: (id: number) => ['media', 'events', id] as const,
  },
  bookmarks: {
    all: ['bookmarks'] as const,
    list: (params?: unknown) => ['bookmarks', 'list', params ?? {}] as const,
  },
  tags: {
    all: ['tags'] as const,
    list: () => ['tags', 'list'] as const,
    detail: (tag: string) => ['tags', 'detail', tag] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    get: () => ['analytics', 'get'] as const,
  },
  finance: {
    all: ['finance'] as const,
    accounts: () => ['finance', 'accounts'] as const,
    categories: (kind?: string) => ['finance', 'categories', kind ?? 'all'] as const,
    transactions: (params?: unknown) => ['finance', 'transactions', params ?? {}] as const,
    budgets: (month?: string) => ['finance', 'budgets', month ?? 'current'] as const,
    pockets: () => ['finance', 'pockets'] as const,
    investments: () => ['finance', 'investments'] as const,
    savings: (accountId?: number) => ['finance', 'savings', accountId ?? 'all'] as const,
    statements: (accountId?: number) => ['finance', 'statements', accountId ?? 'all'] as const,
    billers: (includeArchived?: boolean) => ['finance', 'billers', !!includeArchived] as const,
    billerPayments: (id: number) => ['finance', 'billerPayments', id] as const,
    billerAlerts: (unseenOnly?: boolean) => ['finance', 'billerAlerts', !!unseenOnly] as const,
    overview: () => ['finance', 'overview'] as const,
    networthHistory: () => ['finance', 'networthHistory'] as const,
  },
  insights: {
    all: ['insights'] as const,
    list: (window?: string) => ['insights', 'list', window ?? 'all'] as const,
  },
  themes: {
    all: ['themes'] as const,
    list: () => ['themes', 'list'] as const,
    active: () => ['themes', 'active'] as const,
  },
  ai: {
    all: ['ai'] as const,
    status: () => ['ai', 'status'] as const,
    sessions: () => ['ai', 'sessions'] as const,
    session: (id: number) => ['ai', 'session', id] as const,
  },
} as const;

// Resource roots used by the InvalidateBridge for prefix matching.
export type ResourceRoot = keyof typeof qk;
