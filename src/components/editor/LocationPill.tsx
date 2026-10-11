import { useState } from 'react';
import { MapPin, X } from '@/components/ui/icons';

import { type JournalLocation } from '@/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface Props {
  value: JournalLocation | null;
  onChange: (next: JournalLocation | null) => void;
  triggerLabel?: string;
}

// LocationPill is a M3-styled chip holding a short typed label for where an
// entry was written ("Cinepolis, Vashi").
export default function LocationPill({ value, onChange, triggerLabel = 'Add location' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const applyTyped = () => {
    const q = query.trim();
    if (!q) return;
    onChange({ label: q, lat: null, lon: null });
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-[background-color,color,box-shadow,opacity,transform] ${
            value
              ? 'bg-primary/12 ring-1 ring-primary/30 text-foreground'
              : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <MapPin className="size-3.5" />
          <span className="font-mono text-xs tracking-wide truncate max-w-[160px]">
            {value ? value.label : triggerLabel}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="opacity-60 hover:opacity-100 hover:text-destructive"
            >
              <X className="size-3" />
            </span>
          ) : null}
        </button>
      } />
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyTyped();
            }
          }}
          placeholder={value?.label || 'e.g. Cinepolis, Vashi'}
          className="h-8"
        />
      </PopoverContent>
    </Popover>
  );
}
