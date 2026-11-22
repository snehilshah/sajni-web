import { AlignLeft, Check, ChevronDown } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { GROUP_LABELS, type GroupBy } from './grouping';

// "Group: Status ▾" beside the List/Board switch: how the view splits its
// tasks. The menu lists only what the current view offers.
export default function GroupMenu({
  value,
  options,
  board,
  onChange,
}: {
  value: GroupBy;
  options: GroupBy[];
  board: boolean;
  onChange: (by: GroupBy) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="tonal" size="sm" className="shrink-0 gap-1.5" aria-label={`Group by ${GROUP_LABELS[value]}`}>
            <AlignLeft className="size-3.5" />
            <span className="text-muted-foreground">Group</span>
            <span className="font-semibold">{GROUP_LABELS[value]}</span>
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="tracking-normal normal-case">
            {board ? 'Lanes by' : 'Group the list by'}
          </DropdownMenuLabel>
          {options.map((by) => (
            <div key={by}>
              {by === 'none' && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => onChange(by)} className={cn(by === value && 'font-semibold')}>
                {GROUP_LABELS[by]}
                <Check className={cn('ml-auto size-4 text-[hsl(var(--primary))]', by !== value && 'invisible')} />
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
