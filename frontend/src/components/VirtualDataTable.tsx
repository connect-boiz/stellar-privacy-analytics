import React, { useState, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Search, Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: keyof T;
  header: string;
  width?: number; // flex weight, default 1
  render?: (val: T[keyof T], row: T) => React.ReactNode;
}

interface Props<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  height?: number;
  searchKeys?: (keyof T)[];
  exportFilename?: string;
}

type SortDir = 'asc' | 'desc' | null;

function VirtualDataTable<T extends { id: string | number }>({
  data,
  columns,
  rowHeight = 48,
  height = 500,
  searchKeys = [],
  exportFilename = 'export',
}: Props<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const listRef = useRef<List>(null);

  const filtered = useMemo(() => {
    let rows = data;
    if (search && searchKeys.length) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => searchKeys.some((k) => String(r[k]).toLowerCase().includes(q)));
    }
    if (sortKey && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, search, searchKeys, sortKey, sortDir]);

  const toggleSort = useCallback((key: keyof T) => {
    setSortKey(key);
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc') : 'asc'));
    listRef.current?.scrollTo(0);
  }, [sortKey]);

  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));
  };

  const toggleRow = (id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = filtered.filter((r) => selected.size === 0 || selected.has(r.id));
    const header = columns.map((c) => c.header).join(',');
    const body = rows.map((r) => columns.map((c) => JSON.stringify(r[c.key] ?? '')).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFilename}.csv`;
    a.click();
  };

  const SortIcon = ({ col }: { col: Column<T> }) => {
    if (sortKey !== col.key) return <ChevronsUpDown size={12} className="text-gray-300" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />;
  };

  const totalFlex = columns.reduce((s, c) => s + (c.width ?? 1), 0);
  const colStyle = (c: Column<T>) => ({ flex: (c.width ?? 1) / totalFlex });

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = filtered[index];
    const isSelected = selected.has(row.id);
    return (
      <div
        style={style}
        className={`flex items-center border-b border-gray-100 px-3 text-sm transition-colors ${isSelected ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/60`}
      >
        <div className="w-8 flex-shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleRow(row.id)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label={`Select row ${row.id}`}
          />
        </div>
        {columns.map((col) => (
          <div key={String(col.key)} style={colStyle(col)} className="truncate px-2 text-gray-700">
            {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
        {searchKeys.length > 0 && (
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); listRef.current?.scrollTo(0); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {selected.size > 0 && (
            <span className="text-xs text-blue-600 font-medium">{selected.size} selected</span>
          )}
          <span className="text-xs text-gray-500">{filtered.length.toLocaleString()} rows</span>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center px-3 py-2 bg-gray-100 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
        <div className="w-8 flex-shrink-0">
          <input
            type="checkbox"
            checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-label="Select all"
          />
        </div>
        {columns.map((col) => (
          <button
            key={String(col.key)}
            style={colStyle(col)}
            onClick={() => toggleSort(col.key)}
            className="flex items-center gap-1 px-2 text-left hover:text-blue-600 transition-colors"
          >
            {col.header} <SortIcon col={col} />
          </button>
        ))}
      </div>

      {/* Virtual List */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>
          No results found.
        </div>
      ) : (
        <List ref={listRef} height={height} itemCount={filtered.length} itemSize={rowHeight} width="100%">
          {Row}
        </List>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex justify-between">
        <span>Showing {filtered.length.toLocaleString()} of {data.length.toLocaleString()} records</span>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:underline">Clear selection</button>
        )}
      </div>
    </div>
  );
}

export default VirtualDataTable;
