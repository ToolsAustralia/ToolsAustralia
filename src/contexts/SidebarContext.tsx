"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface SidebarContextType {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isAnySidebarOpen: boolean;
}

const defaultSidebarContext: SidebarContextType = {
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: () => {},
  isCartOpen: false,
  setIsCartOpen: () => {},
  isAnySidebarOpen: false,
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const isAnySidebarOpen = isMobileMenuOpen || isCartOpen;

  return (
    <SidebarContext.Provider
      value={{
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        isCartOpen,
        setIsCartOpen,
        isAnySidebarOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextType {
  const context = useContext(SidebarContext);
  return context ?? defaultSidebarContext;
}
