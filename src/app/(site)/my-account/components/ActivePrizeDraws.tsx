"use client";

interface MiniDraw {
  _id: string;
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
  };
  endDate: string;
  isActive: boolean;
}

interface ActiveMiniDrawsProps {
  miniDraws: MiniDraw[];
}

export default function ActiveMiniDraws({ miniDraws }: ActiveMiniDrawsProps) {
  if (miniDraws.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Mini Draws</h3>
        <p className="text-gray-600">Check back later for new mini draws!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mobile: List View */}
      <div className="block md:hidden space-y-4">
        {miniDraws.map((draw) => (
          <div key={draw._id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">{draw.name}</h3>
            <p className="text-sm text-gray-600 mb-3">{draw.description}</p>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-green-600">Prize: {draw.prize.name}</span>
              <span className="text-xs text-gray-500">
                Ends:{" "}
                {new Date(draw.endDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tablet and Desktop: Grid View */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {miniDraws.map((draw) => (
          <div
            key={draw._id}
            className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold text-gray-900 mb-3">{draw.name}</h3>
            <p className="text-sm text-gray-600 mb-4">{draw.description}</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-600">Prize:</span>
                <span className="text-sm text-gray-900">{draw.prize.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Ends:</span>
                <span className="text-sm text-gray-900">
                  {new Date(draw.endDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
