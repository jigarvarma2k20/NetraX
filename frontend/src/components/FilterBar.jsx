import { useState, useEffect, useRef } from "react";
import { Search, X, SlidersHorizontal, Check } from "lucide-react";
import { useHistoryStore } from "../stores/useHistoryStore";

export default function FilterBar({ value, onChange, className = "" }) {
  const inputRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const statusCodes = useHistoryStore(s => s.statusCodes);
  const hideMedia = useHistoryStore(s => s.hideMedia);
  const hideCSS = useHistoryStore(s => s.hideCSS);
  const hideJS = useHistoryStore(s => s.hideJS);
  const setFilters = useHistoryStore(s => s.setFilters);

  const toggleStatus = (code) => {
    if (statusCodes.includes(code)) {
      setFilters({ statusCodes: statusCodes.filter(c => c !== code) });
    } else {
      setFilters({ statusCodes: [...statusCodes, code] });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !inputRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => {
    onChange?.(e.target.value);
  };

  const clear = () => {
    onChange?.("");
    inputRef.current?.focus();
  };

  // "/" focus + "Esc" clear
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        clear();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={`relative w-full ${className}`}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/60 pointer-events-none"
      />

      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder="Filter requests (url, host, method, status)..."
        className="w-full h-9 pl-9 pr-14 rounded-md
        bg-background-dark border border-panel-border
        text-xs text-text-primary placeholder:text-text-secondary/40
        focus:border-primary focus:ring-1 focus:ring-primary/30
        outline-none transition"
      />

      {value && (
        <button
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2
          text-text-secondary/50 hover:text-white transition"
        >
          <X size={14} />
        </button>
      )}

      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition
        ${showDropdown || statusCodes.length > 0 || hideMedia || hideCSS || hideJS ? 'text-primary bg-primary/10' : 'text-text-secondary/50 hover:text-white'}`}
      >
        <SlidersHorizontal size={14} />
      </button>

      {showDropdown && (
        <div ref={dropdownRef} className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-panel-dark/95 shadow-2xl backdrop-blur-md z-50 p-4">
          <h3 className="text-xs font-semibold text-white mb-3 tracking-wider uppercase">Filter Settings</h3>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-secondary mb-2">Status Codes</p>
              <div className="grid grid-cols-2 gap-2">
                {['2xx', '3xx', '4xx', '5xx'].map(code => (
                  <button
                    key={code}
                    onClick={() => toggleStatus(code)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs border transition
                    ${statusCodes.includes(code) ? 'bg-primary/20 border-primary/50 text-primary' : 'border-white/10 text-text-secondary hover:bg-white/5'}`}
                  >
                    <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${statusCodes.includes(code) ? 'border-primary bg-primary text-background-dark' : 'border-white/20'}`}>
                      {statusCodes.includes(code) && <Check size={10} strokeWidth={3} />}
                    </div>
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/10 w-full" />

            <div>
              <p className="text-xs text-text-secondary mb-2">Hide Noise</p>
              <div className="space-y-2">
                {[
                  { label: 'Hide Media (Images/Video)', state: hideMedia, key: 'hideMedia' },
                  { label: 'Hide CSS', state: hideCSS, key: 'hideCSS' },
                  { label: 'Hide JS', state: hideJS, key: 'hideJS' }
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setFilters({ [item.key]: !item.state })}
                    className={`flex items-center gap-2 px-2 py-1.5 w-full rounded-md text-xs border transition
                    ${item.state ? 'bg-primary/20 border-primary/50 text-primary' : 'border-transparent text-text-secondary hover:bg-white/5'}`}
                  >
                    <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${item.state ? 'border-primary bg-primary text-background-dark' : 'border-white/20'}`}>
                      {item.state && <Check size={10} strokeWidth={3} />}
                    </div>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}