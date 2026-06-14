import { authFetch, requestJSON, API_BASE } from './auth/client';
import type { Bookmark } from './types';

const request = requestJSON;

// --- Memos ---
export const memos = {
  list: (params?: { search?: string; pinned?: boolean; tag?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.pinned) q.set('pinned', 'true');
    if (params?.tag) q.set('tag', params.tag);
    const qs = q.toString();
    return request<any[]>(`/memos${qs ? '?' + qs : ''}`);
  },
  create: (content: string, pinned = false) =>
    request<{ id: number }>('/memos', { method: 'POST', body: JSON.stringify({ content, pinned }) }),
  update: (id: number, data: { content?: string; pinned?: boolean }) =>
    request('/memos/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/memos/' + id, { method: 'DELETE' }),
};

// --- Thinking (typed thought-cards inside a project) ---
export interface ThinkingProject {
  id: number;
  title: string;
  description: string;
  thesis: string;
  gap_questions: string[];
  synthesized_at: string;
  card_count: number;
  created_at: string;
  updated_at: string;
}

export type ThinkingKind =
  | 'note' | 'entity' | 'question' | 'idea' | 'reflection'
  | 'claim' | 'fact' | 'hypothesis' | 'evidence'
  | 'contradiction' | 'decision' | 'todo';

export type ThinkingRelation =
  | 'supports' | 'contradicts' | 'extends' | 'depends_on' | 'refines'
  | 'fixes' | 'refs' | 'points' | 'questions'
  | 'exemplifies' | 'generalizes' | 'related';

export interface ThinkingConnection {
  card_id: number;
  relation: ThinkingRelation;
}

export interface ThinkingEnrichment {
  summary?: string;
  implications?: string[];
  questions_raised?: string[];
  connections?: ThinkingConnection[];
  confidence?: number;
}

export interface ThinkingCard {
  id: number;
  project_id: number;
  kind: ThinkingKind;
  content: string;
  ai_enrichment: ThinkingEnrichment;
  enriched_at: string;
  created_at: string;
  updated_at: string;
}

export const thinking = {
  listProjects: () => request<ThinkingProject[]>('/thinking/projects'),
  createProject: (data: { title: string; description?: string }) =>
    request<{ id: number }>('/thinking/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: number) =>
    request<{ project: ThinkingProject; cards: ThinkingCard[] }>('/thinking/projects/' + id),
  updateProject: (id: number, data: { title?: string; description?: string }) =>
    request('/thinking/projects/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: number) =>
    request('/thinking/projects/' + id, { method: 'DELETE' }),
  synthesize: (id: number) =>
    request<{ thesis: string; gap_questions: string[] }>('/thinking/projects/' + id + '/synthesize', { method: 'POST' }),
  addCard: (projectId: number, data: { kind: ThinkingKind; content: string }) =>
    request<{ id: number }>('/thinking/projects/' + projectId + '/cards', { method: 'POST', body: JSON.stringify(data) }),
  updateCard: (id: number, data: { kind?: ThinkingKind; content?: string }) =>
    request('/thinking/cards/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCard: (id: number) =>
    request('/thinking/cards/' + id, { method: 'DELETE' }),
  enrichCard: (id: number) =>
    request('/thinking/cards/' + id + '/enrich', { method: 'POST' }),
  saveEnrichment: (id: number, enrichment: ThinkingEnrichment) =>
    request('/thinking/cards/' + id + '/enrichment', { method: 'PUT', body: JSON.stringify(enrichment) }),
  classify: (content: string) =>
    request<{ kind: ThinkingKind }>('/thinking/classify', { method: 'POST', body: JSON.stringify({ content }) }),
};

// --- Tasks ---
import type { Task, TaskList, TaskStep, SmartList } from './types';

export const tasks = {
  list: (params?: {
    status?: string;
    due_date?: string;
    week_of?: string;
    completed_date?: string;
    list?: number | 'none';
    parent?: number | 'null';
    smart?: SmartList;
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.due_date) q.set('due_date', params.due_date);
    if (params?.week_of) q.set('week_of', params.week_of);
    if (params?.completed_date) q.set('completed_date', params.completed_date);
    if (params?.list !== undefined) q.set('list', String(params.list));
    if (params?.parent !== undefined) q.set('parent', String(params.parent));
    if (params?.smart) q.set('smart', params.smart);
    const qs = q.toString();
    return request<Task[]>('/tasks' + (qs ? '?' + qs : ''));
  },
  create: (data: {
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    due_date?: string;
    week_of?: string;
    scheduled_at?: string;
    remind?: boolean;
    notify_emails?: string[];
    list_id?: number | null;
    parent_task_id?: number | null;
    important?: boolean;
    steps?: TaskStep[];
  }) => request<{ id: number }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: number) => request<Task>('/tasks/' + id),
  update: (id: number, data: Record<string, any>) =>
    request('/tasks/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/tasks/' + id, { method: 'DELETE' }),
  // Scratch = abandon-but-keep (reversible). Distinct from delete.
  scratch: (id: number) => request('/tasks/' + id, { method: 'PUT', body: JSON.stringify({ status: 'scratched' }) }),
  unscratch: (id: number) => request('/tasks/' + id, { method: 'PUT', body: JSON.stringify({ status: 'todo' }) }),
  // Reschedule a (usually overdue) task. Server records the move off a past
  // day as a 'rescheduled' lifecycle entry, not a miss.
  reschedule: (id: number, due_date: string) =>
    request('/tasks/' + id, { method: 'PUT', body: JSON.stringify({ due_date }) }),
  reorder: (ids: number[]) =>
    request('/tasks/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
  subtasks: (id: number) =>
    request<Task[]>('/tasks/' + id + '/subtasks'),
  missed: (date: string) =>
    request<MissedTask[]>('/tasks/missed?date=' + encodeURIComponent(date)),
  history: (id: number) =>
    request<TaskHistoryEntry[]>('/tasks/' + id + '/history'),
  events: (id: number) =>
    request<TaskEvent[]>('/tasks/' + id + '/events'),
  // Multiple reminders: arbitrary instants, independent of the task's time.
  reminders: (id: number) =>
    request<TaskReminder[]>('/tasks/' + id + '/reminders'),
  addReminder: (id: number, remind_at: string) =>
    request<{ id: number }>('/tasks/' + id + '/reminders', { method: 'POST', body: JSON.stringify({ remind_at }) }),
  deleteReminder: (id: number, rid: number) =>
    request('/tasks/' + id + '/reminders/' + rid, { method: 'DELETE' }),
};

export interface TaskEvent {
  kind: 'created' | 'status' | 'title' | 'list' | 'rescheduled';
  from: string;
  to: string;
  created_at: string;
}

export interface TaskReminder {
  id: number;
  remind_at: string;
  sent_at: string | null;
}

// --- Task lists (groups) ---
export const taskLists = {
  list: () => request<TaskList[]>('/task-lists'),
  create: (data: { name: string; color?: string; icon?: string }) =>
    request<{ id: number }>('/task-lists', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; color?: string; icon?: string }) =>
    request('/task-lists/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/task-lists/' + id, { method: 'DELETE' }),
  reorder: (ids: number[]) =>
    request('/task-lists/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
};

export interface MissedTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  missed_date: string;
  current_due_date: string | null;
  source: 'rescheduled' | 'overdue';
}

export interface TaskHistoryEntry {
  due_date: string;
  outcome: string;
  recorded_at: string;
}

// --- Habits ---
export const habits = {
  list: () => request<any[]>('/habits'),
  create: (data: { name: string; frequency?: string; color?: string }) =>
    request<{ id: number }>('/habits', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, any>) =>
    request('/habits/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/habits/' + id, { method: 'DELETE' }),
  toggleLog: (id: number) => request<{ logged: boolean }>('/habits/' + id + '/log', { method: 'POST' }),
  toggleLogForDate: (id: number, date: string) => request<{ logged: boolean }>('/habits/' + id + '/log/' + date, { method: 'POST' }),
  statusForDate: (date: string) => request<any[]>('/habits/status?date=' + date),
  getLogs: (id: number, days = 30) => request<string[]>('/habits/' + id + '/logs?days=' + days),
  // All habits' logged dates in one call, keyed by habit id. Avoids the
  // per-habit N+1 on the Today page.
  recentLogs: (days = 30) => request<Record<string, string[]>>('/habits/logs?days=' + days),
};

// --- Media ---
export interface MediaDetails {
  external_id: string;
  type: 'show' | 'movie';
  title: string;
  year: string;
  poster_url: string;
  genre: string;
  overview: string;
  seasons_total: number;
  episodes_total: number;
  season_episodes: number[];
  collection_id: string;
  collection_name: string;
}

export interface CollectionPart {
  external_id: string;
  title: string;
  year: string;
  poster_url: string;
  overview: string;
}

export interface CollectionPayload {
  id: string;
  name: string;
  parts: CollectionPart[];
}

export const media = {
  list: (params?: { type?: string; status?: string; collection_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set('type', params.type);
    if (params?.status) q.set('status', params.status);
    if (params?.collection_id) q.set('collection_id', params.collection_id);
    const qs = q.toString();
    return request<any[]>('/media' + (qs ? '?' + qs : ''));
  },
  create: (data: Record<string, any>) =>
    request<{ id: number }>('/media', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, any>) =>
    request('/media/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/media/' + id, { method: 'DELETE' }),
  search: (query: string, type: string) => {
    const q = new URLSearchParams({ q: query, type });
    return request<any[]>('/media/search?' + q.toString());
  },
  details: (externalId: string) =>
    request<MediaDetails>('/media/details?external_id=' + encodeURIComponent(externalId)),
  collection: (id: string) =>
    request<CollectionPayload>('/media/collection?id=' + encodeURIComponent(id)),
  events: (id: number) =>
    request<MediaEventRow[]>('/media/' + id + '/events'),
};

// --- Bookmarks ---
export const bookmarks = {
  list: (params?: { kind?: 'video' | 'site'; unread?: boolean; archived?: boolean; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set('kind', params.kind);
    if (params?.unread !== undefined) q.set('unread', String(params.unread));
    if (params?.archived) q.set('archived', 'true');
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<Bookmark[]>('/bookmarks' + (qs ? '?' + qs : ''));
  },
  create: (data: { url: string; title?: string; note?: string }) =>
    request<Bookmark>('/bookmarks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { title?: string; note?: string; unread?: boolean; archived?: boolean }) =>
    request<Bookmark>('/bookmarks/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/bookmarks/' + id, { method: 'DELETE' }),
};

export type MediaEventKind =
  | 'added'
  | 'started'
  | 'progress'
  | 'completed'
  | 'dropped'
  | 'rating';

export interface MediaEventMeta {
  title?: string;
  type?: string;
  status?: string;
  season?: number;
  episode?: number;
  episodes_watched?: number;
  episodes_total?: number;
  seasons_watched?: number;
  rating?: number;
}

export interface MediaEventRow {
  id: number;
  media_id: number;
  kind: MediaEventKind;
  meta: MediaEventMeta;
  created_at: string;
}

// --- Journal ---
export interface JournalLocation {
  label: string;
  lat?: number | null;
  lon?: number | null;
}

export interface WeeklyEntry {
  id: number;
  iso_year: number;
  iso_week: number;
  mood: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklySummary {
  iso_year: number;
  iso_week: number;
  start_date: string;
  end_date: string;
  days: Array<{
    date: string;
    tasks_done: number;
    tasks_due: number;
    tasks_missed: number;
    mood: string | null;
    has_entry: boolean;
  }>;
  habits: Array<{ id: number; name: string; color: string; logged_days: string[] }>;
  expense_total: number;
  expense_top_category: { id: number; name: string; amount: number } | null;
  expense_currency: string;
}

export const journal = {
  list: () => request<any[]>('/journal'),
  get: (date: string) => request<any>('/journal/' + date),
  save: (
    date: string,
    content: string,
    mood?: string | null,
    location?: JournalLocation | null,
  ) =>
    request('/journal/' + date, {
      method: 'PUT',
      body: JSON.stringify({
        content,
        mood,
        location_label: location?.label ?? '',
        location_lat: location?.lat ?? null,
        location_lon: location?.lon ?? null,
      }),
    }),
  delete: (date: string) => request('/journal/' + date, { method: 'DELETE' }),

  // --- Weekly entry. Same shape as daily but keyed by ISO year + week. ---
  week: {
    list: () => request<WeeklyEntry[]>('/journal/weeks'),
    get: (year: number, week: number) =>
      request<WeeklyEntry>(`/journal/week/${year}/${week}`),
    save: (year: number, week: number, content: string, mood?: string | null) =>
      request(`/journal/week/${year}/${week}`, {
        method: 'PUT',
        body: JSON.stringify({ content, mood: mood ?? null }),
      }),
    delete: (year: number, week: number) =>
      request(`/journal/week/${year}/${week}`, { method: 'DELETE' }),
    summary: (year: number, week: number) =>
      request<WeeklySummary>(`/journal/week/${year}/${week}/summary`),
  },
};

// --- Places (Google Places (New) proxy used by the journal location pill) ---
export interface PlacePrediction { place_id: string; primary: string; secondary: string }
export interface PlaceDetails { place_id: string; label: string; lat: number; lon: number }

export const places = {
  autocomplete: (q: string, session: string, coords?: { lat: number; lon: number }) => {
    const params = new URLSearchParams({ q, session });
    if (coords) {
      params.set('lat', String(coords.lat));
      params.set('lon', String(coords.lon));
    }
    return request<{ predictions: PlacePrediction[] }>('/places/autocomplete?' + params.toString());
  },
  details: (place_id: string, session: string) =>
    request<PlaceDetails>('/places/details?place_id=' + encodeURIComponent(place_id) + '&session=' + encodeURIComponent(session)),
};

// --- Notes ---
export const notes = {
  list: (params?: { search?: string; tag?: string; folder?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.tag) q.set('tag', params.tag);
    if (params?.folder) q.set('folder', params.folder);
    const qs = q.toString();
    return request<any[]>('/notes' + (qs ? '?' + qs : ''));
  },
  get: (id: number) => request<any>('/notes/' + id),
  create: (title: string, content: string, folder?: string) =>
    request<{ id: number; folder: string }>('/notes', { method: 'POST', body: JSON.stringify({ title, content, folder: folder || '' }) }),
  update: (id: number, data: { title?: string; content?: string; folder?: string }) =>
    request('/notes/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/notes/' + id, { method: 'DELETE' }),
  // Folders
  listFolders: () => request<string[]>('/notes/folders'),
  createFolder: (path: string) =>
    request<{ path: string }>('/notes/folders', { method: 'POST', body: JSON.stringify({ path }) }),
  deleteFolder: (path: string) =>
    request('/notes/folders', { method: 'DELETE', body: JSON.stringify({ path }) }),
  renameFolder: (from: string, to: string) =>
    request('/notes/folders/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
};

// --- Uploads ---
export const uploads = {
  upload: async (file: File | Blob): Promise<{ url: string; filename: string }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await authFetch('/uploads', { method: 'POST', body: form });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  // Build a fully-qualified URL for an upload — the relative form `/api/uploads/foo`
  // works when the frontend is same-origin or behind a proxy; in cross-origin
  // production deployments callers should prepend the API base.
  resolveUrl: (relative: string): string => {
    if (relative.startsWith('http')) return relative;
    if (API_BASE === '/api') return relative;
    return API_BASE.replace(/\/api$/, '') + relative;
  },
};

// --- Takeout (export/import all user data) + account delete ---
export const account = {
  // Downloads the user's full takeout archive (zip). Browser kicks off a
  // save dialog via an anchor with the blob URL.
  exportData: async (): Promise<void> => {
    const res = await authFetch('/takeout');
    if (!res.ok) throw new Error('Takeout failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sajni-takeout-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  importData: async (file: File): Promise<{ imported: Record<string, number> }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await authFetch('/takeout/import', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Import failed');
    }
    return res.json();
  },
  scheduleDelete: () =>
    request<{ status: string; purge_after: string; grace_duration: string }>(
      '/account/delete', { method: 'POST' }),
  cancelDelete: () =>
    request<{ status: string }>('/account/cancel-delete', { method: 'POST' }),
  deletionStatus: () =>
    request<{ scheduled: boolean; deleted_at?: string; purge_after?: string }>(
      '/account/deletion-status'),
};

// --- Links ---
export const links = {
  // Server-side title fetch (CORS blocks the browser). Returns the page
  // title so the editor can turn a bare URL into a [title](url) link.
  preview: (url: string) =>
    request<{ url: string; title: string; host: string }>(
      '/links/preview?url=' + encodeURIComponent(url)),
};

// --- Tags ---
export const tags = {
  list: () => request<{ tag: string; count: number }[]>('/tags'),
  get: (tag: string) => request<{ tag: string; entities: any[] }>('/tags/' + encodeURIComponent(tag)),
};

// --- Analytics ---
export const analytics = {
  get: () => request<any>('/analytics'),
};

// --- Finance ---
export interface FinAccount {
  id: number;
  name: string;
  type: 'savings' | 'checking' | 'credit_card' | 'investment' | 'trading' | 'cash' | 'salary';
  institution: string;
  currency: string;
  opening_balance: number;
  balance: number;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  cashback_type: 'none' | 'percentage' | 'fixed';
  cashback_value: number;
  /** Salary accounts: expected monthly inflow + day it lands (one-tap credit). */
  salary_amount: number;
  salary_day: number | null;
  /** Comma-separated SMS identifiers (last-4 / bank) → share-target auto-match. */
  match_hints: string;
  color: string;
  archived: boolean;
  created_at: string;
}

export interface FinCategory {
  id: number;
  name: string;
  kind: 'income' | 'expense';
  color: string;
  icon: string;
}

export interface FinTransaction {
  id: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  type: 'expense' | 'income' | 'transfer_in' | 'transfer_out' | 'buy' | 'sell';
  amount: number;
  description: string;
  note: string;
  txn_at: string; // RFC3339 in IST (carries +05:30)
  transfer_pair: number | null;
  linked_account: number | null;
  created_at: string;
}

export interface FinBudgetItem {
  id: number;
  category_id: number | null;
  amount: number;
  spent: number;
}

export interface FinBudget {
  id: number;
  name: string;
  period: 'monthly' | 'custom';
  start_date: string;
  end_date: string;
  total_amount: number;
  spent: number;
  items: FinBudgetItem[];
}

export interface FinInvestment {
  id: number;
  name: string;
  type: 'sip' | 'rd' | 'stock' | 'etf' | 'mutual_fund' | 'fd' | 'other';
  account_id: number | null;
  invested_amount: number;
  current_value: number;
  monthly_amount: number;
  frequency: string;
  start_date: string | null;
  maturity_date: string | null;
  expected_return: number;
  notes: string;
  last_updated: string;
  /** Trading holdings only: units held + cost basis + booked P/L + lifecycle. */
  quantity: number;
  avg_buy_price: number;
  realized_pl: number;
  status: 'open' | 'closed';
  /** Stocks/ETFs only: market symbol + exchange drive EOD auto-pricing. */
  symbol: string;
  exchange: string;
  /** Last auto-fetched price/unit; current_value = quantity × last_price. */
  last_price: number;
  /** Last fetch failure ('' = ok); set when a symbol stops resolving. */
  price_error: string;
  /** RFC3339 (IST) of the last successful refresh; null = never priced. */
  price_at: string | null;
}

export interface FinSaving {
  id: number;
  account_id: number;
  account_name: string;
  name: string;
  target_amount: number;
  current_amount: number;
  color: string;
  created_at: string;
}

export type BillerFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'bimonthly';

export interface FinBiller {
  id: number;
  name: string;
  amount: number;
  frequency: BillerFrequency;
  next_due_date: string;
  account_id: number | null;
  account_name: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  is_subscription: boolean;
  auto_renew: boolean;
  /** Opt-in: cron spawns a 'Pay {name}' reminder task each cycle. */
  remind_task: boolean;
  /** Amount not known upfront (e.g. electricity); auto-pay uses last amount. */
  variable: boolean;
  alert_days: number;
  color: string;
  notes: string;
  archived: boolean;
  last_paid_date: string | null;
  created_at: string;
}

export interface FinBillerAlert {
  id: number;
  biller_id: number;
  biller_name: string;
  kind: 'upcoming' | 'auto_paid' | 'auto_paid_variable';
  due_date: string;
  amount: number;
  seen: boolean;
  created_at: string;
}

export interface FinStatement {
  id: number;
  account_id: number;
  account_name: string;
  statement_date: string;
  due_date: string;
  /** Payable total = previous_balance + new_charges (may be negative = credit). */
  amount_due: number;
  new_charges: number;
  previous_balance: number;
  cashback_earned: number;
  paid: boolean;
  paid_at: string | null;
}

export const finance = {
  // Accounts
  listAccounts: () => request<FinAccount[]>('/finance/accounts'),
  createAccount: (data: Partial<FinAccount>) =>
    request<{ id: number }>('/finance/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: Partial<FinAccount>) =>
    request('/finance/accounts/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) =>
    request('/finance/accounts/' + id, { method: 'DELETE' }),

  // Categories
  listCategories: (kind?: 'income' | 'expense') =>
    request<FinCategory[]>('/finance/categories' + (kind ? '?kind=' + kind : '')),
  createCategory: (data: Partial<FinCategory>) =>
    request<{ id: number }>('/finance/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: Partial<FinCategory>) =>
    request('/finance/categories/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) =>
    request('/finance/categories/' + id, { method: 'DELETE' }),

  // Transactions
  listTransactions: (params?: { account_id?: number; category_id?: number; type?: string; from?: string; to?: string; search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.account_id) q.set('account_id', String(params.account_id));
    if (params?.category_id) q.set('category_id', String(params.category_id));
    if (params?.type) q.set('type', params.type);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<FinTransaction[]>('/finance/transactions' + (qs ? '?' + qs : ''));
  },
  createTransaction: (data: { account_id: number; category_id?: number | null; type: string; amount: number; description?: string; note?: string; txn_at: string; linked_account?: number }) =>
    request<{ id: number }>('/finance/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id: number, data: Partial<FinTransaction>) =>
    request('/finance/transactions/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id: number) =>
    request('/finance/transactions/' + id, { method: 'DELETE' }),
  // AI category inference. Returns { category_id, category_name } where
  // category_id is null when no existing category matched (falls back
  // to "Others"). 429 means the user has exhausted their AI quota.
  // Parse a shared bank/UPI message into transaction fields (PWA share target).
  parseMessage: (text: string) =>
    request<{ amount: number; type: 'expense' | 'income'; description: string; note: string; txn_at: string; account_hint: string; account_id: number | null; category_id: number | null; category_name: string }>(
      '/finance/parse-message',
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  categorizeTransaction: (data: { title: string; kind: 'expense' | 'income' }) =>
    request<{ category_id: number | null; category_name: string }>(
      '/finance/categorize',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Budgets
  listBudgets: () => request<FinBudget[]>('/finance/budgets'),
  createBudget: (data: { name: string; period: string; start_date: string; end_date: string; total_amount: number; items: { category_id: number | null; amount: number }[] }) =>
    request<{ id: number }>('/finance/budgets', { method: 'POST', body: JSON.stringify(data) }),
  updateBudget: (id: number, data: any) =>
    request('/finance/budgets/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBudget: (id: number) =>
    request('/finance/budgets/' + id, { method: 'DELETE' }),

  // Investments
  listInvestments: () => request<FinInvestment[]>('/finance/investments'),
  createInvestment: (data: Partial<FinInvestment>) =>
    request<{ id: number }>('/finance/investments', { method: 'POST', body: JSON.stringify(data) }),
  updateInvestment: (id: number, data: Partial<FinInvestment>) =>
    request('/finance/investments/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvestment: (id: number) =>
    request('/finance/investments/' + id, { method: 'DELETE' }),
  // Sell a (partial or full) trading holding. units<=0 sells the whole lot;
  // proceeds credit the linked trading account.
  sellInvestment: (id: number, data: { units?: number; price?: number; amount?: number; date?: string }) =>
    request<{ status: string; proceeds: number; realized_pl: number; remaining_units: number; closed: boolean }>(
      '/finance/investments/' + id + '/sell',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Virtual savings
  listSavings: (account_id?: number) =>
    request<FinSaving[]>('/finance/savings' + (account_id ? '?account_id=' + account_id : '')),
  createSaving: (data: Partial<FinSaving>) =>
    request<{ id: number }>('/finance/savings', { method: 'POST', body: JSON.stringify(data) }),
  updateSaving: (id: number, data: Partial<FinSaving>) =>
    request('/finance/savings/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSaving: (id: number) =>
    request('/finance/savings/' + id, { method: 'DELETE' }),

  // Card statements
  listStatements: (account_id?: number) =>
    request<FinStatement[]>('/finance/cards/statements' + (account_id ? '?account_id=' + account_id : '')),
  previewStatement: (account_id: number, data: { statement_date: string; amount_due?: number; new_charges?: number; cashback_earned?: number }) =>
    request<{ statement_date: string; due_date: string; amount_due: number; new_charges: number; previous_balance: number; cashback_earned: number; payments: number }>(
      '/finance/cards/' + account_id + '/statement-preview',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  createStatement: (account_id: number, data: { statement_date: string; due_date: string; amount_due?: number; new_charges?: number; cashback_earned?: number }) =>
    request<{ id: number; amount_due: number; new_charges: number; previous_balance: number; cashback_earned: number }>(
      '/finance/cards/' + account_id + '/statements',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  updateStatement: (id: number, data: Partial<FinStatement> & { paid_from_account?: number }) =>
    request('/finance/cards/statements/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStatement: (id: number) =>
    request('/finance/cards/statements/' + id, { method: 'DELETE' }),

  // Billers / subscriptions
  listBillers: (includeArchived = false) =>
    request<FinBiller[]>('/finance/billers' + (includeArchived ? '?include_archived=true' : '')),
  createBiller: (data: Partial<FinBiller>) =>
    request<{ id: number }>('/finance/billers', { method: 'POST', body: JSON.stringify(data) }),
  updateBiller: (id: number, data: Partial<FinBiller>) =>
    request('/finance/billers/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBiller: (id: number) =>
    request('/finance/billers/' + id, { method: 'DELETE' }),
  payBiller: (id: number, data?: { paid_date?: string; amount?: number }) =>
    request<{ status: string; txn_id: number; next_due_date: string }>(
      '/finance/billers/' + id + '/pay',
      { method: 'POST', body: JSON.stringify(data || {}) },
    ),
  listBillerAlerts: (unseenOnly = false) =>
    request<FinBillerAlert[]>('/finance/billers/alerts' + (unseenOnly ? '?unseen=true' : '')),
  markBillerAlertSeen: (id: number) =>
    request('/finance/billers/alerts/' + id + '/seen', { method: 'POST' }),

  // Overview
  overview: () => request<{
    net_worth: number;
    total_assets: number;
    total_liabilities: number;
    investments_total: number;
    month_income: number;
    month_expense: number;
    month_savings: number;
    month_recurring_invest: number;
    accounts: { account_id: number; name: string; type: string; balance: number; color: string }[];
    top_expense_categories: { id: number | null; name: string; color: string; amount: number }[];
    daily_trend: { date: string; income: number; expense: number }[];
    upcoming_dues: { id: number; account_name: string; due_date: string; amount_due: number; paid: boolean }[];
    upcoming_bills: { id: number; name: string; amount: number; due_date: string; account_name: string | null; is_subscription: boolean; auto_renew: boolean }[];
    investments_breakdown: { type: string; amount: number }[];
  }>('/finance/overview'),

  networthHistory: () =>
    request<{ date: string; assets: number; liabilities: number; net_worth: number }[]>('/finance/networth/history'),
  takeSnapshot: () =>
    request<{ date: string; assets: number; liabilities: number; net_worth: number }>(
      '/finance/networth/snapshot',
      { method: 'POST' },
    ),

  // Export URLs (download via authFetch + blob)
  exportUrl: (kind: 'transactions' | 'budgets' | 'networth') =>
    '/finance/export/' + kind + '.csv',
};

// --- Themes (AI-generated M3 palettes) ---
export interface ThemeSeedsApi {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral?: string;
}

export interface UserTheme {
  id: number;
  name: string;
  source: 'ai' | 'manual' | 'preset';
  seeds: ThemeSeedsApi;
  prompt: string;
  mode_pref: 'auto' | 'light' | 'dark';
  is_active: boolean;
  created_at: string;
}

export const themes = {
  list: () => request<UserTheme[]>('/themes'),
  active: () => request<UserTheme | null>('/themes/active'),
  create: (data: {
    name: string;
    seeds: ThemeSeedsApi;
    source?: 'manual' | 'ai' | 'preset';
    prompt?: string;
    mode_pref?: 'auto' | 'light' | 'dark';
    activate?: boolean;
  }) => request<{ id: number }>('/themes', { method: 'POST', body: JSON.stringify(data) }),
  generate: (prompt: string, opts?: { activate?: boolean; mode_pref?: 'auto' | 'light' | 'dark' }) =>
    request<UserTheme>('/themes/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, activate: opts?.activate ?? false, mode_pref: opts?.mode_pref ?? 'auto' }),
    }),
  update: (id: number, data: Partial<Pick<UserTheme, 'name' | 'seeds' | 'mode_pref'>>) =>
    request('/themes/' + id, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request('/themes/' + id, { method: 'DELETE' }),
  activate: (id: number) =>
    request<UserTheme>('/themes/' + id + '/activate', { method: 'POST' }),
};

// --- Insights (cross-module correlation engine) ---
export type InsightWindow = '1w' | '2w' | '1m' | '6m' | '1y';

export interface Insight {
  id: number;
  window_key: InsightWindow;
  kind: string;
  title: string;
  body: string;
  score: number;
  evidence: Record<string, any>;
  pinned: boolean;
  generated_at: string;
}

export const insights = {
  list: (window?: InsightWindow) =>
    request<Insight[]>('/insights' + (window ? '?window=' + window : '')),
  run: (window: InsightWindow) =>
    request<{ window: InsightWindow; generated: number }>(
      '/insights/run?window=' + window,
      { method: 'POST' },
    ),
  pin: (id: number) => request('/insights/' + id + '/pin', { method: 'POST' }),
  unpin: (id: number) => request('/insights/' + id + '/unpin', { method: 'POST' }),
  dismiss: (id: number) => request('/insights/' + id + '/dismiss', { method: 'POST' }),
};

// --- Time-travel (semantic event lookup over user history) ---
export interface TimeTravelHit {
  type: 'journal' | 'memo' | 'note' | 'transaction' | 'media';
  id: number;
  date: string;
  title: string;
  excerpt: string;
}

// time_travel is exposed indirectly through the AI palette; this endpoint
// gives the Insights UI a direct path for the "when was the last time…?"
// search box without spinning up a chat round.
export const timeTravel = {
  search: (q: string, opts?: { types?: string[]; date_from?: string; date_to?: string; limit?: number }) => {
    const params = new URLSearchParams({ q });
    if (opts?.date_from) params.set('from', opts.date_from);
    if (opts?.date_to) params.set('to', opts.date_to);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.types?.length) params.set('types', opts.types.join(','));
    return request<{ items: TimeTravelHit[]; count: number; query: string }>(
      '/time-travel?' + params.toString(),
    );
  },
};

// --- Universal search ---
export interface SearchHit {
  type: string;
  id: number;
  title: string;
  snippet?: string;
  subtitle?: string;
  route?: string;
}

export const search = {
  query: (q: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    return request<{ results: SearchHit[] }>("/search" + (params.toString() ? "?" + params.toString() : ""));
  },
};

// --- AI ---

export type AIEventType = 'delta' | 'tool_call' | 'tool_result' | 'error' | 'done';

export interface AIEvent {
  type: AIEventType;
  data: any;
}

export interface AISessionMeta {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AISession {
  id: number;
  title: string;
  // messages is the persisted history (genai.Content shape) — opaque to UI
  // except for extracting text from each part to render the transcript.
  messages: { role: string; parts: { text?: string; functionCall?: any; functionResponse?: any }[] }[];
  created_at: string;
  updated_at: string;
}

export const ai = {
  status: () => request<{ enabled: boolean; model?: string }>('/ai/status'),

  listSessions: () => request<AISessionMeta[]>('/ai/sessions'),
  getSession: (id: number) => request<AISession>('/ai/sessions/' + id),
  createSession: () => request<{ id: number }>('/ai/sessions', { method: 'POST' }),
  deleteSession: (id: number) => request('/ai/sessions/' + id, { method: 'DELETE' }),

  // adoptSession promotes a one-shot palette exchange into a real
  // chat session so the user can keep talking from the sidebar with
  // full prior context (tool calls and all).
  adoptSession: (history: unknown[], title?: string) =>
    request<{ id: number }>('/ai/sessions/adopt', {
      method: 'POST',
      body: JSON.stringify({ history, title }),
    }),

  // chat opens an SSE stream against /ai/chat. onEvent fires for every
  // parsed event; the returned promise resolves when the stream ends.
  // Aborting via the AbortSignal cleanly closes the connection.
  chat: async (
    body: { session_id?: number; message: string; mode: 'palette' | 'chat' },
    onEvent: (ev: AIEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const resp = await authFetch('/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.json()).error; } catch { /* ignore */ }
      throw new Error(detail || `AI request failed: ${resp.status}`);
    }
    if (!resp.body) throw new Error('No stream');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line (\n\n).
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseSSEFrame(frame);
        if (ev) onEvent(ev);
      }
    }
  },
};

function parseSSEFrame(frame: string): AIEvent | null {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += (data ? '\n' : '') + line.slice(6);
  }
  if (!data) return null;
  try {
    return { type: event as AIEventType, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
