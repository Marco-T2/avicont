import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/theme-store';

// Toggle binario light/dark. El modo "system" existe en el store pero no
// se expone en la UI — cambia automáticamente al preferido del sistema.
export function ThemeToggle(): React.JSX.Element {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
