import { create } from 'zustand';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { GetRequestByID, GetRequests, GetFilteredRequests, GetFilteredRequestsCount } from '../../wailsjs/go/main/App';

const MAX_TRANSACTIONS = 1000;

export const useHistoryStore = create((set, get) => ({
    transactionIds: [],
    transactionMap: {},
    isListening: false,
    hasMore: true,
    offset: 0,
    LIMIT: 50,
    searchQuery: '',
    statusCodes: [],
    hideMedia: false,
    hideCSS: false,
    hideJS: false,
    totalCount: 0,

    setFilters: (filters) => {
        set({
            ...filters,
            transactionIds: [],
            transactionMap: {},
            offset: 0,
            hasMore: true
        });
        get().fetchTotalCount();
        get().loadMore();
    },

    fetchTotalCount: async () => {
        const { searchQuery, statusCodes, hideMedia, hideCSS, hideJS } = get();
        try {
            const count = await GetFilteredRequestsCount({
                searchQuery,
                statusCodes,
                hideMedia,
                hideCSS,
                hideJS
            });
            set({ totalCount: count });
        } catch (error) {
            // silently handle
        }
    },

    setSearchQuery: (query) => {
        get().setFilters({ searchQuery: query });
    },

    getTransactions: () => {
        const state = get();
        return state.transactionIds.map(id => state.transactionMap[id]).filter(Boolean);
    },

    reset: () => {
        set({
            transactionIds: [],
            transactionMap: {},
            offset: 0,
            hasMore: true,
            totalCount: 0
        });
        get().fetchTotalCount();
    },

    loadMore: async () => {
        const { offset, LIMIT, hasMore, searchQuery, statusCodes, hideMedia, hideCSS, hideJS } = get();
        if (!hasMore) return;

        try {
            const hasFilters = searchQuery || statusCodes.length > 0 || hideMedia || hideCSS || hideJS;
            let newTransactions = [];
            if (hasFilters) {
                newTransactions = await GetFilteredRequests({
                    searchQuery,
                    statusCodes,
                    hideMedia,
                    hideCSS,
                    hideJS
                }, LIMIT, offset);
            } else {
                newTransactions = await GetRequests(LIMIT, offset);
            }
            if (!newTransactions || newTransactions.length === 0) {
                set({ hasMore: false });
                return;
            }

            set((state) => {
                const newMap = { ...state.transactionMap };
                const newIds = [...state.transactionIds];

                newTransactions.forEach(t => {
                    if (!newMap[t.index]) {
                        newMap[t.index] = t;
                        newIds.push(t.index);
                    }
                });

                // Cap at MAX_TRANSACTIONS — evict oldest
                if (newIds.length > MAX_TRANSACTIONS) {
                    const evictCount = newIds.length - MAX_TRANSACTIONS;
                    const evictedIds = newIds.splice(0, evictCount);
                    evictedIds.forEach(id => delete newMap[id]);
                }

                return {
                    transactionMap: newMap,
                    transactionIds: newIds,
                    offset: state.offset + newTransactions.length,
                    hasMore: newTransactions.length === LIMIT
                };
            });
        } catch (error) {
            // silently handle
        }
    },

    addTransaction: (transaction) => set((state) => {
        if (state.transactionMap[transaction.index]) return state;

        const newIds = [transaction.index, ...state.transactionIds];
        const newMap = { ...state.transactionMap, [transaction.index]: transaction };

        // Cap at MAX_TRANSACTIONS
        if (newIds.length > MAX_TRANSACTIONS) {
            const evictedId = newIds.pop();
            delete newMap[evictedId];
        }

        return {
            transactionIds: newIds,
            transactionMap: newMap
        };
    }),

    updateTransaction: (id, response) => set((state) => {
        if (!state.transactionMap[id]) return state;
        return {
            transactionMap: {
                ...state.transactionMap,
                [id]: { ...state.transactionMap[id], response }
            }
        };
    }),

    startListening: () => {
        if (get().isListening) return;
        set({ isListening: true });

        get().fetchTotalCount();
        get().loadMore();

        EventsOn("newRequestRecived", (id) => {
            const { searchQuery, statusCodes, hideMedia, hideCSS, hideJS } = get();
            if (searchQuery || statusCodes.length > 0 || hideMedia || hideCSS || hideJS) return;
            GetRequestByID(id, true).then((data) => {
                get().addTransaction({
                    request: data.request,
                    response: null,
                    index: data.index
                });
                set((state) => ({ totalCount: state.totalCount + 1 }));
            }).catch(() => { });
        });

        EventsOn("requestWithResponse", (id) => {
            const { searchQuery, statusCodes, hideMedia, hideCSS, hideJS } = get();
            if (searchQuery || statusCodes.length > 0 || hideMedia || hideCSS || hideJS) return;
            GetRequestByID(id, true).then((data) => {
                get().updateTransaction(id, data.response);
            }).catch(() => { });
        });
    }
}));
