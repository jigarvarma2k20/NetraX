/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Clock3, Database, Globe, Layers3, Server, ShieldAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useProxyStore } from '../stores/useProxyStore';
import { GetAppStats } from '../../wailsjs/go/main/App';

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function DashboardPage() {
    const transactionIds = useHistoryStore(state => state.transactionIds);
    const transactionMap = useHistoryStore(state => state.transactionMap);
    const pendingRequests = useProxyStore(state => state.pendingRequests.length);
    const pendingResponses = useProxyStore(state => state.pendingResponses.length);

    const [stats, setStats] = useState({
        totalRequests: 0,
        responsesCaptured: 0,
        errorResponses: 0,
        uniqueHosts: 0,
        totalResponseBytes: 0,
        methodCounts: {},
        hostCounts: {}
    });

    useEffect(() => {
        GetAppStats().then(setStats).catch(console.error);
        
        const interval = setInterval(() => {
            GetAppStats().then(setStats).catch(console.error);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const transactions = transactionIds
        .map(id => transactionMap[id])
        .filter(Boolean)
        .sort((a, b) => b.index - a.index);

    const pendingTotal = pendingRequests + pendingResponses;

    const methodEntries = Object.entries(stats.methodCounts || {}).sort((a, b) => b[1] - a[1]);
    const hostEntries = Object.entries(stats.hostCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recentTransactions = transactions.slice(0, 10);
    
    // Derived stats
    const averageResponseBytes = stats.responsesCaptured > 0 ? Math.round(stats.totalResponseBytes / stats.responsesCaptured) : 0;
    const responseRate = stats.totalRequests > 0 ? Math.round((stats.responsesCaptured / stats.totalRequests) * 100) : 0;

    const metricCards = [
        { label: 'Requests captured', value: stats.totalRequests, icon: Server, tone: 'text-primary' },
        { label: 'Pending intercepts', value: pendingTotal, icon: Clock3, tone: 'text-accent-yellow' },
        { label: 'Unique hosts', value: stats.uniqueHosts, icon: Globe, tone: 'text-accent-blue' },
        { label: 'Error responses', value: stats.errorResponses, icon: TriangleAlert, tone: 'text-accent-red' },
        { label: 'Total data observed', value: formatBytes(stats.totalResponseBytes), icon: Database, tone: 'text-accent-green' },
        { label: 'Average response size', value: formatBytes(averageResponseBytes), icon: Layers3, tone: 'text-text-primary' },
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

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.9fr] min-h-0">
                    <div className="rounded-2xl border border-white/6 bg-panel-dark/85 shadow-[0_12px_40px_rgba(0,0,0,0.2)] min-w-0 flex flex-col">
                        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-white">Recent requests</h2>
                                <p className="text-xs text-text-secondary/60">Latest traffic captured in the history store.</p>
                            </div>
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
                                        <div className="w-16 sm:w-20 shrink-0">
                                            <span className="inline-block max-w-full truncate rounded-full bg-white/6 px-2.5 py-1 text-xs font-medium text-white/90 text-center">
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

                    <div className="space-y-6 min-w-0">
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
                                    const share = stats.totalRequests > 0 ? Math.round((count / stats.totalRequests) * 100) : 0;
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
                                    const share = stats.totalRequests > 0 ? Math.round((count / stats.totalRequests) * 100) : 0;
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
                    </div>
                </section>
            </div>
        </div>
    );
}
