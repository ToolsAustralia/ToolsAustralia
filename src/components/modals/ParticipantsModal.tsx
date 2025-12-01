"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Users,
  Mail,
  Phone,
  MapPin,
  Trophy,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { ModalContainer, ModalHeader, ModalContent, Input, Button } from "./ui";

// Types for participant data
interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  totalEntries: number;
  entriesBySource: {
    membership?: number;
    "one-time-package"?: number;
    upsell?: number;
    "mini-draw"?: number;
    referral?: number;
  };
  firstAddedDate: Date | string;
  lastUpdatedDate: Date | string;
}

interface ParticipantsResponse {
  success: boolean;
  data: {
    participants: Participant[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      limit: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    majorDraw: {
      _id: string;
      name: string;
      totalEntries: number;
    };
  };
}

interface ParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  majorDrawId: string;
  majorDrawName?: string;
}

export default function ParticipantsModal({ isOpen, onClose, majorDrawId, majorDrawName }: ParticipantsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [majorDrawInfo, setMajorDrawInfo] = useState<{ _id: string; name: string; totalEntries: number } | null>(null);

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Fetch participants function
  const fetchParticipants = useCallback(
    async (search: string = "", page: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          majorDrawId: majorDrawId,
          page: page.toString(),
          limit: "20",
        });

        if (search.trim()) {
          searchParams.append("search", search.trim());
        }

        const response = await fetch(`/api/admin/major-draw/participants?${searchParams.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to fetch participants");
        }

        const data: ParticipantsResponse = await response.json();

        if (data.success) {
          setParticipants(data.data.participants);
          setPagination(data.data.pagination);
          setMajorDrawInfo(data.data.majorDraw);
        } else {
          throw new Error("Failed to fetch participants");
        }
      } catch (err) {
        console.error("Participants fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch participants");
        setParticipants([]);
      } finally {
        setIsLoading(false);
      }
    },
    [majorDrawId]
  );

  // Effect to fetch participants when modal opens or search changes
  useEffect(() => {
    if (isOpen && majorDrawId) {
      fetchParticipants(debouncedSearchQuery, 1);
    }
  }, [isOpen, majorDrawId, debouncedSearchQuery, fetchParticipants]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setParticipants([]);
      setError(null);
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: 20,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }
  }, [isOpen]);

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    fetchParticipants(debouncedSearchQuery, newPage);
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
    return stateNames[state.toUpperCase()] || state;
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed">
      {/* Header */}
      <ModalHeader
        title={`Participants - ${majorDrawName || majorDrawInfo?.name || "Major Draw"}`}
        subtitle={`${pagination.totalCount.toLocaleString()} participant${pagination.totalCount !== 1 ? "s" : ""} • ${
          majorDrawInfo?.totalEntries.toLocaleString() || 0
        } total entries`}
        onClose={onClose}
      />

      {/* Search Input */}
      <div className="p-6 border-b border-gray-200">
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            icon={Search}
            disabled={isLoading}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}
        </div>
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

          {isLoading && participants.length === 0 && (
            <div className="p-8 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-gray-400 animate-spin" />
              <p className="text-gray-600">Loading participants...</p>
            </div>
          )}

          {!isLoading && participants.length === 0 && !error && (
            <div className="p-8 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No participants found</p>
              <p className="text-sm mt-1">
                {searchQuery.trim() ? "Try a different search term" : "This draw has no participants yet"}
              </p>
            </div>
          )}

          {participants.length > 0 && (
            <div className="p-4">
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4 text-sm font-semibold text-gray-700">
                <div className="col-span-3">Name</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Mobile</div>
                <div className="col-span-2">State</div>
                <div className="col-span-2 text-right">Entries</div>
              </div>

              {/* Participants List */}
              <div className="space-y-3">
                {participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
                  >
                    {/* Mobile View */}
                    <div className="md:hidden space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {participant.firstName.charAt(0)}
                          {participant.lastName.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {participant.firstName} {participant.lastName}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                            <Mail className="w-4 h-4" />
                            <span className="truncate">{participant.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg">
                          <Trophy className="w-4 h-4" />
                          <span className="font-bold">{participant.totalEntries}</span>
                        </div>
                      </div>
                      {participant.mobile && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{participant.mobile}</span>
                        </div>
                      )}
                      {participant.state && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{formatState(participant.state)}</span>
                        </div>
                      )}
                    </div>

                    {/* Desktop View */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                      <div className="col-span-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                            {participant.firstName.charAt(0)}
                            {participant.lastName.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {participant.firstName} {participant.lastName}
                            </h3>
                            <p className="text-xs text-gray-500">ID: {participant.userId.slice(-8)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{participant.email}</span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        {participant.mobile ? (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span>{participant.mobile}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Not provided</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        {participant.state ? (
                          <div className="flex items-center gap-2 text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">{formatState(participant.state)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Not specified</span>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg">
                          <Trophy className="w-4 h-4" />
                          <span className="font-bold">{participant.totalEntries.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Entry Sources (shown on hover or expand) */}
                    {Object.keys(participant.entriesBySource).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex flex-wrap gap-2">
                          {participant.entriesBySource.membership && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              Membership: {participant.entriesBySource.membership}
                            </span>
                          )}
                          {participant.entriesBySource["one-time-package"] && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                              One-time: {participant.entriesBySource["one-time-package"]}
                            </span>
                          )}
                          {participant.entriesBySource.upsell && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                              Upsell: {participant.entriesBySource.upsell}
                            </span>
                          )}
                          {participant.entriesBySource["mini-draw"] && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                              Mini-draw: {participant.entriesBySource["mini-draw"]}
                            </span>
                          )}
                          {participant.entriesBySource.referral && (
                            <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-xs font-medium">
                              Referral: {participant.entriesBySource.referral}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 p-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    Showing {((pagination.currentPage - 1) * pagination.limit + 1).toLocaleString()} to{" "}
                    {Math.min(pagination.currentPage * pagination.limit, pagination.totalCount).toLocaleString()} of{" "}
                    {pagination.totalCount.toLocaleString()} participants
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.hasPrevPage || isLoading}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="px-4 py-2 text-sm text-gray-600">
                      Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.hasNextPage || isLoading}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ModalContent>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </ModalContainer>
  );
}
