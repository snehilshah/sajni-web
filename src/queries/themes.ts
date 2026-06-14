import { useQuery } from '@tanstack/react-query';
import { themes as themesApi } from '@/api';
import { qk } from './keys';

// The active theme + its application live in ThemeProvider; this is just the
// management list shown in Settings. Mutations there call themesApi directly
// (tied to the provider's apply/refresh) and invalidate qk.themes.all.
export function useThemes() {
  return useQuery({ queryKey: qk.themes.list(), queryFn: () => themesApi.list() });
}
