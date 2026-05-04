/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

import { GetRequestByID } from '../../wailsjs/go/main/App';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Bot } from 'lucide-react';

export default function TrafficTable({
  transactions = [],
  selected,
  onSelect,
  loadMore,
  hasMore,
  onCopyUrl,
  onCopyCurl,
  onCopyPythonRequests,
  onCopyFetch,
  onSendToRepeater,
  onSendToComparer,
  onSendToAgent,
  sortBy,
  sortDesc,
  onSort
}) {
  const [contextMenu, setContextMenu] = useState(null);

  const selectTransaction = useCallback((txn) => {
    onSelect?.(txn);
    GetRequestByID(txn.index, false)
      .then((data) => {
        onSelect?.(data);
      })
      .catch(() => { });
  }, [onSelect]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const onEscape = (e) => {
      if (e.key === 'Escape') closeMenu();
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onEscape);
    };
  }, []);

  const runAction = async (handler, txn) => {
    setContextMenu(null);
    if (!handler) return;
    try {
      await handler(txn);
    } catch {
      // silently handle
    }
  };

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
      <div className="flex w-full bg-[#0c101c] text-text-secondary text-xs font-bold border-b border-white/4 shrink-0 uppercase tracking-wider sticky top-0 z-10">
        <button onClick={() => onSort('id')} className="w-20 py-2 px-3 border-r border-white/4 flex items-center justify-between hover:bg-white/5 transition">
          Id
          {sortBy === 'id' && (sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
        <button onClick={() => onSort('method')} className="w-24 py-2 px-3 border-r border-white/4 flex items-center justify-between hover:bg-white/5 transition">
          Method
          {sortBy === 'method' && (sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
        <button onClick={() => onSort('status')} className="w-24 py-2 px-3 border-r border-white/4 flex items-center justify-between hover:bg-white/5 transition">
          Status
          {sortBy === 'status' && (sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
        <button onClick={() => onSort('url')} className="flex-1 py-2 px-3 border-r border-white/4 flex items-center justify-between hover:bg-white/5 transition">
          URL
          {sortBy === 'url' && (sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
        <div className="w-24 py-2 px-3 text-right">Size</div>
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
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, txn: t });
              }}
              className={`flex items-center hover:bg-white/3 cursor-pointer border-b border-white/4 text-[13px] font-mono transition-colors ${isSelected ? "bg-primary/6 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
            >
              <div className="w-20 py-1.5 px-3 shrink-0 text-text-secondary">
                {t.index}
              </div>
              <div className="w-24 py-1.5 px-3 shrink-0">
                <span className={`px-2 py-0.5 text-[11px] rounded font-medium ${methodColors[t.request.method] || 'bg-white/10 text-text-secondary'}`}>
                  {t.request.method}
                </span>
              </div>
              <div className={`w-24 py-1.5 px-3 shrink-0 font-medium ${statusColor}`}>
                {t.response && t.response.status_code !== 0 ? t.response.status_code : "..."}
              </div>
              <div className="flex-1 py-1.5 px-3 text-text-primary truncate min-w-0" title={t.request.url}>
                {t.request.url}
              </div>
              <div className="w-24 py-1.5 px-3 shrink-0 text-text-secondary text-right">
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

      {contextMenu && (
        <div
          className="fixed z-50 min-w-56 rounded-md border border-panel-border bg-panel-dark py-1 text-xs shadow-2xl"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => runAction(onCopyUrl, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Copy URL
          </button>
          <button
            type="button"
            onClick={() => runAction(onCopyCurl, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Copy as cURL
          </button>
          <button
            type="button"
            onClick={() => runAction(onCopyPythonRequests, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Copy as requests (Python)
          </button>
          <button
            type="button"
            onClick={() => runAction(onCopyFetch, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Copy as fetch
          </button>

          <div className="my-1 h-px bg-panel-border" />

          <button
            type="button"
            onClick={() => runAction(onSendToRepeater, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Send to Repeater
          </button>
          <button
            type="button"
            onClick={() => runAction(onSendToComparer, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Send to Comparer
          </button>
          <button
            type="button"
            onClick={() => runAction(onSendToAgent, contextMenu.txn)}
            className="w-full px-3 py-2 text-left text-text-secondary hover:bg-surface-dark hover:text-text-primary transition-colors"
          >
            Send to AI Agent
          </button>
        </div>
      )}
    </div>
  );
}
