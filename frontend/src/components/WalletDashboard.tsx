import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Copy,
  Send,
  RefreshCw,
  LogOut,
  Users,
  Info,
  Plus,
  Trash2,
  Key,
  Gift,
  History,
  Coins,
  Fingerprint,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
} from 'lucide-react';
import { useWallet, WalletAccount, AssetBalance, AccountDetails, TransactionRecord } from '../hooks/useWallet';

function BalanceCard({ account, isSelected, onSelect, onRemove, canRemove }: { account: WalletAccount; isSelected: boolean; onSelect: () => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Wallet className={`h-4 w-4 mr-2 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-700">{account.label || 'Account'}</span>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && <CheckCircle className="h-4 w-4 text-blue-600" />}
          {canRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900" onClick={onSelect}>
        {parseFloat(account.balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 7 })}{' '}
        <span className="text-sm font-normal text-gray-500">XLM</span>
      </p>
      <p className="text-xs font-mono text-gray-500 mt-1 truncate">
        {account.publicKey.slice(0, 8)}...{account.publicKey.slice(-8)}
      </p>
    </motion.div>
  );
}

function TransactionFeedback({ result, onDismiss }: { result: { hash: string; status: string; message: string; amount?: string; destination?: string } | null; onDismiss: () => void }) {
  if (!result) return null;
  const isSuccess = result.status === 'success';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-4 rounded-xl border ${
        isSuccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start">
          {isSuccess ? (
            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
          )}
          <div>
            <p className={`font-medium ${isSuccess ? 'text-green-800' : 'text-red-800'}`}>
              {isSuccess ? 'Transaction Successful' : 'Transaction Failed'}
            </p>
            {isSuccess && result.amount && result.destination ? (
              <p className="text-sm text-green-700 mt-1">
                Sent {result.amount} XLM to{' '}
                <span className="font-mono">
                  {result.destination.slice(0, 8)}...{result.destination.slice(-8)}
                </span>
              </p>
            ) : (
              <p className={`text-sm mt-1 ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>
                {isSuccess ? `Hash: ${result.message}` : result.message}
              </p>
            )}
            {result.hash && (
              <div className="flex items-center gap-2 mt-2">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${result.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  StellarExpert
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(result.hash)}
                  className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Hash
                </button>
              </div>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 ml-4">
          <span className="text-lg leading-none">&times;</span>
        </button>
      </div>
    </motion.div>
  );
}

function SendXLMForm({ onSend, isSending }: { onSend: (dest: string, amount: string) => void; isSending: boolean }) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (destination && amount && parseFloat(amount) > 0) {
      onSend(destination, amount);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Destination Address
        </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="G..."
          className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount (XLM)
        </label>
        <input
          type="number"
          step="0.0000001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="submit"
        disabled={isSending || !destination || !amount || parseFloat(amount) <= 0}
        className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Send XLM
          </>
        )}
      </motion.button>
    </form>
  );
}

function AddAccountForm({ onAddByKey, onAddFromWallet }: { onAddByKey: (key: string) => void; onAddFromWallet: () => void }) {
  const [publicKey, setPublicKey] = useState('');

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Add a Stellar public key to check its balance, or add the currently active Freighter account.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          placeholder="G..."
          className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { if (publicKey) onAddByKey(publicKey); setPublicKey(''); }}
          disabled={!publicKey}
          className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Key className="h-4 w-4 mr-1.5" />
          Add
        </motion.button>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">OR</span>
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onAddFromWallet}
        className="w-full flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <Wallet className="h-4 w-4 mr-2" />
        Add Freighter Account
      </motion.button>
    </div>
  );
}

function AssetBalancesPanel({ balances }: { balances: AssetBalance[] }) {
  const native = balances.find((b) => b.asset_type === 'native');
  const other = balances.filter((b) => b.asset_type !== 'native');

  return (
    <div className="space-y-2">
      {native && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
              <span className="text-white text-xs font-bold">X</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Stellar Lumens</p>
              <p className="text-xs text-gray-500">XLM (native)</p>
            </div>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {parseFloat(native.balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 7 })}
          </p>
        </div>
      )}
      {other.map((asset, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mr-3">
              <span className="text-white text-xs font-bold">{(asset.asset_code || '?')[0]}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{asset.asset_code || 'Unknown'}</p>
              <p className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                {asset.asset_issuer ? `${asset.asset_issuer.slice(0, 8)}...` : 'native'}
              </p>
            </div>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {parseFloat(asset.balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 7 })}
          </p>
        </div>
      ))}
    </div>
  );
}

function AccountDetailsPanel({ details }: { details: AccountDetails }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Sequence</p>
          <p className="text-sm font-mono font-medium text-gray-900 truncate">{details.sequence}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Sub-entries</p>
          <p className="text-sm font-medium text-gray-900">{details.subentry_count}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Low Threshold</p>
          <p className="text-sm font-medium text-gray-900">{details.thresholds.low_threshold}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Med Threshold</p>
          <p className="text-sm font-medium text-gray-900">{details.thresholds.med_threshold}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">High Threshold</p>
          <p className="text-sm font-medium text-gray-900">{details.thresholds.high_threshold}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Last Ledger</p>
          <p className="text-sm font-mono font-medium text-gray-900">{details.last_modified_ledger}</p>
        </div>
      </div>
      {details.signers.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium">Signers ({details.signers.length})</p>
          <div className="space-y-1">
            {details.signers.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                <span className="font-mono text-gray-700 truncate mr-2">
                  {s.key.slice(0, 12)}...{s.key.slice(-8)}
                </span>
                <span className="text-gray-500 font-medium">weight: {s.weight}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionHistory({ transactions }: { transactions: TransactionRecord[] }) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
              tx.operation_type === 'payment' || tx.operation_type === 'create_account'
                ? 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {tx.operation_type === 'payment' || tx.operation_type === 'create_account' ? (
                tx.from === tx.source_account ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4" />
                )
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate capitalize">
                {tx.operation_type.replace(/_/g, ' ')}
              </p>
              <div className="flex items-center text-xs text-gray-500 mt-0.5">
                <span className="font-mono truncate max-w-[120px]">
                  {tx.hash.slice(0, 10)}...
                </span>
                <span className="mx-1">&middot;</span>
                <span>{new Date(tx.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            {tx.amount && (
              <span className="text-sm font-medium text-gray-900">
                {tx.amount} {tx.asset_code || 'XLM'}
              </span>
            )}
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-blue-500 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function WalletDashboard() {
  const {
    accounts,
    selectedAccount,
    isConnecting,
    isConnected,
    error,
    connect,
    disconnect,
    selectAccount,
    refreshBalances,
    sendXLM,
    addAccount,
    removeAccount,
    fundWithFriendbot,
    fetchAccountDetails,
    fetchTransactionHistory,
  } = useWallet();

  const [isSending, setIsSending] = useState(false);
  const [txResult, setTxResult] = useState<{ hash: string; status: string; message: string; amount?: string; destination?: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'balances' | 'assets' | 'details' | 'history'>('balances');

  const loadAccountData = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const [details, txs] = await Promise.all([
        fetchAccountDetails(selectedAccount.publicKey),
        fetchTransactionHistory(selectedAccount.publicKey),
      ]);
      setAccountDetails(details);
      setTransactions(txs);
    } catch {
      console.error('Failed to load account data:', (error as Error).message);
    }
  }, [selectedAccount, fetchAccountDetails, fetchTransactionHistory]);

  useEffect(() => {
    if (selectedAccount) {
      loadAccountData();
    }
  }, [selectedAccount, loadAccountData]);

  const handleSend = async (destination: string, amount: string) => {
    setIsSending(true);
    setTxResult(null);
    try {
      const result = await sendXLM(destination, amount);
      setTxResult(result);
      if (result.status === 'success') {
        setShowSendForm(false);
        loadAccountData();
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalances();
    await loadAccountData();
    setIsRefreshing(false);
  };

  const handleFund = async () => {
    if (!selectedAccount) return;
    setIsFunding(true);
    setTxResult(null);
    try {
      const hash = await fundWithFriendbot(selectedAccount.publicKey);
      setTxResult({ hash, status: 'success', message: hash, amount: '10,000' });
      loadAccountData();
    } catch (err: any) {
      setTxResult({ hash: '', status: 'failed', message: err.message || 'Friendbot funding failed' });
    } finally {
      setIsFunding(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Wallet Balances</h2>
            <p className="text-gray-500 mt-2">Connect your Freighter wallet to get started</p>
            <p className="text-xs text-gray-400 mt-1">Make sure you are on Stellar Testnet</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl"
            >
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={connect}
            disabled={isConnecting}
            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5 mr-2" />
                Connect Freighter Wallet
              </>
            )}
          </motion.button>

          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Prerequisites</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>1. Install Freighter browser extension</li>
              <li>2. Create a wallet and switch to Testnet</li>
              <li>3. Fund your account via Friendbot</li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Wallet Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
            {selectedAccount && ` \u00B7 ${selectedAccount.label}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={disconnect}
            className="flex items-center px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Disconnect
          </motion.button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-200 rounded-xl"
        >
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Selected Account Hero */}
      {selectedAccount && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-blue-100 text-sm">{selectedAccount.label}</p>
            <div className="flex items-center bg-blue-500/30 px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
              <span className="text-xs text-blue-100">Testnet</span>
            </div>
          </div>
          <p className="text-4xl font-bold mb-2">
            {parseFloat(selectedAccount.balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 7 })}{' '}
            <span className="text-xl text-blue-200">XLM</span>
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <p className="text-sm text-blue-100 font-mono">
                {selectedAccount.publicKey.slice(0, 12)}...{selectedAccount.publicKey.slice(-8)}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(selectedAccount.publicKey)}
                className="ml-2 text-blue-200 hover:text-white transition-colors"
                title="Copy address"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {parseFloat(selectedAccount.balance) === 0 && (
                <button
                  onClick={handleFund}
                  disabled={isFunding}
                  className="flex items-center px-4 py-2 bg-yellow-400 text-yellow-900 rounded-lg font-medium text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50"
                >
                  {isFunding ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Gift className="h-4 w-4 mr-1.5" />
                  )}
                  Fund with Friendbot
                </button>
              )}
              <button
                onClick={() => setShowSendForm(!showSendForm)}
                className="flex items-center px-4 py-2 bg-white text-blue-700 rounded-lg font-medium text-sm hover:bg-blue-50 transition-colors"
              >
                <Send className="h-4 w-4 mr-1.5" />
                Send XLM
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Transaction Feedback */}
      <AnimatePresence>
        {txResult && (
          <TransactionFeedback result={txResult} onDismiss={() => setTxResult(null)} />
        )}
      </AnimatePresence>

      {/* Send XLM Form */}
      <AnimatePresence>
        {showSendForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Send XLM</h3>
              <button onClick={() => setShowSendForm(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <SendXLMForm onSend={handleSend} isSending={isSending} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* All Accounts Balances */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">All Accounts</h3>
          </div>
        </div>

        <AnimatePresence>
          <div className="grid gap-3">
            {accounts.map((account) => (
              <BalanceCard
                key={account.publicKey}
                account={account}
                isSelected={selectedAccount?.publicKey === account.publicKey}
                onSelect={() => selectAccount(account.publicKey)}
                onRemove={() => removeAccount(account.publicKey)}
                canRemove={accounts.length > 1}
              />
            ))}
          </div>
        </AnimatePresence>

        {!showAddAccount ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddAccount(true)}
            className="w-full mt-4 flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-4 bg-gray-50 rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">Add Account</h4>
              <button onClick={() => setShowAddAccount(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <AddAccountForm
              onAddByKey={(key) => addAccount(key)}
              onAddFromWallet={() => addAccount()}
            />
          </motion.div>
        )}
      </div>

      {/* Details Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'balances', label: 'Balances', icon: Wallet },
            { id: 'assets', label: 'Assets', icon: Coins },
            { id: 'details', label: 'Details', icon: Fingerprint },
            { id: 'history', label: 'History', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              {activeTab === 'balances' && (
                <div className="space-y-3">
                  {accounts.map((acc) => (
                    <div key={acc.publicKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{acc.label}</p>
                        <p className="text-xs font-mono text-gray-500">
                          {acc.publicKey.slice(0, 8)}...
                        </p>
                      </div>
                      <p className="text-lg font-bold text-gray-900">
                        {parseFloat(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 7 })}{' '}
                        <span className="text-sm font-normal text-gray-500">XLM</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'assets' && (
                <>
                  {accountDetails ? (
                    <AssetBalancesPanel balances={accountDetails.balances} />
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'details' && (
                <>
                  {accountDetails ? (
                    <AccountDetailsPanel details={accountDetails} />
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'history' && (
                <TransactionHistory transactions={transactions} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Network Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Network Information</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Network</span>
            <span className="font-medium text-gray-900">Stellar Testnet</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Horizon URL</span>
            <span className="font-mono text-xs text-gray-600">https://horizon-testnet.stellar.org</span>
          </div>
        </div>
      </div>
    </div>
  );
}
