"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Eye, EyeOff, Settings, DollarSign, Users, TrendingUp } from "lucide-react";
import DashboardLoader from "@/components/loading/DashboardLoader";

interface AffiliateDashboard {
  name: string;
  username: string;
  affiliateCode: string;
  affiliateLink: string;
  totalSignups: number;
  totalSales: number;
  totalCommissions: number;
  breakdown: {
    oneTimePackage: { count: number; totalSales: number; totalCommissions: number };
    upsell: { count: number; totalSales: number; totalCommissions: number };
    membershipFirst: { count: number; totalSales: number; totalCommissions: number };
    membershipRecurring: { count: number; totalSales: number; totalCommissions: number };
    miniDrawPackage: { count: number; totalSales: number; totalCommissions: number };
  };
  recentCommissions: Array<{
    id: string;
    type: string;
    packageName: string;
    purchaseAmount: number;
    commissionAmount: number;
    status: string;
    earnedAt: string;
  }>;
  payoutHistory: Array<{
    id: string;
    totalAmount: number;
    commissionCount: number;
    paidAt: string;
    processedBy: { name: string } | null;
    notes?: string;
  }>;
  bankDetails?: {
    accountName?: string;
    bsb?: string;
    accountNumber?: string;
    bankName?: string;
  };
}

export default function AffiliateDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [bankFormData, setBankFormData] = useState({
    accountName: "",
    bsb: "",
    accountNumber: "",
    bankName: "",
  });
  const [accountFormData, setAccountFormData] = useState({
    currentPassword: "",
    newUsername: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState(false);

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await fetch("/api/affiliate/dashboard");
      if (response.status === 401) {
        router.push("/affiliate/login");
        return;
      }
      const data = await response.json();
      if (data.success) {
        setDashboard(data.data);
        if (data.data.bankDetails) {
          setBankFormData({
            accountName: data.data.bankDetails.accountName || "",
            bsb: data.data.bankDetails.bsb || "",
            accountNumber: data.data.bankDetails.accountNumber || "",
            bankName: data.data.bankDetails.bankName || "",
          });
        }
        // Initialize account form with current username
        if (data.data.username) {
          setAccountFormData((prev) => ({
            ...prev,
            newUsername: data.data.username || "",
          }));
        }
      }
    } catch (error) {
      console.error("Error loading affiliate dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (dashboard?.affiliateLink) {
      navigator.clipboard.writeText(dashboard.affiliateLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBankDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/affiliate/bank-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bankFormData),
      });
      const data = await response.json();
      if (data.success) {
        setShowBankForm(false);
        fetchDashboard();
      }
    } catch (error) {
      console.error("Error updating bank details:", error);
    }
  };

  const handleAccountUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setAccountSuccess(false);

    // Validation
    if (!accountFormData.currentPassword) {
      setAccountError("Current password is required");
      return;
    }

    if (accountFormData.newPassword && accountFormData.newPassword !== accountFormData.confirmPassword) {
      setAccountError("New passwords do not match");
      return;
    }

    if (accountFormData.newPassword && accountFormData.newPassword.length < 6) {
      setAccountError("New password must be at least 6 characters");
      return;
    }

    try {
      const response = await fetch("/api/affiliate/update-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: accountFormData.currentPassword,
          username: accountFormData.newUsername || undefined,
          password: accountFormData.newPassword || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAccountSuccess(true);
        setAccountFormData({
          currentPassword: "",
          newUsername: accountFormData.newUsername,
          newPassword: "",
          confirmPassword: "",
        });
        setTimeout(() => {
          setShowAccountSettings(false);
          setAccountSuccess(false);
        }, 2000);
      } else {
        setAccountError(data.error || "Failed to update account");
      }
    } catch (error) {
      console.error("Error updating account:", error);
      setAccountError("An error occurred. Please try again.");
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return <DashboardLoader label="Loading your dashboard…" light />;
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Dashboard</h1>
          <p className="text-gray-600 dark:text-neutral-400 mb-4">Unable to load your affiliate dashboard information.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh bg-gray-50 w-full overflow-hidden">
      {/* Premium Dashboard Hero Section */}
      <div className="relative bg-gradient-to-br from-red-600 via-red-600 to-red-700 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] overflow-hidden">
        {/* Premium Background Effects */}
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-black/20"></div>

        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-16 h-16 bg-yellow-400/20 rounded-full blur-lg animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-white/15 rounded-full blur-md animate-pulse delay-2000"></div>

        <div className="relative max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="w-full">
            {/* Premium Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between pb-8 gap-6">
              {/* Welcome Section */}
              <div className="lg:text-left lg:flex-[2] lg:max-w-2xl px-4">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold font-['Poppins'] mb-4 text-white leading-tight">
                  Welcome back,
                  <br />
                  <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                    {dashboard.name}!
                  </span>
                </h1>
                <p className="text-white/80 text-base sm:text-lg lg:text-xl max-w-lg">
                  Track your referrals, monitor commissions, and manage your affiliate account.
                </p>
              </div>

              {/* Advanced Stats Dashboard */}
              <div className="lg:flex-[3] lg:max-w-2xl">
                <div className="relative bg-gradient-to-br from-white/10 via-white/5 to-white/10 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/30 shadow-2xl overflow-hidden">
                  {/* Animated Background Pattern */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-50"></div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/10 to-orange-500/10 rounded-full blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-400/10 to-purple-500/10 rounded-full blur-xl"></div>

                  <div className="relative z-10">
                    {/* Main Total with Advanced Design */}
                    <div className="text-center mb-4 relative">
                      <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent mb-1 drop-shadow-lg">
                          {formatCurrency(dashboard.totalCommissions)}
                        </div>
                        <div className="text-white/90 text-sm font-semibold uppercase tracking-wide">
                          Unpaid Commissions
                        </div>
                      </div>
                    </div>

                    {/* Advanced Stats Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Total Signups */}
                      <div className="group relative bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-indigo-500/20 backdrop-blur-sm rounded-xl p-3 border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300 hover:scale-105">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Users className="w-4 h-4 text-white/90" />
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">Signups</span>
                          </div>
                          <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                            {dashboard.totalSignups}
                          </div>
                        </div>
                      </div>

                      {/* Total Sales */}
                      <div className="group relative bg-gradient-to-br from-green-500/20 via-emerald-400/10 to-teal-500/20 backdrop-blur-sm rounded-xl p-3 border border-green-400/30 hover:border-green-400/50 transition-all duration-300 hover:scale-105">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <DollarSign className="w-4 h-4 text-white/90" />
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">Sales</span>
                          </div>
                          <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                            {formatCurrency(dashboard.totalSales)}
                          </div>
                        </div>
                      </div>

                      {/* Commission Rate */}
                      <div className="group relative bg-gradient-to-br from-yellow-500/20 via-amber-400/10 to-orange-500/20 backdrop-blur-sm rounded-xl p-3 border border-yellow-400/30 hover:border-yellow-400/50 transition-all duration-300 hover:scale-105">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <TrendingUp className="w-4 h-4 text-white/90" />
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">Rate</span>
                          </div>
                          <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">30%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 -mt-16 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          {/* Affiliate Link Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 font-['Poppins']">Your Affiliate Link</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={dashboard.affiliateLink}
                readOnly
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
              <button
                onClick={copyLink}
                className="group relative bg-gradient-to-r from-red-600 to-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-red-675 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </>
                )}
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-neutral-400 mt-3">
              Share this link to earn commission on each successful purchase from your referrals (subscriptions, renewals,
              add-ons, and eligible products). Payments must complete successfully.
            </p>
          </div>

          {/* Account Settings Section */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-['Poppins'] flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Account Settings
              </h2>
              <button
                onClick={() => {
                  setShowAccountSettings(!showAccountSettings);
                  setAccountError(null);
                  setAccountSuccess(false);
                }}
                className="text-sm font-medium text-red-600 hover:text-red-675 transition-colors"
              >
                {showAccountSettings ? "Cancel" : "Update"}
              </button>
            </div>
            {showAccountSettings ? (
              <form onSubmit={handleAccountUpdate} className="space-y-4">
                {accountError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {accountError}
                  </div>
                )}
                {accountSuccess && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                    Account updated successfully!
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Current Password *</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={accountFormData.currentPassword}
                      onChange={(e) => setAccountFormData({ ...accountFormData, currentPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">New Username</label>
                  <input
                    type="text"
                    value={accountFormData.newUsername}
                    onChange={(e) => setAccountFormData({ ...accountFormData, newUsername: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={accountFormData.newPassword}
                      onChange={(e) => setAccountFormData({ ...accountFormData, newPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={accountFormData.confirmPassword}
                      onChange={(e) => setAccountFormData({ ...accountFormData, confirmPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-red-600 to-red-600 text-white rounded-xl font-semibold hover:from-red-675 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  Update Account
                </button>
              </form>
            ) : (
              <div className="text-gray-600 dark:text-neutral-400">
                <p>Update your username and password to keep your account secure.</p>
              </div>
            )}
          </div>

          {/* Bank Details */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-['Poppins']">Bank Details</h2>
              <button
                onClick={() => setShowBankForm(!showBankForm)}
                className="text-sm font-medium text-red-600 hover:text-red-675 transition-colors"
              >
                {showBankForm ? "Cancel" : dashboard.bankDetails ? "Edit" : "Add"}
              </button>
            </div>
            {showBankForm ? (
              <form onSubmit={handleBankDetailsSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Account Name</label>
                    <input
                      type="text"
                      value={bankFormData.accountName}
                      onChange={(e) => setBankFormData({ ...bankFormData, accountName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">
                      BSB <span className="text-gray-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={bankFormData.bsb}
                      onChange={(e) => setBankFormData({ ...bankFormData, bsb: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                      placeholder="6-digit code (e.g., 123456)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      BSB (Bank State Branch) is a 6-digit code used in Australia. Required for Australian bank
                      accounts, optional for international accounts.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={bankFormData.accountNumber}
                      onChange={(e) => setBankFormData({ ...bankFormData, accountNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={bankFormData.bankName}
                      onChange={(e) => setBankFormData({ ...bankFormData, bankName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-600 text-white rounded-xl font-semibold hover:from-red-675 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  Save Bank Details
                </button>
              </form>
            ) : (
              <div>
                {dashboard.bankDetails ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium text-gray-700 dark:text-neutral-200">Account Name:</span>{" "}
                      <span className="text-gray-900">{dashboard.bankDetails.accountName || "Not provided"}</span>
                    </p>
                    <p>
                      <span className="font-medium text-gray-700 dark:text-neutral-200">BSB:</span>{" "}
                      <span className="text-gray-900">{dashboard.bankDetails.bsb || "Not provided"}</span>
                    </p>
                    <p>
                      <span className="font-medium text-gray-700 dark:text-neutral-200">Account Number:</span>{" "}
                      <span className="text-gray-900">
                        {dashboard.bankDetails.accountNumber
                          ? "••••" + dashboard.bankDetails.accountNumber.slice(-4)
                          : "Not provided"}
                      </span>
                    </p>
                    <p>
                      <span className="font-medium text-gray-700 dark:text-neutral-200">Bank Name:</span>{" "}
                      <span className="text-gray-900">{dashboard.bankDetails.bankName || "Not provided"}</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-neutral-400">No bank details provided. Add your bank details to receive payouts.</p>
                )}
              </div>
            )}
          </div>

          {/* Recent Commissions */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 mb-14">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 font-['Poppins']">
              Recent Unpaid Commissions
            </h2>
            {dashboard.recentCommissions.length === 0 ? (
              <p className="text-gray-600 dark:text-neutral-400">No unpaid commissions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Package
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Purchase
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Commission
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dashboard.recentCommissions.map((commission) => (
                      <tr key={commission.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(commission.earnedAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap capitalize">{commission.type.replace("-", " ")}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{commission.packageName || "N/A"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {formatCurrency(commission.purchaseAmount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-green-600 font-semibold">
                          {formatCurrency(commission.commissionAmount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 capitalize">
                            {commission.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payout History */}
          {dashboard.payoutHistory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 mb-14">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 font-['Poppins']">Payout History</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Commissions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Processed By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dashboard.payoutHistory.map((payout) => (
                      <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(payout.paidAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold">
                          {formatCurrency(payout.totalAmount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{payout.commissionCount} commissions</td>
                        <td className="px-4 py-3 whitespace-nowrap">{payout.processedBy?.name || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
