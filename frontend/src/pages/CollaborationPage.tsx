import React from 'react';
import { CollaborationInterface } from '../components/CollaborationInterface';

export const CollaborationPage: React.FC = () => (
  <div className="space-y-4">
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-2xl font-bold text-gray-900">Real-time Collaboration</h1>
      <p className="text-gray-600 mt-1">
        Work together on privacy analyses with live presence, shared cursors, and synchronized state.
      </p>
    </div>
    <CollaborationInterface />
  </div>
);
