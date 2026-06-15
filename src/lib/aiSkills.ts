import {
  CalendarDays, Clock, ListChecks, Film, Inbox, BookOpen,
  type LucideIcon,
} from '@/components/ui/icons';

// Each Skill is a templated message the user can fire with one click.
// The agent resolves dates/IDs at runtime via tool calls — these strings
// are intentionally generic.
export interface Skill {
  id: string;
  label: string;
  prompt: string;
  icon: LucideIcon;
}

export const SKILLS: Skill[] = [
  {
    id: 'agenda',
    label: 'Plan tomorrow',
    icon: CalendarDays,
    prompt:
      "Build me an agenda for tomorrow. Pull my open tasks, today's habit progress, and anything time-sensitive. Keep it to a 1-page schedule with a suggested order.",
  },
  {
    id: 'free-slot',
    label: 'Find a free hour',
    icon: Clock,
    prompt:
      "Find me the next free 1-hour slot in the next 3 days, considering my scheduled tasks. Respect work hours (09:00–18:00 weekdays).",
  },
  {
    id: 'review',
    label: 'Weekly review',
    icon: ListChecks,
    prompt:
      "Summarize what I did this past week — habits hit/missed, tasks completed, and money spent grouped by category.",
  },
  {
    id: 'recommend',
    label: 'Recommend something to watch',
    icon: Film,
    prompt:
      "Recommend a movie or show I'd like, based on my media library and any ratings I've given. Use TMDB to pick something real and pass the external_id when adding.",
  },
  {
    id: 'inbox-sweep',
    label: 'Inbox sweep',
    icon: Inbox,
    prompt:
      "Look at my recent memos and turn anything task-shaped into a draft task. Show me the list before creating; only create the ones I confirm.",
  },
  {
    id: 'journal-prompt',
    label: 'Journal prompt',
    icon: BookOpen,
    prompt:
      "Give me a short reflective prompt for today's journal entry, grounded in what I've been working on this week.",
  },
];
