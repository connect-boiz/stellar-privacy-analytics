import React, { useState, useEffect } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { InvitePartnerForm } from '../components/mpc/InvitePartnerForm';
import { ParticipantsList } from '../components/mpc/ParticipantsList';
import { LogTerminal } from '../components/mpc/LogTerminal';
import { DataPreview } from '../components/mpc/DataPreview';
import { StartComputationButton } from '../components/mpc/StartComputationButton';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMPCSession } from '../hooks/useMPCSession';
import { toast } from 'react-hot-toast';


export const MPCWorkspace: React.FC = () => {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'query' | 'results' | 'metadata'>('query');

  const ws = useWebSocket('ws://localhost:3001/mpc');
  const {
    session,
    isLoading,
    error,
    createSession,
    addParticipant,
    updateParticipantStatus,
    addLog,
    startComputation,
    getSessionStats,
    clearSession
  } = useMPCSession();

  const sessionStats = getSessionStats();

  useEffect(() => {
    if (ws.lastMessage) {
      const message = JSON.parse(ws.lastMessage.data);
      handleWebSocketMessage(message);
    }
  }, [ws.lastMessage]);

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'participant_joined':
        if (message.participant) {
          addParticipant(message.participant.publicKey, message.participant.nickname);
        }
        break;

      case 'participant_status':
        if (message.participantId && message.status) {
          updateParticipantStatus(message.participantId, message.status);
        }
        break;

      case 'computation_started':
        addLog('info', 'MPC computation started', 'initialization');
        break;

      case 'computation_phase':
        addLog('info', message.message, message.phase);
        break;

      case 'computation_completed':
        addLog('success', 'MPC computation completed successfully', 'completion');
        setActiveTab('results');
        break;

      case 'computation_error':
        addLog('error', `Computation failed: ${message.error}`, 'error');
        toast.error('MPC computation failed');
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  };


  const handleCreateSession = async (sessionName: string) => {
    try {
      // Simulate host user data
      const hostPublicKey = 'G' + 'A'.repeat(55);
      const hostNickname = 'Host';
      await createSession(sessionName, hostPublicKey, hostNickname);
      toast.success('Session created successfully');
    } catch (error) {
      toast.error('Failed to create session');
    }
  };

  const handleInvitePartner = async (stellarPublicKey: string, nickname: string) => {
    try {
      addParticipant(stellarPublicKey, nickname);
      toast.success('Invitation sent successfully');
      setShowInviteForm(false);
    } catch (error) {
      toast.error('Failed to send invitation');
    }
  };

  const handleStartComputation = async () => {
    try {
      await startComputation();
    } catch (error) {
      toast.error('Failed to start computation');
    }
  };


  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <Users className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Create MPC Session</h2>
            <p className="text-gray-600 mb-6">Start a new collaborative analytics workspace</p>
            <button
              onClick={() => handleCreateSession(`Session ${Date.now()}`)}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Create New Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${session.isComputing
                ? 'text-blue-600 bg-blue-50 border-blue-200'
                : session.hasStarted
                  ? 'text-green-600 bg-green-50 border-green-200'
                  : 'text-yellow-600 bg-yellow-50 border-yellow-200'
              }`}>
              <div className={`w-2 h-2 rounded-full ${session.isComputing
                  ? 'bg-blue-500 animate-pulse'
                  : session.hasStarted
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                }`} />
              <span className="text-sm font-medium">
                {session.isComputing ? 'Computing' : session.hasStarted ? 'Completed' : 'Ready'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              {sessionStats?.totalParticipants || 0} participants
            </span>
            <button
              onClick={() => setShowInviteForm(true)}
              className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Invite Partner</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-screen pt-16">
        {/* Left Sidebar - Participants */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Participants</h2>
            <ParticipantsList participants={session.participants} />
            <div className="mt-6">
              <StartComputationButton
                isReady={sessionStats?.isReady || false}
                isComputing={session.isComputing}
                hasStarted={session.hasStarted}
                onStartComputation={handleStartComputation}
                participantsCount={sessionStats?.totalParticipants || 0}
                readyCount={sessionStats?.readyParticipants || 0}
              />
            </div>
          </div>
        </div>

        {/* Center - Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200">
            <div className="flex space-x-8 px-6">
              {(['query', 'results', 'metadata'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${activeTab === tab
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'query' && (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Query Panel</h3>
                  <p className="text-sm">Query interface will be implemented here</p>
                </div>
              </div>
            )}
            {activeTab === 'results' && (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Database className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Results Panel</h3>
                  <p className="text-sm">Results will appear here after computation</p>
                </div>
              </div>
            )}
            {activeTab === 'metadata' && (
              <DataPreview
                data={[
                  { id: 1, name: 'Sample Data 1', value: 100, category: 'A' },
                  { id: 2, name: 'Sample Data 2', value: 200, category: 'B' },
                  { id: 3, name: 'Sample Data 3', value: 150, category: 'A' },
                ]}
                isLoading={false}
                isAnonymized={true}
              />
            )}
          </div>
        </div>

        {/* Right Sidebar - Logs */}
        <div className="w-96 bg-gray-900 border-l border-gray-200 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <LogTerminal logs={session.logs} />
          </div>
        </div>
      </div>

      {/* Invite Partner Modal */}
      {showInviteForm && (
        <InvitePartnerForm
          onSubmit={handleInvitePartner}
          onCancel={() => setShowInviteForm(false)}
        />
      )}
    </div>
  );
};
