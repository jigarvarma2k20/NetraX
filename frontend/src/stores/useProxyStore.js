import { create } from 'zustand';
import { SetIntercept, ForwardRequest, DropRequest, ForwardResponse, DropResponse, GetRequestByID, ForwardAll, ForwardAndInterceptResponse } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export const useProxyStore = create((set, get) => ({
    interceptEnabled: false,
    pendingRequests: [],
    pendingResponses: [],

    reset: () => set({
        pendingRequests: [],
        pendingResponses: []
    }),

    toggleIntercept: (val) => {
        SetIntercept(val);
        set({ interceptEnabled: val });
        if (!val) {
            set({ pendingRequests: [], pendingResponses: [] });
        }
    },

    setInterceptStatus: (val) => set({ interceptEnabled: val }),

    addPendingRequest: async (id) => {
        try {
            if (get().pendingRequests.some(r => String(r.id) === String(id))) return;

            const txn = await GetRequestByID(id, false);
            if (!txn || !txn.request) return;

            const req = txn.request;
            set(state => {
                if (state.pendingRequests.some(r => String(r.id) === String(id))) return state;
                return { pendingRequests: [...state.pendingRequests, { id, ...req }] };
            });
        } catch (e) {
            // silently handle
        }
    },

    addPendingResponse: async (id) => {
        try {
            if (get().pendingResponses.some(r => String(r.id) === String(id))) return;

            const txn = await GetRequestByID(id, false);
            if (!txn || !txn.response) return;

            const resp = txn.response;
            const req = txn.request;

            set(state => {
                if (state.pendingResponses.some(r => String(r.id) === String(id))) return state;
                return {
                    pendingResponses: [...state.pendingResponses, {
                        ...resp,
                        id,
                        reqHost: req?.host,
                        reqUrl: req?.url,
                        reqMethod: req?.method
                    }]
                };
            });
        } catch (e) {
            // silently handle
        }
    },

    removePendingRequest: (id) => set(state => ({
        pendingRequests: state.pendingRequests.filter(r => r.id !== id)
    })),

    removePendingResponse: (id) => set(state => ({
        pendingResponses: state.pendingResponses.filter(r => r.id !== id)
    })),

    handleForward: async (id, modifiedReq) => {
        get().removePendingRequest(id);
        await ForwardRequest(id, modifiedReq);
    },

    handleForwardAndInterceptResponse: async (id, modifiedReq) => {
        get().removePendingRequest(id);
        await ForwardAndInterceptResponse(id, modifiedReq);
    },

    handleDrop: async (id) => {
        get().removePendingRequest(id);
        await DropRequest(id);
    },

    handleForwardResponse: async (id, modifiedResp) => {
        get().removePendingResponse(id);
        await ForwardResponse(id, modifiedResp);
    },

    handleDropResponse: async (id) => {
        get().removePendingResponse(id);
        await DropResponse(id);
    },

    forwardAll: async () => {
        await ForwardAll();
        set({ pendingRequests: [], pendingResponses: [] });
    }
}));
