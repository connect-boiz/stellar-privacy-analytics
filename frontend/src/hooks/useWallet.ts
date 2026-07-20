import { useState, useEffect, useCallback } from 'react';
import {
  isConnected,
  getAddress,
  requestAccess,
  getNetwork,
  signTransaction,
} from '@stellar/freighter-api';
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';

export interface WalletAccount {
  publicKey: string;
  network: string;
  balance: string;
  label?: string;
}

export interface AssetBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

export interface AccountDetails {
  sequence: string;
  balances: AssetBalance[];
  signers: { key: string; type: string; weight: number }[];
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  subentry_count: number;
  home_domain?: string;
  inflation_destination?: string;
  last_modified_ledger: number;
}

export interface TransactionRecord {
  id: string;
  hash: string;
  created_at: string;
  source_account: string;
  operation_type: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  from?: string;
  to?: string;
  memo?: string;
  successful: boolean;
}

interface UseWalletReturn {
  accounts: WalletAccount[];
  selectedAccount: WalletAccount | null;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  selectAccount: (publicKey: string) => void;
  refreshBalances: () => Promise<void>;
  sendXLM: (destination: string, amount: string) => Promise<{ hash: string; status: 'success' | 'failed'; message: string; amount?: string; destination?: string }>;
  addAccount: (publicKey?: string) => Promise<void>;
  removeAccount: (publicKey: string) => void;
  fundWithFriendbot: (publicKey?: string) => Promise<string>;
  fetchAccountDetails: (publicKey: string) => Promise<AccountDetails>;
  fetchTransactionHistory: (publicKey: string, limit?: number) => Promise<TransactionRecord[]>;
}

const HORIZON = 'https://horizon-testnet.stellar.org';

export function useWallet(): UseWalletReturn {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<WalletAccount | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [server] = useState(() => new Horizon.Server(HORIZON));

  const fetchBalance = useCallback(async (publicKey: string): Promise<string> => {
    try {
      const res = await fetch(`${HORIZON}/accounts/${publicKey}`);
      if (!res.ok) {
        if (res.status === 404) return '0.0000000';
        return '0.0000000';
      }
      const data = await res.json();
      const native = data.balances?.find(
        (b: any) => b.asset_type === 'native'
      );
      return native ? native.balance : '0.0000000';
    } catch {
      return '0.0000000';
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const connectedResult = await isConnected();
      if (!connectedResult.isConnected) {
        const accessResult = await requestAccess();
        if (!accessResult.address) {
          throw new Error('Freighter wallet access denied. Please approve the connection request.');
        }
      }

      const addressResult = await getAddress();
      if (!addressResult.address) {
        throw new Error('Could not retrieve wallet address from Freighter.');
      }

      const networkResult = await getNetwork();
      if (networkResult.networkPassphrase !== Networks.TESTNET) {
        throw new Error('Please switch your Freighter wallet to Testnet network.');
      }

      const balance = await fetchBalance(addressResult.address);
      const account: WalletAccount = {
        publicKey: addressResult.address,
        network: 'testnet',
        balance,
        label: 'Account 1',
      };

      setAccounts([account]);
      setSelectedAccount(account);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [fetchBalance]);

  const disconnect = useCallback(() => {
    setAccounts([]);
    setSelectedAccount(null);
    setError(null);
  }, []);

  const selectAccount = useCallback(
    (publicKey: string) => {
      const account = accounts.find((a) => a.publicKey === publicKey);
      if (account) setSelectedAccount(account);
    },
    [accounts]
  );

  const refreshBalances = useCallback(async () => {
    const updated = await Promise.all(
      accounts.map(async (acc) => ({
        ...acc,
        balance: await fetchBalance(acc.publicKey),
      }))
    );
    setAccounts(updated);
    if (selectedAccount) {
      const updatedSelected = updated.find(
        (a) => a.publicKey === selectedAccount.publicKey
      );
      if (updatedSelected) setSelectedAccount(updatedSelected);
    }
  }, [accounts, selectedAccount, fetchBalance]);

  const addAccount = useCallback(async (publicKey?: string) => {
    setError(null);
    try {
      let key = publicKey;

      if (!key) {
        const connectedResult = await isConnected();
        if (!connectedResult.isConnected) {
          await requestAccess();
        }
        const addressResult = await getAddress();
        if (!addressResult.address) {
          throw new Error('Could not retrieve wallet address.');
        }
        key = addressResult.address;
      }

      if (accounts.some((a) => a.publicKey === key)) {
        throw new Error('This account is already added');
      }

      const balance = await fetchBalance(key);
      const newAccount: WalletAccount = {
        publicKey: key,
        network: 'testnet',
        balance,
        label: `Account ${accounts.length + 1}`,
      };
      const updated = [...accounts, newAccount];
      setAccounts(updated);
      setSelectedAccount(newAccount);
    } catch (err: any) {
      setError(err.message || 'Failed to add account');
    }
  }, [accounts, fetchBalance]);

  const fundWithFriendbot = useCallback(async (publicKey?: string): Promise<string> => {
    const key = publicKey || selectedAccount?.publicKey;
    if (!key) throw new Error('No account selected');

    const res = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(key)}`
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Friendbot funding failed');
    }
    const data = await res.json();
    await refreshBalances();
    return data.hash || 'Account funded with 10,000 XLM';
  }, [selectedAccount, refreshBalances]);

  const removeAccount = useCallback((publicKey: string) => {
    if (accounts.length <= 1) return;
    const updated = accounts.filter((a) => a.publicKey !== publicKey);
    setAccounts(updated);
    if (selectedAccount?.publicKey === publicKey) {
      setSelectedAccount(updated[0] || null);
    }
  }, [accounts, selectedAccount]);

  const fetchAccountDetails = useCallback(async (publicKey: string): Promise<AccountDetails> => {
    const res = await fetch(`${HORIZON}/accounts/${publicKey}`);
    if (!res.ok) throw new Error('Failed to fetch account details');
    const data = await res.json();

    return {
      sequence: data.sequence,
      balances: data.balances || [],
      signers: data.signers || [],
      thresholds: data.thresholds || { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
      subentry_count: data.subentry_count || 0,
      home_domain: data.home_domain,
      inflation_destination: data.inflation_destination,
      last_modified_ledger: data.last_modified_ledger,
    };
  }, []);

  const fetchTransactionHistory = useCallback(async (publicKey: string, limit = 20): Promise<TransactionRecord[]> => {
    const res = await fetch(
      `${HORIZON}/accounts/${publicKey}/transactions?limit=${limit}&order=desc`
    );
    if (!res.ok) return [];
    const data = await res.json();

    const opsRes = await fetch(
      `${HORIZON}/accounts/${publicKey}/operations?limit=${limit}&order=desc`
    );
    if (!opsRes.ok) return [];
    const opsData = await opsRes.json();

    return (opsData._embedded?.records || []).map((op: any) => ({
      id: op.id,
      hash: op.transaction_hash,
      created_at: op.created_at,
      source_account: op.source_account || publicKey,
      operation_type: op.type,
      amount: op.amount,
      asset_code: op.asset_code,
      asset_issuer: op.asset_issuer,
      from: op.from,
      to: op.to,
      memo: op.memo,
      successful: op.transaction_successful !== false,
    }));
  }, []);

  const sendXLM = useCallback(
    async (destination: string, amount: string) => {
      if (!selectedAccount) {
        return { hash: '', status: 'failed' as const, message: 'No wallet connected' };
      }

      try {
        const account = await server.loadAccount(selectedAccount.publicKey);

        const tx = new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(
            Operation.payment({
              destination,
              asset: Asset.native(),
              amount,
            })
          )
          .setTimeout(30)
          .build();

        const signed = await signTransaction(tx.toXDR(), {
          networkPassphrase: Networks.TESTNET,
        });

        if (!signed.signedTxXdr) {
          return { hash: '', status: 'failed' as const, message: 'Transaction signing was rejected.' };
        }

        const submitRes = await fetch(`${HORIZON}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `tx=${encodeURIComponent(signed.signedTxXdr)}`,
        });

        if (!submitRes.ok) {
          const errBody = await submitRes.json();
          return {
            hash: '',
            status: 'failed' as const,
            message: errBody?.extras?.result_codes?.transaction || 'Transaction submission failed',
          };
        }

        const submitData = await submitRes.json();
        await refreshBalances();

        return {
          hash: submitData.hash,
          status: 'success' as const,
          message: submitData.hash,
          amount,
          destination,
        };
      } catch (err: any) {
        return {
          hash: '',
          status: 'failed' as const,
          message: err.message || 'Transaction failed',
        };
      }
    },
    [selectedAccount, refreshBalances, server]
  );

  useEffect(() => {
    (async () => {
      try {
        const result = await isConnected();
        if (result.isConnected) {
          await connect();
        }
      } catch {
        console.warn('Failed to check initial connection');
      }
    })();
  }, []);

  return {
    accounts,
    selectedAccount,
    isConnecting,
    isConnected: accounts.length > 0,
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
  };
}
