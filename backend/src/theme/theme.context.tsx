import { createContext } from 'react';
import { ThemeMode } from './theme.types';

export interface ThemeContextProps {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  previewTheme: (theme: ThemeMode | null) => void;
}

export const ThemeContext = createContext<ThemeContextProps>({
  mode: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  previewTheme: () => {},
});