import React, { useState, useEffect } from 'react';
import { StartMCPServer, StopMCPServer, GetMCPStatus } from '../../wailsjs/go/main/App';
import { Bot, Play, Square, Settings, Link2, ExternalLink, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

export default function McpPage() {
    const [isRunning, setIsRunning] = useState(false);
    const [address, setAddress] = useState('127.0.0.1');
    const [port, setPort] = useState(8085);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const checkStatus = async () => {
        try {
            const status = await GetMCPStatus();
            setIsRunning(status);
            setError(null);
        } catch (e) {
            console.error("Failed to check MCP status", e);
        }
    };

    const toggleServer = async () => {
        setLoading(true);
        setError(null);
        
        try {
            if (isRunning) {
                await StopMCPServer();
                setIsRunning(false);
            } else {
                await StartMCPServer(address, parseInt(port, 10));
                setIsRunning(true);
            }
        } catch (e) {
            setError(e.toString());
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        const text = `"mcpServers": {
  "netrax": {
    "command": "mcp-proxy", // requires SSE proxy or custom bridge depending on client
    "args": ["http://${address}:${port}/sse"]
  }
}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex-1 bg-background-dark p-8 overflow-y-auto w-full h-full custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                        <Bot size={24} className="text-primary" />
                        MCP Server
                    </h1>
                </div>

                <div className="glass border border-white/4 rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 border-b border-white/4 bg-[#0c101c] flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <Settings size={18} className="text-primary" />
                                Model Context Protocol
                            </h2>
                            <p className="text-xs text-text-secondary mt-1">
                                Expose NetraX's captured traffic to AI agents like Claude to automate debugging.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx(
                                "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2",
                                isRunning ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-text-secondary/10 text-text-secondary border border-text-secondary/20"
                            )}>
                                <span className={clsx("w-2 h-2 rounded-full", isRunning ? "bg-accent-green animate-pulse" : "bg-text-secondary")}></span>
                                {isRunning ? "RUNNING" : "STOPPED"}
                            </span>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {error && (
                            <div className="p-4 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-end">
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">MCP Host Address</label>
                                    <input 
                                        type="text" 
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        disabled={isRunning || loading}
                                        placeholder="127.0.0.1"
                                        className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all disabled:opacity-50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">MCP SSE Port</label>
                                    <input 
                                        type="number" 
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                        disabled={isRunning || loading}
                                        className="w-full bg-background-dark border border-panel-border rounded-lg text-sm text-white px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-white/4">
                            <button
                                onClick={toggleServer}
                                disabled={loading}
                                className={clsx(
                                    "flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer w-full sm:w-auto",
                                    isRunning 
                                        ? "bg-accent-red/10 border border-accent-red/30 text-accent-red hover:bg-accent-red/20"
                                        : "bg-primary text-background-dark hover:bg-primary/90"
                                )}
                            >
                                {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                {isRunning ? "Stop Server" : "Start Server"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="glass border border-white/4 rounded-xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-4 border-b border-white/4 bg-[#0c101c]">
                        <h2 className="text-base font-semibold text-white flex items-center gap-2">
                            <Link2 size={18} className="text-primary" />
                            How to connect
                        </h2>
                    </div>
                    
                    <div className="p-6 space-y-4 text-sm text-text-secondary">
                        <p>1. Start the MCP server using the button above.</p>
                        <p>2. Add the following configuration to your AI agent (like Claude Desktop) config file:</p>
                        
                        <div className="relative group bg-background-dark p-4 rounded-lg border border-panel-border font-mono text-xs overflow-x-auto text-primary">
                            <button 
                                onClick={handleCopy}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-panel-dark border border-panel-border text-text-secondary hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                title="Copy configuration"
                            >
                                {copied ? <Check size={14} className="text-accent-green" /> : <Copy size={14} />}
                            </button>
                            <pre>{`"mcpServers": {
  "netrax": {
    "command": "mcp-proxy", // requires SSE proxy or custom bridge depending on client
    "args": ["http://${address}:${port}/sse"]
  }
}`}</pre>
                        </div>
                        
                        <div className="flex items-start gap-2 pt-2 p-3 bg-white/2 rounded-lg border border-white/5">
                            <ExternalLink size={16} className="text-primary shrink-0 mt-0.5" />
                            <p className="text-xs text-text-secondary/80">Wait for Claude to natively support SSE, or use a bridge tool to pipe SSE into standard input/output for local tools.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
