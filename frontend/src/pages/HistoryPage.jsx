import React, { useState, useEffect, useRef } from 'react';
import { useHistoryStore } from '../stores/useHistoryStore';
import FilterBar from '../components/FilterBar';
import TrafficTable from '../components/TrafficTable';
import Inspector from '../components/Inspector';
import { X } from 'lucide-react';

export default function HistoryPage() {
  const transactionIds = useHistoryStore(state => state.transactionIds);
  const transactionMap = useHistoryStore(state => state.transactionMap);
  const loadMore = useHistoryStore(state => state.loadMore);
  const hasMore = useHistoryStore(state => state.hasMore);
  const startListening = useHistoryStore(state => state.startListening);

  useEffect(() => {
    startListening();
  }, [startListening]);

  const transactions = transactionIds.map(id => transactionMap[id]).filter(Boolean);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [bottomHeight, setBottomHeight] = useState(50);
  const containerRef = useRef(null);

  const filteredTransactions = transactions.filter(t => {
    if (!filter) return true;
    const lower = filter.toLowerCase();
    return (
      (t.request.url && t.request.url.toLowerCase().includes(lower)) ||
      (t.request.host && t.request.host.toLowerCase().includes(lower)) ||
      (t.request.method && t.request.method.toLowerCase().includes(lower)) ||
      (t.response && t.response.status_code && t.response.status_code.toString().includes(lower))
    );
  });

  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomHeight;
    const containerHeight = containerRef.current.getBoundingClientRect().height;

    const doDrag = (dragEvent) => {
      const deltaY = startY - dragEvent.clientY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      let newHeight = startHeight + deltaPercent;
      newHeight = Math.max(15, Math.min(newHeight, 85)); // clamp between 15% and 85%
      setBottomHeight(newHeight);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      <FilterBar value={filter} onChange={setFilter} />

      <div ref={containerRef} className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Half: Traffic Table */}
        <div
          className="w-full overflow-hidden flex flex-col z-10"
          style={{ height: selected ? `${100 - bottomHeight}%` : '100%' }}
        >
          <TrafficTable
            transactions={filteredTransactions}
            selected={selected}
            onSelect={(reqData) => setSelected(reqData)}
            loadMore={loadMore}
            hasMore={hasMore}
          />
        </div>

        {/* Resizer Handle */}
        {selected && (
          <div
            onMouseDown={startResize}
            className="w-full h-[3px] bg-white/[0.04] hover:bg-primary cursor-row-resize z-30 transition-colors"
          />
        )}

        {/* Bottom Half: Inspector Sheet (Like Burp Suite) */}
        {selected && (
          <div
            className="w-full flex flex-col bg-panel-dark relative z-20 shadow-[0_-8px_30px_rgb(0,0,0,0.5)] border-t border-panel-border"
            style={{ height: `${bottomHeight}%` }}
          >
            <Inspector txn={selected} />
            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-4 p-[5px] bg-transparent hover:bg-white/10 text-text-secondary hover:text-white rounded transition-colors z-50"
              title="Close Inspector"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
