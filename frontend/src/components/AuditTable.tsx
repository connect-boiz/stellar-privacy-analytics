import React, { useState, useEffect, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Shield, 
  ShieldAlert, 
  ShieldCheck,
  Calendar,
  User,
  Database,
  ChevronDown,
  RefreshCcw,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { ScanningEffect } from './ui/ScanningEffect';

interface AuditLog {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  actor: {
    userId?: string;
    publicKey?: string;
    ipAddress?: string;
  };
  resource: {
    type: string;
    id?: string;
  };
  outcome: 'success' | 'failure' | 'attempted';
  privacyBudgetConsumed?: number;
  zkProofStatus?: 'passed' | 'failed' | 'not_applicable';
  stellarTransactionId?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export const AuditTable: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    riskLevel: '',
    dateRange: 'all'
  });

  // Fetch data (simulated for now, would use backend)
  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockLogs: AuditLog[] = Array.from({ length: 1000 }).map((_, i) => ({
        id: `audit-${1000 - i}`,
        timestamp: new Date(Date.now() - i * 1000 * 60 * 15).toISOString(),
        category: i % 4 === 0 ? 'privacy_query' : 'access_control',
        action: i % 4 === 0 ? 'differential_privacy_query' : 'data_access_request',
        actor: {
          publicKey: `GD${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          userId: `user_${Math.random().toString(36).substring(2, 6)}`,
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`
        },
        resource: {
          type: 'dataset',
          id: `dataset_${Math.floor(Math.random() * 100)}`
        },
        outcome: Math.random() > 0.1 ? 'success' : 'failure',
        privacyBudgetConsumed: i % 4 === 0 ? parseFloat((Math.random() * 0.5).toFixed(3)) : undefined,
        zkProofStatus: i % 4 === 0 ? (Math.random() > 0.05 ? 'passed' : 'failed') : 'not_applicable',
        stellarTransactionId: `tx_${Math.random().toString(16).substring(2, 10)}`,
        riskLevel: i % 10 === 0 ? 'high' : 'low'
      }));
      
      setLogs(mockLogs);
      setIsLoading(false);
    };

    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.actor.publicKey?.toLowerCase().includes(filters.search.toLowerCase()) ||
        log.resource.id?.toLowerCase().includes(filters.search.toLowerCase()) ||
        log.id.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesCategory = !filters.category || log.category === filters.category;
      const matchesRisk = !filters.riskLevel || log.riskLevel === filters.riskLevel;
      
      return matchesSearch && matchesCategory && matchesRisk;
    });
  }, [logs, filters]);

  const handleExport = () => {
    // CSV Export logic
    const headers = ['ID', 'Timestamp', 'Actor', 'Resource', 'Action', 'Outcome', 'Epsilon', 'ZK Proof'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        log.id,
        log.timestamp,
        log.actor.publicKey,
        log.resource.id,
        log.action,
        log.outcome,
        log.privacyBudgetConsumed || '',
        log.zkProofStatus
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const log = filteredLogs[index];
    if (!log) return null;

    return (
      <div style={style} className="flex items-center border-b border-gray-100 dark:border-obsidian-800 px-4 py-2 hover:bg-gray-50 dark:hover:bg-obsidian-800/50 transition-colors">
        <div className="w-1/12 text-xs font-mono text-gray-500 truncate" title={log.id}>#{log.id.split('-')[1]}</div>
        <div className="w-2/12 text-xs text-gray-600 dark:text-gray-400">
          {format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}
        </div>
        <div className="w-3/12 flex flex-col">
          <div className="text-sm font-medium dark:text-gray-200 flex items-center gap-1">
            <User size={12} className="text-gray-400" />
            <span className="truncate max-w-[150px] font-mono">{log.actor.publicKey}</span>
          </div>
          <div className="text-[10px] text-gray-500">IP: {log.actor.ipAddress}</div>
        </div>
        <div className="w-2/12">
          <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-slate-100 dark:bg-obsidian-800 dark:text-gray-300">
            <Database size={10} />
            {log.resource.id}
          </div>
        </div>
        <div className="w-1/12 text-center">
          {log.privacyBudgetConsumed !== undefined ? (
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-cyber-blue">ε</span>
              <span className="text-xs font-mono">{log.privacyBudgetConsumed}</span>
            </div>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </div>
        <div className="w-1/12 flex justify-center">
          {log.zkProofStatus === 'passed' && (
            <div className="flex flex-col items-center gap-0.5" title="ZK Proof Verified">
              <ShieldCheck size={16} className="text-green-500" />
              <span className="text-[8px] uppercase font-bold text-green-600">Verified</span>
            </div>
          )}
          {log.zkProofStatus === 'failed' && (
            <div className="flex flex-col items-center gap-0.5" title="ZK Proof Failed">
              <ShieldAlert size={16} className="text-red-500" />
              <span className="text-[8px] uppercase font-bold text-red-600">Failed</span>
            </div>
          )}
          {log.zkProofStatus === 'not_applicable' && (
            <span className="text-gray-300 text-[10px]">N/A</span>
          )}
        </div>
        <div className="w-2/12 flex justify-end items-center gap-2">
           <a 
            href={`https://stellar.expert/explorer/testnet/tx/${log.stellarTransactionId}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-cyber-blue rounded-lg transition-colors"
            title="View on Stellar Expert"
          >
            <ExternalLink size={14} />
          </a>
          <div className={clsx(
            "w-2 h-2 rounded-full",
            log.outcome === 'success' ? "bg-green-500 shadow-[0_0_5px_#22c55e]" : "bg-red-500"
          )} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full glass rounded-2xl overflow-hidden border border-gray-200 dark:border-obsidian-800 shadow-2xl">
      {/* Table Header / Filters */}
      <div className="p-4 bg-white/50 dark:bg-obsidian-900/50 border-b border-gray-200 dark:border-obsidian-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search by ID, Public Key, or Dataset..." 
                className="input-field pl-10 h-10"
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
              />
            </div>
            <div className="flex items-center gap-2">
               <div className="relative">
                <select 
                  className="appearance-none bg-slate-100 dark:bg-obsidian-800 border-none rounded-lg px-4 py-2 pr-10 text-sm focus:ring-2 focus:ring-cyber-blue"
                  value={filters.category}
                  onChange={(e) => setFilters({...filters, category: e.target.value})}
                >
                  <option value="">All Categories</option>
                  <option value="privacy_query">Privacy Query</option>
                  <option value="access_control">Access Control</option>
                  <option value="key_management">Key Management</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {}} 
              className="p-2 bg-slate-100 dark:bg-obsidian-800 rounded-lg hover:bg-slate-200 transition-colors"
              title="Refresh Logs"
            >
              <RefreshCcw size={18} />
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-cyber-blue text-black rounded-lg font-bold text-xs uppercase tracking-widest hover:opacity-80 transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)]"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table Body Header */}
      <div className="flex items-center bg-gray-50 dark:bg-obsidian-900/80 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 dark:border-obsidian-800">
        <div className="w-1/12 uppercase tracking-tighter">ID</div>
        <div className="w-2/12">Timestamp</div>
        <div className="w-3/12">Actor (Accessor)</div>
        <div className="w-2/12">Resource</div>
        <div className="w-1/12 text-center text-cyber-blue"><Zap size={10} className="inline mr-1" />Epsilon</div>
        <div className="w-1/12 text-center text-green-500"><Shield size={10} className="inline mr-1" />ZK-Proof</div>
        <div className="w-2/12 text-right pr-4">Stellar / Status</div>
      </div>

      {/* Virtualized List */}
      <div className="flex-1 bg-white/20 dark:bg-transparent min-h-[600px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <ScanningEffect isLoading={true} className="w-64 h-32 flex items-center justify-center">
               <div className="text-cyber-blue font-bold animate-pulse">Scanning Privacy Audit Logs...</div>
            </ScanningEffect>
          </div>
        ) : filteredLogs.length > 0 ? (
          <List
            height={600}
            itemCount={filteredLogs.length}
            itemSize={64}
            width="100%"
            className="scrollbar-hide"
          >
            {Row}
          </List>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Search size={48} className="mb-4 opacity-20" />
            <p>No audit logs found matching your filters</p>
          </div>
        )}
      </div>
      
      {/* Footer Info */}
      <div className="px-6 py-3 bg-gray-50 dark:bg-obsidian-900 border-t border-gray-200 dark:border-obsidian-800 text-[10px] text-gray-500 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> SUCCESS</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> FAILURE</span>
        </div>
        <div>TOTAL RECORDS: <span className="font-bold text-gray-700 dark:text-gray-300">{filteredLogs.length}</span></div>
      </div>
    </div>
  );
};
