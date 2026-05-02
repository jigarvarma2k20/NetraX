import { create } from 'zustand';
import { SaveRepeater, GetRepeaters, UpdateRepeater, DeleteRepeater, GetRequestByID } from '../../wailsjs/go/main/App';
import { domain } from '../../wailsjs/go/models';

export const useRepeaterStore = create((set, get) => ({
    tabs: [],
    activeTabId: null,
    loading: false,

    loadTabs: async () => {
        set({ loading: true });
        try {
            const stored = await GetRepeaters();
            if (stored && stored.length > 0) {
                const tabs = stored.map(s => ({
                    id: s.id,
                    name: s.name,
                    request: s.request ? new domain.HTTPRequestDTO(s.request) : new domain.HTTPRequestDTO(),
                    response: s.response ? new domain.HTTPResponseDTO(s.response) : null,
                    loading: false
                }));
                set({ tabs, activeTabId: tabs[0].id, loading: false });
            } else {
                // Default tab if empty
                get().createTab();
                set({ loading: false });
            }
        } catch (e) {
            console.error("Failed to load repeater tabs:", e);
            // Fallback
            if (get().tabs.length === 0) get().createTab();
            set({ loading: false });
        }
    },

    setActiveTab: (id) => set({ activeTabId: id }),

    createTab: async () => {
        const newName = `Tab ${get().tabs.length + 1}`;
        try {
            // Save to DB first to get ID
            const req = new domain.HTTPRequestDTO({
                method: "GET",
                url: "https://example.com",
                proto: "HTTP/1.1",
                header: JSON.stringify({
                    "User-Agent": "NetraX/1.0",
                    "Accept": "*/*"
                }),
                body: ""
            });
            const id = await SaveRepeater(newName, req, null);

            const newTab = {
                id: id,
                name: newName,
                request: req,
                response: null,
                loading: false
            };

            set(state => ({
                tabs: [...state.tabs, newTab],
                activeTabId: id
            }));
        } catch (e) {
            console.error("Failed to create tab:", e);
        }
    },

    addTabFromTransaction: async (transaction) => {
        let fullTransaction = transaction;
        try {
            if (transaction.index) {
                const fetched = await GetRequestByID(transaction.index, false);
                if (fetched) fullTransaction = fetched;
            }
        } catch (e) {
            console.error("Failed to fetch full transaction details:", e);
        }

        if (!fullTransaction?.request) return null;

        const req = fullTransaction.request;
        const newName = `History #${fullTransaction.index}`;
        const method = req.method || "GET";
        const url = req.url || "https://example.com";
        const proto = req.proto || "HTTP/1.1";
        const header = typeof req.header === 'string'
            ? req.header
            : JSON.stringify(req.header || {});
        const body = req.body || "";

        const payloadReq = new domain.HTTPRequestDTO({
            method,
            url,
            proto,
            header,
            body
        });
        
        let payloadRes = null;
        if (fullTransaction.response) {
            const res = fullTransaction.response;
            const resHeader = typeof res.header === 'string'
                ? res.header
                : JSON.stringify(res.header || {});
            
            payloadRes = new domain.HTTPResponseDTO({
                ...res,
                header: resHeader
            });
        }

        try {
            const id = await SaveRepeater(newName, payloadReq, payloadRes);
            const newTab = {
                id,
                name: newName,
                request: payloadReq,
                response: payloadRes,
                loading: false
            };

            set(state => ({
                tabs: [...state.tabs, newTab],
                activeTabId: id
            }));

            return id;
        } catch (e) {
            console.error("Failed to create repeater tab from transaction:", e);
            return null;
        }
    },

    closeTab: async (id) => {
        const { tabs, activeTabId } = get();
        if (tabs.length === 1) return; // Don't close last tab? Or maybe allow and create new clean one? Burp allows closing all.
        // If we close last one, we should probably create a new one or show empty state.
        // For now, mimic logic: if 1, don't close.

        try {
            await DeleteRepeater(id);

            const newTabs = tabs.filter(t => t.id !== id);
            let newActiveId = activeTabId;
            if (activeTabId === id) {
                newActiveId = newTabs[newTabs.length - 1].id;
            }
            set({ tabs: newTabs, activeTabId: newActiveId });
        } catch (e) {
            console.error("Failed to delete tab:", e);
        }
    },

    updateTabRequest: async (id, reqDTO) => {
        // Optimistic update
        set(state => ({
            tabs: state.tabs.map(t => t.id === id ? { ...t, request: reqDTO } : t)
        }));
    },

    persistTab: async (id) => {
        const tab = get().tabs.find(t => t.id === id);
        if (!tab) return;
        
        try {
            const reqDTO = new domain.HTTPRequestDTO({
                method: tab.request.method,
                url: tab.request.url,
                proto: tab.request.proto || "HTTP/1.1",
                header: typeof tab.request.header === 'string' ? tab.request.header : JSON.stringify(tab.request.header),
                body: tab.request.body || ""
            });

            const resDTO = tab.response ? new domain.HTTPResponseDTO(tab.response) : null;

            await UpdateRepeater(tab.id, tab.name, reqDTO, resDTO);
        } catch (e) {
            console.error("Failed to persist tab:", e);
        }
    },

    renameTab: async (id, newName) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === id ? { ...t, name: newName } : t)
        }));
        await get().persistTab(id);
    },

    setTabResponse: (id, response) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === id ? { ...t, response, loading: false } : t)
        }));
    },

    setTabLoading: (id, loading) => {
        set(state => ({
            tabs: state.tabs.map(t => t.id === id ? { ...t, loading } : t)
        }));
    }
}));
