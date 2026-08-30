import { THEME_STORAGE_KEY } from "./theme.constants";
import { ThemeMode } from "./theme.types";

export const saveTheme = (theme: ThemeMode) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures (private mode, quota exceeded, etc.)
  }
};

export const getStoredTheme = (): ThemeMode | null => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
  } catch {
    return null;
  }
};
