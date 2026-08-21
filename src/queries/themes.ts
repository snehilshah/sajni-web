import { useQuery } from '@tanstack/react-query';
import { themes as themesApi } from '@/api';
import { qk } from './keys';

// ThemeProvider owns activation and painting. This query is only the stable
// management list shown in Settings.
export function useThemes() {
  return useQuery({ queryKey: qk.themes.list(), queryFn: () => themesApi.list() });
}
