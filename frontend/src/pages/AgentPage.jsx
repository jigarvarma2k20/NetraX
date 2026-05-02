import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AgentChat, GetAgentHistory, ClearAgentHistory, CancelAgentChat } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { Bot, MessageSquare, Send, Settings, Sparkles, Trash2, User, ChevronDown, Square } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from '../components/Modal';

const markdownPlugins = [remarkGfm];
const CHAT_PAGE_SIZE = 30;

const markdownComponents = {
    p: ({ node, ...props }) => <p className="mb-4 last:mb-0 leading-relaxed text-[15px]" {...props} />,
    pre: ({ node, ...props }) => <div className="bg-panel-dark p-4 rounded-xl overflow-x-auto my-4 border border-panel-border shadow-sm"><pre {...props} /></div>,
    code: ({ node, inline, ...props }) =>
        inline
            ? <code className="bg-surface-dark text-text-primary px-1.5 py-0.5 rounded-md text-sm font-mono border border-panel-border" {...props} />
            : <code className="text-sm text-text-secondary font-mono" {...props} />,
    ul: ({ node, ...props }) => <ul className="list-disc ml-5 my-4 space-y-2 text-[15px]" {...props} />,
    ol: ({ node, ...props }) => <ol className="list-decimal ml-5 my-4 space-y-2 text-[15px]" {...props} />,
    li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
    h1: ({ node, ...props }) => <h1 className="text-xl font-semibold text-text-primary mb-3 mt-6" {...props} />,
    h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-text-primary mb-3 mt-6" {...props} />,
    h3: ({ node, ...props }) => <h3 className="text-base font-medium text-text-primary mb-2 mt-5" {...props} />,
    a: ({ node, ...props }) => <a className="text-primary hover:underline transition-colors" {...props} />,
    blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-panel-border pl-4 my-4 font-normal italic text-text-secondary" {...props} />,
};

function looksLikeMarkdown(content) {
    return /(^|\n)\s{0,3}([#>*-]|\d+\.)\s|```|`[^`]+`|\[[^\]]+\]\([^\)]+\)|\|/.test(content);
}

const MessageItem = React.memo(function MessageItem({ msg }) {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const isAssistant = msg.role === 'assistant';
    const renderAsMarkdown = isAssistant && looksLikeMarkdown(msg.content || '');

    return (
        <div className={clsx(
            "flex w-full py-6",
            isUser ? "justify-end" : "justify-start"
        )}>
            <div className={clsx(
                "w-full max-w-5xl flex gap-4 md:gap-5 px-4 lg:px-0 mx-auto",
                isUser ? "flex-row-reverse" : "flex-row"
            )}>
                {/* Avatar */}
                {!isUser && (
                    <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border mt-0.5",
                        isSystem
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                : "bg-panel-dark text-text-primary border-panel-border shadow-sm"
                    )}>
                        {isSystem ? <Bot size={16} /> : <Bot size={16} />}
                    </div>
                )}

                {/* Message Bubble */}
                <div className={clsx(
                    "flex flex-col space-y-2 text-[15px] overflow-hidden",
                    isUser ? "items-end" : "items-start w-full",
                    /* Important: ensure max-width is constrained so text word-wraps */
                    "max-w-full"
                )}>
                    {isUser ? (
                        <div className="bg-primary text-white px-5 py-3 rounded-3xl rounded-tr-sm shadow-sm max-w-fit">
                            <div className="whitespace-pre-wrap word-break">{msg.content}</div>
                        </div>
                    ) : (
                        <div className={clsx(
                            "w-full text-text-secondary",
                            isSystem ? "text-amber-200/80 italic text-sm mt-1" : ""
                        )}>
                            {isAssistant ? (
                                renderAsMarkdown ? (
                                    <div className="markdown-body whitespace-pre-wrap wrap-break-word leading-relaxed min-w-0">
                                        <ReactMarkdown remarkPlugins={markdownPlugins} components={markdownComponents}>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="whitespace-pre-wrap word-break leading-relaxed">{msg.content}</div>
                                )
                            ) : (
                                <div className="whitespace-pre-wrap word-break leading-relaxed">{msg.content}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});
const PROVIDER_PRESETS = [
    { label: 'Ollama Cloud', url: 'https://ollama.com/api/chat', modelHint: 'llama3:latest' },
    { label: 'Ollama (Local)', url: 'http://localhost:11434/v1', modelHint: 'llama3:latest' },
    { label: 'Google (Gemini)', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', modelHint: 'gemini-2.5-flash' },
    { label: 'OpenAI (ChatGPT)', url: 'https://api.openai.com/v1', modelHint: 'gpt-4o' },
    { label: 'Custom URL', url: 'custom', modelHint: '' },
];

export default function AgentPage() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState(() => localStorage.getItem('agent_input_draft') || '');
    const [loading, setLoading] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [visibleCount, setVisibleCount] = useState(CHAT_PAGE_SIZE);

    // Config state
    const [config, setConfig] = useState(() => {
        const stored = localStorage.getItem('agent_config');
        return stored ? JSON.parse(stored) : {
            apiKey: '',
            baseUrl: 'http://localhost:11434/v1',
            model: 'llama3:latest'
        };
    });

    const currentPreset = useMemo(() => {
        const preset = PROVIDER_PRESETS.find(p => p.url === config.baseUrl);
        return preset ? preset.url : 'custom';
    }, [config.baseUrl]);

    const handleProviderChange = (e) => {
        const selectedUrl = e.target.value;
        if (selectedUrl !== 'custom') {
            const preset = PROVIDER_PRESETS.find(p => p.url === selectedUrl);
            setConfig({ ...config, baseUrl: selectedUrl, model: preset.modelHint || config.model });
        } else {
            setConfig({ ...config, baseUrl: '' });
        }
    };

    const messagesEndRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('agent_config', JSON.stringify(config));
    }, [config]);

    useEffect(() => {
        localStorage.setItem('agent_input_draft', input);
    }, [input]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (messages.length === 0) {
            setVisibleCount(CHAT_PAGE_SIZE);
        }
    }, [messages.length]);

    const hiddenCount = Math.max(0, messages.length - visibleCount);

    const visibleMessages = useMemo(() => {
        const start = Math.max(0, messages.length - visibleCount);
        return messages.slice(start).map((msg, idx) => ({
            msg,
            originalIndex: start + idx
        }));
    }, [messages, visibleCount]);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                const history = await GetAgentHistory();
                if (history && history.length > 0) {
                    setMessages(history);
                }
            } catch (err) {
                console.error("Failed to load agent history:", err);
            }
        };
        loadHistory();

        const unlisten = EventsOn("agent_log", (logMsg) => {
            setMessages(prev => [...prev, { role: 'system', content: `[Agent Action]: ${logMsg}` }]);
        });
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    const handleClearHistory = async () => {
        if (!window.confirm("Are you sure you want to clear all chat history? This action cannot be undone.")) {
            return;
        }
        try {
            await ClearAgentHistory();
            setMessages([]);
        } catch (err) {
            console.error("Failed to clear agent history:", err);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput('');
        localStorage.removeItem('agent_input_draft');

        const newHistory = [...messages.filter(m => m.role === 'user' || m.role === 'assistant')];
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const finalHistory = await AgentChat(config, newHistory, userMsg);
            if (finalHistory) {
                const assistantReply = finalHistory[finalHistory.length - 1];
                setMessages(prev => [...prev, { role: 'assistant', content: assistantReply.content }]);
            }
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: 'system', content: `[Error]: ${err}` }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="relative flex flex-col w-full h-full bg-background-dark overflow-hidden text-text-primary font-sans">
            {/* Minimal Header */}
            <header className="flex-none h-10 bg-panel-dark/80 backdrop-blur-md border-b border-panel-border flex items-center justify-between px-4 z-10 w-full relative group shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3">
                    <div className="flex bg-surface-dark p-1.5 rounded-lg border border-panel-border shadow-sm transition-transform duration-300 group-hover:scale-105">
                        <Sparkles size={14} className="text-text-primary" />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-medium tracking-tight text-text-primary flex items-center gap-2">
                            NetraX Assistant
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="rounded-lg border border-panel-border bg-panel-dark p-2 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary group"
                        title="Configuration"
                    >
                        <Settings size={16} className="group-hover:rotate-45 transition-transform duration-300" />
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scroll-smooth flex flex-col items-center">
                <div className="w-full flex-1 flex flex-col justify-start pb-4">
                    {hiddenCount > 0 && (
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={() => setVisibleCount(prev => prev + CHAT_PAGE_SIZE)}
                                className="flex items-center gap-2 rounded-full border border-panel-border bg-panel-dark px-4 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary hover:border-white/20 shadow-sm"
                            >
                                <ChevronDown size={14} />
                                Load previous messages ({hiddenCount})
                            </button>
                        </div>
                    )}

                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6 my-auto">
                            <div className="w-16 h-16 rounded-3xl bg-panel-dark border border-panel-border flex items-center justify-center shadow-lg shadow-black/20 transition-transform duration-500 hover:scale-110">
                                <Sparkles size={28} className="text-text-secondary" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-semibold text-text-primary tracking-tight">How can I assist you today?</h3>
                                <p className="text-[15px] text-text-secondary leading-relaxed">
                                    I can analyze traffic, inspect payloads, and help you understand security dynamics caught by NetraX.
                                </p>
                            </div>
                            <div className="flex gap-3 flex-wrap justify-center mt-4">
                                <button onClick={() => setInput("Identify any anomalous requests in the recent traffic.")} className="bg-panel-dark hover:bg-surface-dark border border-panel-border text-text-secondary text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm">
                                    Spot anomalies
                                </button>
                                <button onClick={() => setInput("Explain the payloads sent to the backend endpoints.")} className="bg-panel-dark hover:bg-surface-dark border border-panel-border text-text-secondary text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm">
                                    Explain payloads
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex-1">
                            {visibleMessages.map(({ msg, originalIndex }) => (
                                <MessageItem key={originalIndex} msg={msg} />
                            ))}
                        </div>
                    )}

                    {loading && (
                        <div className="flex w-full py-6 justify-start">
                            <div className="w-full max-w-5xl flex gap-4 md:gap-5 px-4 lg:px-0 mx-auto">
                                <div className="w-8 h-8 rounded-full bg-panel-dark flex items-center justify-center shrink-0 border border-panel-border shadow-sm mt-0.5">
                                    <Bot size={16} className="text-text-primary animate-pulse" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <div className="flex gap-1.5 items-center h-8 bg-transparent">
                                        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/80 animate-[bounce_1s_infinite_0ms]"></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/80 animate-[bounce_1s_infinite_200ms]"></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/80 animate-[bounce_1s_infinite_400ms]"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-4 w-full" />
                </div>
            </main>

            {/* Input Area */}
            <div className="flex-none pb-6 pt-2 px-4 w-full bg-linear-to-t from-background-dark via-background-dark to-transparent">
                <div className="max-w-5xl mx-auto relative rounded-3xl bg-panel-dark border border-panel-border shadow-lg focus-within:border-white/20 transition-all focus-within:ring-4 focus-within:ring-white/5">
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        placeholder={loading ? "Generating response..." : "Ask the NetraX Assistant..."}
                        className="w-full max-h-62.5 bg-transparent pl-5 pr-14 py-4 outline-none text-[15px] text-text-primary placeholder:text-text-secondary/70 resize-none overflow-y-auto custom-scrollbar disabled:opacity-50 min-h-14 flex items-center leading-relaxed"
                        rows={1}
                        style={{ height: "auto" }}
                        onInput={(e) => {
                            e.target.style.height = "auto";
                            e.target.style.height = (e.target.scrollHeight < 250 ? e.target.scrollHeight : 250) + "px";
                        }}
                    />
                    {loading ? (
                        <button
                            onClick={() => CancelAgentChat()}
                            className="absolute right-2.5 bottom-2.5 p-2 rounded-full bg-red-400 text-black hover:bg-red-500 transition-all shadow-sm"
                        >
                            <Square fill="currentColor" size={16} className="translate-x-[0.5px] translate-y-[-0.5px] m-px" />
                        </button>
                    ) : (
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim()}
                            className="absolute right-2.5 bottom-2.5 p-2 rounded-full bg-primary text-white hover:bg-primary-hover disabled:opacity-30 disabled:bg-surface-dark disabled:text-text-secondary transition-all shadow-sm"
                        >
                            <Send size={18} className="translate-x-px -translate-y-px" />
                        </button>
                    )}
                </div>
                <div className="text-center mt-3">
                    <p className="text-[11px] text-text-secondary/70">AI can make mistakes. Verify important traffic interpretations.</p>
                </div>
            </div>

            {/* Config Modal */}
            <Modal
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                title="Assistant Settings"
                cancelText="Done"
                type="info"
            >
                <div className="space-y-5 py-2">
                    <div>
                        <label className="block text-[13px] font-medium text-text-secondary mb-2">AI Provider</label>
                        <select
                            value={currentPreset}
                            onChange={handleProviderChange}
                            className="w-full bg-background-dark border border-panel-border rounded-xl text-sm text-text-primary px-4 py-2.5 focus:border-white/30 focus:ring-2 focus:ring-white/5 outline-none transition-all shadow-inner mb-3 appearance-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
                        >
                            {PROVIDER_PRESETS.map(p => (
                                <option key={p.url} value={p.url}>{p.label}</option>
                            ))}
                        </select>

                        {currentPreset === 'custom' && (
                            <div>
                                <label className="block text-[13px] font-medium text-text-secondary mb-2 mt-4">Custom Base URL</label>
                                <input
                                    type="text"
                                    value={config.baseUrl}
                                    onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
                                    placeholder="e.g., http://your-cloud.com:11434/v1"
                                    className="w-full bg-background-dark border border-panel-border rounded-xl text-sm text-text-primary px-4 py-2.5 focus:border-white/30 focus:ring-2 focus:ring-white/5 outline-none transition-all shadow-inner"
                                />
                            </div>
                        )}
                        <p className="text-[11px] text-text-secondary/70 mt-2 leading-relaxed">Choose an AI provider. NetraX requires OpenAI proxy compatibility (which Ollama, LMStudio, and Gemini support).</p>
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-text-secondary mb-2">Model Name</label>
                        <input
                            type="text"
                            value={config.model}
                            onChange={e => setConfig({ ...config, model: e.target.value })}
                            placeholder="gpt-4o, claude-3-haiku, llama3"
                            className="w-full bg-background-dark border border-panel-border rounded-xl text-sm text-text-primary px-4 py-2.5 focus:border-white/30 focus:ring-2 focus:ring-white/5 outline-none transition-all shadow-inner"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium text-text-secondary mb-2">API Key</label>
                        <input
                            type="password"
                            value={config.apiKey}
                            onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full bg-background-dark border border-panel-border rounded-xl text-sm text-text-primary px-4 py-2.5 focus:border-white/30 focus:ring-2 focus:ring-white/5 outline-none transition-all shadow-inner"
                        />
                        <p className="text-[11px] text-text-secondary/70 mt-2">Stored securely in your browser's local storage.</p>
                    </div>

                    <div className="pt-6 border-t border-panel-border mt-6 flex justify-between items-center">
                        <div>
                            <h4 className="text-[13px] font-medium text-text-secondary">Clear Data</h4>
                            <p className="text-[11px] text-text-secondary/70 mt-1">Delete all messages from the database.</p>
                        </div>
                        <button
                            onClick={() => {
                                handleClearHistory();
                                setIsConfigOpen(false);
                            }}
                            className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ml-auto"
                        >
                            <Trash2 size={14} />
                            Clear History
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
