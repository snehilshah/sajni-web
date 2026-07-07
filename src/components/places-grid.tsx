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
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onNavigate(path)}
            className={cn(
              'flex flex-col items-center justify-center gap-2 px-1.5 py-4 text-xs font-medium rounded-2xl transition-colors',
              isActive
                ? 'bg-[hsl(var(--secondary-container))] text-[hsl(var(--on-secondary-container))]'
                : 'bg-[hsl(var(--surface-container))] text-foreground/85 hover:bg-[hsl(var(--surface-container-high))]',
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
