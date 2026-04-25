import { useState, useEffect, useMemo } from 'react';
import { useProxyStore } from '../stores/useProxyStore';
import { Play, XOctagon, ArrowRight, ArrowLeft, PlayCircle, PauseCircle } from 'lucide-react';
import clsx from 'clsx';
import RequestPanel from '../components/RequestPanel';
import ResponsePanel from '../components/ResponsePanel';

export default function InterceptPage() {
  const { pendingRequests, pendingResponses, handleForward, handleDrop, handleForwardResponse, handleDropResponse, interceptEnabled, toggleIntercept, forwardAll, handleForwardAndInterceptResponse } = useProxyStore();

  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [editData, setEditData] = useState(null);

  const combinedList = useMemo(() => {
    const socket = [];
    pendingRequests.forEach(r => socket.push({ ...r, type: 'request', sortId: r.id }));
    pendingResponses.forEach(r => socket.push({ ...r, type: 'response', sortId: r.id }));
    return socket.sort((a, b) => a.sortId - b.sortId);
  }, [pendingRequests, pendingResponses]);

  useEffect(() => {
    if (combinedList.length > 0 && !selectedId) {
      handleSelect(combinedList[0]);
    } else if (combinedList.length === 0) {
      setSelectedId(null);
      setEditData(null);
    }
  }, [combinedList]);

  const handleSelect = (item) => {
    setSelectedId(item.id);
    setSelectedType(item.type);
    setEditData(JSON.parse(JSON.stringify(item)));
  };

  const onForward = () => {
    if (!selectedId || !editData) return;
    if (selectedType === 'request') {
      handleForward(selectedId, editData);
    } else {
      handleForwardResponse(selectedId, editData);
    }
    setSelectedId(null);
    setEditData(null);
    setSelectedType(null);
  };

  const onDrop = () => {
    if (!selectedId) return;
    if (selectedType === 'request') {
      handleDrop(selectedId);
    } else {
      handleDropResponse(selectedId);
    }
    setSelectedId(null);
    setEditData(null);
    setSelectedType(null);
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div className="w-80 border-r border-panel-border flex flex-col bg-panel-dark">

        {/* Master Toggles */}
        <div className="flex flex-col border-b border-panel-border bg-overlay-soft">
          <div className="flex items-center gap-2 p-2">
            <button
              onClick={() => {
                const newState = !interceptEnabled;
                toggleIntercept(newState);
                if (!newState) forwardAll();
              }}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border",
                interceptEnabled
                  ? "bg-primary/20 border-primary text-primary hover:bg-primary/30"
                  : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10"
              )}
            >
              {interceptEnabled ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
              Intercept is {interceptEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="px-2 pb-2">
            <button
              onClick={forwardAll}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border bg-accent-green/10 border-accent-green/50 text-accent-green hover:bg-accent-green/20"
            >
              <Play size={12} fill="currentColor" /> Forward All Pending
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {combinedList.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => handleSelect(item)}
              className={clsx(
                "p-3 border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors",
                selectedId === item.id && selectedType === item.type && "bg-primary/[0.06] border-l-2 border-primary"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {item.type === 'request' ? (
                    <ArrowRight size={14} className="text-accent-blue" />
                  ) : (
                    <ArrowLeft size={14} className="text-accent-yellow" />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  {item.type === 'request' ? (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded",
                          item.method === 'GET' ? 'bg-accent-blue/20 text-accent-blue' :
                            item.method === 'POST' ? 'bg-accent-green/20 text-accent-green' : 'bg-white/10 text-text-secondary'
                        )}>{item.method}</span>
                        <span className="text-xs text-text-secondary truncate font-mono">#{item.id}</span>
                      </div>
                      <div className="text-[10px] text-text-secondary truncate" title={item.url}>{item.url}</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded",
                          item.status_code >= 200 && item.status_code < 300 ? 'bg-accent-green/20 text-accent-green' :
                            item.status_code >= 300 && item.status_code < 400 ? 'bg-accent-yellow/20 text-accent-yellow' : 'bg-accent-red/20 text-accent-red'
                        )}>{item.status_code}</span>
                        <span className="text-xs text-text-secondary truncate font-mono">#{item.id}</span>
                      </div>
                      <div className="text-[10px] text-text-secondary truncate">
                        Response to <span className="text-text-secondary/60">{item.reqUrl || 'Unknown URL'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {combinedList.length === 0 && (
            <div className="p-8 text-center text-text-secondary/50 text-sm">
              No intercepted items.
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col bg-background-dark overflow-hidden">
        {selectedId && editData ? (
          <>
            <div className="h-10 border-b border-panel-border flex items-center px-4 justify-between bg-panel-dark shrink-0">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className={clsx("font-mono font-bold", selectedType === 'request' ? "text-accent-blue" : "text-accent-yellow")}>
                  {selectedType === 'request' ? 'REQUEST' : 'RESPONSE'}
                </span>
                <span className="w-px h-4 bg-white/10 mx-2" />
                <span className="font-mono text-primary">#{editData.id}</span>
                <span className="w-px h-4 bg-white/10 mx-2" />
                <span className="truncate max-w-[400px]">
                  {selectedType === 'request' ? editData.url : (editData.reqUrl || 'Unknown URL')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onDrop}
                  className="flex items-center gap-2 px-3 py-1 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red text-xs font-medium rounded border border-accent-red/20 transition-all"
                >
                  <XOctagon size={14} /> Drop
                </button>

                {selectedType === 'request' && (
                  <button
                    onClick={() => {
                      handleForwardAndInterceptResponse(selectedId, editData);
                      setSelectedId(null);
                      setEditData(null);
                      setSelectedType(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1 bg-accent-yellow/10 hover:bg-accent-yellow/20 text-accent-yellow text-xs font-medium rounded border border-accent-yellow/20 transition-all"
                    title="Forward request and intercept its response"
                  >
                    <PauseCircle size={14} /> Intercept Response
                  </button>
                )}

                <button
                  onClick={onForward}
                  className="flex items-center gap-2 px-4 py-1 bg-primary text-white text-xs font-medium rounded hover:bg-primary-hover transition-all shadow-lg shadow-primary/20"
                >
                  <Play size={14} fill="currentColor" /> Forward
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {selectedType === 'request' ? (
                <RequestPanel
                  dto={editData}
                  onChange={setEditData}
                  editable
                />
              ) : (
                <ResponsePanel
                  dto={editData}
                  onChange={setEditData}
                  editable
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary/40 gap-4">
            <div className="p-4 bg-primary/5 rounded-full">
              {interceptEnabled ? <PlayCircle size={32} /> : <PauseCircle size={32} />}
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-text-secondary/60">
                {interceptEnabled ? "Interceptor is Empty" : "Intercept is OFF"}
              </p>
              <p className="text-xs text-text-secondary/40 mt-1">
                {interceptEnabled ? "Waiting for traffic..." : "Turn on intercept to capture traffic."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
