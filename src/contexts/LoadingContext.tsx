"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import LoadingScreen from "@/components/loading/LoadingScreen";
import SuccessScreen from "@/components/loading/SuccessScreen";
import { clearDashboardEntryHold } from "@/utils/dashboard-entry-hold";

interface Benefit {
  text: string;
  icon?: "gift" | "star" | "zap" | "ticket" | "tag";
  highlight?: boolean;
}

interface LoadingState {
  isVisible: boolean;
  title: string;
  subtitle: string;
  steps: string[];
}

interface SuccessState {
  isVisible: boolean;
  title: string;
  subtitle: string;
  benefits: Benefit[];
  autoCloseDelay?: number;
}

interface LoadingContextType {
  showLoading: (title: string, subtitle: string, steps: string[]) => void;
  hideLoading: () => void;
  showSuccess: (title: string, subtitle: string, benefits: Benefit[], autoCloseDelay?: number) => void;
  hideSuccess: () => void;
  /** True while the full-screen success overlay is visible (purchase celebration). */
  isSuccessScreenVisible: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isVisible: false,
    title: "",
    subtitle: "",
    steps: [],
  });

  const [successState, setSuccessState] = useState<SuccessState>({
    isVisible: false,
    title: "",
    subtitle: "",
    benefits: [],
    autoCloseDelay: 4500,
  });

  const showLoading = (title: string, subtitle: string, steps: string[]) => {
    setLoadingState({
      isVisible: true,
      title,
      subtitle,
      steps,
    });
  };

  const hideLoading = () => {
    setLoadingState((prev) => ({ ...prev, isVisible: false }));
  };

  const showSuccess = (title: string, subtitle: string, benefits: Benefit[], autoCloseDelay?: number) => {
    setSuccessState({
      isVisible: true,
      title,
      subtitle,
      benefits,
      autoCloseDelay: autoCloseDelay ?? 4500,
    });
  };

  const hideSuccess = () => {
    // Release the dashboard entry hold HERE, because this is the event it actually waits for.
    //
    // A purchase arms a module-level hold that freezes /my-account's entry buckets so the
    // counter animates exactly once, after the celebration closes. Its only other release
    // lives in `useDashboardEntryDisplay`, which exists ONLY while /my-account is mounted —
    // and the purchase modals are globally mounted, so buying from the homepage, results or
    // rewards left nobody to observe this transition and the wallet stayed frozen at its
    // pre-purchase figure for the rest of the SPA session.
    //
    // This provider is mounted globally, so it observes the overlay closing on EVERY page.
    // Releasing here fixes the leak at its real owner rather than capping it with a timeout,
    // and it preserves the feature: the hold still lasts exactly as long as the celebration.
    clearDashboardEntryHold();
    setSuccessState((prev) => ({
      ...prev,
      isVisible: false,
    }));
  };

  return (
    <LoadingContext.Provider
      value={{
        showLoading,
        hideLoading,
        showSuccess,
        hideSuccess,
        isSuccessScreenVisible: successState.isVisible,
      }}
    >
      {children}

      {/* Global Loading Screen */}
      <LoadingScreen
        title={loadingState.title}
        subtitle={loadingState.subtitle}
        steps={loadingState.steps}
        isVisible={loadingState.isVisible}
      />

      {/* Global Success Screen */}
      <SuccessScreen
        title={successState.title}
        subtitle={successState.subtitle}
        benefits={successState.benefits}
        autoCloseDelay={successState.autoCloseDelay}
        onAutoClose={hideSuccess}
        isVisible={successState.isVisible}
      />
    </LoadingContext.Provider>
  );
};
