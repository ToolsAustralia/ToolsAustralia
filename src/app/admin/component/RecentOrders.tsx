import { Clock, Package, User } from "lucide-react";
import { formatDateInAEST } from "@/utils/common/timezone";
import { formatDisplayName } from "@/utils/display-name";

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  products: Array<{
    product: {
      name: string;
      images: string[];
    };
    quantity: number;
  }>;
}

interface RecentOrdersProps {
  orders: Order[];
}

export default function RecentOrders({ orders }: RecentOrdersProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200";
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:text-neutral-100 dark:bg-neutral-700 dark:text-neutral-200";
    }
  };

  const formatDate = (dateString: string) => {
    return formatDateInAEST(new Date(dateString), "dd MMM yyyy");
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow dark:shadow-none border border-gray-200 dark:border-neutral-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Orders</h3>
        <button className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
          View all
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-8">
          <Package className="h-12 w-12 text-gray-400 dark:text-neutral-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-neutral-400">No orders yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order._id}
              className="flex items-center justify-between p-4 border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800/80 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-gray-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                  <Package className="h-5 w-5 text-gray-600 dark:text-neutral-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-medium text-gray-900 dark:text-white">#{order.orderNumber}</p>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-neutral-400">
                    <div className="flex items-center space-x-1">
                      <User className="h-3 w-3" />
                      <span>
                        {formatDisplayName(order.user.firstName, order.user.lastName)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900 dark:text-white">${order.totalAmount.toFixed(2)}</p>
                <p className="text-sm text-gray-500 dark:text-neutral-400">{order.products.length} item(s)</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
