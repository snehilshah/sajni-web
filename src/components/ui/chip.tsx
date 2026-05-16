import * as React from 'react';
import { cn } from '@/lib/utils';

type ChipVariant = 'default' | 'sage' | 'amber' | 'rose';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

export function Chip({ className, variant = 'default', ...props }: ChipProps) {
  const v =
    variant === 'sage' ? 'chip-sage' :
    variant === 'amber' ? 'chip-amber' :
    variant === 'rose' ? 'chip-rose' : '';
  return <span className={cn('chip', v, className)} {...props} />;
}
