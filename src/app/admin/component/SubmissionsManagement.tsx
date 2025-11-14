"use client";

import React, { useState, useEffect } from "react";
import { Search, Eye, Building, MessageSquare } from "lucide-react";
import { formatDateInAEST } from "@/utils/common/timezone";

interface PartnerApplication {
  _id: string;
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  status: "pending" | "under_review" | "approved" | "rejected" | "contacted";
  adminNotes?: string;
  submittedAt: string;
  reviewedBy?: {
    name: string;
    email: string;
  };
  reviewedAt?: string;
}

interface ContactSubmission {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: "new" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  submittedAt: string;
  assignedTo?: {
    name: string;
    email: string;
  };
  respondedBy?: {
    name: string;
    email: string;
  };
  respondedAt?: string;
  response?: string;
}

export default function SubmissionsManagement() {
  const [activeTab, setActiveTab] = useState<"partner" | "contact">("partner");
  const [partnerApplications, setPartnerApplications] = useState<PartnerApplication[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<PartnerApplication | ContactSubmission | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingStatus, setEditingStatus] = useState("");

  // Fetch partner applications
  const fetchPartnerApplications = async () => {
    try {
      const response = await fetch("/api/partner-applications");
      if (response.ok) {
        const data = await response.json();
        setPartnerApplications(data.data.applications || []);
      }
    } catch (error) {
      console.error("Error fetching partner applications:", error);
    }
  };

  // Fetch contact submissions
  const fetchContactSubmissions = async () => {
    try {
      const response = await fetch("/api/contact-submissions");
      if (response.ok) {
        const data = await response.json();
        setContactSubmissions(data.data.submissions || []);
      }
    } catch (error) {
      console.error("Error fetching contact submissions:", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchPartnerApplications(), fetchContactSubmissions()]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
      case "new":
        return "bg-yellow-100 text-yellow-800";
      case "under_review":
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "approved":
      case "resolved":
        return "bg-green-100 text-green-800";
      case "rejected":
      case "closed":
        return "bg-red-100 text-red-800";
      case "contacted":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleViewDetails = (item: PartnerApplication | ContactSubmission) => {
    setSelectedItem(item);
    setEditingNotes("adminNotes" in item ? item.adminNotes || "" : "");
    setEditingStatus(item.status);
    setShowModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedItem) return;

    try {
      const endpoint =
        activeTab === "partner"
          ? `/api/partner-applications/${selectedItem._id}`
          : `/api/contact-submissions/${selectedItem._id}`;

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: editingStatus,
          adminNotes: editingNotes,
        }),
      });

      if (response.ok) {
        // Refresh data
        if (activeTab === "partner") {
          await fetchPartnerApplications();
        } else {
          await fetchContactSubmissions();
        }
        setShowModal(false);
        setSelectedItem(null);
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const filteredPartnerApplications = partnerApplications.filter((app) => {
    const matchesSearch =
      app.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || app.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredContactSubmissions = contactSubmissions.filter((submission) => {
    const matchesSearch =
      submission.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      submission.subject.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || submission.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tabs and Filters Container */}
      <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 p-3 sm:p-6">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("partner")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "partner"
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Building className="w-4 h-4 inline mr-2" />
              Partner Applications ({partnerApplications.length})
            </button>
            <button
              onClick={() => setActiveTab("contact")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "contact"
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Contact Submissions ({contactSubmissions.length})
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={`Search ${activeTab === "partner" ? "partner applications" : "contact submissions"}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="all">All Status</option>
              {activeTab === "partner" ? (
                <>
                  <option value="pending">Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="contacted">Contacted</option>
                </>
              ) : (
                <>
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === "partner" ? (
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPartnerApplications.map((app) => (
                  <tr key={app._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {app.firstName} {app.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{app.email}</div>
                        <div className="text-sm text-gray-500">{app.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{app.businessName}</div>
                      {app.abn && <div className="text-sm text-gray-500">ABN: {app.abn}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          app.status
                        )}`}
                      >
                        {app.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateInAEST(new Date(app.submittedAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button onClick={() => handleViewDetails(app)} className="text-red-600 hover:text-red-900 mr-3">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContactSubmissions.map((submission) => (
                  <tr key={submission._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {submission.firstName} {submission.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{submission.email}</div>
                        <div className="text-sm text-gray-500">{submission.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{submission.subject}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {submission.message.substring(0, 100)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          submission.status
                        )}`}
                      >
                        {submission.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(
                          submission.priority
                        )}`}
                      >
                        {submission.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateInAEST(new Date(submission.submittedAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(submission)}
                        className="text-red-600 hover:text-red-900 mr-3"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal for viewing/editing details */}
      {showModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg border-2 border-red-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {activeTab === "partner" ? "Partner Application Details" : "Contact Submission Details"}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Contact Information */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Contact Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <span className="ml-2 font-medium">
                        {selectedItem.firstName} {selectedItem.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <span className="ml-2 font-medium">{selectedItem.email}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <span className="ml-2 font-medium">{selectedItem.phone}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Submitted:</span>
                      <span className="ml-2 font-medium">
                        {formatDateInAEST(new Date(selectedItem.submittedAt), "dd MMM yyyy, hh:mm a")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Business Information (for partner applications) */}
                {activeTab === "partner" && "businessName" in selectedItem && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Business Information</h4>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-gray-500">Business Name:</span>
                        <span className="ml-2 font-medium">{selectedItem.businessName}</span>
                      </div>
                      {selectedItem.abn && (
                        <div>
                          <span className="text-gray-500">ABN:</span>
                          <span className="ml-2 font-medium">{selectedItem.abn}</span>
                        </div>
                      )}
                      {selectedItem.acn && (
                        <div>
                          <span className="text-gray-500">ACN:</span>
                          <span className="ml-2 font-medium">{selectedItem.acn}</span>
                        </div>
                      )}
                      {selectedItem.goals && (
                        <div>
                          <span className="text-gray-500">Goals:</span>
                          <p className="mt-1 text-gray-700">{selectedItem.goals}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Message (for contact submissions) */}
                {activeTab === "contact" && "message" in selectedItem && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Message</h4>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-gray-500">Subject:</span>
                        <span className="ml-2 font-medium">{selectedItem.subject}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Message:</span>
                        <p className="mt-1 text-gray-700 whitespace-pre-wrap">{selectedItem.message}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Management */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Status Management</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={editingStatus}
                        onChange={(e) => setEditingStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      >
                        {activeTab === "partner" ? (
                          <>
                            <option value="pending">Pending</option>
                            <option value="under_review">Under Review</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="contacted">Contacted</option>
                          </>
                        ) : (
                          <>
                            <option value="new">New</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
                      <textarea
                        value={editingNotes}
                        onChange={(e) => setEditingNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        placeholder="Add notes about this submission..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateStatus}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
