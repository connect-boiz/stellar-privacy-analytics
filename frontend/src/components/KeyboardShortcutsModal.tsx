import { useState, useEffect, useCallback } from 'react';

interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  category: string;
}

function ShortcutKey({ shortcut }: { shortcut: ShortcutDefinition }) {
  const keys: string[] = [];
  if (shortcut.ctrl) keys.push('Ctrl');
  if (shortcut.alt) keys.push('Alt');
  if (shortcut.shift) keys.push('Shift');
  keys.push(shortcut.key === '?' ? '?' : shortcut.key.toUpperCase());

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-700">{shortcut.description}</span>
      <div className="flex gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-300 rounded shadow-sm"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  { key: '/', description: 'Search', category: 'Navigation' },
  { key: 'n', ctrl: true, description: 'New dataset', category: 'Actions' },
  { key: 's', ctrl: true, description: 'Save', category: 'Actions' },
  { key: '?', description: 'Toggle shortcuts', category: 'Help' },
  { key: 'Escape', description: 'Close modal', category: 'General' },
];

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [shortcuts] = useState<ShortcutDefinition[]>(DEFAULT_SHORTCUTS);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const toggleHelp = (event: KeyboardEvent) => {
      if (event.key === '?') {
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', toggleHelp);
    return () => window.removeEventListener('keydown', toggleHelp);
  }, []);

  if (!isOpen) return null;

  const byCategory = shortcuts.reduce<Record<string, ShortcutDefinition[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category} className="py-3 first:pt-0 last:pb-0">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {category}
              </h3>
              {items.map((s, i) => (
                <ShortcutKey key={i} shortcut={s} />
              ))}
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-500 text-center">
          Press{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Esc</kbd>{' '}
          or click outside to close
        </div>
      </div>
    </div>
  );
}
