import type { ElementType, ReactNode } from "react";

export function Card({
  children, className = "", as: As = "div", ...rest
}: { children: ReactNode; className?: string; as?: ElementType } & Record<string, unknown>) {
  return (
    <As className={`rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({
  title, subtitle, icon: Icon, right,
}: { title: string; subtitle?: string; icon?: ElementType; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && (
          <div className="shrink-0 w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
            <Icon className="w-4 h-4" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-display font-bold text-[15px] sm:text-base text-neutral-900 dark:text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
