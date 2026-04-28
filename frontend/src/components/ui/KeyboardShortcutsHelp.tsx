import React from 'react';
import { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-2">
          {shortcuts.map((shortcut, i) => (
            <li key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-800">
                {formatShortcut(shortcut)}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-400 text-center">Press ? to toggle this panel</p>
      </div>
    </div>
  );
}
