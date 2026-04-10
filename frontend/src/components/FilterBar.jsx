import { Search } from 'lucide-react';

export default function FilterBar({ value, onChange }) {
  return (
    <div className="px-4 py-2 border-b border-panel-border bg-panel-dark flex items-center gap-3">
      <div className="relative w-full max-w-xl">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={14} className="text-text-secondary/40" />
        </div>
        <input
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          className="w-full bg-background-dark border border-panel-border rounded-lg text-xs text-text-primary placeholder:text-text-secondary/30 pl-9 pr-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all select-text"
          placeholder="Filter requests (url, host, method, status)..."
        />
      </div>
    </div>
  );
}