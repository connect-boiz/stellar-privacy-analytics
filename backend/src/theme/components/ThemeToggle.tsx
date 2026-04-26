import React from 'react';
import { useTheme } from '../theme.hook';

export const ThemeToggle = () => {
  const { mode, setTheme } = useTheme();

  return (
    <div>
      <button onClick={() => setTheme('light')}>
        Light {mode === 'light' && '✓'}
      </button>

      <button onClick={() => setTheme('dark')}>
        Dark {mode === 'dark' && '✓'}
      </button>

      <button onClick={() => setTheme('system')}>
        System {mode === 'system' && '✓'}
      </button>
    </div>
  );
};