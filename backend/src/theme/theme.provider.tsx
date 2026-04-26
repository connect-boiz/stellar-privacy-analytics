import React, { useEffect, useState } from 'react';
import { ThemeContext } from './theme.context';
import { ThemeMode } from './theme.types';
import { getStoredTheme, saveTheme } from './theme.storage';
import { getSystemTheme } from './theme.utils';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [preview, setPreview] = useState<ThemeMode | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) setMode(stored);
  }, []);

  useEffect(() => {
    const activeMode = preview || mode;

    const resolved =
      activeMode === 'system' ? getSystemTheme() : activeMode;

    setResolvedTheme(resolved);

    document.documentElement.setAttribute('data-theme', resolved);
  }, [mode, preview]);

  const setTheme = (theme: ThemeMode) => {
    setMode(theme);
    saveTheme(theme);
  };

  const previewTheme = (theme: ThemeMode | null) => {
    setPreview(theme);
  };

  return (
    <ThemeContext.Provider
      value={{ mode, resolvedTheme, setTheme, previewTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};