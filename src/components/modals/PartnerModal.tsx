"use client";

import React, { useState, useEffect } from "react";
import { Building, Mail, User, Target, Send, X, CheckCircle } from "lucide-react";
import { ModalContainer, ModalContent, Input, Textarea, Button, FormSection } from "./ui";

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PartnerModal: React.FC<PartnerModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    phone: "",
    abn: "",
    acn: "",
    goals: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
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
      setSubmitError("");
      setIsSubmitted(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

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
    setSubmitError("");

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

      // Auto close modal after 3 seconds
      setTimeout(() => {
        // Reset form
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
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Error submitting partner application:", error);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" closeOnBackdrop={false}>
      {/* Custom Header for Partner Modal - Highly optimized for mobile */}
      <div className="bg-gradient-to-r from-[#ee0000] via-[#ff3333] to-[#ff4444] p-2 sm:p-6 text-white relative overflow-hidden">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-1.5 right-1.5 sm:top-4 sm:right-4 text-white hover:text-gray-200 transition-all duration-300 hover:scale-110 z-50 p-0.5 sm:p-1 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
          aria-label="Close modal"
        >
          <X size={16} className="sm:w-6 sm:h-6" />
        </button>

        <div className="relative z-10 flex items-center justify-center sm:justify-between">
          {/* <Image
            src="/images/Tools Australia Logo/Primary Logo.png"
            alt="Tools Australia"
            width={120}
            height={120}
            className="h-8 sm:h-12 w-auto drop-shadow-lg"
            priority
            unoptimized={true}
            placeholder="empty"
          /> */}
          <h2 className="text-sm sm:text-2xl font-bold font-['Poppins']">
            {isSubmitted ? "Application Submitted!" : "Become a Partner"}
          </h2>
        </div>
      </div>

      <ModalContent padding="md">
        {isSubmitted ? (
          // Success State
          <div className="text-center py-4 sm:py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full mb-4 sm:mb-6">
              <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-gray-900 font-['Poppins'] mb-2 sm:mb-4">Thank You!</h3>
            <p className="text-sm sm:text-base text-gray-600 font-['Inter'] mb-4 sm:mb-6">
              Your partnership application has been submitted successfully. We&apos;ll be in touch within 24 hours to
              discuss your partnership opportunities.
            </p>
            <div className="bg-green-50 rounded-xl p-3 sm:p-4 border border-green-200 max-w-sm mx-auto">
              <p className="text-xs sm:text-sm text-green-700 font-['Inter']">
                This modal will close automatically in a few seconds.
              </p>
            </div>
          </div>
        ) : (
          // Form State
          <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-6">
            {/* Error Message */}
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 mb-4">
                <p className="text-sm text-red-700 font-['Inter']">{submitError}</p>
              </div>
            )}
            <FormSection title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  placeholder="First name"
                  error={errors.firstName}
                  className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                />
                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  placeholder="Last name"
                  error={errors.lastName}
                  className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                />
              </div>
            </FormSection>

            <FormSection title="Business Information" icon={Building}>
              <div className="space-y-1.5 sm:space-y-2">
                <Input
                  name="businessName"
                  value={formData.businessName}
                  onChange={(e) => handleInputChange("businessName", e.target.value)}
                  placeholder="Business name"
                  error={errors.businessName}
                  className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                  <Input
                    name="abn"
                    value={formData.abn}
                    onChange={(e) => handleInputChange("abn", e.target.value)}
                    placeholder="ABN (Optional)"
                    error={errors.abn}
                    className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                  />
                  <Input
                    name="acn"
                    value={formData.acn}
                    onChange={(e) => handleInputChange("acn", e.target.value)}
                    placeholder="ACN (Optional)"
                    error={errors.acn}
                    className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                  />
                </div>
              </div>
            </FormSection>

            <FormSection title="Contact Information" icon={Mail}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Email address"
                  error={errors.email}
                  className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                />
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="Phone number"
                  error={errors.phone}
                  className="font-['Poppins'] text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 h-8 sm:h-auto"
                />
              </div>
            </FormSection>

            <FormSection title="Partnership Goals" icon={Target}>
              <Textarea
                name="goals"
                value={formData.goals}
                onChange={(e) => handleInputChange("goals", e.target.value)}
                placeholder="What are you hoping to achieve? (Optional)"
                rows={2}
                className="font-['Poppins'] text-xs sm:text-base px-2 py-1.5 sm:px-3 sm:py-2"
              />
            </FormSection>

            {/* Submit Button - Optimized for mobile */}
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3 pt-1 sm:pt-2">
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                fullWidth
                className="font-['Poppins'] text-xs sm:text-sm py-1.5 sm:py-3 h-8 sm:h-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={isSubmitting}
                icon={Send}
                iconPosition="left"
                className="font-['Poppins'] text-xs sm:text-sm py-1.5 sm:py-3 h-8 sm:h-auto"
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </form>
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default PartnerModal;
