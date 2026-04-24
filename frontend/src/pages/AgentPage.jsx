import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AgentChat, GetAgentHistory, ClearAgentHistory } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { Bot, Send, Settings, User, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from '../components/Modal';

const markdownPlugins = [remarkGfm];
const CHAT_PAGE_SIZE = 30;

const markdownComponents = {
    p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    pre: ({ node, ...props }) => <div className="bg-[#05070d] p-3 rounded-lg overflow-x-auto my-2 border border-white/5 shadow-inner"><pre {...props} /></div>,
    code: ({ node, inline, ...props }) =>
        inline
            ? <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono" {...props} />
            : <code className="text-xs text-text-secondary font-mono" {...props} />,
    ul: ({ node, ...props }) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
    ol: ({ node, ...props }) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
    li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
    h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-white mb-2 mt-4" {...props} />,
    h2: ({ node, ...props }) => <h2 className="text-base font-semibold text-white mb-2 mt-3" {...props} />,
    h3: ({ node, ...props }) => <h3 className="text-sm font-medium text-white mb-1 mt-2" {...props} />,
    a: ({ node, ...props }) => <a className="text-primary hover:underline transition-colors" {...props} />
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
            "flex items-start gap-3 max-w-[80%]",
            isUser ? "ml-auto flex-row-reverse" : ""
        )}>
            <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg",
                isUser ? "bg-primary" : isSystem ? "bg-text-secondary/20" : "bg-[#0c101c] border border-white/5"
            )}>
                {isUser ? <User size={14} className="text-background-dark" /> : <Bot size={14} className={isSystem ? 'text-text-secondary' : 'text-primary'} />}
            </div>

            <div className={clsx(
                "p-4 rounded-xl text-sm shadow-md",
                isUser
                    ? "bg-primary text-background-dark font-medium rounded-tr-sm"
                    : isSystem
                        ? "bg-text-secondary/10 text-text-secondary italic text-xs rounded-tl-sm w-full"
                        : "bg-panel-dark text-text-primary border border-white/5 rounded-tl-sm w-full overflow-hidden"
            )}>
                {isAssistant ? (
                    renderAsMarkdown ? (
                        <div className="w-full markdown-body whitespace-pre-wrap break-words">
                            <ReactMarkdown remarkPlugins={markdownPlugins} components={markdownComponents}>
                                {msg.content}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap word-break">{msg.content}</div>
                    )
                ) : (
                    <div className="whitespace-pre-wrap word-break">{msg.content}</div>
                )}
            </div>
        </div>
    );
});

export default function AgentPage() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
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

    const messagesEndRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('agent_config', JSON.stringify(config));
    }, [config]);

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
        // Load history from DB
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

        // Listen for internal tool calls emitted by backend
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
        if (!input.trim()) return;

        const userMsg = input;
        setInput('');

        const newHistory = [...messages.filter(m => m.role === 'user' || m.role === 'assistant')];
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const finalHistory = await AgentChat(config, newHistory, userMsg);
            // finalHistory includes all old messages + the new usermsg & assistant reply
            if (finalHistory) {
                // keep the system log messages, and just pull the last reply
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

    return (
        <div className="flex-1 bg-background-dark p-6 overflow-hidden flex flex-col md:flex-row gap-6 w-full h-full">

            {/* Chat Window */}
            <div className="flex-1 flex flex-col glass border border-white/[0.04] rounded-xl overflow-hidden shadow-2xl h-full">
                <div className="px-6 py-4 border-b border-white/[0.04] bg-[#0c101c] flex items-center justify-between shadow-sm z-10">
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <Bot size={18} className="text-primary drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]" />
                        NetraX AI Agent
                    </h2>
                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-all ring-1 ring-white/5 hover:ring-white/10 shadow-lg"
                        title="LLM Configuration"
                    >
                        <Settings size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="text-center text-text-secondary/50 mt-10">
                            Say hello to your integrated proxy agent!
                        </div>
                    )}
                    {hiddenCount > 0 && (
                        <div className="flex justify-center mb-2">
                            <button
                                onClick={() => setVisibleCount(prev => prev + CHAT_PAGE_SIZE)}
                                className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-colors border border-white/10"
                            >
                                Load {Math.min(CHAT_PAGE_SIZE, hiddenCount)} older messages ({hiddenCount} hidden)
                            </button>
                        </div>
                    )}
                    {visibleMessages.map(({ msg, originalIndex }) => (
                        <MessageItem key={originalIndex} msg={msg} />
                    ))}
                    {loading && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg bg-[#0c101c] border border-white/5">
                                <Bot size={14} className="text-primary animate-pulse" />
                            </div>
                            <div className="p-4 rounded-xl text-sm bg-panel-dark text-text-primary border border-white/5 shadow-md flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary animate-bounce"></span>
                                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-[#0c101c] border-t border-white/[0.04]">
                    <div className="flex bg-background-dark border border-panel-border rounded-lg overflow-hidden focus-within:border-primary transition-colors">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            disabled={loading}
                            placeholder="Ask agent to get intercepted requests or settings..."
                            className="flex-1 bg-transparent px-4 py-3 outline-none text-sm text-white disabled:opacity-50"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={loading || !input.trim()}
                            className="px-4 py-3 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
                title="LLM Configuration"
                cancelText="Close"
                type="info"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">Provider / Base URL</label>
                        <input
                            type="text"
                            value={config.baseUrl}
                            onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
                            placeholder="Standard OpenAI, Local/Cloud Ollama, LMStudio"
                            className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all shadow-inner"
                        />
                        <p className="text-[10px] text-text-secondary mt-1">Leave empty for standard OpenAI. Use `https://generativelanguage.googleapis.com/v1beta/openai/` for Gemini 1.5+. Use `http://localhost:11434/v1` for local Ollama.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">Model Name</label>
                        <input
                            type="text"
                            value={config.model}
                            onChange={e => setConfig({ ...config, model: e.target.value })}
                            placeholder="gpt-4o-mini, gemini-1.5-flash, llama3:latest"
                            className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all shadow-inner"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">API Key</label>
                        <input
                            type="password"
                            value={config.apiKey}
                            onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all shadow-inner"
                        />
                        <p className="text-[10px] text-text-secondary mt-1">Stored locally in your browser.</p>
                    </div>

                    <div className="pt-4 border-t border-white/5 mt-4">
                        <button
                            onClick={() => {
                                handleClearHistory();
                                setIsConfigOpen(false);
                            }}
                            className="w-full py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <Trash2 size={16} />
                            Clear Chat History
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
