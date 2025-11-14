import { Star, Eye, ShoppingCart } from "lucide-react";
import Image from "next/image";

interface Product {
  _id: string;
  name: string;
  price: number;
  images: string[];
  rating: number;
  reviews: unknown[];
}

interface TopProductsProps {
  products: Product[];
}

export default function TopProducts({ products }: TopProductsProps) {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < Math.floor(rating) ? "text-yellow-400 fill-current" : "text-gray-300"}`}
      />
    ));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Top Products</h3>
        <button className="text-sm text-red-600 hover:text-red-700 font-medium">View all</button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8">
          <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No products yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product, index) => (
            <div
              key={product._id}
              className="flex items-center space-x-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  {product.images && product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      width={48}
                      height={48}
                      className="rounded-lg object-cover"
                    />
                  ) : (
                    <ShoppingCart className="h-6 w-6 text-gray-400" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                  <h4 className="text-sm font-medium text-gray-900 truncate">{product.name}</h4>
                </div>

                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex items-center space-x-1">{renderStars(product.rating)}</div>
                  <span className="text-xs text-gray-500">({product.reviews?.length || 0} reviews)</span>
                </div>
              </div>

              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold text-gray-900">${product.price.toFixed(2)}</p>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <Eye className="h-3 w-3" />
                  <span>High rating</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
