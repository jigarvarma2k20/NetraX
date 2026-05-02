import { useState, useEffect, useRef, useCallback } from 'react';
import { ExecuteRequest } from '../../wailsjs/go/main/App';
import { Plus, X, Play, Loader2 } from 'lucide-react';
import RequestPanel from '../components/RequestPanel';
import ResponsePanel from '../components/ResponsePanel';
import clsx from 'clsx';
import { useRepeaterStore } from '../stores/useRepeaterStore';

export default function RepeaterPage() {
  const { tabs, activeTabId, loadTabs, createTab, setActiveTab, closeTab, updateTabRequest, setTabResponse, setTabLoading, renameTab, persistTab } = useRepeaterStore();

  useEffect(() => {
    loadTabs();
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Renaming Logic
  const [editingTabId, setEditingTabId] = useState(null);
  const [editName, setEditName] = useState("");

  const startEditing = (tab) => {
    setEditingTabId(tab.id);
    setEditName(tab.name);
  };

  const saveName = () => {
    if (editingTabId) {
      renameTab(editingTabId, editName);
      setEditingTabId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') setEditingTabId(null);
  };

  // Send Logic
  const handleSend = async () => {
    if (!activeTab) return;

    setTabLoading(activeTabId, true);
    await persistTab(activeTabId);

    try {
      const result = await ExecuteRequest(activeTab.request);
      setTabResponse(activeTabId, result.response);
      setTimeout(() => persistTab(activeTabId), 0);
    } catch (err) {
      setTabLoading(activeTabId, false);
    }
  };

  const handleRequestChange = (val) => {
    updateTabRequest(activeTabId, val);
  };

  // Debounced auto-save: save 2s after last change, not on a fixed interval
  const saveTimerRef = useRef(null);
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (activeTabId) persistTab(activeTabId);
    }, 2000);
  }, [activeTabId, persistTab]);

  // Trigger debounced save whenever active tab's request changes
  const prevRequestRef = useRef(null);
  useEffect(() => {
    if (!activeTab) return;
    const currentReq = activeTab.request;
    if (prevRequestRef.current !== currentReq) {
      prevRequestRef.current = currentReq;
      scheduleAutoSave();
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeTab?.request, scheduleAutoSave]);

  // Also persist on unmount
  useEffect(() => {
    return () => {
      if (activeTabId) persistTab(activeTabId);
    };
  }, [activeTabId]);

  return (
    <div className="flex flex-col h-full bg-background-dark">
      {/* Tabs Bar */}
      <div className="flex items-center bg-panel-dark border-b border-panel-border overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => startEditing(tab)}
            className={clsx(
              "group flex items-center gap-2 px-4 py-2 text-xs cursor-pointer border-r border-panel-border transition-colors min-w-25 h-9 select-none",
              activeTabId === tab.id
                ? "bg-background-dark text-primary border-t-2 border-t-primary"
                : "text-text-secondary hover:bg-white/5"
            )}
          >
            {editingTabId === tab.id ? (
              <input
                autoFocus
                className="bg-transparent border border-primary/50 rounded px-1 outline-none text-white w-full h-full"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={saveName}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="truncate max-w-30">{tab.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        ))}
        <button onClick={createTab} className="p-2 text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
          <Plus size={16} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="h-10 border-b border-panel-border flex items-center px-4 bg-panel-dark">
        <button
          onClick={handleSend}
          disabled={activeTab?.loading}
          className="flex items-center gap-2 px-4 py-1 bg-primary text-white text-xs font-bold rounded hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          {activeTab?.loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
          Send
        </button>
        <div className="ml-auto text-xs text-text-secondary">
        </div>
      </div>

      {/* Split Editor — key on activeTabId to force re-mount and prevent ghost state */}
      <div className="flex-1 flex overflow-hidden">
        {/* Request */}
        <div className="flex-1 border-r border-panel-border flex flex-col min-w-50 min-h-0">
          {activeTab && (
            <RequestPanel
              key={`req-${activeTabId}`}
              dto={activeTab.request}
              onChange={handleRequestChange}
              editable
            />
          )}
        </div>

        {/* Response */}
        <div className="flex-1 flex flex-col min-w-50 min-h-0">
          {activeTab && (
            <ResponsePanel
              key={`resp-${activeTabId}`}
              dto={activeTab.response}
              editable
            />
          )}
        </div>
      </div>
    </div>
  );
}
