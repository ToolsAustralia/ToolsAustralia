"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import LoadingScreen from "@/components/loading/LoadingScreen";
import SuccessScreen from "@/components/loading/SuccessScreen";

interface Benefit {
  text: string;
  icon?: "gift" | "star" | "zap";
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
    autoCloseDelay: 3000,
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
    setLoadingState((prev) => ({
      ...prev,
      isVisible: false,
    }));
  };

  const showSuccess = (title: string, subtitle: string, benefits: Benefit[], autoCloseDelay?: number) => {
    setSuccessState({
      isVisible: true,
      title,
      subtitle,
      benefits,
      autoCloseDelay: autoCloseDelay || 3000,
    });
  };

  const hideSuccess = () => {
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
