"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import UserDetailModal from "@/components/admin/UserDetailModal";

interface AdminUserModalContextValue {
  openUserModal: (userId: string) => void;
  closeUserModal: () => void;
}

const AdminUserModalContext = createContext<AdminUserModalContextValue | null>(null);

export function AdminUserModalProvider({ children }: { children: React.ReactNode }) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openUserModal = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setIsOpen(true);
  }, []);

  const closeUserModal = useCallback(() => {
    setIsOpen(false);
    setSelectedUserId(null);
  }, []);

  const value: AdminUserModalContextValue = {
    openUserModal,
    closeUserModal,
  };

  return (
    <AdminUserModalContext.Provider value={value}>
      {children}
      <UserDetailModal
        userId={selectedUserId}
        isOpen={isOpen}
        onCloseAction={closeUserModal}
      />
    </AdminUserModalContext.Provider>
  );
}

export function useAdminUserModal(): AdminUserModalContextValue {
  const ctx = useContext(AdminUserModalContext);
  if (!ctx) {
    throw new Error("useAdminUserModal must be used within AdminUserModalProvider");
  }
  return ctx;
}
