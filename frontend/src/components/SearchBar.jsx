export default function SearchBar() {
  return (
    <div className="px-4 mb-2 flex items-center gap-2">
      <div className="relative flex-1">
        <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-base">search</span>
        <input
          className="form-input bg-surface-dark border-0 h-8 rounded pl-8 pr-3 text-xs text-white w-full placeholder:text-text-secondary"
          placeholder="Search..."
        />
      </div>

      <button className="h-8 px-2 rounded bg-surface-dark text-xs text-text-secondary hover:bg-primary/20">.*</button>
      <button className="h-8 px-2 rounded bg-surface-dark text-xs text-text-secondary hover:bg-primary/20">Aa</button>
      <button className="h-8 px-2 rounded bg-surface-dark text-xs text-text-secondary hover:bg-primary/20">{}</button>
    </div>
  );
}
