export type BarItem = { id: string; label: string; value: number; color: string; count?: number; unit?: string };

export function BarList({ items, fmt = (v: number) => String(v), fmtCount = (n: number) => n.toLocaleString("en-AU"), onItemClick, equalLength = false }: {
  items: BarItem[]; fmt?: (v: number) => string; fmtCount?: (n: number) => string; onItemClick?: (id: string) => void; equalLength?: boolean;
}) {
  const max = items.length ? Math.max(...items.map((i) => i.value)) || 1 : 1;
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">{it.label}</span>
              <span className="text-xs font-bold text-neutral-900 dark:text-white num shrink-0">{fmt(it.value)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500 group-hover:brightness-110" style={{ width: (equalLength ? 100 : (it.value / max) * 100) + "%", background: it.color }} />
              </div>
              {it.count != null && <span className="text-2xs text-neutral-400 dark:text-neutral-500 num w-28 text-right shrink-0 truncate">{fmtCount(it.count)} {it.unit}</span>}
            </div>
          </>
        );
        return onItemClick ? (
          <button
            key={it.id}
            type="button"
            onClick={() => onItemClick(it.id)}
            className="group block w-full text-left cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-600 transition-colors"
          >
            {body}
          </button>
        ) : (
          <div key={it.id} className="group">{body}</div>
        );
      })}
    </div>
  );
}
