import { useTheme, type Density, type ModePref } from '@/theme/ThemeProvider';

export type { Density, ModePref };

export function useMode() {
  const { modePref, setMode } = useTheme();
  return { mode: modePref, setMode };
}

export function useDensity() {
  const { density, setDensity } = useTheme();
  return { density, setDensity };
}
