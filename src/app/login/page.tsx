"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Gift, Star, Zap, Shield } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";

// Google Icon Component
function GoogleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// Square Checkbox Component
function SquareCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="relative w-6 h-6">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div
        className={`w-6 h-6 border-2 rounded ${
          checked ? "border-[#ee0000] bg-[#ee0000]" : "border-[#d9d9d9] bg-white"
        } flex items-center justify-center`}
      >
        {checked && (
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

// Animated Offers Component
function AnimatedOffers() {
  const [currentOffer, setCurrentOffer] = useState(0);

  const offers = [
    {
      icon: <Gift className="w-8 h-8 text-white" />,
      title: "Benefits +",
      subtitle: "Exclusive Offers",
      color: "bg-[#ec0000]",
    },
    {
      icon: <Star className="w-8 h-8 text-white" />,
      title: "Premium +",
      subtitle: "VIP Access",
      color: "bg-[#ec0000]",
    },
    {
      icon: <Zap className="w-8 h-8 text-white" />,
      title: "Flash +",
      subtitle: "Daily Deals",
      color: "bg-[#ec0000]",
    },
    {
      icon: <Shield className="w-8 h-8 text-white" />,
      title: "Secure +",
      subtitle: "Safe Shopping",
      color: "bg-[#ec0000]",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentOffer((prev) => (prev + 1) % offers.length);
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, [offers.length]);

  const current = offers[currentOffer];

  return (
    <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
      <div
        className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-14 lg:h-14 ${current.color} rounded-full flex items-center justify-center transition-all duration-500 ease-in-out`}
      >
        <div className="transition-all duration-500 ease-in-out transform scale-50 sm:scale-75 lg:scale-100">
          {current.icon}
        </div>
      </div>
      <div className="transition-all duration-500 ease-in-out">
        <p className="text-[10px] sm:text-[12px] lg:text-[14px] font-medium text-[#ec0000] tracking-[-0.28px] transition-all duration-500 ease-in-out">
          {current.title}
        </p>
        <p className="text-[14px] sm:text-[16px] lg:text-[24px] font-bold text-[#ec0000] tracking-[-0.48px] transition-all duration-500 ease-in-out">
          {current.subtitle}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const { data: session, status } = useSession();
  const { showToast } = useToast();

  // Redirect if user is already logged in based on their role
  useEffect(() => {
    if (status === "authenticated" && session) {
      // Check user role and redirect accordingly
      if (session.user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/my-account");
      }
    }
  }, [status, session, router]);

  // Show loading while checking authentication status
  if (status === "loading") {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600"></div>
      </div>
    );
  }

  // Don't render the login form if user is authenticated
  if (status === "authenticated") {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Check if this is a rate limit error (429)
        // NextAuth may return different error formats, so we check the error message
        const errorMessage = result.error.toLowerCase();
        const isRateLimitError =
          errorMessage.includes("too many") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("429") ||
          errorMessage.includes("failed to construct") ||
          errorMessage.includes("construct") ||
          result.status === 429;

        if (isRateLimitError) {
          // Show toast notification for rate limit errors
          showToast({
            type: "error",
            title: "Too Many Login Attempts",
            message: "Please wait a moment before trying again. You've exceeded the maximum number of login attempts.",
            duration: 8000, // Longer duration for important security messages
          });
          setError("Too many login attempts. Please wait a moment before trying again.");
        } else {
          // Show toast for other authentication errors
          showToast({
            type: "error",
            title: "Login Failed",
            message: "Invalid email or password. Please check your credentials and try again.",
            duration: 5000,
          });
          setError("Invalid email or password");
        }
      } else {
        // Login successful - show success toast
        showToast({
          type: "success",
          title: "Login Successful",
          message: "Welcome back! Redirecting to your account...",
          duration: 3000,
        });
        // The useEffect will handle the redirect once the session updates
        // No need to manually redirect here
      }
    } catch (error) {
      // Handle unexpected errors, including rate limit errors that NextAuth might throw
      // When NextAuth receives a 429 response, it throws: "Failed to construct 'URL': Invalid URL"
      // This is the ONLY scenario where "construct" appears in login errors

      // Get error message from all possible representations
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error);
      const errorToString = error?.toString() || "";
      const allErrorText = `${errorMessage} ${errorString} ${errorToString}`.toLowerCase();

      // Debug: Log the error to see what we're actually getting
      console.log("🔍 Login catch block - Error details:", {
        error,
        errorMessage,
        errorString,
        errorToString,
        allErrorText,
        hasConstruct: allErrorText.includes("construct"),
      });

      // ULTRA-SIMPLE RULE: If error contains "construct" = rate limit error (429)
      // Check all possible error representations to be absolutely sure
      const isRateLimitError =
        allErrorText.includes("construct") ||
        allErrorText.includes("too many") ||
        allErrorText.includes("rate limit") ||
        allErrorText.includes("429");

      if (isRateLimitError) {
        // Show toast notification for rate limit errors
        showToast({
          type: "error",
          title: "Too Many Login Attempts",
          message: "Please wait a moment before trying again. You've exceeded the maximum number of login attempts.",
          duration: 8000,
        });
        setError("Too many login attempts. Please wait a moment before trying again.");
      } else {
        // Show generic error toast for other unexpected errors
        console.error("Login error:", error);
        showToast({
          type: "error",
          title: "Login Error",
          message: "An error occurred. Please try again.",
          duration: 5000,
        });
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // Let NextAuth handle the redirect, the useEffect will handle role-based routing
      await signIn("google", { redirect: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred with Google sign-in";
      showToast({
        type: "error",
        title: "Google Sign-In Error",
        message: errorMessage,
        duration: 5000,
      });
      setError("An error occurred with Google sign-in");
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen-dvh bg-white flex flex-col lg:flex-row overflow-hidden">
      {/* Left Column - Login Form */}
      <div className="w-full lg:w-[591px] flex flex-col p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
        {/* Logo Section */}
        <div className="mb-4 sm:mb-6 lg:mb-12">
          <div className="flex items-center gap-3">
            <div className="w-[40px] h-[42px] sm:w-[50px] sm:h-[52px] relative">
              <Image
                src="/images/Tools Australia Logo/Social Media Profile_Primary.png"
                alt="Tools Australia Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="text-xl sm:text-2xl font-semibold text-black tracking-[-0.96px]">Tools Australia</span>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-16">
          {/* Text Section */}
          <div className="mb-3 sm:mb-4 lg:mb-6">
            <h1 className="text-[24px] sm:text-[28px] lg:text-[40px] font-bold text-[#232323] mb-1 sm:mb-2 tracking-[-1.6px]">
              Sign in
            </h1>
            <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-[#969696] leading-[1.5]">
              Please login to continue to your account.
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3 lg:space-y-4">
            {/* Email Field */}
            <div className="relative">
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full h-[45px] sm:h-[50px] lg:h-[59px] px-4 py-4 border-[1.5px] border-[#d9d9d9] rounded-[10px] text-[14px] sm:text-[16px] lg:text-[18px] text-[#232323] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200"
                  placeholder=""
                  required
                />
                <label className="absolute -top-[10.5px] left-3 bg-white px-1 text-[11px] sm:text-[12px] lg:text-[14px] font-medium text-[#9a9a9a]">
                  Email
                </label>
              </div>
            </div>

            {/* Password Field */}
            <div className="relative">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full h-[45px] sm:h-[50px] lg:h-[59px] px-4 py-4 border border-[#d9d9d9] rounded-[10px] text-[14px] sm:text-[16px] lg:text-[18px] text-[#232323] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200 pr-12"
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#9a9a9a] hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  ) : (
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2.5">
              <SquareCheckbox
                checked={formData.rememberMe}
                onChange={(checked) => setFormData((prev) => ({ ...prev, rememberMe: checked }))}
              />
              <label className="text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-[#232323]">
                Keep me logged in
              </label>
            </div>

            {/* Error Message */}
            {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[42px] sm:h-[48px] lg:h-[54px] bg-[#ec0000] text-white rounded-[10px] font-semibold text-[14px] sm:text-[16px] lg:text-[18px] tracking-[-0.18px] hover:bg-[#d40000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-px bg-[#d9d9d9]"></div>
              <span className="text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-[#6e6e6e]">or</span>
              <div className="flex-1 h-px bg-[#d9d9d9]"></div>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full h-[42px] sm:h-[48px] lg:h-[54px] bg-white border border-[#e6e8e7] text-[#232323] rounded-[10px] font-semibold text-[14px] sm:text-[16px] lg:text-[18px] tracking-[-0.18px] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.03)]"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-3 sm:mt-4 lg:mt-6 text-center">
            <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-[#6c6c6c]">
              Need an account?{" "}
              <Link
                href="/membership"
                className="text-[#ee0000] font-semibold underline hover:no-underline"
                onClick={(e) => {
                  // If we're already on the membership page, scroll to the section
                  if (window.location.pathname === "/membership") {
                    e.preventDefault();
                    const membershipSection = document.getElementById("membership");
                    if (membershipSection) {
                      // Get the actual header height dynamically
                      const header = document.querySelector("header");
                      const headerHeight = header ? header.offsetHeight : 80;

                      // Calculate the position accounting for the fixed header
                      const elementPosition = membershipSection.offsetTop - headerHeight - 20; // Extra 20px padding

                      window.scrollTo({
                        top: Math.max(0, elementPosition), // Ensure we don't scroll to negative position
                        behavior: "smooth",
                      });
                    }
                  }
                }}
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Column - Background Image with Content */}
      <div className="flex-1 relative min-h-[300px] sm:min-h-[400px] lg:min-h-screen-svh">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <Image src="/images/loginBg.jpg" alt="Tools background" fill className="object-cover" priority />
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-[525px] w-full">
            {/* Main CTA Card */}
            <div className="bg-[#f7fafc] rounded-[10px] p-4 sm:p-6 lg:p-11 mb-4 sm:mb-6 lg:mb-8 relative overflow-visible">
              {/* Background Blur Effect - Responsive positioning */}
              <div className="absolute -right-[15px] sm:-right-[20px] lg:-right-[30px] top-[80px] sm:top-[120px] lg:top-[155px] w-[120px] sm:w-[160px] lg:w-[214px] h-[80px] sm:h-[100px] lg:h-[135px] bg-[#f43636] blur-[30px] sm:blur-[40px] lg:blur-[50px] z-10"></div>

              {/* Card Image - Positioned absolutely on top of blur effect */}
              <div className="absolute -right-[25px] sm:-right-[35px] lg:-right-[50px] top-[40px] sm:top-[70px] lg:top-[105px] w-[150px] sm:w-[200px] lg:w-[276px] h-[90px] sm:h-[130px] lg:h-[170px] z-20">
                <Image
                  src="/images/loginCardImage.png"
                  alt="Tools collection"
                  fill
                  className="object-contain"
                  priority
                />
              </div>

              {/* Card Content */}
              <div className="relative z-30 max-w-[180px] sm:max-w-[240px] lg:max-w-[280px] pr-2 sm:pr-4 lg:pr-0">
                <h2 className="text-[20px] sm:text-[24px] lg:text-[34px] font-bold text-[#ec0000] mb-3 sm:mb-4 tracking-[-0.68px] leading-[1.1] sm:leading-[37px]">
                  Achieve More with the Right Tools
                </h2>
                <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-[#718096] mb-4 sm:mb-6 lg:mb-8 leading-[1.4] sm:leading-[28px] tracking-[-0.32px] max-w-[240px] sm:max-w-none">
                  Shop quality tools and earn rewards every time you buy. Your membership gives you exclusive perks,
                  discounts, and access to premium offers.
                </p>
                <button className="bg-[#ec0000] text-[#f7fafc] px-3 sm:px-4 py-1.5 sm:py-2 rounded-[70px] text-[12px] sm:text-[14px] font-medium tracking-[-0.28px] hover:bg-[#d40000] transition-colors">
                  Learn more
                </button>
              </div>

              {/* Small Earnings Card - Positioned in bottom right of main card */}
              <div className="absolute bottom-[-8px] sm:bottom-[-10px] right-0 sm:right-4 lg:right-0 w-[160px] sm:w-[160px] lg:w-[287px] h-[50px] sm:h-[60px] lg:h-[94px] bg-[#f7fafc] rounded-[10px] p-1.5 sm:p-2 lg:p-5 border border-[#e6e8e7] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.03)] z-40">
                <AnimatedOffers />
              </div>
            </div>

            {/* Bottom Text - Hidden on mobile */}
            <div className="hidden sm:block text-center mt-8 sm:mt-12 lg:mt-16 relative z-10">
              <h3 className="text-[20px] sm:text-[28px] lg:text-[40px] font-semibold text-white mb-2 sm:mb-3 lg:mb-4 leading-[1.385]">
                Unlock New Benefits
              </h3>
              <p className="text-[12px] sm:text-[16px] lg:text-[20px] text-[#cfd9e0] leading-[1.385]">
                Track your purchases, maximize your points, and enjoy smarter shopping with our rewards-driven
                marketplace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
