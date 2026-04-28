import React from 'react';
import { useTheme } from '../theme.hook';

export const ThemePreview = () => {
  const { previewTheme } = useTheme();

  return (
    <div>
      <button
        onMouseEnter={() => previewTheme('light')}
        onMouseLeave={() => previewTheme(null)}
      >
        Preview Light
      </button>

      <button
        onMouseEnter={() => previewTheme('dark')}
        onMouseLeave={() => previewTheme(null)}
      >
        Preview Dark
      </button>
    </div>
  );
};