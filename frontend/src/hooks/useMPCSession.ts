import { useState, useCallback, useEffect } from 'react';

export interface Participant {
  id: string;
  publicKey: string;
  nickname: string;
  isHost: boolean;
  isOnline: boolean;
  isReady: boolean;
  joinedAt: Date;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  phase?: string;
  message: string;
}

export interface MPCSession {
  id: string;
  name: string;
  hostId: string;
  participants: Participant[];
  logs: LogEntry[];
  isComputing: boolean;
  hasStarted: boolean;
  createdAt: Date;
}

export const useMPCSession = () => {
  const [session, setSession] = useState<MPCSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize a new session
  const createSession = useCallback(async (name: string, hostPublicKey: string, hostNickname: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const newSession: MPCSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        hostId: hostPublicKey,
        participants: [
          {
            id: hostPublicKey,
            publicKey: hostPublicKey,
            nickname: hostNickname,
            isHost: true,
            isOnline: true,
            isReady: false,
            joinedAt: new Date()
          }
        ],
        logs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date(),
            level: 'info',
            message: `Session "${name}" created by ${hostNickname}`
          }
        ],
        isComputing: false,
        hasStarted: false,
        createdAt: new Date()
      };

      setSession(newSession);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add a participant to the session
  const addParticipant = useCallback((publicKey: string, nickname: string) => {
    if (!session) return;

    const newParticipant: Participant = {
      id: publicKey,
      publicKey,
      nickname,
      isHost: false,
      isOnline: true,
      isReady: false,
      joinedAt: new Date()
    };

    setSession(prev => {
      if (!prev) return prev;
      
      // Check if participant already exists
      if (prev.participants.some(p => p.id === publicKey)) {
        return prev;
      }

      const updatedSession = {
        ...prev,
        participants: [...prev.participants, newParticipant],
        logs: [
          ...prev.logs,
          {
            id: `log_${Date.now()}`,
            timestamp: new Date(),
            level: 'info',
            message: `${nickname} joined the session`
          }
        ]
      };

      return updatedSession;
    });
  }, [session]);

  // Update participant status
  const updateParticipantStatus = useCallback((participantId: string, status: Partial<Participant>) => {
    setSession(prev => {
      if (!prev) return prev;

      const updatedSession = {
        ...prev,
        participants: prev.participants.map(p => 
          p.id === participantId ? { ...p, ...status } : p
        )
      };

      return updatedSession;
    });
  }, []);

  // Add a log entry
  const addLog = useCallback((level: LogEntry['level'], message: string, phase?: string) => {
    setSession(prev => {
      if (!prev) return prev;

      const newLog: LogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        level,
        phase,
        message
      };

      return {
        ...prev,
        logs: [...prev.logs, newLog]
      };
    });
  }, []);

  // Start computation
  const startComputation = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    setError(null);

    try {
      // Add starting log
      addLog('info', 'Starting MPC computation...', 'initialization');

      // Update session state
      setSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isComputing: true,
          hasStarted: true
        };
      });

      // Simulate computation phases
      const phases = [
        { name: 'initialization', duration: 2000, messages: ['Initializing secure computation environment', 'Setting up cryptographic parameters'] },
        { name: 'key_generation', duration: 3000, messages: ['Generating cryptographic keys', 'Creating zero-knowledge proof circuits'] },
        { name: 'data_encryption', duration: 2500, messages: ['Encrypting input data', 'Preparing secure shares'] },
        { name: 'computation', duration: 4000, messages: ['Performing secure multiparty computation', 'Generating zero-knowledge proofs'] },
        { name: 'verification', duration: 2000, messages: ['Verifying computation results', 'Validating zero-knowledge proofs'] },
        { name: 'completion', duration: 1000, messages: ['Computation completed successfully', 'Results ready'] }
      ];

      for (const phase of phases) {
        addLog('info', `Starting ${phase.name.replace('_', ' ')} phase`, phase.name);
        
        for (const message of phase.messages) {
          await new Promise(resolve => setTimeout(resolve, phase.duration / phase.messages.length));
          addLog('info', message, phase.name);
        }

        addLog('success', `${phase.name.replace('_', ' ')} phase completed`, phase.name);
      }

      // Mark computation as complete
      setSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isComputing: false
        };
      });

      addLog('success', 'MPC computation completed successfully!');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Computation failed');
      addLog('error', `Computation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      setSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isComputing: false
        };
      });
    } finally {
      setIsLoading(false);
    }
  }, [session, addLog]);

  // Get session statistics
  const getSessionStats = useCallback(() => {
    if (!session) return null;

    const totalParticipants = session.participants.length;
    const onlineParticipants = session.participants.filter(p => p.isOnline).length;
    const readyParticipants = session.participants.filter(p => p.isReady).length;

    return {
      totalParticipants,
      onlineParticipants,
      readyParticipants,
      isReady: totalParticipants > 0 && readyParticipants === totalParticipants,
      canStart: totalParticipants > 1 && readyParticipants === totalParticipants && !session.hasStarted
    };
  }, [session]);

  // Clear session
  const clearSession = useCallback(() => {
    setSession(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
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
  };
};
