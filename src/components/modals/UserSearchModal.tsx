"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search, User, Mail, Phone, MapPin, Calendar, Trophy, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useDebounce } from "../../hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "./ui";

// Types for user search
interface UserSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  currentDrawEntries?: {
    totalEntries: number;
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
    };
  };
}

interface UserSearchResponse {
  success: boolean;
  data: {
    users: UserSearchResult[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
      limit: number;
    };
    searchInfo: {
      query: string;
      resultsFound: number;
      currentDraw: {
        id: string;
        name: string;
        status: string;
      } | null;
    };
  };
}

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserSelect: (user: UserSearchResult) => void;
  title?: string;
  description?: string;
  excludeUserId?: string; // Exclude current winner if editing
  majorDrawId?: string; // Filter to only show participants of this draw
}

export default function UserSearchModal({
  isOpen,
  onClose,
  onUserSelect,
  title = "Search Users",
  description = "Search for users by name, email, mobile, or user ID",
  excludeUserId,
  majorDrawId,
}: UserSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Search users function
  const searchUsers = useCallback(
    async (query: string, page: number = 1) => {
      if (!query.trim()) {
        setSearchResults([]);
        setPagination({
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNextPage: false,
          hasPrevPage: false,
        });
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          q: query,
          page: page.toString(),
          limit: "20",
        });

        if (majorDrawId) {
          searchParams.append("majorDrawId", majorDrawId);
        }

        const response = await fetch(`/api/admin/users/search?${searchParams.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to search users");
        }

        const data: UserSearchResponse = await response.json();

        if (data.success) {
          // Filter out excluded user if specified
          const filteredUsers = excludeUserId
            ? data.data.users.filter((user) => user._id !== excludeUserId)
            : data.data.users;

          setSearchResults(filteredUsers);
          setPagination(data.data.pagination);
        } else {
          throw new Error("Search failed");
        }
      } catch (err) {
        console.error("User search error:", err);
        setError(err instanceof Error ? err.message : "Failed to search users");
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [excludeUserId, majorDrawId]
  );

  // Effect to trigger search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      searchUsers(debouncedSearchQuery, 1);
    } else {
      setSearchResults([]);
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }
  }, [debouncedSearchQuery, searchUsers]);

  // Handle user selection from search modal
  const handleUserSelect = (user: UserSearchResult) => {
    setSelectedUser(user);
    setError(null);
  };

  // Handle confirm selection
  const handleConfirmSelection = () => {
    if (selectedUser) {
      onUserSelect(selectedUser);
      onClose();
    }
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (debouncedSearchQuery.trim()) {
      searchUsers(debouncedSearchQuery, newPage);
    }
  };

  // Format date for display
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format Australian state
  const formatState = (state?: string) => {
    if (!state) return "Not specified";
    const stateNames: Record<string, string> = {
      NSW: "New South Wales",
      VIC: "Victoria",
      QLD: "Queensland",
      WA: "Western Australia",
      SA: "South Australia",
      TAS: "Tasmania",
      ACT: "Australian Capital Territory",
      NT: "Northern Territory",
    };
    return stateNames[state] || state;
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      {/* Header */}
      <ModalHeader title={title} subtitle={description} onClose={onClose} />

      {/* Search Input */}
      <div className="p-6 border-b border-gray-200">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, mobile, or user ID..."
          icon={Search}
          disabled={isLoading}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Content */}
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 m-4 bg-red-50 border-2 border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="p-8 text-center text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Start typing to search users</p>
              <p className="text-sm mt-1">Search by name, email, mobile, or user ID</p>
            </div>
          )}

          {searchQuery.trim() && !isLoading && searchResults.length === 0 && !error && (
            <div className="p-8 text-center text-gray-500">
              <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No users found</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="p-4 space-y-3">
              {searchResults.map((user) => (
                <div
                  key={user._id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedUser?._id === user._id
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  onClick={() => handleUserSelect(user)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {user.firstName.charAt(0)}
                          {user.lastName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-600">ID: {user._id}</p>
                        </div>
                        {selectedUser?._id === user._id && (
                          <CheckCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-4 h-4" />
                          <span>{user.email}</span>
                        </div>
                        {user.mobile && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="w-4 h-4" />
                            <span>{user.mobile}</span>
                          </div>
                        )}
                        {user.state && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="w-4 h-4" />
                            <span>{formatState(user.state)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>Joined {formatDate(user.createdAt)}</span>
                        </div>
                      </div>

                      {user.currentDrawEntries && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800">Current Draw Entries</span>
                          </div>
                          <div className="text-sm text-blue-700">
                            <p className="font-semibold">Total: {user.currentDrawEntries.totalEntries}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {user.currentDrawEntries.entriesBySource.membership && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                  Membership: {user.currentDrawEntries.entriesBySource.membership}
                                </span>
                              )}
                              {user.currentDrawEntries.entriesBySource["one-time-package"] && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                  One-time: {user.currentDrawEntries.entriesBySource["one-time-package"]}
                                </span>
                              )}
                              {user.currentDrawEntries.entriesBySource.upsell && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                  Upsell: {user.currentDrawEntries.entriesBySource.upsell}
                                </span>
                              )}
                              {user.currentDrawEntries.entriesBySource["mini-draw"] && (
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                                  Mini-draw: {user.currentDrawEntries.entriesBySource["mini-draw"]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 p-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={!pagination.hasPrevPage}
                  >
                    Previous
                  </Button>
                  <span className="px-4 py-2 text-sm text-gray-600">
                    Page {pagination.currentPage} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalContent>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {searchQuery.trim() && (
              <span>
                {pagination.totalCount} user{pagination.totalCount !== 1 ? "s" : ""} found
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSelection} disabled={!selectedUser}>
              Select User
            </Button>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
}
