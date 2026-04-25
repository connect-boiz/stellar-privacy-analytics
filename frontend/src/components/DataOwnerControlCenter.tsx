import React, { useState } from 'react';
import { signTransaction } from '@stellar/freighter-api';
import { AlertTriangle, ShieldX, CheckCircle, Loader2, X } from 'lucide-react';
import { Modal, ConfirmDialog } from './ui/Modal';

interface Consumer {
  id: string;
  name: string;
  permissionLevel: string;
  activeSince: string;
}

const MOCK_CONSUMERS: Consumer[] = [
  { id: 'usr_1', name: 'Acme Corp Analytics', permissionLevel: 'Full Analytics', activeSince: '2023-10-12' },
  { id: 'usr_2', name: 'Global Health NGO', permissionLevel: 'Aggregated Only', activeSince: '2023-11-05' },
  { id: 'usr_3', name: 'Stellar Data Indexer', permissionLevel: 'Metadata', activeSince: '2024-01-20' },
];

export const DataOwnerControlCenter: React.FC = () => {
  const [consumers, setConsumers] = useState<Consumer[]>(MOCK_CONSUMERS);
  const [modalState, setModalState] = useState<{ isOpen: boolean; consumer: Consumer | null; step: number }>({
    isOpen: false,
    consumer: null,
    step: 1,
  });
  const [isPending, setIsPending] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 5000);
  };

  const handleRevoke = async (consumerId: string | 'ALL') => {
    const previousConsumers = [...consumers];

    // Optimistic UI Update
    if (consumerId === 'ALL') {
      setConsumers([]);
    } else {
      setConsumers(consumers.filter(c => c.id !== consumerId));
    }

    setIsPending(true);
    setModalState({ ...modalState, step: 2 });

    try {
      // Mock XDR creation for Stellar transaction
      const mockXdr = "AAAAAgAAAAB...";

      // Freighter integration: Sign the revocation transaction
      const signedTx = await signTransaction(mockXdr, { network: 'TESTNET' });

      if (!signedTx) throw new Error("User declined transaction");

      // In production, submit the signedTx to Horizon here...
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate ledger consensus delay

      showToast(consumerId === 'ALL' ? 'Emergency Revocation successful.' : 'Access revoked successfully.', 'success');
      setModalState({ isOpen: false, consumer: null, step: 1 });
    } catch (error) {
      // Rollback on failure
      setConsumers(previousConsumers);
      showToast('Transaction failed or was rejected. State rolled back.', 'error');
      setModalState({ isOpen: false, consumer: null, step: 1 });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg flex items-center space-x-2 text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Owner Control Center</h1>
          <p className="text-gray-500 mt-1">Manage dataset permissions and active consumer keys.</p>
        </div>
        <button
          onClick={() => setModalState({ isOpen: true, consumer: null, step: 1 })}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center shadow-sm transition-colors"
        >
          <AlertTriangle size={18} className="mr-2" />
          Revoke All Access
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Consumer / Organization</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Permission Level</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600">Active Since</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {consumers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No active consumers have access to your datasets.</td>
              </tr>
            ) : (
              consumers.map((consumer) => (
                <tr key={consumer.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-900 font-medium">{consumer.name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">{consumer.permissionLevel}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-sm">{consumer.activeSince}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setModalState({ isOpen: true, consumer, step: 1 })}
                      className="text-red-600 hover:text-red-800 font-medium text-sm flex items-center justify-end w-full"
                      disabled={isPending}
                    >
                      <ShieldX size={16} className="mr-1" /> Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Multi-step Revocation Modal */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, consumer: null, step: 1 })}
        title={modalState.consumer ? `Revoke ${modalState.consumer.name}?` : 'Emergency: Revoke All?'}
        size="md"
        showCloseButton={!isPending}
        closeOnOverlayClick={!isPending}
        closeOnEscape={!isPending}
      >
        {modalState.step === 1 ? (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <p className="text-gray-600 mb-6">
              {modalState.consumer
                ? `This will instantly invalidate client-side decryption keys for ${modalState.consumer.name}. They will lose all access.`
                : 'This is a destructive action. All active consumers will instantly lose decryption access. Use only in emergencies.'}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setModalState({ isOpen: false, consumer: null, step: 1 })}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(modalState.consumer ? modalState.consumer.id : 'ALL')}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Confirm Revocation
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="mb-4 flex justify-center text-blue-600">
              <Loader2 size={40} className="animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Awaiting Signature</h3>
            <p className="text-gray-600 text-sm">
              Please sign the transaction using the Freighter wallet prompt to process the revocation on the Stellar ledger.
            </p>
            <p className="text-yellow-600 text-xs mt-4 font-medium animate-pulse">
              Waiting for ledger consensus...
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};