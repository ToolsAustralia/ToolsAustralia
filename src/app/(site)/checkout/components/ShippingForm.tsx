"use client";

import { MapPin, User, Mail, Building } from "lucide-react";

interface ShippingInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface ShippingFormProps {
  shippingInfo: ShippingInfo;
  setShippingInfo: React.Dispatch<React.SetStateAction<ShippingInfo>>;
  errors: Record<string, string>;
}

const australianStates = [
  "Australian Capital Territory",
  "New South Wales",
  "Northern Territory",
  "Queensland",
  "South Australia",
  "Tasmania",
  "Victoria",
  "Western Australia",
];

export default function ShippingForm({ shippingInfo, setShippingInfo, errors }: ShippingFormProps) {
  const handleInputChange = (field: keyof ShippingInfo, value: string) => {
    setShippingInfo((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          Personal Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
            <input
              type="text"
              value={shippingInfo.firstName}
              onChange={(e) => handleInputChange("firstName", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.firstName ? "border-red-500" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="Enter your first name"
            />
            {errors.firstName && <p className="text-red-600 text-sm mt-1">{errors.firstName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
            <input
              type="text"
              value={shippingInfo.lastName}
              onChange={(e) => handleInputChange("lastName", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.lastName ? "border-red-500" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="Enter your last name"
            />
            {errors.lastName && <p className="text-red-600 text-sm mt-1">{errors.lastName}</p>}
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-green-600" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
            <input
              type="email"
              value={shippingInfo.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.email ? "border-red-500" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="your.email@example.com"
            />
            {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
            <input
              type="tel"
              value={shippingInfo.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.phone ? "border-red-500" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="+61 4XX XXX XXX"
            />
            {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-red-600" />
          Shipping Address
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Street Address *</label>
            <input
              type="text"
              value={shippingInfo.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                errors.address ? "border-red-500" : "border-gray-300 hover:border-red-400"
              }`}
              placeholder="123 Main Street"
            />
            {errors.address && <p className="text-red-600 text-sm mt-1">{errors.address}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Apartment, Suite, Unit (Optional)</label>
            <input
              type="text"
              value={shippingInfo.apartment || ""}
              onChange={(e) => handleInputChange("apartment", e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 hover:border-red-400 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200"
              placeholder="Apt 4B, Suite 200, etc."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
              <input
                type="text"
                value={shippingInfo.city}
                onChange={(e) => handleInputChange("city", e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                  errors.city ? "border-red-500" : "border-gray-300 hover:border-red-400"
                }`}
                placeholder="Sydney"
              />
              {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code *</label>
              <input
                type="text"
                value={shippingInfo.zipCode}
                onChange={(e) => handleInputChange("zipCode", e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                  errors.zipCode ? "border-red-500" : "border-gray-300 hover:border-red-400"
                }`}
                placeholder="2000"
              />
              {errors.zipCode && <p className="text-red-600 text-sm mt-1">{errors.zipCode}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
              <select
                value={shippingInfo.state}
                onChange={(e) => handleInputChange("state", e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
                  errors.state ? "border-red-500" : "border-gray-300 hover:border-red-400"
                }`}
              >
                <option value="">Select State</option>
                {australianStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              {errors.state && <p className="text-red-600 text-sm mt-1">{errors.state}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
              <input
                type="text"
                value={shippingInfo.country}
                disabled
                className="w-full px-4 py-3 border border-gray-300 hover:border-red-400 rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Instructions */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building className="w-5 h-5 text-purple-600" />
          Delivery Instructions
        </h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Special Instructions (Optional)</label>
          <textarea
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 hover:border-red-400 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 resize-none"
            placeholder="Leave at front door, call when delivered, etc."
          />
        </div>
      </div>
    </div>
  );
}
