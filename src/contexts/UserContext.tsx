"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  useUserData as useUserDataQuery,
  useMyAccountData,
  useUserMembership,
  useUserStats,
  UserData,
} from "@/hooks/queries/useUserQueries";

// Re-export the UserData type from React Query hooks for consistency
export type { UserData };

interface UserContextType {
  // Data
  userData: UserData | null;
  loading: boolean;
  error: string | null;

  // Session
  isAuthenticated: boolean;
  session: unknown;

  // Actions
  refetch: () => void;

  // Computed properties
  hasActiveSubscription: boolean;
  isMember: boolean;

  // Additional data from React Query
  accountData: unknown;
  membershipStatus: unknown;
  userStats: unknown;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

/**
 * UserContext Provider
 * Manages user data consistently across the entire application using React Query
 */
export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  // Use React Query hooks for data fetching
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUserData,
  } = useUserDataQuery(userId);

  const { data: accountData, isLoading: accountLoading, error: accountError } = useMyAccountData(userId);

  const membershipStatus = useUserMembership(userId);
  const userStats = useUserStats(userId);

  // Combine loading states
  const loading = userLoading || accountLoading;

  // Combine error states
  const error = userError?.message || accountError?.message || null;

  // Computed properties
  const hasActiveSubscription =
    membershipStatus && typeof membershipStatus === "object" && "hasActiveSubscription" in membershipStatus
      ? (membershipStatus as { hasActiveSubscription: boolean }).hasActiveSubscription
      : false;
  const isMember = hasActiveSubscription;
  const isAuthenticated = !!session;

  const value: UserContextType = {
    userData: userData || null,
    loading,
    error,
    isAuthenticated,
    session,
    refetch: () => {
      refetchUserData();
    },
    hasActiveSubscription,
    isMember,
    accountData: accountData || null,
    membershipStatus,
    userStats,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

/**
 * Hook to use the UserContext
 */
export const useUserContext = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUserContext must be used within a UserProvider");
  }
  return context;
};

/**
 * Hook for backward compatibility with existing useUserData hook
 * @deprecated Use useUserContext instead for better performance and consistency
 */
export const useUserData = (): {
  userData: UserData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  isAuthenticated: boolean;
  session: any; // eslint-disable-line @typescript-eslint/no-explicit-any
} => {
  return useUserContext();
};
