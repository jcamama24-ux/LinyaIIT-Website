import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'linyaiit_theme_v1';
const THEME_CHANGE_EVENT = 'linyaiit-theme-change';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#020617' : '#7A0019');
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write errors
  }

  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function useTheme(): {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const syncFromDom = (event: Event) => {
      const custom = event as CustomEvent<ThemeMode>;
      if (custom.detail === 'dark' || custom.detail === 'light') {
        setThemeState(custom.detail);
      }
    };

    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
        applyTheme(event.newValue);
        setThemeState(event.newValue);
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, syncFromDom);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromDom);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  };
}