import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as destructive (default true — every current
   *  call site is a delete). Pass false for a neutral confirm. */
  destructive?: boolean;
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let emit: ((req: Request) => void) | null = null;

/**
 * Imperative, promise-based replacement for the native window.confirm — keeps
 * the app 100% Material-expressive (shadcn AlertDialog) with no native browser
 * dialogs. Mount <ConfirmRoot/> once near the app root, then:
 *
 *   if (!(await confirmDialog('Delete this?'))) return;
 *
 * Resolves true when the user confirms, false on cancel / dismiss.
 */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { description: opts } : opts;
  return new Promise((resolve) => {
    if (!emit) {
      // Root not mounted — fail safe (never auto-confirm a destructive action).
      resolve(false);
      return;
    }
    emit({ ...o, resolve });
  });
}

/** Singleton dialog host. Render exactly once, high in the tree. */
export function ConfirmRoot() {
  const [req, setReq] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    emit = (r) => {
      setReq(r);
      setOpen(true);
    };
    return () => {
      emit = null;
    };
  }, []);

  const settle = (ok: boolean) => {
    setOpen(false);
    req?.resolve(ok);
    // Resolve immediately; clear state after the close animation.
    window.setTimeout(() => setReq(null), 150);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) settle(false);
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title ?? 'Are you sure?'}</AlertDialogTitle>
          <AlertDialogDescription>{req?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {req?.cancelText ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={req?.destructive === false ? 'default' : 'destructive'}
            onClick={() => settle(true)}
          >
            {req?.confirmText ?? 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
