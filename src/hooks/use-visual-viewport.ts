import { useEffect, useState } from 'react';

// Tracks the *visual* viewport while a full-height mobile surface (chat
// sheet, media form sheet) is open, so a sticky footer / input stays
// above the on-screen keyboard. On iOS Safari the layout viewport keeps
// its size when the keyboard appears — dvh units don't shrink — so a
// fixed full-height sheet leaves controls hidden behind the keyboard.
// visualViewport reports the truth on both platforms; offsetTop covers
// iOS pushing the viewport upward.
export function useVisualViewportBox(active: boolean) {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) { setBox(null); return; }
    const update = () => setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return box;
}
