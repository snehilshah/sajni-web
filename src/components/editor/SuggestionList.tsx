import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Item, ItemRef, KeyProps } from './types';

export type SuggestionItem = Item;

export interface SuggestionListProps {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
  query?: string;
  emptyText?: string;
}

export const SuggestionList = forwardRef<ItemRef, SuggestionListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = props.items;

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) props.command(item);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: KeyProps) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (items.length > 0) {
          selectItem(selectedIndex);
          return true;
        }
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-popover text-popover-foreground rounded-lg border border-border shadow-lg overflow-hidden min-w-[220px] p-2 text-xs text-muted-foreground">
        {props.emptyText || 'No matches'}
      </div>
    );
  }

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border border-border shadow-lg overflow-hidden min-w-[240px] max-w-[340px] p-1 max-h-[280px] overflow-y-auto">
      {items.map((item, index) => (
        <button
          type="button"
          key={item.id}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
            index === selectedIndex ? 'bg-accent text-accent-foreground' : ''
          }`}
        >
          {item.icon && <span className="text-base leading-none mt-px shrink-0">{item.icon}</span>}
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">{item.title}</span>
            {item.subtitle && <span className="text-xs opacity-70 truncate">{item.subtitle}</span>}
          </div>
        </button>
      ))}
    </div>
  );
});

SuggestionList.displayName = 'SuggestionList';
