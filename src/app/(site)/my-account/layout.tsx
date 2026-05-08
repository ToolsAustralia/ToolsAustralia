"use client";

import React, { useEffect } from "react";
import BottomNav from "./components/BottomNav";

export default function MyAccountLayout({ children }: { children: React.ReactNode }) {
  /** Opt out of site-wide chrome (header/footer/newsletter section) while on
   * /my-account routes. The hide rules live in globals.css under the
   * body[data-account-layout] selector — set/cleared here. */
  useEffect(() => {
    document.body.setAttribute("data-account-layout", "");
    return () => {
      document.body.removeAttribute("data-account-layout");
    };
  }, []);

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <main className="flex-1 w-full min-w-0 max-w-full overflow-x-hidden pb-16 lg:pb-0">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
