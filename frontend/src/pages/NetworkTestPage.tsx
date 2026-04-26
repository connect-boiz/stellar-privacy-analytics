import React from 'react';
import { SimpleNetworkTest } from '../components/SimpleNetworkTest';

export const NetworkTestPage: React.FC = () => {
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SimpleNetworkTest />
      </div>
    </div>
  );
};
