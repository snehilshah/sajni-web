import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Task } from '@/types';
import { Check } from '@/components/ui/icons';
import { FlowFill } from '@/components/ui/flow-fill';
import { useToggleTaskStatus } from '@/queries/tasks';
import { doneColors } from './look';

/**
 * Finishing a task from the list (the row's Done, an In progress card's
 * Done): the sage wave drifts across it with a white "Done" for a beat,
 * then it files under Done with "Done: … Undo". A refusal (open steps or
 * subtasks) puts it back with the server's reason.
 */
export function useFinishTask(task: Task) {
  const toggle = useToggleTaskStatus();
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const open = task.status !== 'done' && task.status !== 'scratched';
  const finish = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!open || finishing) return;
    const prev = task.status;
    setFinishing(true);
    timer.current = window.setTimeout(() => {
      toggle.mutate(
        { id: task.id, status: 'done' },
        {
          onSuccess: () =>
            toast(`Done: ${task.title}`, {
              action: { label: 'Undo', onClick: () => toggle.mutate({ id: task.id, status: prev }) },
            }),
          onSettled: () => setFinishing(false),
        },
      );
    }, 900);
  };
  return { open, finishing, finish };
}

/** The finishing moment over a row or card: the wave, "Done", the title. */
export function FinishOverlay({ show, title, className }: { show: boolean; title: string; className?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
          className={'absolute inset-0 z-10 flex items-center gap-3 overflow-hidden px-3.5 ' + (className ?? '')}
        >
          <FlowFill colors={doneColors()} />
          <motion.span
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 18, delay: 0.12 }}
            className="relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white pr-3.5 pl-2.5 text-sm font-semibold text-[#2e5a3e]"
          >
            <Check className="size-4" strokeWidth={3} /> Done
          </motion.span>
          <span className="relative truncate text-[0.9375rem] font-medium text-white/90">{title}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
