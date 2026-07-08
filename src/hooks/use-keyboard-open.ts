import { useEffect, useState } from 'react';

// True while the on-screen keyboard is (very likely) up: the visual
// viewport is meaningfully shorter than the layout viewport. Used to
// slide the mobile bottom dock out of the way while typing.
const KEYBOARD_MIN_PX = 140;

export function useKeyboardOpen(enabled = true) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) {
      setOpen(false);
      return;
    }
    const update = () => setOpen(window.innerHeight - vv.height > KEYBOARD_MIN_PX);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [enabled]);

  return open;
}
