/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

import { useState, useMemo, useCallback } from 'react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GetRequestByID } from '../../wailsjs/go/main/App';
import { GitCompareArrows, Download, ArrowLeftRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const COMPARER_STATE_KEY = 'netrax.comparer.state';

function parseHeadersSafe(header) {
    if (header && typeof header === 'object') {
        return header;
    }

    try {
        const parsed = JSON.parse(String(header || '{}'));
        return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
        return {};
    }
}

function getHeaderValue(headers, name) {
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(headers || {})) {
        if (String(k).toLowerCase() !== target) continue;
        if (Array.isArray(v)) return String(v[0] || '');
        return String(v || '');
    }
    return '';
}

function isLikelyBinary(body, contentType) {
    if (!body) return false;

    const ct = (contentType || '').toLowerCase();
    const looksTextType =
        ct.includes('json') ||
        ct.includes('xml') ||
        ct.includes('html') ||
        ct.includes('javascript') ||
        ct.includes('x-www-form-urlencoded') ||
        ct.startsWith('text/');

    if (ct.includes('octet-stream') || ct.includes('protobuf') || ct.includes('grpc')) {
        return true;
    }

    if (looksTextType) {
        return false;
    }

    // Heuristic: if too many control/replacement chars are present, treat as binary.
    const sample = String(body).slice(0, 4096);
    let noisyCount = 0;
    for (let i = 0; i < sample.length; i++) {
        const code = sample.charCodeAt(i);
        const ch = sample[i];
        const isLineBreak = ch === '\n' || ch === '\r' || ch === '\t';
        const isControl = code < 32 && !isLineBreak;
        const isReplacement = ch === '�';
        if (isControl || isReplacement) noisyCount++;
    }

    return noisyCount / Math.max(sample.length, 1) > 0.08;
}

function formatBodyForComparer(body, headers) {
    const normalized = body || '';
    const contentType = getHeaderValue(headers, 'content-type');
    const contentLength = getHeaderValue(headers, 'content-length') || String(normalized.length);

    if (isLikelyBinary(normalized, contentType)) {
        return [
            '[Binary payload omitted]',
            `Content-Type: ${contentType || 'unknown'}`,
            `Content-Length: ${contentLength}`,
            'Tip: open this request in Inspector -> Hex view for byte-level inspection.'
        ].join('\n');
    }

    return normalized;
}

// Simple line-by-line diff
function computeDiff(textA, textB) {
    const linesA = (textA || '').split('\n');
    const linesB = (textB || '').split('\n');
    const maxLen = Math.max(linesA.length, linesB.length);
    const result = [];

    for (let i = 0; i < maxLen; i++) {
        const a = i < linesA.length ? linesA[i] : null;
        const b = i < linesB.length ? linesB[i] : null;

        if (a === b) {
            result.push({ type: 'equal', lineA: i + 1, lineB: i + 1, a, b });
        } else if (a === null) {
            result.push({ type: 'added', lineA: null, lineB: i + 1, a: null, b });
        } else if (b === null) {
            result.push({ type: 'removed', lineA: i + 1, lineB: null, a, b: null });
        } else {
            result.push({ type: 'modified', lineA: i + 1, lineB: i + 1, a, b });
        }
    }
    return result;
}

// Format headers from JSON string to readable block
function formatMessage(dto, type) {
    if (!dto) return '';
    try {
        let statusLine = '';
        if (type === 'request') {
            statusLine = `${dto.method} ${dto.url} ${dto.proto || 'HTTP/1.1'}`;
        } else {
            statusLine = `${dto.proto || 'HTTP/1.1'} ${dto.status_code} ${dto.status}`;
        }
        let headersObj = {};
        let headers = '';
        try {
            headersObj = parseHeadersSafe(dto.header);
            headers = Object.entries(headersObj).map(([k, v]) =>
                `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
            ).join('\n');
        } catch { headers = dto.header || ''; }

        const body = formatBodyForComparer(dto.body, headersObj);
        return `${statusLine}\n${headers}\n\n${body}`;
    } catch { return ''; }
}

export default function ComparerPage() {
    const [searchParams] = useSearchParams();
    const [idA, setIdA] = useState('');
    const [idB, setIdB] = useState('');
    const [dataA, setDataA] = useState(null);
    const [dataB, setDataB] = useState(null);
    const [loading, setLoading] = useState({ a: false, b: false });
    const [viewType, setViewType] = useState('request'); // request or response
    const [diffMode, setDiffMode] = useState('side'); // side or unified

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(COMPARER_STATE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);

            if (typeof saved.idA === 'string') setIdA(saved.idA);
            if (typeof saved.idB === 'string') setIdB(saved.idB);
            if (saved.dataA) setDataA(saved.dataA);
            if (saved.dataB) setDataB(saved.dataB);
            if (saved.viewType === 'request' || saved.viewType === 'response') {
                setViewType(saved.viewType);
            }
            if (saved.diffMode === 'side' || saved.diffMode === 'unified') {
                setDiffMode(saved.diffMode);
            }
        } catch {
            // ignore malformed cache
        }
    }, []);

    const loadRequest = useCallback(async (id, slot) => {
        const parsedId = parseInt(id);
        if (isNaN(parsedId) || parsedId <= 0) return;

        setLoading(prev => ({ ...prev, [slot]: true }));
        try {
            const data = await GetRequestByID(parsedId, false);
            if (slot === 'a') setDataA(data);
            else setDataB(data);
        } catch (err) {
            // silently handle
        } finally {
            setLoading(prev => ({ ...prev, [slot]: false }));
        }
    }, []);

    useEffect(() => {
        const queryA = searchParams.get('a');
        const queryB = searchParams.get('b');

        if (!queryA && !queryB) return;

        if (queryA) {
            setIdA(queryA);
            loadRequest(queryA, 'a');
        }

        if (queryB) {
            setIdB(queryB);
            loadRequest(queryB, 'b');
        }
    }, [searchParams, loadRequest]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(COMPARER_STATE_KEY, JSON.stringify({
                idA,
                idB,
                dataA,
                dataB,
                viewType,
                diffMode
            }));
        } catch {
            // ignore storage errors
        }
    }, [idA, idB, dataA, dataB, viewType, diffMode]);

    const textA = useMemo(() => {
        if (!dataA) return '';
        return viewType === 'request'
            ? formatMessage(dataA.request, 'request')
            : formatMessage(dataA.response, 'response');
    }, [dataA, viewType]);

    const textB = useMemo(() => {
        if (!dataB) return '';
        return viewType === 'request'
            ? formatMessage(dataB.request, 'request')
            : formatMessage(dataB.response, 'response');
    }, [dataB, viewType]);

    const diff = useMemo(() => computeDiff(textA, textB), [textA, textB]);

    const stats = useMemo(() => {
        let added = 0, removed = 0, modified = 0;
        diff.forEach(d => {
            if (d.type === 'added') added++;
            if (d.type === 'removed') removed++;
            if (d.type === 'modified') modified++;
        });
        return { added, removed, modified };
    }, [diff]);

    return (
        <div className="flex flex-col h-full bg-background-dark">
            {/* Toolbar */}
            <div className="flex items-center gap-4 p-3 border-b border-panel-border bg-panel-dark">
                {/* Slot A */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded">A</span>
                    <input
                        type="text"
                        value={idA}
                        onChange={e => setIdA(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && loadRequest(idA, 'a')}
                        placeholder="Request ID"
                        className="bg-background-dark border border-panel-border rounded px-3 py-1 text-xs w-32 focus:border-primary outline-none text-text-primary placeholder:text-text-secondary/30"
                    />
                    <button
                        onClick={() => loadRequest(idA, 'a')}
                        disabled={loading.a}
                        className="flex items-center gap-1 px-2 py-1 bg-accent-blue/10 text-accent-blue text-xs font-medium rounded border border-accent-blue/20 hover:bg-accent-blue/20 transition-all disabled:opacity-50"
                    >
                        {loading.a ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Load
                    </button>
                </div>

                <ArrowLeftRight size={16} className="text-text-secondary/40" />

                {/* Slot B */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-green bg-accent-green/10 px-2 py-0.5 rounded">B</span>
                    <input
                        type="text"
                        value={idB}
                        onChange={e => setIdB(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && loadRequest(idB, 'b')}
                        placeholder="Request ID"
                        className="bg-background-dark border border-panel-border rounded px-3 py-1 text-xs w-32 focus:border-primary outline-none text-text-primary placeholder:text-text-secondary/30"
                    />
                    <button
                        onClick={() => loadRequest(idB, 'b')}
                        disabled={loading.b}
                        className="flex items-center gap-1 px-2 py-1 bg-accent-green/10 text-accent-green text-xs font-medium rounded border border-accent-green/20 hover:bg-accent-green/20 transition-all disabled:opacity-50"
                    >
                        {loading.b ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        Load
                    </button>
                </div>

                <div className="h-6 w-px bg-white/10 mx-2" />

                {/* View Type Toggle */}
                <div className="flex bg-overlay-soft p-0.5 rounded-lg">
                    {['request', 'response'].map(t => (
                        <button
                            key={t}
                            onClick={() => setViewType(t)}
                            className={clsx(
                                "px-3 py-1 rounded-md text-xs font-medium transition-all capitalize",
                                viewType === t ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-white'
                            )}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Diff stats */}
                {(dataA || dataB) && (
                    <div className="ml-auto flex items-center gap-3 text-[10px] font-mono">
                        <span className="text-accent-green">+{stats.added}</span>
                        <span className="text-accent-red">-{stats.removed}</span>
                        <span className="text-accent-yellow">~{stats.modified}</span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex">
                {!dataA && !dataB ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-text-secondary/40 gap-4">
                        <div className="p-4 bg-primary/5 rounded-full">
                            <GitCompareArrows size={32} />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-medium text-text-secondary/60">HTTP Comparer</p>
                            <p className="text-xs text-text-secondary/40 mt-1 max-w-sm">
                                Load two requests by their ID from history to compare them side by side. Differences will be highlighted.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Diff Header */}
                        <div className="flex h-8 bg-[#0c101c] border-b border-panel-border shrink-0 text-xs font-bold uppercase tracking-wider text-text-secondary/60">
                            <div className="flex-1 px-4 flex items-center border-r border-panel-border">
                                <span className="text-accent-blue mr-2">A</span>
                                {dataA ? `#${dataA.index} · ${dataA.request?.method} ${dataA.request?.url?.substring(0, 40)}` : 'Not loaded'}
                            </div>
                            <div className="flex-1 px-4 flex items-center">
                                <span className="text-accent-green mr-2">B</span>
                                {dataB ? `#${dataB.index} · ${dataB.request?.method} ${dataB.request?.url?.substring(0, 40)}` : 'Not loaded'}
                            </div>
                        </div>

                        {/* Diff Body */}
                        <div className="flex-1 overflow-auto font-mono text-xs">
                            {diff.map((line, i) => (
                                <div
                                    key={i}
                                    className={clsx(
                                        "flex border-b border-white/2",
                                        line.type === 'added' && 'bg-accent-green/6',
                                        line.type === 'removed' && 'bg-accent-red/6',
                                        line.type === 'modified' && 'bg-accent-yellow/4',
                                    )}
                                >
                                    {/* Line A */}
                                    <div className="flex-1 flex border-r border-white/4 min-h-6">
                                        <div className="w-10 text-right px-2 py-0.5 text-text-secondary/30 select-none shrink-0 border-r border-white/4">
                                            {line.lineA || ''}
                                        </div>
                                        <div className={clsx(
                                            "flex-1 px-2 py-0.5 whitespace-pre-wrap break-all",
                                            line.type === 'removed' && 'text-accent-red/80',
                                            line.type === 'modified' && 'text-accent-yellow/80',
                                            line.type === 'equal' && 'text-text-primary/70',
                                            line.type === 'added' && 'text-transparent',
                                        )}>
                                            {line.a ?? ''}
                                        </div>
                                    </div>

                                    {/* Line B */}
                                    <div className="flex-1 flex min-h-6">
                                        <div className="w-10 text-right px-2 py-0.5 text-text-secondary/30 select-none shrink-0 border-r border-white/4">
                                            {line.lineB || ''}
                                        </div>
                                        <div className={clsx(
                                            "flex-1 px-2 py-0.5 whitespace-pre-wrap break-all",
                                            line.type === 'added' && 'text-accent-green/80',
                                            line.type === 'modified' && 'text-accent-yellow/80',
                                            line.type === 'equal' && 'text-text-primary/70',
                                            line.type === 'removed' && 'text-transparent',
                                        )}>
                                            {line.b ?? ''}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}