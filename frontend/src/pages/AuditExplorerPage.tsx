import React from 'react';
import { ShieldCheck, Lock, Activity, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuditTable } from '../components/AuditTable';

const AuditExplorerPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-cyber-dark text-slate-900 dark:text-slate-100 p-6 lg:p-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
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

        {/* Main Interface */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase font-extrabold tracking-[0.3em] text-gray-400 bg-gray-100 dark:bg-obsidian-900 px-3 py-1 rounded border-l-2 border-cyber-blue">
              Audit Stream / Ledger Sync
            </h2>
          </div>
          
          <div className="h-[750px] relative">
            <AuditTable />
          </div>
        </div>

        {/* Technical Footer */}
        <footer className="pt-8 border-t border-gray-200 dark:border-obsidian-800 grid grid-cols-1 md:grid-cols-3 gap-8 opacity-50 text-[10px] font-mono leading-relaxed">
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">DECENTRALIZED LOGGING:</span>
            <p>Internal audit records are hashed and anchored to the Stellar network using SHA-256 Merkle trees. Each record corresponds to an immutable blockchain transaction for independent verification.</p>
          </div>
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">PRIVACY BUDGET ENFORCEMENT:</span>
            <p>Epsilon (ε) consumption is tracked per query. Automatic revocation triggers when individual or collective privacy budgets exceed the defined safety thresholds (Privacy PQL).</p>
          </div>
          <div className="space-y-2">
            <span className="text-cyber-blue font-bold">ZK-PROOF SYSTEM:</span>
            <p>Zero-Knowledge proofs are generated using the Bulletproofs algorithm on the client-side, proving policy compliance without revealing sensitive raw data points during the validation phase.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AuditExplorerPage;
