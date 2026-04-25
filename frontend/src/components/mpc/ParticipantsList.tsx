import React from 'react';
import { Wifi, WifiOff, Activity, Clock, CheckCircle, User, Crown } from 'lucide-react';

interface Participant {
  id: string;
  stellarPublicKey: string;
  nickname: string;
  status: 'online' | 'offline' | 'ready';
  joinedAt: Date;
  isHost?: boolean;
}

interface ParticipantsListProps {
  participants: Participant[];
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({ participants }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'offline':
        return <WifiOff className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'ready':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'offline':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'ready':
        return 'Ready';
      case 'offline':
        return 'Offline';
      default:
        return 'Connecting';
    }
  };

  const formatPublicKey = (key: string) => {
    if (key.length <= 8) return key;
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  const formatJoinTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const readyCount = participants.filter(p => p.status === 'ready').length;
  const onlineCount = participants.filter(p => p.status === 'online').length;
  const totalCount = participants.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
            <div className="text-xs text-gray-500">Online</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">{readyCount}</div>
            <div className="text-xs text-gray-500">Ready</div>
          </div>
        </div>
      </div>

      {/* Participants List */}
      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  {participant.isHost && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                      <Crown className="w-2 h-2 text-yellow-900" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {participant.nickname}
                    </p>
                    {participant.isHost && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                        Host
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">
                    {formatPublicKey(participant.stellarPublicKey)}
                  </p>
                  <p className="text-xs text-gray-400">
                    Joined {formatJoinTime(participant.joinedAt)}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center space-x-2">
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-full border ${getStatusColor(participant.status)}`}>
                  {getStatusIcon(participant.status)}
                  <span className="text-xs font-medium">
                    {getStatusText(participant.status)}
                  </span>
                </div>
                
                {participant.status === 'ready' && (
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
            </div>

            {/* Progress bar for ready participants */}
            {participant.status === 'ready' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
                  <span className="text-xs text-blue-600">Ready for computation</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {participants.length === 0 && (
          <div className="text-center py-8">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No participants yet</p>
            <p className="text-gray-400 text-xs mt-1">Invite partners to get started</p>
          </div>
        )}
      </div>

      {/* Ready Status Indicator */}
      {readyCount > 0 && readyCount === participants.length && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              All participants ready! You can start the computation.
            </span>
          </div>
        </div>
      )}

      {readyCount > 0 && readyCount < participants.length && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              {readyCount} of {participants.length} participants ready
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
