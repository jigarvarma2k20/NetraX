import { GetRequestByID } from '../../wailsjs/go/main/App';
import { useCallback, useRef } from 'react';

export default function TrafficTable({ transactions = [], selected, onSelect, loadMore, hasMore }) {

  const selectTransaction = useCallback((txn) => {
    onSelect?.(txn);
    GetRequestByID(txn.index, false)
      .then((data) => {
        onSelect?.(data);
      })
      .catch(() => { });
  }, [onSelect]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // If we are within 100px of the bottom, load more
    if (hasMore && scrollHeight - scrollTop - clientHeight < 100) {
      loadMore?.();
    }
  };

  const methodColors = {
    GET: 'bg-accent-blue/20 text-accent-blue',
    POST: 'bg-accent-green/20 text-accent-green',
    PUT: 'bg-accent-yellow/20 text-accent-yellow',
    DELETE: 'bg-accent-red/20 text-accent-red',
    PATCH: 'bg-primary/20 text-primary',
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex w-full bg-[#0c101c] text-text-secondary text-xs font-bold border-b border-white/[0.04] shrink-0 uppercase tracking-wider sticky top-0 z-10">
        <div className="w-24 p-3 border-r border-white/[0.04]">Method</div>
        <div className="w-24 p-3 border-r border-white/[0.04]">Status</div>
        <div className="flex-1 p-3 border-r border-white/[0.04]">URL</div>
        <div className="w-24 p-3 text-right">Size</div>
      </div>

      {/* Native Scroll List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" onScroll={handleScroll}>
        {transactions.map((t) => {
          const isSelected = selected?.index === t.index;

          const statusColor = t.response && t.response.status_code !== 0
            ? t.response.status_code >= 200 && t.response.status_code < 300
              ? 'text-accent-green'
              : t.response.status_code >= 300 && t.response.status_code < 400
                ? 'text-accent-yellow'
                : 'text-accent-red'
            : 'text-text-secondary';

          return (
            <div
              key={t.index}
              onClick={() => selectTransaction(t)}
              className={`flex items-center hover:bg-white/[0.03] cursor-pointer border-b border-white/[0.04] text-sm font-mono transition-colors ${isSelected ? "bg-primary/[0.06] border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
            >
              <div className="w-24 p-2.5 shrink-0">
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${methodColors[t.request.method] || 'bg-white/10 text-text-secondary'}`}>
                  {t.request.method}
                </span>
              </div>
              <div className={`w-24 p-2.5 shrink-0 font-medium ${statusColor}`}>
                {t.response && t.response.status_code !== 0 ? t.response.status_code : "..."}
              </div>
              <div className="flex-1 p-2.5 text-text-primary truncate min-w-0" title={t.request.url}>
                {t.request.url}
              </div>
              <div className="w-24 p-2.5 shrink-0 text-text-secondary text-right">
                {t.response && t.response.status_code !== 0 ? `${t.response.content_length}B` : "-"}
              </div>
            </div>
          );
        })}
        {transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-text-secondary/50">
            <p>No traffic recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
