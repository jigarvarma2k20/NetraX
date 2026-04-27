import { useState, useEffect, useRef } from 'react';
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
    Object.entries(headerObj || {}).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(', ') : String(v ?? '')
    ])
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
    '  .then((r) => r.text())',
    '  .then((res) => console.log(res))',
    '  .catch((e) => console.error(e));'
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

  const transactionIds = useHistoryStore(s => s.transactionIds);
  const transactionMap = useHistoryStore(s => s.transactionMap);
  const loadMore = useHistoryStore(s => s.loadMore);
  const hasMore = useHistoryStore(s => s.hasMore);
  const startListening = useHistoryStore(s => s.startListening);
  const reset = useHistoryStore(s => s.reset);

  const addTabFromTransaction = useRepeaterStore(s => s.addTabFromTransaction);

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
    const f = filter.toLowerCase();
    return (
      t.request.url?.toLowerCase().includes(f) ||
      t.request.host?.toLowerCase().includes(f) ||
      t.request.method?.toLowerCase().includes(f) ||
      t.response?.status_code?.toString().includes(f)
    );
  });

  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomHeight;
    const containerHeight = containerRef.current.getBoundingClientRect().height;

    const doDrag = (ev) => {
      const delta = startY - ev.clientY;
      let next = startHeight + (delta / containerHeight) * 100;
      next = Math.max(15, Math.min(next, 85));
      setBottomHeight(next);
    };

    const stop = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stop);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stop);
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

      <div className="flex items-center gap-2 px-4 py-2 border-b border-panel-border bg-panel-dark">

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <FilterBar value={filter} onChange={setFilter} />

          <span className="text-xs text-text-secondary/60 whitespace-nowrap">
            {filteredTransactions.length}/{transactions.length}
          </span>
        </div>

        <button
          onClick={() => {
            reset();
            setSelected(null);
          }}
          disabled={!transactions.length}
          className="h-9 px-3 rounded-md text-xs font-medium
          border border-panel-border bg-background-dark
          text-text-secondary
          hover:bg-red-500/10 hover:text-red-400
          disabled:opacity-40 disabled:cursor-not-allowed
          transition"
        >
          Clear
        </button>

      </div>

      <div ref={containerRef} className="flex-1 flex flex-col relative overflow-hidden">

        <div
          className="w-full flex flex-col overflow-hidden"
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

        {selected && (
          <div
            onMouseDown={startResize}
            className="h-0.5 bg-white/5 hover:bg-primary cursor-row-resize"
          />
        )}

        {selected && (
          <div
            className="relative bg-panel-dark border-t border-panel-border"
            style={{ height: `${bottomHeight}%` }}
          >
            <Inspector txn={selected} />

            <button
              onClick={() => setSelected(null)}
              className="absolute top-2 right-3 p-1 hover:bg-white/10 rounded"
            >
              <X size={16} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}