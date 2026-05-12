"use client";

import React from "react";
import type { RevenueDetailUser } from "@/hooks/queries/useAdminQueries";
import TableHeader, { type SortKey, type SortOrder } from "./TableHeader";
import UserRow from "./UserRow";

interface UserListProps {
  users: RevenueDetailUser[];
  expandedUsers: Set<string>;
  onToggleExpanded: (userId: string) => void;
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  onUserClick?: (userId: string) => void;
}

const UserList: React.FC<UserListProps> = ({
  users,
  expandedUsers,
  onToggleExpanded,
  sortBy,
  sortOrder,
  onSort,
  onUserClick,
}) => {
  return (
    <>
      {/* Table Header - Desktop */}
      <TableHeader sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />

      {/* Users List */}
      <div className="space-y-3">
        {users.map((user) => (
          <UserRow
            key={user.userId}
            user={user}
            isExpanded={expandedUsers.has(user.userId)}
            onToggleExpanded={onToggleExpanded}
            onUserClick={onUserClick}
          />
        ))}
      </div>
    </>
  );
};

export default UserList;
