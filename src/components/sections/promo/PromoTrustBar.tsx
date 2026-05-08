"use client";

import { CalendarDays, Shield, Trophy, type LucideIcon } from "lucide-react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { cn } from "@/utils/cn";

const linkClass =
  "text-inherit visited:text-inherit no-underline decoration-transparent [text-decoration-line:none] transition-opacity hover:opacity-90";

type TrustItem =
  | {
      kind: "text";
      icon: LucideIcon;
      lineMobile: string;
      lineDesktop: string;
      desktopMutedTail?: string;
    }
  | {
      kind: "cert";
      icon: LucideIcon;
      href: string;
      host: string;
      lineDesktopBeforeLink: string;
    };

/** Shared label styles: all caps. On mobile, nowrap + leading-none keeps the bar to a single line (no height jump). */
const labelCn =
  "min-w-0 font-extrabold uppercase tracking-wide text-[clamp(7px,2.2vw,10px)] max-sm:whitespace-nowrap max-sm:leading-none sm:text-xs sm:leading-snug sm:tracking-wide sm:whitespace-normal lg:text-sm";

export default function PromoTrustBar() {
  const theme = usePromoTheme();

  const trustItems: TrustItem[] = [
    {
      kind: "text",
      icon: Trophy,
      lineMobile: "Drawn live",
      lineDesktop: "Winners drawn live",
      desktopMutedTail: "· on Facebook",
    },
    {
      kind: "cert",
      icon: Shield,
      href: "https://randomdraws.com.au",
      host: "randomdraws.com.au",
      lineDesktopBeforeLink: "Govt-certified draws · ",
    },
    {
      kind: "text",
      icon: CalendarDays,
      lineMobile: "Drawn every 27th",
      lineDesktop: "Drawn every 27th",
    },
  ];

  return (
    <div
      className="relative z-10 w-full min-w-0 max-w-none bg-white dark:bg-neutral-950 border-b border-slate-200/80 dark:border-neutral-800"
      aria-label="Trust and giveaway information"
    >
      <div className="box-border w-full min-w-0 max-w-none max-sm:py-1.5 py-2.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-4 lg:px-10 xl:px-14 2xl:px-16">
        <div className="flex w-full min-w-0 flex-row flex-nowrap items-center justify-between gap-1 sm:justify-center sm:gap-6 md:gap-10 lg:justify-between lg:gap-6 xl:gap-10">
          {trustItems.map((item) => {
            const Icon = item.icon;
            const key = item.kind === "text" ? item.lineDesktop : item.host;

            /** Mobile: side columns content-width; center (cert) flex-1 so URL fits one line */
            const shellMobile =
              item.kind === "cert"
                ? "max-sm:flex-1 max-sm:min-w-0 max-sm:basis-0"
                : "max-sm:flex-none max-sm:shrink-0 max-sm:basis-auto";

            if (item.kind === "cert") {
              return (
                <div
                  key={key}
                  className={cn("flex min-w-0 items-center justify-center sm:flex-1", shellMobile)}
                >
                  <div className="inline-flex min-w-0 max-w-full items-center gap-0.5 sm:gap-2">
                    <Icon
                      className="h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                      style={{ color: theme.primary }}
                      aria-hidden
                    />
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(labelCn, "min-w-0 text-gray-900 dark:text-white sm:hidden", linkClass)}
                      aria-label="Government-certified draws — randomdraws.com.au"
                    >
                      {item.host}
                    </a>
                    <p className={cn(labelCn, "hidden min-w-0 max-w-full text-gray-900 dark:text-white sm:inline")}>
                      <span>{item.lineDesktopBeforeLink}</span>
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "inline")}>
                        {item.host}
                      </a>
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={key}
                className={cn("flex min-w-0 items-center justify-center sm:flex-1 lg:justify-center", shellMobile)}
              >
                <div className="inline-flex max-w-full items-center gap-0.5 sm:gap-2">
                  <Icon
                    className="h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                    style={{ color: theme.primary }}
                    aria-hidden
                  />
                  <p
                    className={cn(labelCn, "m-0 max-w-full text-gray-900 dark:text-white sm:leading-snug")}
                  >
                    <span className="sm:hidden">{item.lineMobile}</span>
                    <span className="hidden sm:inline">
                      {item.lineDesktop}
                      {item.desktopMutedTail != null ? (
                        <span className="font-semibold text-gray-500 dark:text-neutral-400"> {item.desktopMutedTail}</span>
                      ) : null}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
