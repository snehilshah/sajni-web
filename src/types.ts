export interface Memo {
  id: number;
  content: string;
  pinned: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  tags?: string[];
  due_date?: string | null;
  scheduled_at?: string | null;
  list_id?: number | null;
  parent_task_id?: number | null;
  important: boolean;
  steps: TaskStep[];
  sort_order: number;
  subtask_count: number;
  subtasks_done: number;
  created_at: string;
  updated_at: string;
}

export interface TaskList {
  id: number;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export type SmartList = 'my_day' | 'important' | 'planned' | 'inbox' | 'all';

export interface Habit {
  id: number;
  name: string;
  frequency: 'daily' | 'weekly';
  color: string;
  created_at: string;
  logged_today: boolean;
  total_logs: number;
  current_streak: number;
}

export type MediaStatus = 'in_progress' | 'pending' | 'waiting' | 'complete' | 'archived' | 'dropped' | 'scratched';

export interface MediaEntry {
  id: number;
  title: string;
  type: 'movie' | 'show' | 'book';
  status: MediaStatus;
  rating?: number | null;
  notes: string;
  platform: string;
  poster_url: string;
  year?: number | null;
  genre: string;
  external_id: string;
  episodes_watched: number;
  episodes_total: number;
  seasons_watched: number;
  seasons_total: number;
  /** TMDB-derived per-season episode counts; [] when unknown. */
  season_episodes: number[];
  /** "tmdb:collection:1234" — empty if the movie has no series. */
  collection_id: string;
  collection_name: string;
  created_at: string;
  updated_at: string;
  /** Latest 'completed' event timestamp; empty when not yet finished. */
  last_completed_at: string;
}

export interface MediaSearchResult {
  external_id: string;
  title: string;
  year: string;
  poster_url: string;
  overview: string;
  genre: string;
}

export interface JournalEntry {
  id: number;
  date: string;
  mood?: string | null;
  content?: string;
  tags: string[];
  backlinks: BacklinkRef[];
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  title: string;
  content?: string;
  tags: string[];
  backlinks: BacklinkRef[];
  created_at: string;
  updated_at: string;
}

export interface BacklinkRef {
  source_type: string;
  source_id: number;
  title: string;
}

export interface TagInfo {
  tag: string;
  count: number;
}

export interface TagEntities {
  tag: string;
  entities: { type: string; id: number; title: string }[];
}

export interface Analytics {
  activity_heatmap: { date: string; count: number }[];
  module_breakdown: Record<string, number>;
  habit_streaks: { name: string; current: number; longest: number }[];
  task_velocity: { week: string; completed: number }[];
  journal_consistency: { days_logged: number; total_days: number; percentage: number };
  top_tags: { tag: string; count: number }[];
  media_stats: Record<string, number>;
}
