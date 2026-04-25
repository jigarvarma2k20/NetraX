import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, Globe, Layers3, Server, ShieldAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useProxyStore } from '../stores/useProxyStore';

export default function DashboardPage() {
    const transactionIds = useHistoryStore(state => state.transactionIds);
    const transactionMap = useHistoryStore(state => state.transactionMap);
    const loadMore = useHistoryStore(state => state.loadMore);
    const hasMore = useHistoryStore(state => state.hasMore);
    const pendingRequests = useProxyStore(state => state.pendingRequests.length);
    const pendingResponses = useProxyStore(state => state.pendingResponses.length);

    const transactions = transactionIds
        .map(id => transactionMap[id])
        .filter(Boolean)
        .sort((a, b) => b.index - a.index);

    const totalRequests = transactions.length;
    const responsesCaptured = transactions.filter((txn) => txn.response && txn.response.status_code !== 0).length;
    const errorResponses = transactions.filter((txn) => txn.response && txn.response.status_code >= 400).length;
    const uniqueHosts = new Set(transactions.map((txn) => txn.request.host).filter(Boolean)).size;
    const totalResponseBytes = transactions.reduce((sum, txn) => sum + (txn.response?.content_length || 0), 0);
    const averageResponseBytes = responsesCaptured > 0 ? Math.round(totalResponseBytes / responsesCaptured) : 0;
    const responseRate = totalRequests > 0 ? Math.round((responsesCaptured / totalRequests) * 100) : 0;

    const methodCounts = transactions.reduce((acc, txn) => {
        const method = txn.request.method || 'OTHER';
        acc[method] = (acc[method] || 0) + 1;
        return acc;
    }, {});

    const hostCounts = transactions.reduce((acc, txn) => {
        const host = txn.request.host || txn.request.url || 'unknown';
        acc[host] = (acc[host] || 0) + 1;
        return acc;
    }, {});

    const methodEntries = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);
    const hostEntries = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recentTransactions = transactions.slice(0, 6);
    const latestTransaction = transactions[0];
    const pendingTotal = pendingRequests + pendingResponses;

    const metricCards = [
        { label: 'Requests captured', value: totalRequests, icon: Server, tone: 'text-primary' },
        { label: 'Responses captured', value: responsesCaptured, icon: CheckCircle2, tone: 'text-accent-green' },
        { label: 'Pending intercepts', value: pendingTotal, icon: Clock3, tone: 'text-accent-yellow' },
        { label: 'Unique hosts', value: uniqueHosts, icon: Globe, tone: 'text-accent-blue' },
        { label: 'Error responses', value: errorResponses, icon: TriangleAlert, tone: 'text-accent-red' },
        { label: 'Average response size', value: `${averageResponseBytes}B`, icon: Layers3, tone: 'text-text-primary' },
    ];

    return (
        <div className="h-full w-full overflow-y-auto custom-scrollbar bg-background-dark">
            <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {metricCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.label} className="rounded-2xl border border-white/6 bg-panel-dark/85 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-text-secondary/60">{card.label}</p>
                                        <div className={`mt-2 text-3xl font-semibold ${card.tone}`}>{card.value}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/6 bg-white/5 p-3 text-text-secondary">
                                        <Icon size={20} className={card.tone} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.9fr]">
                    <div className="rounded-2xl border border-white/6 bg-panel-dark/85 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-white">Recent requests</h2>
                                <p className="text-xs text-text-secondary/60">Latest traffic captured in the history store.</p>
                            </div>
                            {hasMore ? (
                                <button
                                    type="button"
                                    onClick={loadMore}
                                    className="rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    Load more
                                </button>
                            ) : null}
                        </div>

                        <div className="divide-y divide-white/6">
                            {recentTransactions.length > 0 ? recentTransactions.map((txn) => {
                                const responseCode = txn.response?.status_code || 0;
                                const statusTone = responseCode >= 200 && responseCode < 300
                                    ? 'text-accent-green'
                                    : responseCode >= 300 && responseCode < 400
                                        ? 'text-accent-yellow'
                                        : responseCode >= 400
                                            ? 'text-accent-red'
                                            : 'text-text-secondary';

                                return (
                                    <div key={txn.index} className="flex items-center gap-4 px-5 py-4 text-sm">
                                        <div className="w-20 shrink-0">
                                            <span className="rounded-full bg-white/6 px-2.5 py-1 text-xs font-medium text-white/90">
                                                {txn.request.method || 'GET'}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-text-primary" title={txn.request.url}>{txn.request.url}</div>
                                            <div className="mt-1 truncate text-xs text-text-secondary/70">{txn.request.host || txn.request.remote_addr || 'unknown host'}</div>
                                        </div>
                                        <div className={`w-20 shrink-0 text-right text-sm font-medium ${statusTone}`}>
                                            {responseCode > 0 ? responseCode : '...'}
                                        </div>
                                        <div className="w-24 shrink-0 text-right text-xs text-text-secondary">
                                            {txn.response?.content_length ? `${txn.response.content_length}B` : 'no body'}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center text-text-secondary/60">
                                    <Server size={28} className="text-primary/40" />
                                    <p>No traffic captured yet.</p>
                                    <Link to="/setup" className="text-sm text-primary hover:text-primary-hover">
                                        Finish setup to start monitoring.
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-2xl border border-white/6 bg-panel-dark/85 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-base font-semibold text-white">Method breakdown</h2>
                                    <p className="text-xs text-text-secondary/60">Request distribution by HTTP verb.</p>
                                </div>
                                <TrendingUp size={18} className="text-primary" />
                            </div>

                            <div className="mt-4 space-y-3">
                                {methodEntries.length > 0 ? methodEntries.map(([method, count]) => {
                                    const share = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                                    return (
                                        <div key={method}>
                                            <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
                                                <span>{method}</span>
                                                <span>{count} requests</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-white/6">
                                                <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(6, share)}%` }} />
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="rounded-xl border border-dashed border-white/8 px-4 py-6 text-sm text-text-secondary/60">
                                        Method statistics will appear here once traffic is captured.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/6 bg-panel-dark/85 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-base font-semibold text-white">Top hosts</h2>
                                    <p className="text-xs text-text-secondary/60">Most active destinations in the current session.</p>
                                </div>
                                <Globe size={18} className="text-accent-blue" />
                            </div>

                            <div className="mt-4 space-y-3">
                                {hostEntries.length > 0 ? hostEntries.map(([host, count]) => {
                                    const share = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                                    return (
                                        <div key={host} className="rounded-xl border border-white/6 bg-white/3 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0 truncate text-sm text-white" title={host}>{host}</div>
                                                <div className="text-xs text-text-secondary/60">{count} hits</div>
                                            </div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
                                                <div className="h-full rounded-full bg-accent-blue/80" style={{ width: `${Math.max(8, share)}%` }} />
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="rounded-xl border border-dashed border-white/8 px-4 py-6 text-sm text-text-secondary/60">
                                        Host activity will show up here as requests are observed.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/6 bg-panel-dark/85 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-base font-semibold text-white">Latest activity</h2>
                                    <p className="text-xs text-text-secondary/60">A quick glance at the most recent request.</p>
                                </div>
                                <ShieldAlert size={18} className="text-accent-yellow" />
                            </div>

                            <div className="mt-4 rounded-xl border border-white/6 bg-white/3 p-4">
                                {latestTransaction ? (
                                    <>
                                        <div className="text-sm font-medium text-white">
                                            {latestTransaction.request.method} {latestTransaction.request.host || latestTransaction.request.url}
                                        </div>
                                        <div className="mt-2 space-y-1 text-xs text-text-secondary/70">
                                            <div className="truncate" title={latestTransaction.request.url}>{latestTransaction.request.url}</div>
                                            <div>Response rate: {responseRate}%</div>
                                            <div>Pending request queue: {pendingRequests}</div>
                                            <div>Pending response queue: {pendingResponses}</div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-text-secondary/60">
                                        No captured traffic yet. Start with the Setup page to begin monitoring.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
