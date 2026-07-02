"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";
import DashboardLoader from "@/components/loading/DashboardLoader";

// Mark page as dynamic to prevent static generation issues
export const dynamic = "force-dynamic";

function AffiliateLoginContent() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/affiliate/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      // Redirect to affiliate dashboard
      router.push("/affiliate");
    } catch {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen-dvh bg-white dark:bg-neutral-950 flex flex-col lg:flex-row overflow-hidden text-neutral-900 dark:text-neutral-100">
      {/* Left Column - Login Form */}
      <div className="w-full lg:w-[591px] flex flex-col p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
        <div className="mb-4 sm:mb-6 lg:mb-12 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[40px] h-[42px] sm:w-[50px] sm:h-[52px] relative shrink-0">
              <Image
                src="/images/Tools Australia Logo/Social Media Profile_Primary.webp"
                alt="Tools Australia Logo"
                fill
                className="object-contain"
                sizes="(max-width: 640px) 40px, 50px"
                priority
              />
            </div>
            <span className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-white tracking-[-0.96px]">
              Tools Australia
            </span>
          </div>
          <ThemeToggleButton className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/90 shadow-sm transition-all duration-300 hover:scale-105 active:scale-95 dark:border-neutral-600 dark:bg-neutral-900/90" />
        </div>

        {/* Content Section */}
        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-16">
          {/* Text Section */}
          <div className="mb-3 sm:mb-4 lg:mb-6">
            <h1 className="text-[24px] sm:text-[28px] lg:text-[40px] font-bold text-neutral-900 dark:text-white mb-1 sm:mb-2 tracking-[-1.6px]">
              Affiliate Login
            </h1>
            <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-500 dark:text-neutral-400 leading-[1.5]">
              Access your affiliate dashboard to track earnings and manage your affiliate link.
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3 lg:space-y-4">
            {/* Username Field */}
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-[45px] sm:h-[50px] lg:h-[59px] px-4 py-4 border-[1.5px] border-[#d9d9d9] dark:border-neutral-600 rounded-[10px] text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200"
                  placeholder=""
                  required
                />
                <label className="absolute -top-[10.5px] left-3 bg-white dark:bg-neutral-950 px-1 text-2xs sm:text-[12px] lg:text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
                  Username
                </label>
              </div>
            </div>

            {/* Password Field */}
            <div className="relative">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-[45px] sm:h-[50px] lg:h-[59px] px-4 py-4 border border-[#d9d9d9] dark:border-neutral-600 rounded-[10px] text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200 pr-12"
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  ) : (
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-lg border border-red-200 dark:border-red-900">
                {error}
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[42px] sm:h-[48px] lg:h-[54px] bg-red-500 text-white rounded-[10px] font-semibold text-[14px] sm:text-[16px] lg:text-[18px] tracking-[-0.18px] hover:bg-[#d40000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Back to Home Link */}
          <div className="mt-3 sm:mt-4 lg:mt-6 text-center">
            <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-600 dark:text-neutral-400">
              <Link href="/" className="text-red-600 font-semibold underline hover:no-underline">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Column - Background Image with Content */}
      <div className="flex-1 relative min-h-[300px] sm:min-h-[400px] lg:min-h-screen-svh">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <Image src="/images/loginBg.jpg" alt="Tools background" fill className="object-cover" sizes="(max-width: 1024px) 100vw, calc(100vw - 591px)" priority />
        </div>
        <div className="absolute inset-0 z-[1] bg-black/25 dark:bg-black/55 pointer-events-none" aria-hidden />

        {/* Content Overlay */}
        <div className="relative z-10 h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-[525px] w-full">
            {/* Main CTA Card */}
            <div className="bg-[#f7fafc] dark:bg-neutral-900/95 dark:border dark:border-neutral-700 rounded-[10px] p-4 sm:p-6 lg:p-11 mb-4 sm:mb-6 lg:mb-8 relative overflow-visible">
              {/* Background Blur Effect - Responsive positioning */}
              <div className="absolute -right-[15px] sm:-right-[20px] lg:-right-[30px] top-[80px] sm:top-[120px] lg:top-[155px] w-[120px] sm:w-[160px] lg:w-[214px] h-[80px] sm:h-[100px] lg:h-[135px] bg-[#f43636] blur-[30px] sm:blur-[40px] lg:blur-[50px] z-10"></div>

              {/* Card Image - Positioned absolutely on top of blur effect */}
              <div className="absolute -right-[25px] sm:-right-[35px] lg:-right-[50px] top-[40px] sm:top-[70px] lg:top-[105px] w-[150px] sm:w-[200px] lg:w-[276px] h-[90px] sm:h-[130px] lg:h-[170px] z-20">
                <Image
                  src="/images/loginCardImage.webp"
                  alt="Tools collection"
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 150px, (max-width: 1024px) 200px, 276px"
                  priority
                />
              </div>

              {/* Card Content */}
              <div className="relative z-30 max-w-[180px] sm:max-w-[240px] lg:max-w-[280px] pr-2 sm:pr-4 lg:pr-0">
                <h2 className="text-[20px] sm:text-[24px] lg:text-[34px] font-bold text-red-500 mb-3 sm:mb-4 tracking-[-0.68px] leading-[1.1] sm:leading-[37px]">
                  Earn More with Affiliate Program
                </h2>
                <p className="text-[12px] sm:text-[14px] lg:text-[16px] text-[#718096] dark:text-neutral-400 mb-4 sm:mb-6 lg:mb-8 leading-[1.4] sm:leading-[28px] tracking-[-0.32px] max-w-[240px] sm:max-w-none">
                  Join our affiliate program and earn 30% commission on every successful referral. Track your earnings,
                  manage your links, and grow your income.
                </p>
                <Link
                  href="/partner"
                  className="inline-block bg-red-500 text-[#f7fafc] px-3 sm:px-4 py-1.5 sm:py-2 rounded-[70px] text-[12px] sm:text-[14px] font-medium tracking-[-0.28px] hover:bg-[#d40000] transition-colors"
                >
                  Learn more
                </Link>
              </div>
            </div>

            {/* Bottom Text - Hidden on mobile */}
            <div className="hidden sm:block text-center mt-8 sm:mt-12 lg:mt-16 relative z-10">
              <h3 className="text-[20px] sm:text-[28px] lg:text-[40px] font-semibold text-white mb-2 sm:mb-3 lg:mb-4 leading-[1.385]">
                Track Your Success
              </h3>
              <p className="text-[12px] sm:text-[16px] lg:text-[20px] text-[#cfd9e0] dark:text-neutral-300 leading-[1.385]">
                Monitor your referrals, view commission details, and manage your affiliate account all in one place.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AffiliateLoginPage() {
  return (
    <Suspense fallback={<DashboardLoader label="Loading…" />}>
      <AffiliateLoginContent />
    </Suspense>
  );
}
