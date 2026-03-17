"use client";

import React from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import BottomNav from "./components/BottomNav";

export default function MyAccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider scoped>
      <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950 flex flex-col">
        <style jsx global>{`
          .site-header,
          .site-footer,
          .newsletter-section {
            display: none !important;
          }
        `}</style>
        
        <main className="flex-1 w-full min-w-0 max-w-full overflow-x-hidden pb-16 lg:pb-0">
          {children}
        </main>

        <BottomNav />
      </div>
    </ThemeProvider>
  );
}
