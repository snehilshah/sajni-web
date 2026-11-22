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
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-[background-color,color,box-shadow,opacity,transform] ${
              value
                ? 'bg-primary/12 text-foreground ring-1 ring-primary/30'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <MapPin className="size-3.5" />
            <span className="max-w-[160px] truncate font-mono text-xs tracking-wide">
              {value ? value.label : triggerLabel}
            </span>
            {value ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="opacity-60 hover:text-destructive hover:opacity-100"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </button>
        }
      />
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
