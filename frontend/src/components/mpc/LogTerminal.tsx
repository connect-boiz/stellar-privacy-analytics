import React, { useEffect, useRef } from 'react';
import { Terminal, CheckCircle, AlertCircle, Info, AlertTriangle, X, Download } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  phase?: string;
}

interface LogTerminalProps {
  logs: LogEntry[];
}

export const LogTerminal: React.FC<LogTerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default:
        return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const clearLogs = () => {
    // This would be handled by the parent component
    console.log('Clear logs requested');
  };

  const downloadLogs = () => {
    const logText = logs.map(log => {
      const timestamp = formatTimestamp(log.timestamp);
      const level = log.level.toUpperCase();
      const phase = log.phase ? `[${log.phase}]` : '';
      return `[${timestamp}] ${level} ${phase} ${log.message}`;
    }).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mpc-logs-${new Date().toISOString().slice(0, 19)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Initialization':
        return 'text-purple-400';
      case 'Setup':
        return 'text-cyan-400';
      case 'Computation':
        return 'text-green-400';
      case 'Verification':
        return 'text-yellow-400';
      case 'Finalization':
        return 'text-blue-400';
      case 'Error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Computation Log</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            {logs.length} entries
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={downloadLogs}
            className="text-gray-400 hover:text-gray-300 transition-colors"
            title="Download logs"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={clearLogs}
            className="text-gray-400 hover:text-gray-300 transition-colors"
            title="Clear logs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        style={{ minHeight: '0' }}
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Terminal className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">Waiting for computation logs...</p>
            <p className="text-xs mt-1 opacity-75">Logs will appear here when computation starts</p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-2 text-gray-300">
                {/* Timestamp */}
                <span className="text-gray-500 text-xs mt-0.5 whitespace-nowrap">
                  {formatTimestamp(log.timestamp)}
                </span>

                {/* Log Icon */}
                <span className={`mt-0.5 ${getLogColor(log.level)}`}>
                  {getLogIcon(log.level)}
                </span>

                {/* Log Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    {/* Level Badge */}
                    <span className={`text-xs font-medium ${getLogColor(log.level)} uppercase`}>
                      {log.level}
                    </span>

                    {/* Phase Badge */}
                    {log.phase && (
                      <span className={`text-xs font-medium ${getPhaseColor(log.phase)}`}>
                        [{log.phase}]
                      </span>
                    )}
                  </div>

                  {/* Message */}
                  <p className="text-gray-300 break-words leading-tight mt-0.5">
                    {log.message}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator for active computation */}
            {logs.length > 0 && logs[logs.length - 1].level === 'info' && (
              <div className="flex items-center space-x-2 text-gray-500 mt-2">
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-gray-500 rounded-full animate-pulse" />
                  <div className="w-1 h-1 bg-gray-500 rounded-full animate-pulse delay-75" />
                  <div className="w-1 h-1 bg-gray-500 rounded-full animate-pulse delay-150" />
                </div>
                <span className="text-xs">Processing...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Terminal Footer */}
      <div className="border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>Real-time MPC computation logs</span>
            <span>•</span>
            <span>WebSocket connected</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live</span>
          </div>
        </div>
      </div>
    </div>
  );
};
