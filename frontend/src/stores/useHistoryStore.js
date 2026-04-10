import { create } from 'zustand';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { GetRequestByID, GetRequests } from '../../wailsjs/go/main/App';

const MAX_TRANSACTIONS = 1000;

export const useHistoryStore = create((set, get) => ({
    transactionIds: [],
    transactionMap: {},
    isListening: false,
    hasMore: true,
    offset: 0,
    LIMIT: 50,

    getTransactions: () => {
        const state = get();
        return state.transactionIds.map(id => state.transactionMap[id]).filter(Boolean);
    },

    reset: () => set({
        transactionIds: [],
        transactionMap: {},
        offset: 0,
        hasMore: true
    }),

    loadMore: async () => {
        const { offset, LIMIT, hasMore } = get();
        if (!hasMore) return;

        try {
            const newTransactions = await GetRequests(LIMIT, offset);
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

        get().loadMore();

        EventsOn("newRequestRecived", (id) => {
            GetRequestByID(id, true).then((data) => {
                get().addTransaction({
                    request: data.request,
                    response: null,
                    index: data.index
                });
            }).catch(() => { });
        });

        EventsOn("requestWithResponse", (id) => {
            GetRequestByID(id, true).then((data) => {
                get().updateTransaction(id, data.response);
            }).catch(() => { });
        });
    }
}));
