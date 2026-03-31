import { Award, Users, TrendingUp, Calendar } from "lucide-react";

export default function MembershipStats() {
  // This would typically fetch real data from the API
  const membershipData = {
    totalMembers: 1247,
    activeSubscriptions: 892,
    oneTimePurchases: 355,
    monthlyRevenue: 15680,
    growthRate: 12.5,
    topPackage: "Premium Annual",
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow dark:shadow-none border border-gray-200 dark:border-neutral-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Membership Overview</h3>
        <Award className="h-5 w-5 text-gray-400 dark:text-neutral-500" />
      </div>

      <div className="space-y-4">
        {/* Total Members */}
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-neutral-800/60 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Total Members</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">All time</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {membershipData.totalMembers.toLocaleString()}
            </p>
            <div className="flex items-center space-x-1 text-xs text-green-600 dark:text-green-400">
              <TrendingUp className="h-3 w-3" />
              <span>+{membershipData.growthRate}%</span>
            </div>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-neutral-800/60 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
              <Calendar className="h-4 w-4 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Active Subscriptions</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">Recurring members</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {membershipData.activeSubscriptions.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              {Math.round((membershipData.activeSubscriptions / membershipData.totalMembers) * 100)}% of total
            </p>
          </div>
        </div>

        {/* One-time Purchases */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Award className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">One-time Purchases</p>
              <p className="text-xs text-gray-500">Single purchases</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">{membershipData.oneTimePurchases.toLocaleString()}</p>
            <p className="text-xs text-gray-500">
              {Math.round((membershipData.oneTimePurchases / membershipData.totalMembers) * 100)}% of total
            </p>
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/25 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-red-100 dark:bg-red-900/40 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Monthly Revenue</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">From memberships</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              ${membershipData.monthlyRevenue.toLocaleString()}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">+8.2% from last month</p>
          </div>
        </div>

        {/* Top Package */}
        <div className="mt-4 p-3 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/40 dark:to-red-900/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Most Popular Package</p>
              <p className="text-lg font-semibold text-red-700 dark:text-red-300">{membershipData.topPackage}</p>
            </div>
            <div className="h-10 w-10 bg-red-200 dark:bg-red-900/50 rounded-lg flex items-center justify-center">
              <Award className="h-5 w-5 text-red-600 dark:text-red-300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
