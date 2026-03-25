import React from 'react';
import { Play, Shield, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface StartComputationButtonProps {
  isReady: boolean;
  isComputing: boolean;
  hasStarted: boolean;
  onStartComputation: () => void;
  participantsCount: number;
  readyCount: number;
}

export const StartComputationButton: React.FC<StartComputationButtonProps> = ({
  isReady,
  isComputing,
  hasStarted,
  onStartComputation,
  participantsCount,
  readyCount
}) => {
  const getButtonState = () => {
    if (hasStarted) {
      return {
        text: 'Computation Running',
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        className: 'bg-blue-600 text-white hover:bg-blue-700 cursor-not-allowed',
        disabled: true
      };
    }

    if (isComputing) {
      return {
        text: 'Starting Computation...',
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        className: 'bg-yellow-600 text-white hover:bg-yellow-700 cursor-not-allowed',
        disabled: true
      };
    }

    if (participantsCount === 0) {
      return {
        text: 'Invite Partners to Start',
        icon: <AlertTriangle className="w-4 h-4" />,
        className: 'bg-gray-400 text-white cursor-not-allowed',
        disabled: true
      };
    }

    if (readyCount < participantsCount) {
      return {
        text: `Waiting for ${participantsCount - readyCount} Participants`,
        icon: <AlertTriangle className="w-4 h-4" />,
        className: 'bg-yellow-500 text-white cursor-not-allowed',
        disabled: true
      };
    }

    return {
      text: 'Start Computation',
      icon: <Play className="w-4 h-4" />,
      className: 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200',
      disabled: false
    };
  };

  const buttonState = getButtonState();

  return (
    <div className="space-y-4">
      {/* Main Button */}
      <button
        onClick={onStartComputation}
        disabled={buttonState.disabled}
        className={`w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${buttonState.className}`}
      >
        {buttonState.icon}
        <span>{buttonState.text}</span>
      </button>

      {/* Status Messages */}
      {!hasStarted && (
        <div className="space-y-2">
          {participantsCount > 0 && (
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />
              <span>
                {readyCount} of {participantsCount} participants ready
              </span>
            </div>
          )}

          {isReady && (
            <div className="flex items-center justify-center space-x-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              <span>All participants ready - you can start the computation</span>
            </div>
          )}

          {participantsCount === 0 && (
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span>Invite at least one partner to start computation</span>
            </div>
          )}

          {readyCount < participantsCount && participantsCount > 0 && (
            <div className="flex items-center justify-center space-x-2 text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
              <span>Waiting for all participants to be ready</span>
            </div>
          )}
        </div>
      )}

      {/* Computation Info */}
      {hasStarted && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-sm text-blue-800">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-medium">MPC Computation in Progress</span>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Zero-knowledge proof generation is running. This may take several minutes.
          </p>
          <div className="mt-3 space-y-1">
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Initializing secure computation</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-75" />
              <span>Generating zero-knowledge proofs</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150" />
              <span>Processing encrypted data</span>
            </div>
          </div>
        </div>
      )}

      {/* Security Notice */}
      {!hasStarted && isReady && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <Shield className="w-4 h-4 text-green-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800">Privacy Protected</h4>
              <p className="text-xs text-green-600 mt-1">
                Your data will be processed using secure multi-party computation. 
                No participant can access raw data from other parties.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
