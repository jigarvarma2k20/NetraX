import { useState, useEffect, useRef, useMemo } from 'react';
import { hexDump } from '../utils/hex';
import clsx from 'clsx';
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function MessageEditor({
    data,
    onChange,
    readOnly,
    placeHolder
}) {
    const [viewMode, setViewMode] = useState('Raw');
    const [searchTerm, setSearchTerm] = useState('');
    const [useRegex, setUseRegex] = useState(false);
    const [matchIndex, setMatchIndex] = useState(0);

    const textareaRef = useRef(null);

    const matches = useMemo(() => {
        if (!searchTerm || !data) return [];
        const results = [];
        try {
            const pattern = useRegex
                ? new RegExp(searchTerm, 'gi')
                : new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

            let match;
            while ((match = pattern.exec(data)) !== null) {
                results.push({ start: match.index, end: match.index + match[0].length });
            }
        } catch (e) {
            // Invalid regex
        }
        return results;
    }, [data, searchTerm, useRegex]);

    const nextMatch = () => {
        setMatchIndex((prev) => (prev + 1) % matches.length);
    };

    const prevMatch = () => {
        setMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
    };

    useEffect(() => {
        if (matches.length > 0 && textareaRef.current) {
            const current = matches[matchIndex];
            if (current) {
                const el = textareaRef.current;
                el.focus();
                el.setSelectionRange(current.start, current.end);
            }
        }
    }, [matchIndex, matches]);

    useEffect(() => {
        setMatchIndex(0);
    }, [searchTerm]);

    return (
        <div className="flex flex-col h-full bg-background-dark text-sm font-mono overflow-hidden">

            {/* View Tabs */}
            <div className="flex items-center gap-1 bg-panel-dark border-b border-panel-border px-2 h-8 shrink-0">
                {['Raw', 'Hex', 'Render'].map(mode => (
                    <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={clsx(
                            "px-3 h-full text-xs font-bold transition-colors border-b-2",
                            viewMode === mode
                                ? "text-primary border-primary bg-white/5"
                                : "text-text-secondary/60 border-transparent hover:text-text-secondary hover:bg-white/5"
                        )}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative min-h-0">
                {viewMode === 'Raw' && (
                    <div className="relative w-full h-full bg-background-dark" onClick={() => textareaRef.current?.focus()}>
                        <textarea
                            ref={textareaRef}
                            className="w-full h-full bg-transparent text-text-primary/90 caret-primary outline-none resize-none p-4 font-mono text-xs leading-normal select-text"
                            style={{
                                fontFamily: '"Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'keep-all',
                                overflowWrap: 'anywhere',
                            }}
                            value={data}
                            onChange={e => onChange && !readOnly && onChange(e.target.value)}
                            readOnly={readOnly}
                            spellCheck={false}
                            placeholder={placeHolder}
                        />
                    </div>
                )}

                {viewMode === 'Hex' && (
                    <pre className="w-full h-full p-4 text-text-secondary text-xs font-mono overflow-auto select-text">
                        {hexDump(data || '')}
                    </pre>
                )}

                {viewMode === 'Render' && (
                    <div className="w-full h-full bg-white p-4 overflow-auto select-text">
                        <iframe
                            srcDoc={(() => {
                                if (!data) return "";
                                const parts = data.split("\n\n");
                                if (parts.length < 2) return data;
                                return parts.slice(1).join("\n\n");
                            })()}
                            className="w-full h-full border-none"
                            sandbox="allow-same-origin"
                            title="Rendered View"
                        />
                    </div>
                )}
            </div>

            {/* Search Bar (Bottom) */}
            <div className="h-8 bg-panel-dark border-t border-panel-border flex items-center px-2 gap-2 shrink-0">
                <Search size={12} className="text-text-secondary/50" />
                <input
                    className="bg-transparent border-none outline-none text-xs text-text-primary flex-1 placeholder:text-text-secondary/30 focus:placeholder-text-secondary/50"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) prevMatch();
                            else nextMatch();
                        }
                    }}
                />
                <div className="flex items-center gap-2 border-l border-white/10 pl-2">
                    <label className="flex items-center gap-1 text-[10px] text-text-secondary/70 cursor-pointer select-none hover:text-text-secondary">
                        <input
                            type="checkbox"
                            checked={useRegex}
                            onChange={e => setUseRegex(e.target.checked)}
                            className="accent-primary"
                        />
                        Regex
                    </label>
                </div>

                {searchTerm && (
                    <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-2">
                        <button onClick={prevMatch} className="p-0.5 hover:bg-white/10 rounded text-text-secondary">
                            <ChevronUp size={14} />
                        </button>
                        <button onClick={nextMatch} className="p-0.5 hover:bg-white/10 rounded text-text-secondary">
                            <ChevronDown size={14} />
                        </button>
                        <div className="text-[10px] text-text-secondary/60 px-1 min-w-[50px] text-center font-mono">
                            {matches.length === 0 ? "0/0" : `${matchIndex + 1}/${matches.length}`}
                        </div>
                    </div>
                )}
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="ml-1 p-0.5 hover:bg-white/10 rounded text-text-secondary">
                        <X size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
