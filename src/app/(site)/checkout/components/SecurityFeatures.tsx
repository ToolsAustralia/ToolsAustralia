"use client";

import { Shield, Lock, Truck, RotateCcw, Award } from "lucide-react";

export default function SecurityFeatures() {
  const features = [
    {
      icon: Lock,
      title: "SSL Encrypted",
      description: "Your data is protected with 256-bit SSL encryption",
      color: "green",
    },
    {
      icon: Shield,
      title: "PCI Compliant",
      description: "We meet the highest security standards for payment processing",
      color: "blue",
    },
    {
      icon: Truck,
      title: "Fast Shipping",
      description: "Most orders ship within 1-2 business days",
      color: "orange",
    },
    {
      icon: RotateCcw,
      title: "Easy Returns",
      description: "30-day hassle-free returns on all purchases",
      color: "purple",
    },
    {
      icon: Award,
      title: "Trusted Brand",
      description: "Over 10,000 satisfied customers",
      color: "red",
    },
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      green: "bg-green-100 text-green-600",
      blue: "bg-blue-100 text-blue-600",
      orange: "bg-orange-100 text-orange-600",
      purple: "bg-purple-100 text-purple-600",
      red: "bg-red-100 text-red-600",
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2 font-['Poppins']">Why Shop With Us?</h3>
        <p className="text-gray-600 text-sm">Your security and satisfaction are our top priorities</p>
      </div>

      <div className="space-y-4">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <div key={index} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${getColorClasses(feature.color)}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 text-sm">{feature.title}</h4>
                <p className="text-xs text-gray-600">{feature.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trust Badges */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center mb-1">
              <span className="text-xs font-bold text-gray-600">SSL</span>
            </div>
            <span className="text-xs text-gray-500">Secure</span>
          </div>
          <div className="text-center">
            <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center mb-1">
              <span className="text-xs font-bold text-gray-600">PCI</span>
            </div>
            <span className="text-xs text-gray-500">Compliant</span>
          </div>
          <div className="text-center">
            <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center mb-1">
              <span className="text-xs font-bold text-gray-600">256</span>
            </div>
            <span className="text-xs text-gray-500">Bit SSL</span>
          </div>
        </div>
      </div>
    </div>
  );
}






















