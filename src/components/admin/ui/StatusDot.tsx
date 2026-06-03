const MAP = { success: "bg-emerald-500", warning: "bg-amber-500", error: "bg-red-500", info: "bg-blue-500" } as const;
export function StatusDot({ status }: { status: keyof typeof MAP }) {
  return <span className={`w-2.5 h-2.5 rounded-full ${MAP[status] ?? MAP.info} shrink-0 ring-4 ring-white dark:ring-neutral-900`} />;
}
