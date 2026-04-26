export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
}