"use client";

interface Order {
  _id: string;
  orderNumber: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  products?: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  tickets?: Array<{
    ticketId: string;
    quantity: number;
    price: number;
  }>;
  membership?: {
    packageId: string;
    packageName: string;
  };
  appliedDiscounts?: Array<{
    description: string;
    amount: number;
  }>;
  trackingNumber?: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

interface RecentOrdersProps {
  orders: Order[];
}

export default function RecentOrders({ orders }: RecentOrdersProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 2L3 7v11a1 1 0 001 1h12a1 1 0 001-1V7l-7-5zM8 15v-4h4v4H8z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Recent Orders</h3>
        <p className="text-gray-600">Your order history will appear here</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "shipped":
        return "bg-blue-100 text-blue-800";
      case "processing":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
        return "bg-gray-100 text-gray-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getOrderType = (order: Order) => {
    if (order.products && order.tickets && order.products.length > 0 && order.tickets.length > 0) {
      return "Products + Tickets";
    } else if (order.products && order.products.length > 0) {
      return "Products";
    } else if (order.tickets && order.tickets.length > 0) {
      return "Tickets";
    } else if (order.membership) {
      return "Membership";
    }
    return "Other";
  };

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <h3 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
              </div>

              <p className="text-sm text-gray-600 mt-1">{getOrderType(order)}</p>

              <p className="text-sm text-gray-500 mt-1">
                {new Date(order.createdAt).toLocaleDateString("en-AU", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              {/* Applied Discounts */}
              {order.appliedDiscounts && order.appliedDiscounts.length > 0 && (
                <div className="mt-2">
                  <div className="flex flex-wrap gap-1">
                    {order.appliedDiscounts.map((discount, index) => (
                      <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        {discount.description}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right ml-4">
              <p className="text-lg font-bold text-gray-900">${order.totalAmount.toFixed(2)}</p>
              {order.appliedDiscounts && order.appliedDiscounts.length > 0 && (
                <p className="text-sm text-green-600">
                  Saved ${order.appliedDiscounts.reduce((sum, discount) => sum + discount.amount, 0).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {/* Tracking Number */}
          {order.trackingNumber && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Tracking:</span> {order.trackingNumber}
              </p>
            </div>
          )}

          {/* Action Button */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <a href={`/orders/${order.orderNumber}`} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View Details →
            </a>
          </div>
        </div>
      ))}

      {/* View All Button */}
      <div className="text-center pt-4">
        <a href="/orders" className="text-blue-600 hover:text-blue-700 font-medium">
          View All Orders →
        </a>
      </div>
    </div>
  );
}
