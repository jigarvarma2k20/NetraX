
export default function Header({ title }) {
  return (
    <div className="px-4 pt-4 pb-2 flex items-center justify-between">
      <h2 className="text-sm font-medium text-white">{title}</h2>
    </div>
  );
}
