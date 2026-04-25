import React, { useState, useMemo } from 'react';
import { ShieldCheck, Lock, Activity, ArrowLeft, AlertTriangle, Clock, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuditTable } from '../components/AuditTable';
import { motion } from 'framer-motion';

// ── Shared mock data ──────────────────────────────────────────────────────────
const MOCK_EVENTS = Array.from({ length: 40 }, (_, i) => ({
  id: `audit-${1000 - i}`,
  timestamp: new Date(Date.now() - i * 1000 * 60 * 30),
  action: i % 5 === 0 ? 'data_export_attempt' : i % 3 === 0 ? 'differential_privacy_query' : 'data_access_request',
  actor: `user_${String.fromCharCode(97 + (i % 6))}`,
  riskLevel: i % 10 === 0 ? 'critical' : i % 5 === 0 ? 'high' : 'low',
  outcome: i % 7 === 0 ? 'failure' : 'success',
  epsilonConsumed: i % 3 === 0 ? parseFloat((Math.random() * 0.8).toFixed(3)) : 0,
}));

// ── Anomaly Detection ─────────────────────────────────────────────────────────
const AnomalyPanel: React.FC = () => {
  const anomalies = useMemo(() => MOCK_EVENTS.filter(
    (e) => e.riskLevel === 'critical' || e.riskLevel === 'high' || e.outcome === 'failure'
  ), []);

  const riskBadge = (r: string) =>
    r === 'critical' ? 'bg-red-100 text-red-700' :
    r === 'high' ? 'bg-orange-100 text-orange-700' :
    'bg-yellow-100 text-yellow-700';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Critical Events', count: MOCK_EVENTS.filter(e => e.riskLevel === 'critical').length, color: 'text-red-600' },
          { label: 'High Risk', count: MOCK_EVENTS.filter(e => e.riskLevel === 'high').length, color: 'text-orange-600' },
          { label: 'Failures', count: MOCK_EVENTS.filter(e => e.outcome === 'failure').length, color: 'text-yellow-600' },
        ].map(({ label, count, color }) => (
          <div key={label} className="bg-white rounded-lg shadow p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
        <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <AlertTriangle className="h-4 w-4 text-orange-500" /> Anomalous Events
        </div>
        {anomalies.slice(0, 10).map((e) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="px-4 py-3 flex items-center justify-between text-sm"
          >
            <div>
              <span className="font-mono text-gray-500 text-xs mr-2">#{e.id.split('-')[1]}</span>
              <span className="text-gray-800">{e.action.replace(/_/g, ' ')}</span>
              <span className="ml-2 text-xs text-gray-400">by {e.actor}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded font-medium ${riskBadge(e.riskLevel)}`}>{e.riskLevel}</span>
              {e.outcome === 'failure' && <span className="text-xs text-red-500 font-medium">BLOCKED</span>}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ── Retention Management ──────────────────────────────────────────────────────
const RetentionPanel: React.FC = () => {
  const [retentionDays, setRetentionDays] = useState(90);
  const [archived, setArchived] = useState(false);

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const expiredCount = MOCK_EVENTS.filter((e) => e.timestamp < cutoff).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" /> Retention Policy</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Retain logs for <span className="text-blue-600 font-bold">{retentionDays} days</span>
          </label>
          <input
            type="range"
            min={7}
            max={365}
            value={retentionDays}
            onChange={(e) => { setRetentionDays(Number(e.target.value)); setArchived(false); }}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>7 days</span><span>365 days</span></div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-bold text-orange-600">{expiredCount}</span> records older than {retentionDays} days
            </p>
            <p className="text-xs text-gray-500 mt-0.5">These records are eligible for archival or deletion.</p>
          </div>
          <button
            onClick={() => setArchived(true)}
            disabled={expiredCount === 0 || archived}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {archived ? '✓ Archived' : 'Archive Now'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          {[7, 30, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => { setRetentionDays(d); setArchived(false); }}
              className={`py-2 rounded-lg border transition-colors ${retentionDays === d ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {d < 365 ? `${d}d` : '1yr'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Timeline ──────────────────────────────────────────────────────────────────
const TimelinePanel: React.FC = () => {
  const events = MOCK_EVENTS.slice(0, 15);

  const iconColor = (risk: string) =>
    risk === 'critical' ? 'bg-red-500' : risk === 'high' ? 'bg-orange-400' : 'bg-green-400';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-6"><BarChart2 className="h-4 w-4 text-blue-500" /> Activity Timeline</h3>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-4">
          {events.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative pl-10"
            >
              <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full ${iconColor(e.riskLevel)} ring-2 ring-white`} />
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{e.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-400">{e.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>by {e.actor}</span>
                  {e.epsilonConsumed > 0 && <span className="text-blue-600">ε {e.epsilonConsumed}</span>}
                  <span className={e.outcome === 'failure' ? 'text-red-500 font-medium' : 'text-green-600'}>{e.outcome}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = 'logs' | 'anomalies' | 'retention' | 'timeline';

const AuditExplorerPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('logs');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'logs', label: 'Audit Logs', icon: <ShieldCheck size={14} /> },
    { id: 'anomalies', label: 'Anomaly Detection', icon: <AlertTriangle size={14} /> },
    { id: 'retention', label: 'Retention', icon: <Clock size={14} /> },
    { id: 'timeline', label: 'Timeline', icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-cyber-dark text-slate-900 dark:text-slate-100 p-6 lg:p-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="group flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-gray-500 hover:text-cyber-blue transition-colors px-2 py-1 rounded-lg hover:bg-cyber-blue/5"
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              BACK TO CONSOLE
            </button>
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-cyber-blue drop-shadow-[0_0_8px_#00F0FF]" />
              <h1 className="text-4xl font-extrabold tracking-tighter uppercase italic">
                Transaction <span className="text-cyber-blue">Explorer</span>
              </h1>
            </div>
            <p className="text-gray-500 max-w-2xl font-mono text-xs uppercase tracking-tight">
              CRYPTOGRAPHIC AUDIT TRAIL // REAL-TIME STELLAR LEDGER VERIFICATION // ZERO-KNOWLEDGE PROOF LOGS
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="glass p-4 rounded-xl flex items-center gap-3">
              <Activity className="text-cyber-blue" />
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400">Total Queries</div>
                <div className="text-xl font-bold font-mono tracking-tighter">1,204</div>
              </div>
            </div>
            <div className="glass p-4 rounded-xl flex items-center gap-3">
              <Lock className="text-green-500" />
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-400">Proof Verification</div>
                <div className="text-xl font-bold font-mono tracking-tighter">99.2%</div>
              </div>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-obsidian-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-cyber-blue text-cyber-blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {tab === 'logs' && (
            <div className="h-[750px] relative">
              <AuditTable />
            </div>
          )}
          {tab === 'anomalies' && <AnomalyPanel />}
          {tab === 'retention' && <RetentionPanel />}
          {tab === 'timeline' && <TimelinePanel />}
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-gray-200 dark:border-obsidian-800 grid grid-cols-1 md:grid-cols-3 gap-8 opacity-50 text-[10px] font-mono leading-relaxed">
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">DECENTRALIZED LOGGING:</span>
            <p>Internal audit records are hashed and anchored to the Stellar network using SHA-256 Merkle trees.</p>
          </div>
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">PRIVACY BUDGET ENFORCEMENT:</span>
            <p>Epsilon (ε) consumption is tracked per query with automatic revocation on threshold breach.</p>
          </div>
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">ZK-PROOF SYSTEM:</span>
            <p>Zero-Knowledge proofs generated using Bulletproofs, proving compliance without revealing raw data.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AuditExplorerPage;
