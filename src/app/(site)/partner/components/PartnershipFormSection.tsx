"use client";

import React, { useState, useCallback } from "react";
import { Building, Mail, User, Target, Send, CheckCircle } from "lucide-react";

interface PartnershipFormSectionProps {
  className?: string;
}

// Move components outside to prevent re-creation on every render
const FormSection = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) => (
  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-gradient-to-r from-red-600 to-red-700 rounded-lg">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 font-['Poppins']">{title}</h3>
    </div>
    {children}
  </div>
);

const Input = ({
  name,
  value,
  placeholder,
  error,
  type = "text",
  className = "",
  onChange,
}: {
  name: string;
  value: string;
  placeholder: string;
  error?: string;
  type?: string;
  className?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="space-y-1">
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 font-['Inter'] text-gray-900 placeholder-gray-500 ${
        error ? "border-red-500" : ""
      } ${className}`}
    />
    {error && <p className="text-red-500 text-sm font-['Inter']">{error}</p>}
  </div>
);

const Textarea = ({
  name,
  value,
  placeholder,
  rows = 3,
  className = "",
  onChange,
}: {
  name: string;
  value: string;
  placeholder: string;
  rows?: number;
  className?: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) => (
  <textarea
    name={name}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    rows={rows}
    className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 font-['Inter'] text-gray-900 placeholder-gray-500 resize-none ${className}`}
  />
);

const Button = ({
  type,
  onClick,
  children,
  variant = "primary",
  loading = false,
  icon: Icon,
  iconPosition = "left",
  className = "",
}: {
  type?: "button" | "submit";
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  iconPosition?: "left" | "right";
  className?: string;
}) => {
  const baseClasses =
    "inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 font-['Inter']";
  const variantClasses =
    variant === "primary"
      ? "bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-xl transform hover:scale-105"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className={`${baseClasses} ${variantClasses} ${loading ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {Icon && iconPosition === "left" && <Icon className="w-4 h-4 mr-2" />}
      {loading ? "Submitting..." : children}
      {Icon && iconPosition === "right" && <Icon className="w-4 h-4 ml-2" />}
    </button>
  );
};

const PartnershipFormSection: React.FC<PartnershipFormSectionProps> = ({ className = "" }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    phone: "",
    abn: "", // Australian Business Number (optional)
    acn: "", // Australian Company Number (optional)
    goals: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    setErrors((prev) => {
      if (prev[name]) {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      }
      return prev;
    });
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }
    if (!formData.businessName.trim()) {
      newErrors.businessName = "Business name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    }

    // Optional ABN validation (if provided, should be 11 digits)
    if (formData.abn.trim() && !/^\d{11}$/.test(formData.abn.replace(/\s/g, ""))) {
      newErrors.abn = "ABN must be 11 digits";
    }

    // Optional ACN validation (if provided, should be 9 digits)
    if (formData.acn.trim() && !/^\d{9}$/.test(formData.acn.replace(/\s/g, ""))) {
      newErrors.acn = "ACN must be 9 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit to API
      const response = await fetch("/api/partner-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit application");
      }

      const result = await response.json();
      console.log("Partner application submitted successfully:", result);

      // Show success state
      setIsSubmitted(true);

      // Reset form after 3 seconds
      setTimeout(() => {
        setFormData({
          firstName: "",
          lastName: "",
          businessName: "",
          email: "",
          phone: "",
          abn: "",
          acn: "",
          goals: "",
        });
        setErrors({});
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting partner application:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <section className={`py-16 sm:py-20 pb-32 sm:pb-40 bg-gradient-to-br from-green-50 to-white ${className}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 font-['Poppins'] mb-4">
              Application Submitted!
            </h2>
            <p className="text-lg text-gray-600 font-['Inter'] mb-8">
              Thank you for your interest in partnering with us. We&apos;ll be in touch within 24 hours.
            </p>
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 max-w-md mx-auto">
              <p className="text-sm text-gray-500 font-['Inter']">
                This form will reset automatically in a few seconds.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`py-16 sm:py-20 bg-gradient-to-br from-gray-50 to-white mb-16${className}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 font-['Poppins'] mb-4">
            Ready to Partner with Us?
          </h2>
          <p className="text-lg text-gray-600 font-['Inter'] max-w-2xl mx-auto">
            Fill out the form below and our team will get back to you within 24 hours to discuss your partnership
            opportunities.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          <FormSection title="Personal Information" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                name="firstName"
                value={formData.firstName}
                placeholder="First name"
                error={errors.firstName}
                onChange={handleInputChange}
              />
              <Input
                name="lastName"
                value={formData.lastName}
                placeholder="Last name"
                error={errors.lastName}
                onChange={handleInputChange}
              />
            </div>
          </FormSection>

          <FormSection title="Business Information" icon={Building}>
            <div className="space-y-4">
              <Input
                name="businessName"
                value={formData.businessName}
                placeholder="Business name"
                error={errors.businessName}
                onChange={handleInputChange}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  name="abn"
                  value={formData.abn}
                  placeholder="ABN (Optional)"
                  error={errors.abn}
                  onChange={handleInputChange}
                />
                <Input
                  name="acn"
                  value={formData.acn}
                  placeholder="ACN (Optional)"
                  error={errors.acn}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Contact Information" icon={Mail}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="email"
                name="email"
                value={formData.email}
                placeholder="Email address"
                error={errors.email}
                onChange={handleInputChange}
              />
              <Input
                type="tel"
                name="phone"
                value={formData.phone}
                placeholder="Phone number"
                error={errors.phone}
                onChange={handleInputChange}
              />
            </div>
          </FormSection>

          <FormSection title="Partnership Goals" icon={Target}>
            <Textarea
              name="goals"
              value={formData.goals}
              placeholder="What are you hoping to achieve through this partnership? (Optional)"
              rows={4}
              onChange={handleInputChange}
            />
          </FormSection>

          {/* Submit Button */}
          <div className="flex justify-center pt-4">
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              icon={Send}
              iconPosition="left"
              className="px-12 py-4 text-lg"
            >
              {isSubmitting ? "Submitting..." : "Submit Partnership Application"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default PartnershipFormSection;
