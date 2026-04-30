import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Users, MessageSquare, History, Wifi, WifiOff, Lock, Send } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Permission = 'owner' | 'editor' | 'viewer';

interface Presence {
  userId: string;
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  lastSeen: number;
}

interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  timestamp: number;
}

interface ChangeRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  timestamp: number;
}

interface CollabState {
  presence: Presence[];
  messages: ChatMessage[];
  history: ChangeRecord[];
  isOnline: boolean;
  pendingChanges: number;
}

type CollabAction =
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'UPSERT_PRESENCE'; payload: Presence }
  | { type: 'REMOVE_PRESENCE'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'ADD_HISTORY'; payload: ChangeRecord }
  | { type: 'SYNC_PENDING'; payload: number };

function reducer(state: CollabState, action: CollabAction): CollabState {
  switch (action.type) {
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload };
    case 'UPSERT_PRESENCE': {
      const exists = state.presence.some(p => p.userId === action.payload.userId);
      return {
        ...state,
        presence: exists
          ? state.presence.map(p => p.userId === action.payload.userId ? action.payload : p)
          : [...state.presence, action.payload],
      };
    }
    case 'REMOVE_PRESENCE':
      return { ...state, presence: state.presence.filter(p => p.userId !== action.payload) };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'ADD_HISTORY':
      return { ...state, history: [action.payload, ...state.history].slice(0, 50) };
    case 'SYNC_PENDING':
      return { ...state, pendingChanges: action.payload };
    default:
      return state;
  }
}

const INITIAL_STATE: CollabState = {
  presence: [
    { userId: 'u1', name: 'Alice', color: '#3b82f6', cursorX: 120, cursorY: 80, lastSeen: Date.now() },
    { userId: 'u2', name: 'Bob', color: '#10b981', cursorX: 300, cursorY: 200, lastSeen: Date.now() },
  ],
  messages: [
    { id: 'm1', userId: 'u1', name: 'Alice', text: 'Starting the privacy analysis.', timestamp: Date.now() - 60000 },
    { id: 'm2', userId: 'u2', name: 'Bob', text: 'I'll handle the encryption dimension.', timestamp: Date.now() - 30000 },
  ],
  history: [
    { id: 'h1', userId: 'u1', name: 'Alice', description: 'Updated privacy level to High', timestamp: Date.now() - 120000 },
    { id: 'h2', userId: 'u2', name: 'Bob', description: 'Added data retention policy', timestamp: Date.now() - 90000 },
  ],
  isOnline: true,
  pendingChanges: 0,
};

const CURRENT_USER = { userId: 'me', name: 'You', color: '#f59e0b', permission: 'editor' as Permission };

const USER_PERMISSIONS: Record<string, Permission> = {
  u1: 'owner',
  u2: 'editor',
  me: 'editor',
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CollaborationInterface: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'permissions'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const offlineQueueRef = useRef<ChangeRecord[]>([]);

  // Simulate online/offline toggle
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'SET_ONLINE', payload: true });
      // Flush offline queue on reconnect
      offlineQueueRef.current.forEach(change => dispatch({ type: 'ADD_HISTORY', payload: change }));
      dispatch({ type: 'SYNC_PENDING', payload: 0 });
      offlineQueueRef.current = [];
    };
    const handleOffline = () => dispatch({ type: 'SET_ONLINE', payload: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Stale presence cleanup
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 30000;
      state.presence.forEach(p => {
        if (p.userId !== CURRENT_USER.userId && p.lastSeen < cutoff) {
          dispatch({ type: 'REMOVE_PRESENCE', payload: p.userId });
        }
      });
    }, 10000);
    return () => clearInterval(id);
  }, [state.presence]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Track local cursor in workspace
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setCursorPos({ x, y });
    dispatch({
      type: 'UPSERT_PRESENCE',
      payload: { ...CURRENT_USER, cursorX: x, cursorY: y, lastSeen: Date.now() },
    });
  }, []);

  const sendMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      userId: CURRENT_USER.userId,
      name: CURRENT_USER.name,
      text,
      timestamp: Date.now(),
    };
    dispatch({ type: 'ADD_MESSAGE', payload: msg });
    setChatInput('');

    // Record in history
    const change: ChangeRecord = {
      id: `h-${Date.now()}`,
      userId: CURRENT_USER.userId,
      name: CURRENT_USER.name,
      description: `Sent annotation: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`,
      timestamp: Date.now(),
    };
    if (state.isOnline) {
      dispatch({ type: 'ADD_HISTORY', payload: change });
    } else {
      offlineQueueRef.current.push(change);
      dispatch({ type: 'SYNC_PENDING', payload: offlineQueueRef.current.length });
    }
  }, [chatInput, state.isOnline]);

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'history', label: 'History', icon: History },
    { id: 'permissions', label: 'Permissions', icon: Lock },
  ] as const;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full" aria-label="Real-time collaboration workspace">
      {/* Workspace canvas */}
      <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">Collaborative Workspace</h1>
          <div className="flex items-center gap-3">
            {/* Online status */}
            <span
              className={`flex items-center gap-1 text-sm font-medium ${state.isOnline ? 'text-green-600' : 'text-red-500'}`}
              aria-live="polite"
              aria-label={state.isOnline ? 'Online' : `Offline – ${state.pendingChanges} pending changes`}
            >
              {state.isOnline ? (
                <Wifi className="h-4 w-4" aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4" aria-hidden="true" />
              )}
              {state.isOnline ? 'Online' : `Offline (${state.pendingChanges} pending)`}
            </span>

            {/* Active users */}
            <div className="flex items-center gap-1" aria-label={`${state.presence.length} users active`}>
              <Users className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <div className="flex -space-x-1">
                {state.presence.map(p => (
                  <div
                    key={p.userId}
                    title={p.name}
                    aria-label={p.name}
                    className="h-7 w-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Canvas with shared cursors */}
        <div
          ref={workspaceRef}
          className="relative bg-gray-50 h-64 lg:h-96 cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          aria-label="Shared workspace canvas. Move mouse to share cursor position."
          role="application"
        >
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-20" aria-hidden="true">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Remote cursors */}
          {state.presence
            .filter(p => p.userId !== CURRENT_USER.userId)
            .map(p => (
              <div
                key={p.userId}
                className="absolute pointer-events-none transition-all duration-100"
                style={{ left: p.cursorX, top: p.cursorY }}
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d="M0 0 L0 12 L3.5 9 L6 14 L8 13 L5.5 8 L10 8 Z" fill={p.color} />
                </svg>
                <span
                  className="absolute top-4 left-1 text-xs text-white px-1 rounded whitespace-nowrap"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name}
                </span>
              </div>
            ))}

          {/* Placeholder content */}
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            <p>Privacy analysis workspace — move your cursor to share position</p>
          </div>

          {/* Local cursor coords (debug) */}
          <div className="absolute bottom-2 right-2 text-xs text-gray-400" aria-hidden="true">
            {cursorPos.x}, {cursorPos.y}
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-full lg:w-80 bg-white rounded-lg shadow flex flex-col">
        {/* Tabs */}
        <div role="tablist" aria-label="Collaboration panels" className="flex border-b border-gray-200">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`collab-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`collab-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Chat panel */}
        <div
          role="tabpanel"
          id="collab-panel-chat"
          aria-labelledby="collab-tab-chat"
          hidden={activeTab !== 'chat'}
          className="flex flex-col flex-1 min-h-0"
        >
          <div
            className="flex-1 overflow-y-auto p-3 space-y-3"
            aria-label="Chat messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {state.messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.userId === CURRENT_USER.userId ? 'items-end' : 'items-start'}`}
              >
                <span className="text-xs text-gray-500 mb-0.5">
                  {msg.userId === CURRENT_USER.userId ? 'You' : msg.name} · {formatTime(msg.timestamp)}
                </span>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    msg.userId === CURRENT_USER.userId
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-gray-200 flex gap-2">
            <label htmlFor="chat-input" className="sr-only">Type a message</label>
            <input
              id="chat-input"
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Chat message input"
            />
            <button
              onClick={sendMessage}
              disabled={!chatInput.trim()}
              aria-label="Send message"
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* History panel */}
        <div
          role="tabpanel"
          id="collab-panel-history"
          aria-labelledby="collab-tab-history"
          hidden={activeTab !== 'history'}
          className="flex-1 overflow-y-auto p-3 space-y-2"
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Change History</h2>
          {state.history.length === 0 && (
            <p className="text-sm text-gray-500">No changes recorded yet.</p>
          )}
          {state.history.map(entry => (
            <div key={entry.id} className="border-l-2 border-blue-200 pl-3 py-1">
              <p className="text-xs font-medium text-gray-900">{entry.name}</p>
              <p className="text-xs text-gray-600">{entry.description}</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatTime(entry.timestamp)}</p>
            </div>
          ))}
        </div>

        {/* Permissions panel */}
        <div
          role="tabpanel"
          id="collab-panel-permissions"
          aria-labelledby="collab-tab-permissions"
          hidden={activeTab !== 'permissions'}
          className="flex-1 overflow-y-auto p-3"
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Access Control</h2>
          <ul className="space-y-2" aria-label="User permissions">
            {[...state.presence, CURRENT_USER].map(p => {
              const perm = USER_PERMISSIONS[p.userId] ?? 'viewer';
              return (
                <li
                  key={p.userId}
                  className="flex items-center justify-between py-2 border-b border-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.color }}
                      aria-hidden="true"
                    >
                      {p.name[0]}
                    </div>
                    <span className="text-sm text-gray-900">
                      {p.userId === CURRENT_USER.userId ? `${p.name} (you)` : p.name}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${
                      perm === 'owner'
                        ? 'bg-purple-100 text-purple-700'
                        : perm === 'editor'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    aria-label={`Permission: ${perm}`}
                  >
                    {perm}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray-500 mt-4">
            <Lock className="h-3 w-3 inline mr-1" aria-hidden="true" />
            Only owners can change permissions.
          </p>
        </div>
      </div>
    </div>
  );
};
