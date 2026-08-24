import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { media as mediaApi, type MediaRefreshResult } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { qk } from '@/queries/keys';

// React StrictMode remounts effects in development. Keep one request per
// authenticated user for this browser process; the API owns the real weekly
// throttle shared by every client and device.
const refreshes = new Map<string, Promise<MediaRefreshResult>>();

function refreshFor(userID: string): Promise<MediaRefreshResult> {
  const existing = refreshes.get(userID);
  if (existing) return existing;
  const request = mediaApi.refresh().catch((err) => {
    refreshes.delete(userID);
    throw err;
  });
  refreshes.set(userID, request);
  return request;
}

export default function MediaStartupRefresh() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    refreshFor(user.id)
      .then((result) => {
        if (cancelled) return;
        if (result.checked > 0) {
          queryClient.invalidateQueries({ queryKey: qk.media.all });
        }
        if (result.changed === 0) return;
        const first = result.titles[0] || 'a saved show';
        const rest = result.changed - 1;
        toast.success(
          rest > 0
            ? `New seasons detected for ${first} and ${rest} more`
            : `New season detected for ${first}`,
        );
      })
      .catch(() => {
        // Best-effort startup freshness. The existing library remains usable,
        // and unsuccessful rows stay eligible for the next app launch.
      });
    return () => { cancelled = true; };
  }, [queryClient, user]);

  return null;
}
