"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  UserCheck,
  Trophy,
  DollarSign,
  AlertTriangle,
  Crown,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";

interface ActivityLogItem {
  id: string;
  type:
    | "user_signup"
    | "membership_purchase"
    | "one_time_purchase"
    | "draw_complete"
    | "high_value_order"
    | "system_alert"
    | "membership_upgrade";
  user: string;
  userId?: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
  miniDrawId?: string;
}

interface ActivityLogResponse {
  activities: ActivityLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function ActivityLogManagement() {
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error } = useQuery<ActivityLogResponse>({
    queryKey: ["admin", "activity-log", currentPage, typeFilter, searchTerm],
    queryFn: async (): Promise<ActivityLogResponse> => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "25",
      });
      if (typeFilter) params.append("type", typeFilter);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/admin/activity-log?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch activity log: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error("Failed to fetch activity log");
      }

      return result.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "user_signup":
        return <UserCheck className="w-4 h-4" />;
      case "draw_complete":
        return <Trophy className="w-4 h-4" />;
      case "high_value_order":
        return <DollarSign className="w-4 h-4" />;
      case "system_alert":
        return <AlertTriangle className="w-4 h-4" />;
      case "membership_upgrade":
        return <Crown className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-white bg-gradient-to-br from-green-600 to-green-700";
      case "warning":
        return "text-black bg-gradient-to-br from-yellow-500 to-yellow-600";
      case "error":
        return "text-white bg-gradient-to-br from-red-600 to-red-700";
      case "info":
        return "text-white bg-gradient-to-br from-blue-600 to-blue-700";
      default:
        return "text-white bg-gradient-to-br from-gray-600 to-gray-700";
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search activities..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="user_signup">User Signups</option>
              <option value="membership_purchase">Membership Purchases</option>
              <option value="one_time_purchase">One-Time Purchases</option>
              <option value="membership_upgrade">Subscription Changes</option>
              <option value="draw_complete">Draw Completions</option>
              <option value="high_value_order">High-Value Orders</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading activities...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-700 font-medium">Failed to load activities</p>
            <p className="text-red-600 text-sm mt-1">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        ) : data && data.activities.length > 0 ? (
          <>
            <div className="divide-y divide-gray-200">
              {data.activities.map((activity) => (
                <div key={activity.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start space-x-3 sm:space-x-4">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getStatusColor(
                        activity.status
                      )}`}
                    >
                      <div className="scale-75 sm:scale-100">{getActivityIcon(activity.type)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-medium text-gray-900 leading-tight">
                        {activity.miniDrawId && activity.action.includes('"') ? (
                          <>
                            {activity.action.split('"')[0]}
                            <a
                              href={`/mini-draws/${activity.miniDrawId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-red-600 hover:text-red-700 underline font-semibold"
                            >
                              {activity.action.split('"')[1]}
                            </a>
                            {activity.action.split('"')[2] ?? ""}
                          </>
                        ) : (
                          activity.action
                        )}
                      </p>
                      <div className="flex items-center space-x-2 mt-1.5 flex-wrap">
                        <ClickableUserDisplay
                          displayText={activity.user}
                          userId={activity.userId ?? null}
                          className="text-xs sm:text-sm text-gray-600 font-medium"
                        />
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs sm:text-sm text-gray-500">{activity.time}</span>
                        {activity.amount && (
                          <>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs sm:text-sm font-semibold text-green-600">
                              ${activity.amount.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.pagination.totalPages > 1 && (
              <div className="bg-gray-50 px-4 sm:px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{" "}
                  {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{" "}
                  {data.pagination.total} activities
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={data.pagination.page === 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={data.pagination.page === data.pagination.totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">No activities found</p>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your filters or search term</p>
          </div>
        )}
      </div>
    </div>
  );
}
