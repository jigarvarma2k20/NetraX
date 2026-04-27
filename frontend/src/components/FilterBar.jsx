import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

export default function FilterBar({ value, onChange, className = "" }) {
  const inputRef = useRef(null);

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
        className="w-full h-9 pl-9 pr-8 rounded-md
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
    </div>
  );
}