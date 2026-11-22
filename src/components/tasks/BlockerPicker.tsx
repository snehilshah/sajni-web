import { useState } from 'react';

import type { Task } from '@/types';
import { ChevronDown } from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { STATUS_DOT } from './helpers';

// The "Blocked by" field: pick the task that must be done first. Type to
// narrow the list (with many open tasks scrolling gets slow).
export default function BlockerPicker({ value, tasks, onChange }: {
  value: number | null;
  tasks: Task[];
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const picked = tasks.find((t) => t.id === value);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger
        aria-label="Select blocking task"
        data-popup-open={open ? '' : undefined}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-card px-3.5 text-left text-sm outline-none transition-[box-shadow] duration-150',
          'focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--primary))] data-[popup-open]:shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
        )}
      >
        {picked ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[picked.status]}`} />
            <span className="truncate">{picked.title}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">Select the task that must be done first</span>
        )}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 p-0">
        <Command
          // Every typed word must appear in the title (cmdk's default is fuzzy:
          // "plants" would also match "plan for the side project").
          filter={(value, search) => {
            const title = value.slice(0, value.lastIndexOf('__')).toLowerCase();
            return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => title.includes(w)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search tasks" value={query} onValueChange={setQuery} autoFocus />
          <CommandList className="max-h-72">
            <CommandEmpty>No open task matches.</CommandEmpty>
            {tasks.map((t) => (
              <CommandItem
                key={t.id}
                // The title is what's searched; the id keeps equal titles apart.
                value={`${t.title}__${t.id}`}
                onSelect={() => { onChange(t.id); setOpen(false); setQuery(''); }}
                className={cn(t.id === value && 'font-semibold')}
              >
                <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[t.status]}`} />
                <span className="truncate">{t.title}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
