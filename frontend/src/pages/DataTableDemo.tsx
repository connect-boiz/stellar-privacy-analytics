import React, { useMemo } from 'react';
import VirtualDataTable, { Column } from '../components/VirtualDataTable';

interface Row {
  id: number;
  user: string;
  dataset: string;
  action: string;
  epsilon: number;
  timestamp: string;
  status: 'success' | 'failure';
}

const STATUSES = ['success', 'failure'] as const;
const ACTIONS = ['data_access', 'export', 'query', 'delete', 'update'];
const DATASETS = ['customer_db', 'sales_2024', 'user_analytics', 'finance_q1', 'hr_records'];

const columns: Column<Row>[] = [
  { key: 'id', header: 'ID', width: 0.5 },
  { key: 'user', header: 'User', width: 1.5 },
  { key: 'dataset', header: 'Dataset', width: 1.5 },
  { key: 'action', header: 'Action', width: 1 },
  { key: 'epsilon', header: 'ε Budget', width: 0.7, render: (v) => <span className="font-mono text-blue-600">{v}</span> },
  { key: 'timestamp', header: 'Timestamp', width: 1.5 },
  {
    key: 'status', header: 'Status', width: 0.8,
    render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {String(v)}
      </span>
    ),
  },
];

const DataTableDemo: React.FC = () => {
  const data = useMemo<Row[]>(() =>
    Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1,
      user: `user_${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}`,
      dataset: DATASETS[i % DATASETS.length],
      action: ACTIONS[i % ACTIONS.length],
      epsilon: parseFloat((Math.random() * 2).toFixed(3)),
      timestamp: new Date(Date.now() - i * 60000).toISOString().replace('T', ' ').slice(0, 19),
      status: STATUSES[i % 7 === 0 ? 1 : 0],
    })), []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Table</h1>
        <p className="text-gray-600 mt-1">Virtual scrolling — renders only visible rows for smooth performance with large datasets.</p>
      </div>
      <VirtualDataTable
        data={data}
        columns={columns}
        searchKeys={['user', 'dataset', 'action']}
        rowHeight={48}
        height={560}
        exportFilename="privacy-data"
      />
    </div>
  );
};

export default DataTableDemo;
