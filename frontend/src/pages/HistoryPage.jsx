import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useRepeaterStore } from '../stores/useRepeaterStore';
import FilterBar from '../components/FilterBar';
import TrafficTable from '../components/TrafficTable';
import Inspector from '../components/Inspector';
import { X } from 'lucide-react';

function parseHeaderObject(headerData) {
  if (!headerData) return {};
  if (typeof headerData === 'object') return headerData;
  try {
    return JSON.parse(headerData);
  } catch {
    return {};
  }
}

function flattenHeaders(headerObj) {
  return Object.fromEntries(
    Object.entries(headerObj || {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])
  );
}

function shellEscape(value) {
  return `'${String(value ?? '').replace(/'/g, `'"'"'`)}'`;
}

function buildCurlFromRequest(req) {
  const headers = flattenHeaders(parseHeaderObject(req?.header));
  const parts = [`curl -X ${req?.method || 'GET'} ${shellEscape(req?.url || '')}`];

  Object.entries(headers).forEach(([k, v]) => {
    parts.push(`  -H ${shellEscape(`${k}: ${v}`)}`);
  });

  if (req?.body) {
    parts.push(`  --data-raw ${shellEscape(req.body)}`);
  }

  return parts.join(' \\\n');
}

function buildPythonRequestsFromRequest(req) {
  const headers = flattenHeaders(parseHeaderObject(req?.header));
  return [
    'import requests',
    '',
    `url = ${JSON.stringify(req?.url || '')}`,
    `headers = ${JSON.stringify(headers, null, 2)}`,
    `data = ${JSON.stringify(req?.body || '')}`,
    '',
    `response = requests.request(${JSON.stringify(req?.method || 'GET')}, url, headers=headers, data=data)`,
    'print(response.status_code)',
    'print(response.text)'
  ].join('\n');
}

function buildFetchFromRequest(req) {
  const headers = flattenHeaders(parseHeaderObject(req?.header));
  const options = {
    method: req?.method || 'GET',
    headers,
    ...(req?.body ? { body: req.body } : {})
  };

  return [
    `fetch(${JSON.stringify(req?.url || '')}, ${JSON.stringify(options, null, 2)})`,
    '  .then((response) => response.text())',
    '  .then((result) => console.log(result))',
    '  .catch((error) => console.error(error));'
  ].join('\n');
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const transactionIds = useHistoryStore(state => state.transactionIds);
  const transactionMap = useHistoryStore(state => state.transactionMap);
  const loadMore = useHistoryStore(state => state.loadMore);
  const hasMore = useHistoryStore(state => state.hasMore);
  const startListening = useHistoryStore(state => state.startListening);
  const reset = useHistoryStore(state => state.reset);
  const addTabFromTransaction = useRepeaterStore(state => state.addTabFromTransaction);

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

  const onCopyUrl = async (txn) => {
    await copyText(txn?.request?.url || '');
  };

  const onCopyCurl = async (txn) => {
    await copyText(buildCurlFromRequest(txn?.request));
  };

  const onCopyPythonRequests = async (txn) => {
    await copyText(buildPythonRequestsFromRequest(txn?.request));
  };

  const onCopyFetch = async (txn) => {
    await copyText(buildFetchFromRequest(txn?.request));
  };

  const onSendToRepeater = async (txn) => {
    await addTabFromTransaction(txn);
    navigate('/repeater');
  };

  const onSendToComparer = (txn) => {
    const key = 'netrax.comparer.selection';
    const id = Number(txn?.index);
    if (!Number.isFinite(id)) return;

    let a = null;
    let b = null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      a = Number.isFinite(Number(saved.a)) ? Number(saved.a) : null;
      b = Number.isFinite(Number(saved.b)) ? Number(saved.b) : null;
    } catch {
      // ignore malformed state
    }

    if (!a) {
      a = id;
    } else if (!b) {
      if (a !== id) b = id;
    } else if (a !== id && b !== id) {
      a = b;
      b = id;
    }

    const next = { a, b };
    localStorage.setItem(key, JSON.stringify(next));

    const params = new URLSearchParams();
    if (next.a) params.set('a', String(next.a));
    if (next.b) params.set('b', String(next.b));
    navigate(`/comparer?${params.toString()}`);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden h-full">
      <div className="flex items-center gap-3 px-4">
        <div className="flex-1 min-w-0">
          <FilterBar value={filter} onChange={setFilter} />
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setSelected(null);
          }}
          className="shrink-0 rounded-md border border-white/8 bg-white/2 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white/6 hover:text-white"
          title="Clear list"
        >
          Clear
        </button>
      </div>

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
            onCopyUrl={onCopyUrl}
            onCopyCurl={onCopyCurl}
            onCopyPythonRequests={onCopyPythonRequests}
            onCopyFetch={onCopyFetch}
            onSendToRepeater={onSendToRepeater}
            onSendToComparer={onSendToComparer}
          />
        </div>

        {/* Resizer Handle */}
        {selected && (
          <div
            onMouseDown={startResize}
            className="w-full h-0.75 bg-white/4 hover:bg-primary cursor-row-resize z-30 transition-colors"
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
              className="absolute top-2 right-4 p-1.25 bg-transparent hover:bg-white/10 text-text-secondary hover:text-white rounded transition-colors z-50"
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
