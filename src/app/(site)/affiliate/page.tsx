"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, LogOut } from "lucide-react";

interface AffiliateDashboard {
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
  const [bankFormData, setBankFormData] = useState({
    accountName: "",
    bsb: "",
    accountNumber: "",
    bankName: "",
  });

  useEffect(() => {
    fetchDashboard();
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
      }
    } catch (error) {
      console.error("Error loading affiliate dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/affiliate/logout", { method: "POST" });
    router.push("/affiliate/login");
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
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Error loading dashboard. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Affiliate Dashboard</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-600 mb-2">Total Signups</h3>
          <p className="text-3xl font-bold">{dashboard.totalSignups}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-600 mb-2">Total Sales</h3>
          <p className="text-3xl font-bold">{formatCurrency(dashboard.totalSales)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-600 mb-2">Unpaid Commissions</h3>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(dashboard.totalCommissions)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm text-gray-600 mb-2">Commission Rate</h3>
          <p className="text-3xl font-bold">30%</p>
        </div>
      </div>

      {/* Affiliate Link */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-bold mb-4">Your Affiliate Link</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={dashboard.affiliateLink}
            readOnly
            className="flex-1 px-4 py-2 border rounded-lg bg-gray-50"
          />
          <button
            onClick={copyLink}
            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Share this link to earn 30% commission on referrals. Commissions are only granted on successful payments.
        </p>
      </div>

      {/* Commission Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-bold mb-4">Unpaid Commission Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">One-Time Packages</h3>
            <p className="text-sm text-gray-600">
              {dashboard.breakdown.oneTimePackage.count} sales • {formatCurrency(dashboard.breakdown.oneTimePackage.totalCommissions)} earned
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Upsells</h3>
            <p className="text-sm text-gray-600">
              {dashboard.breakdown.upsell.count} sales • {formatCurrency(dashboard.breakdown.upsell.totalCommissions)} earned
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">First-Time Memberships</h3>
            <p className="text-sm text-gray-600">
              {dashboard.breakdown.membershipFirst.count} sales • {formatCurrency(dashboard.breakdown.membershipFirst.totalCommissions)} earned
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Recurring Memberships</h3>
            <p className="text-sm text-gray-600">
              {dashboard.breakdown.membershipRecurring.count} payments • {formatCurrency(dashboard.breakdown.membershipRecurring.totalCommissions)} earned
            </p>
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Bank Details</h2>
          <button
            onClick={() => setShowBankForm(!showBankForm)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showBankForm ? "Cancel" : dashboard.bankDetails ? "Edit" : "Add"}
          </button>
        </div>
        {showBankForm ? (
          <form onSubmit={handleBankDetailsSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input
                  type="text"
                  value={bankFormData.accountName}
                  onChange={(e) => setBankFormData({ ...bankFormData, accountName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BSB</label>
                <input
                  type="text"
                  value={bankFormData.bsb}
                  onChange={(e) => setBankFormData({ ...bankFormData, bsb: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                <input
                  type="text"
                  value={bankFormData.accountNumber}
                  onChange={(e) => setBankFormData({ ...bankFormData, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={bankFormData.bankName}
                  onChange={(e) => setBankFormData({ ...bankFormData, bankName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">
              Save
            </button>
          </form>
        ) : (
          <div>
            {dashboard.bankDetails ? (
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Account Name:</span> {dashboard.bankDetails.accountName || "Not provided"}
                </p>
                <p>
                  <span className="font-medium">BSB:</span> {dashboard.bankDetails.bsb || "Not provided"}
                </p>
                <p>
                  <span className="font-medium">Account Number:</span>{" "}
                  {dashboard.bankDetails.accountNumber ? "••••" + dashboard.bankDetails.accountNumber.slice(-4) : "Not provided"}
                </p>
                <p>
                  <span className="font-medium">Bank Name:</span> {dashboard.bankDetails.bankName || "Not provided"}
                </p>
              </div>
            ) : (
              <p className="text-gray-600">No bank details provided. Add your bank details to receive payouts.</p>
            )}
          </div>
        )}
      </div>

      {/* Recent Commissions */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-bold mb-4">Recent Unpaid Commissions</h2>
        {dashboard.recentCommissions.length === 0 ? (
          <p className="text-gray-600">No unpaid commissions yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Package</th>
                  <th className="text-right py-2">Purchase</th>
                  <th className="text-right py-2">Commission</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentCommissions.map((commission) => (
                  <tr key={commission.id} className="border-b">
                    <td className="py-2">{formatDate(commission.earnedAt)}</td>
                    <td className="py-2 capitalize">{commission.type.replace("-", " ")}</td>
                    <td className="py-2">{commission.packageName || "N/A"}</td>
                    <td className="py-2 text-right">{formatCurrency(commission.purchaseAmount)}</td>
                    <td className="py-2 text-right text-green-600 font-semibold">
                      {formatCurrency(commission.commissionAmount)}
                    </td>
                    <td className="py-2 capitalize">{commission.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout History */}
      {dashboard.payoutHistory.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Payout History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left py-2">Commissions</th>
                  <th className="text-left py-2">Processed By</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.payoutHistory.map((payout) => (
                  <tr key={payout.id} className="border-b">
                    <td className="py-2">{formatDate(payout.paidAt)}</td>
                    <td className="py-2 font-semibold">{formatCurrency(payout.totalAmount)}</td>
                    <td className="py-2">{payout.commissionCount} commissions</td>
                    <td className="py-2">{payout.processedBy?.name || "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

