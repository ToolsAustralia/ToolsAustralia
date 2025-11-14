"use client";

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import MetallicButton from "@/components/ui/MetallicButton";

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
}

export default function ContactForm() {
  const { trackLead } = usePixelTracking();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    subject: "General Inquiry",
    message: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Helper function to check if a field is valid
  const isFieldValid = (fieldName: keyof FormErrors): boolean => {
    return !errors[fieldName] && formData[fieldName as keyof typeof formData]?.toString().trim() !== "";
  };

  // Helper function to check if a field has been touched and is invalid
  const isFieldInvalid = (fieldName: keyof FormErrors): boolean => {
    return touched[fieldName] && !!errors[fieldName];
  };

  // Check if form is valid for submit button
  const isFormValid = (): boolean => {
    return (
      formData.firstName.trim() !== "" &&
      formData.lastName.trim() !== "" &&
      formData.email.trim() !== "" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
      formData.phone.trim() !== "" &&
      formData.message.trim() !== "" &&
      formData.message.trim().length >= 10
    );
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // First name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    // Last name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone validation
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\+?[\d\s\-\(\)]+$/.test(formData.phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }

    // Message validation
    if (!formData.message.trim()) {
      newErrors.message = "Message is required";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters long";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Mark field as touched
    setTouched((prev) => ({
      ...prev,
      [name]: true,
    }));

    // Real-time validation
    const newErrors = { ...errors };
    if (name === "firstName" && value.trim() === "") {
      newErrors.firstName = "First name is required";
    } else if (name === "firstName") {
      delete newErrors.firstName;
    }

    if (name === "lastName" && value.trim() === "") {
      newErrors.lastName = "Last name is required";
    } else if (name === "lastName") {
      delete newErrors.lastName;
    }

    if (name === "email") {
      if (value.trim() === "") {
        newErrors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        newErrors.email = "Please enter a valid email address";
      } else {
        delete newErrors.email;
      }
    }

    if (name === "phone" && value.trim() === "") {
      newErrors.phone = "Phone number is required";
    } else if (name === "phone") {
      delete newErrors.phone;
    }

    if (name === "message" && value.trim() === "") {
      newErrors.message = "Message is required";
    } else if (name === "message") {
      delete newErrors.message;
    }

    setErrors(newErrors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit to API
      const response = await fetch("/api/contact-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit form");
      }

      const result = await response.json();
      console.log("Contact form submitted successfully:", result);

      // Track lead event for pixel tracking
      trackLead({
        content_type: "contact_form",
        content_name: `Contact Form - ${formData.subject}`,
        content_category: "lead_generation",
        value: 0, // Contact form has no monetary value
        currency: "AUD",
      });

      setIsSubmitted(true);

      // Reset form after successful submission
      setTimeout(() => {
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          subject: "General Inquiry",
          message: "",
        });
        setTouched({});
        setErrors({});
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const subjects = ["General Inquiry", "Support", "Partnership", "Feedback"];

  // Show success message
  if (isSubmitted) {
    return (
      <div className="p-6 sm:p-8 lg:p-12 flex items-center justify-center min-h-[300px] sm:min-h-[400px] relative overflow-hidden">
        {/* White Background */}
        <div className="absolute inset-0 bg-white"></div>

        <div className="text-center relative z-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-black mb-2 font-['Poppins']">Message Sent!</h3>
          <p className="text-sm sm:text-base text-gray-600 font-['Poppins']">
            Thank you for contacting us. We&apos;ll get back to you soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-12 relative overflow-hidden">
      {/* White Background */}
      <div className="absolute inset-0 bg-white"></div>

      {/* Content */}
      <div className="relative z-10">
        {/* Form Header */}
        <div className="mb-8">
          <h3 className="text-[24px] font-semibold text-black mb-2 font-['Poppins']">Send us a message</h3>
          <p className="text-[14px] text-gray-600 mb-4 font-['Poppins']">
            Fill out the form below and we&apos;ll get back to you as soon as possible.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" ref={formRef}>
          {/* First Name and Last Name Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="relative">
              <label className="block text-[12px] font-medium text-gray-600 mb-2 font-['Poppins']">First Name</label>
              <div className="relative">
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={`form-input ${
                    isFieldInvalid("firstName")
                      ? "border-red-500"
                      : isFieldValid("firstName")
                      ? "border-green-500"
                      : "border-gray-400 hover:border-[#ee0000]"
                  }`}
                  placeholder="Enter your first name"
                />
                {isFieldValid("firstName") && (
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                )}
                {isFieldInvalid("firstName") && (
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                    <X className="w-5 h-5 text-red-500" />
                  </div>
                )}
              </div>
              <div
                className={`absolute bottom-0 left-0 w-full h-px ${
                  isFieldInvalid("firstName")
                    ? "bg-red-500"
                    : isFieldValid("firstName")
                    ? "bg-green-500"
                    : "bg-gray-400"
                }`}
              ></div>
            </div>
            <div className="relative">
              <label className="block text-[12px] font-medium text-gray-600 mb-2 font-['Poppins']">Last Name</label>
              <div className="relative">
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={`form-input ${
                    isFieldInvalid("lastName")
                      ? "border-red-500"
                      : isFieldValid("lastName")
                      ? "border-green-500"
                      : "border-gray-400 hover:border-[#ee0000]"
                  }`}
                  placeholder="Enter your last name"
                />
                {isFieldValid("lastName") && (
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                )}
                {isFieldInvalid("lastName") && (
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                    <X className="w-5 h-5 text-red-500" />
                  </div>
                )}
              </div>
              <div
                className={`absolute bottom-0 left-0 w-full h-px ${
                  isFieldInvalid("lastName") ? "bg-red-500" : isFieldValid("lastName") ? "bg-green-500" : "bg-gray-400"
                }`}
              ></div>
            </div>
          </div>

          {/* Email Row */}
          <div className="relative">
            <label className="block text-[12px] font-medium text-gray-600 mb-2 font-['Poppins']">Email</label>
            <div className="relative">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`form-input ${
                  isFieldInvalid("email")
                    ? "border-red-500"
                    : isFieldValid("email")
                    ? "border-green-500"
                    : "border-gray-400 hover:border-[#ee0000]"
                }`}
                placeholder="Enter your email address"
              />
              {isFieldValid("email") && (
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              )}
              {isFieldInvalid("email") && (
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                  <X className="w-5 h-5 text-red-500" />
                </div>
              )}
            </div>
            <div
              className={`absolute bottom-0 left-0 w-full h-px ${
                isFieldInvalid("email") ? "bg-red-500" : isFieldValid("email") ? "bg-green-500" : "bg-gray-400"
              }`}
            ></div>
          </div>

          {/* Phone Number Row */}
          <div className="relative">
            <label className="block text-[12px] font-medium text-gray-600 mb-2 font-['Poppins']">Phone Number</label>
            <div className="relative">
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className={`form-input ${
                  isFieldInvalid("phone")
                    ? "border-red-500"
                    : isFieldValid("phone")
                    ? "border-green-500"
                    : "border-gray-400 hover:border-[#ee0000]"
                }`}
                placeholder="Enter your phone number"
              />
              {isFieldValid("phone") && (
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              )}
              {isFieldInvalid("phone") && (
                <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-6 h-6">
                  <X className="w-5 h-5 text-red-500" />
                </div>
              )}
            </div>
            <div
              className={`absolute bottom-0 left-0 w-full h-px ${
                isFieldInvalid("phone") ? "bg-red-500" : isFieldValid("phone") ? "bg-green-500" : "bg-gray-400"
              }`}
            ></div>
          </div>

          {/* Subject Selection */}
          <div>
            <label className="block text-[14px] font-semibold text-black mb-2 font-['Poppins']">Select Subject?</label>
            <div className="flex flex-wrap gap-3 sm:gap-4">
              {subjects.map((subject) => (
                <label
                  key={subject}
                  className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-all duration-200 focus-within:bg-gray-100"
                >
                  <input
                    type="radio"
                    name="subject"
                    value={subject}
                    checked={formData.subject === subject}
                    onChange={handleInputChange}
                    className="w-[16px] h-[16px] text-[#ee0000] border-gray-400 focus:ring-0 focus:ring-offset-0 rounded-full transition-all duration-300"
                  />
                  <span className="text-[12px] text-black font-['Poppins'] select-none">{subject}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="relative">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[12px] font-medium text-gray-600 font-['Poppins']">Message</label>
              <span
                className={`text-[10px] font-['Poppins'] ${
                  formData.message.length < 10
                    ? "text-red-500"
                    : formData.message.length > 500
                    ? "text-orange-500"
                    : "text-green-500"
                }`}
              >
                {formData.message.length}/500
              </span>
            </div>
            <div className="relative">
              <textarea
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                rows={4}
                maxLength={500}
                className={`form-input resize-none ${
                  isFieldInvalid("message")
                    ? "border-red-500"
                    : isFieldValid("message")
                    ? "border-green-500"
                    : "border-gray-400 hover:border-[#ee0000]"
                }`}
                placeholder="Write your message (minimum 10 characters)..."
              />
              {isFieldValid("message") && (
                <div className="absolute right-0 top-3 w-6 h-6">
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              )}
              {isFieldInvalid("message") && (
                <div className="absolute right-0 top-3 w-6 h-6">
                  <X className="w-5 h-5 text-red-500" />
                </div>
              )}
            </div>
            <div
              className={`absolute bottom-0 left-0 w-full h-px ${
                isFieldInvalid("message") ? "bg-red-500" : isFieldValid("message") ? "bg-green-500" : "bg-gray-400"
              }`}
            ></div>
          </div>

          {/* Submit Button */}
          <div className="relative flex justify-center sm:justify-end items-center">
            <MetallicButton
              onClick={() => formRef.current?.requestSubmit()}
              variant="primary"
              size="md"
              borderRadius="lg"
              disabled={isSubmitting || !isFormValid()}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </div>
              ) : (
                "Send Message"
              )}
            </MetallicButton>
          </div>
        </form>
      </div>
    </div>
  );
}
