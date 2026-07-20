import React from 'react';
import { WalletDashboard } from '../components/WalletDashboard';

export const WalletPage: React.FC = () => {
  return (
    <div className="py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <WalletDashboard />
      </div>
    </div>
  );
};

export default WalletPage;
