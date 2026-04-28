import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export interface ShortcutDefinition {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  description: string;
  category: string;
  action: () => void;
}

// Global state for the help modal
let setHelpModalOpenGlobal: ((open: boolean) => void) | null = null;

export function useKeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setHelpModalOpenGlobal = setIsOpen;
    return () => {
      setHelpModalOpenGlobal = null;
    };
  }, []);

  return { isOpen, setIsOpen };
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutDefinition[] = [
    // Navigation
    {
      key: 'g',
      altKey: true,
      description: 'Go to Dashboard',
      category: 'Navigation',
      action: () => navigate('/dashboard'),
    },
    {
      key: 'a',
      altKey: true,
      description: 'Go to Analytics',
      category: 'Navigation',
      action: () => navigate('/analytics'),
    },
    {
      key: 'd',
      altKey: true,
      description: 'Go to Data Management',
      category: 'Navigation',
      action: () => navigate('/data'),
    },
    {
      key: 'p',
      altKey: true,
      description: 'Go to Privacy Settings',
      category: 'Navigation',
      action: () => navigate('/privacy'),
    },
    {
      key: 'u',
      altKey: true,
      description: 'Go to Encrypted Upload',
      category: 'Navigation',
      action: () => navigate('/upload'),
    },
    {
      key: 'b',
      altKey: true,
      description: 'Go to Privacy Budget',
      category: 'Navigation',
      action: () => navigate('/budget'),
    },
    {
      key: 'k',
      altKey: true,
      description: 'Go to Key Management',
      category: 'Navigation',
      action: () => navigate('/key-management'),
    },
    {
      key: 'l',
      altKey: true,
      description: 'Go to Audit Logs',
      category: 'Navigation',
      action: () => navigate('/audit'),
    },
    {
      key: 's',
      altKey: true,
      description: 'Go to Search',
      category: 'Navigation',
      action: () => navigate('/search'),
    },
    {
      key: 'c',
      altKey: true,
      description: 'Go to Consent Management',
      category: 'Navigation',
      action: () => navigate('/consent'),
    },
    // Actions
    {
      key: 'Escape',
      description: 'Go back / Close modal',
      category: 'Actions',
      action: () => {
        if (setHelpModalOpenGlobal) {
          setHelpModalOpenGlobal(false);
        } else {
          navigate(-1);
        }
      },
    },
    {
      key: 'r',
      altKey: true,
      description: 'Refresh current page data',
      category: 'Actions',
      action: () => {
        window.location.reload();
      },
    },
    // Help
    {
      key: '?',
      shiftKey: true,
      description: 'Show keyboard shortcuts help',
      category: 'Help',
      action: () => {
        if (setHelpModalOpenGlobal) {
          setHelpModalOpenGlobal(true);
        } else {
          const byCategory = shortcuts.reduce<Record<string, ShortcutDefinition[]>>((acc, s) => {
            if (!acc[s.category]) acc[s.category] = [];
            acc[s.category].push(s);
            return acc;
          }, {});

          const lines = Object.entries(byCategory).flatMap(([cat, items]) => [
            `── ${cat} ──`,
            ...items.map((s) => {
              const mods = [s.ctrlKey && 'Ctrl', s.altKey && 'Alt', s.shiftKey && 'Shift']
                .filter(Boolean)
                .join('+');
              return `  ${mods ? mods + '+' : ''}${s.key.toUpperCase()}: ${s.description}`;
            }),
          ]);
          toast(lines.join('\n'), { duration: 8000, icon: '⌨️' });
        }
      },
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
        const altMatch = !!shortcut.altKey === event.altKey;
        const shiftMatch = !!shortcut.shiftKey === event.shiftKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [navigate] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}
