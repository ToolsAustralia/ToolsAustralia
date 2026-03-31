"use client";

import React, { useState } from "react";
import {
  Plus,
  RefreshCw,
  Play,
  Pause,
  Square,
  Eye,
  Search,
  Filter,
  Target,
} from "lucide-react";
import { useExperiments, useActivateExperiment, usePauseExperiment, useEndExperiment } from "@/hooks/queries/useABTestingQueries";
import { useQueryClient } from "@tanstack/react-query";
import ExperimentFormModal from "./ExperimentFormModal";
import ExperimentDetailModal from "./ExperimentDetailModal";
import { format } from "date-fns";

/**
 * A/B Testing Management Component
 * Main component for managing A/B testing experiments
 */
export default function ABTestingManagement() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const _queryClient = useQueryClient();

  const { data: experimentsData, isLoading, error, refetch } = useExperiments({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page: 1,
    limit: 50,
  });

  const activateMutation = useActivateExperiment();
  const pauseMutation = usePauseExperiment();
  const endMutation = useEndExperiment();

  const experiments = experimentsData || [];

  const getStatusBadge = (status: string) => {
    const badges = {
      draft:
        "bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 border border-gray-200 dark:border-neutral-600",
      active:
        "bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 border border-green-200/80 dark:border-green-800/60",
      paused:
        "bg-yellow-100 dark:bg-amber-950/40 text-yellow-800 dark:text-amber-300 border border-yellow-200/80 dark:border-amber-800/60",
      ended:
        "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 border border-red-200/80 dark:border-red-800/60",
    };
    return badges[status as keyof typeof badges] || badges.draft;
  };

  const handleViewExperiment = (experimentId: string) => {
    setSelectedExperimentId(experimentId);
    setIsDetailModalOpen(true);
  };

  const handleActivate = async (experimentId: string) => {
    const experiment = experiments.find((exp) => exp._id === experimentId);
    const isResume = experiment?.status === "paused";
    const message = isResume 
      ? "Are you sure you want to resume this experiment?" 
      : "Are you sure you want to activate this experiment?";
    
    if (confirm(message)) {
      try {
        await activateMutation.mutateAsync(experimentId);
      } catch (error) {
        alert(error instanceof Error ? error.message : `Failed to ${isResume ? "resume" : "activate"} experiment`);
      }
    }
  };

  const handlePause = async (experimentId: string) => {
    if (confirm("Are you sure you want to pause this experiment?")) {
      try {
        await pauseMutation.mutateAsync(experimentId);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to pause experiment");
      }
    }
  };

  const handleEnd = async (experimentId: string) => {
    if (confirm("Are you sure you want to end this experiment? This action cannot be undone.")) {
      try {
        await endMutation.mutateAsync(experimentId);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to end experiment");
      }
    }
  };

  return (
    <div className="w-full space-y-3 sm:space-y-4">
      {/* Search and Filters - Compact Design */}
      <div className="bg-gradient-to-br from-white via-gray-50 to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 p-2 sm:p-4 lg:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 lg:gap-4">
          {/* Search Bar */}
          <div className="relative flex-1 group flex items-center gap-2">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-neutral-500 group-focus-within:text-red-600 dark:group-focus-within:text-red-400 transition-colors w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search experiments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 sm:pl-10 lg:pl-12 pr-3 sm:pr-4 py-1.5 sm:py-2 lg:py-2.5 border-2 border-gray-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white text-xs sm:text-sm lg:text-base shadow-sm hover:shadow-md transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-neutral-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-neutral-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-w-[120px] sm:min-w-[150px] rounded-lg border-2 border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:ring-2 focus:ring-red-500/50 focus:border-red-500 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </div>

          {/* Create Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-3 sm:px-4 py-1.5 sm:py-2 text-white hover:from-red-700 hover:to-red-800 shadow-md hover:shadow-lg transition-all duration-200 text-xs sm:text-sm font-medium"
          >
            <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Create Experiment</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>
      </div>

      {/* Experiments Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg sm:rounded-xl shadow-sm dark:shadow-none border border-gray-200 dark:border-neutral-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 sm:p-12 text-center">
            <RefreshCw className="mx-auto h-6 w-6 sm:h-8 sm:w-8 animate-spin text-gray-400 dark:text-neutral-500" />
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-500 dark:text-neutral-400">Loading experiments...</p>
          </div>
        ) : error ? (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-sm sm:text-base text-red-600 dark:text-red-400">Error loading experiments</p>
            <button
              onClick={() => refetch()}
              className="mt-3 sm:mt-4 text-xs sm:text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : experiments.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <Target className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-neutral-500" />
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-500 dark:text-neutral-400">No experiments found</p>
            <p className="mt-2 text-xs sm:text-sm text-gray-400 dark:text-neutral-500">
              {search || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first experiment to get started"}
            </p>
            {!search && statusFilter === "all" && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-white hover:from-red-700 hover:to-red-800 shadow-md hover:shadow-lg transition-all duration-200 text-xs sm:text-sm font-medium"
              >
                Create Experiment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                <tr>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Name
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Status
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Targets
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Dates
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Created
                  </th>
                  <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-neutral-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-neutral-700 bg-white dark:bg-neutral-900">
                {experiments.map((experiment) => (
                  <tr key={experiment._id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/80 transition-colors">
                    <td className="whitespace-nowrap px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                      <div className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">{experiment.name}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadge(
                          experiment.status
                        )}`}
                      >
                        {experiment.status}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
                      <div className="text-xs sm:text-sm text-gray-500 dark:text-neutral-400">
                        {experiment.slugTargets.includes("*") ? (
                          <span className="font-medium">All Pages</span>
                        ) : (
                          <span>{experiment.slugTargets.length} page(s)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 dark:text-neutral-400">
                      {experiment.startDate || experiment.endDate ? (
                        <div className="space-y-0.5">
                          {experiment.startDate && (
                            <div>Start: {format(new Date(experiment.startDate), "MMM d, yyyy")}</div>
                          )}
                          {experiment.endDate && (
                            <div>End: {format(new Date(experiment.endDate), "MMM d, yyyy")}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-neutral-500">No dates set</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 dark:text-neutral-400">
                      {format(new Date(experiment.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="whitespace-nowrap px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <button
                          onClick={() => handleViewExperiment(experiment._id)}
                          className="rounded p-1.5 text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {(experiment.status === "draft" || experiment.status === "paused") && (
                          <button
                            onClick={() => handleActivate(experiment._id)}
                            disabled={activateMutation.isPending}
                            className="rounded p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 transition-colors"
                            title={experiment.status === "paused" ? "Resume" : "Activate"}
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {experiment.status === "active" && (
                          <button
                            onClick={() => handlePause(experiment._id)}
                            disabled={pauseMutation.isPending}
                            className="rounded p-1.5 text-yellow-600 dark:text-amber-400 hover:bg-yellow-50 dark:hover:bg-amber-950/40 hover:text-yellow-700 dark:hover:text-amber-300 disabled:opacity-50 transition-colors"
                            title="Pause"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}
                        {(experiment.status === "active" || experiment.status === "paused") && (
                          <button
                            onClick={() => handleEnd(experiment._id)}
                            disabled={endMutation.isPending}
                            className="rounded p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
                            title="End"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {isCreateModalOpen && (
        <ExperimentFormModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            refetch();
          }}
        />
      )}

      {isDetailModalOpen && selectedExperimentId && (
        <ExperimentDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedExperimentId(null);
          }}
          experimentId={selectedExperimentId}
        />
      )}
    </div>
  );
}
