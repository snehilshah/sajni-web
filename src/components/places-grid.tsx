import { motion } from 'framer-motion';

import { NAV_ITEMS, isActivePath } from '@/components/nav-chrome';
import { PixelIcon } from '@/components/ui/pixel-icon';
import { cn } from '@/lib/utils';

// Staggered grid of every destination — the reveal behind the merged
// pill's title dropdown (and anywhere else that needs "all places").
export default function PlacesGrid({ pathname, onNavigate }: {
  pathname: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <motion.div
      className="grid grid-cols-3 gap-2"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }}
    >
      {NAV_ITEMS.map(({ path, label, icon }) => {
        const isActive = isActivePath(pathname, path);
        return (
          <motion.button
            key={path}
            type="button"
            variants={{ hidden: { opacity: 0, transform: 'translateY(10px)' }, show: { opacity: 1, transform: 'translateY(0)' } }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            whileTap={{ transform: 'scale(0.95)' }}
            onClick={() => onNavigate(path)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl px-1.5 py-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--popover))]',
              isActive
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                : 'bg-[hsl(var(--surface-container))] text-foreground/85 hover:bg-[hsl(var(--surface-container-highest))] hover:text-foreground',
            )}
          >
            <PixelIcon name={icon} solid={isActive} className="size-5" />
            {label}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
