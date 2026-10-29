import { useEffect, useState } from 'react';
import { format } from 'date-fns';

const todayKey = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Today's date (yyyy-MM-dd) that turns over by itself: at midnight while the
 * page is open, and when the tab or PWA comes back after sleeping through it
 * (suspended timers don't fire on time). A page left open overnight would
 * otherwise keep asking for yesterday.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      setToday(todayKey());
      clearTimeout(timer);
      const midnight = new Date();
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(check, midnight.getTime() - Date.now());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
