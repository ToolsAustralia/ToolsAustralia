"use client";

import React from "react";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { DollarSign, Package, TrendingUp } from "lucide-react";

interface RevenueBreakdownProps {
  metrics: IDailyMetrics[];
}

export function RevenueBreakdown({ metrics }: RevenueBreakdownProps) {
  // Aggregate revenue breakdown across all days
  const aggregatedBreakdown = React.useMemo(() => {
    const breakdown: Record<string, { revenue: number; count: number }> = {
      membership: { revenue: 0, count: 0 },
      "one-time": { revenue: 0, count: 0 },
      "mini-draw": { revenue: 0, count: 0 },
      upsell: { revenue: 0, count: 0 },
    };

    let totalFacebookRevenue = 0;
    let totalPaymentRevenue = 0;

    for (const metric of metrics) {
      // Sum Facebook-attributed revenue
      totalFacebookRevenue += metric.revenue;

      // Sum PaymentEvent revenue breakdown
      if (metric.revenueBreakdown) {
        totalPaymentRevenue += metric.revenueBreakdown.totalRevenue;
        for (const [packageType, data] of Object.entries(metric.revenueBreakdown.byPackageType)) {
          if (breakdown[packageType]) {
            breakdown[packageType].revenue += data.revenue;
            breakdown[packageType].count += data.count;
          } else {
            breakdown[packageType] = { revenue: data.revenue, count: data.count };
          }
        }
      }
    }

    return {
      facebookRevenue: totalFacebookRevenue,
      paymentRevenue: totalPaymentRevenue,
      byPackageType: breakdown,
    };
  }, [metrics]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  const packageTypeLabels: Record<string, string> = {
    membership: "Membership",
    "one-time": "One-Time Package",
    "mini-draw": "Mini Draw",
    upsell: "Upsell",
  };

  const packageTypeColors: Record<string, string> = {
    membership: "bg-blue-100 text-blue-700 border-blue-200",
    "one-time": "bg-green-100 text-green-700 border-green-200",
    "mini-draw": "bg-purple-100 text-purple-700 border-purple-200",
    upsell: "bg-amber-100 text-amber-700 border-amber-200",
  };

  const totalPackageRevenue = Object.values(aggregatedBreakdown.byPackageType).reduce(
    (sum, data) => sum + data.revenue,
    0
  );

  return (
    <div className="space-y-6">
      {/* Facebook-Attributed Revenue */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Facebook-Attributed Revenue</h3>
            <p className="text-sm text-gray-600">Revenue attributed to Facebook ads via 7-day click window</p>
          </div>
        </div>
        <div className="text-3xl font-bold text-gray-900">
          {formatCurrency(aggregatedBreakdown.facebookRevenue)}
        </div>
      </div>

      {/* PaymentEvent Revenue Breakdown */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Revenue by Package Type</h3>
            <p className="text-sm text-gray-600">Total purchases and revenue from PaymentEvents</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Summary Card */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total Revenue (All Packages)</span>
              <span className="text-xl font-bold text-gray-900">{formatCurrency(aggregatedBreakdown.paymentRevenue)}</span>
            </div>
          </div>

          {/* Package Breakdown Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Package Type</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Count</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Percentage</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(aggregatedBreakdown.byPackageType)
                  .filter(([_, data]) => data.count > 0)
                  .sort(([_, a], [__, b]) => b.revenue - a.revenue)
                  .map(([packageType, data]) => {
                    const percentage =
                      totalPackageRevenue > 0 ? ((data.revenue / totalPackageRevenue) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={packageType} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${packageTypeColors[packageType] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                          >
                            {packageTypeLabels[packageType] || packageType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-900 font-medium">{data.count.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-gray-900 font-semibold">{formatCurrency(data.revenue)}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{percentage}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {totalPackageRevenue === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No purchase data available for the selected period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


