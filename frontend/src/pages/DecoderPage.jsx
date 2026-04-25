import React, { useState } from 'react';
import Header from '../components/Header';
import { ArrowRightLeft, Copy, Trash2, ChevronDown } from 'lucide-react';
import { hexDump } from '../utils/hex';

export default function DecoderPage() {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [method, setMethod] = useState('Base64');
    const [mode, setMode] = useState('Encode');

    const handleAction = () => {
        try {
            let result = '';
            if (mode === 'Encode') {
                switch (method) {
                    case 'Base64':
                        result = btoa(input);
                        break;
                    case 'URL':
                        result = encodeURIComponent(input);
                        break;
                    case 'Hex':
                        result = input.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
                        break;
                    case 'Binary':
                        result = input.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
                        break;
                }
            } else {
                switch (method) {
                    case 'Base64':
                        result = atob(input);
                        break;
                    case 'URL':
                        result = decodeURIComponent(input);
                        break;
                    case 'Hex':
                        const hex = input.replace(/\s+/g, '');
                        if (hex.length % 2 !== 0) throw new Error("Invalid Hex length");
                        let str = '';
                        for (let i = 0; i < hex.length; i += 2) {
                            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                        }
                        result = str;
                        break;
                    case 'Binary':
                        const bins = input.trim().split(/\s+/);
                        result = bins.map(b => String.fromCharCode(parseInt(b, 2))).join('');
                        break;
                }
            }
            setOutput(result);
        } catch (e) {
            setOutput(`Error: ${e.message}`);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="flex flex-col h-full bg-background-dark text-text-primary">
            {/* Toolbar */}
            <div className="flex items-center gap-4 p-4 border-b border-panel-border bg-panel-dark">
                <div className="flex bg-overlay-soft p-1 rounded-lg">
                    {['Encode', 'Decode'].map(m => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); }}
                            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === m ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-white'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-white/10 mx-2" />

                <div className="relative">
                    <select
                        value={method}
                        onChange={e => setMethod(e.target.value)}
                        className="appearance-none bg-background-dark border border-panel-border rounded px-3 py-1.5 pr-8 text-xs focus:border-primary outline-none cursor-pointer hover:border-white/20 transition-colors text-text-primary"
                    >
                        <option value="Base64">Base64</option>
                        <option value="URL">URL</option>
                        <option value="Hex">Hex</option>
                        <option value="Binary">Binary</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                </div>

                <button
                    onClick={handleAction}
                    className="ml-auto bg-primary hover:bg-primary-hover text-white px-6 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                    <ArrowRightLeft size={14} />
                    Execute
                </button>
            </div>

            {/* Content Split */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 divide-y md:divide-y-0 md:divide-x divide-panel-border">
                {/* Input */}
                <div className="flex-1 flex flex-col min-h-0 bg-panel-dark">
                    <div className="px-4 py-2 border-b border-white/[0.04] flex justify-between items-center bg-[#0c101c]">
                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Input</span>
                        <div className="flex gap-2">
                            <button onClick={() => setInput('')} className="p-1 hover:text-accent-red transition-colors text-text-secondary" title="Clear">
                                <Trash2 size={12} />
                            </button>
                            <button onClick={() => copyToClipboard(input)} className="p-1 hover:text-white transition-colors text-text-secondary" title="Copy">
                                <Copy size={12} />
                            </button>
                        </div>
                    </div>
                    <textarea
                        className="flex-1 w-full bg-background-dark p-4 text-xs font-mono outline-none resize-none placeholder:text-text-secondary/30 text-text-primary"
                        placeholder="Enter text to process..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        spellCheck={false}
                    />
                </div>

                {/* Output */}
                <div className="flex-1 flex flex-col min-h-0 bg-panel-dark">
                    <div className="px-4 py-2 border-b border-white/[0.04] flex justify-between items-center bg-[#0c101c]">
                        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Output</span>
                        <button onClick={() => copyToClipboard(output)} className="p-1 hover:text-white transition-colors text-text-secondary" title="Copy">
                            <Copy size={12} />
                        </button>
                    </div>
                    <textarea
                        className="flex-1 w-full bg-background-dark p-4 text-xs font-mono outline-none resize-none text-accent-green placeholder:text-text-secondary/20"
                        placeholder="Result will appear here..."
                        value={output}
                        readOnly
                    />
                </div>
            </div>
        </div>
    );
}
