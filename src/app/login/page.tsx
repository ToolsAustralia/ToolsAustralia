"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useState, useEffect, useRef } from "react";

import { signIn, useSession } from "next-auth/react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import Link from "next/link";

import { Eye, EyeOff, Shield, Star, Gift, Zap, type LucideIcon } from "lucide-react";

import Image from "next/image";

import { useToast } from "@/components/ui/Toast";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import {
  POWERSET_IMAGES,
  POWERSET_BRAND_TEXT,
} from "@/components/sections/promo/prize-selection/constants";
import {
  getLandingPageThemeFromSlug,
  getPackageColorScheme,
  getToolsetBadgeStyle,
  hexToRgbaString,
} from "@/utils/package-colors/packageColorScheme";

import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/utils/cn";

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
          checked
            ? "border-red-600 bg-red-600"
            : "border-[#d9d9d9] bg-white dark:border-neutral-500 dark:bg-neutral-900"
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

// Rotating Toolset Card — cycles Milwaukee → DeWalt → Makita → Ryobi every 3.5s.
// Card surface tints to the active brand so Ryobi's lime brand never sits on white.

const TOOLSETS = ["milwaukee", "dewalt", "makita", "ryobi"] as const;
type ToolsetKey = (typeof TOOLSETS)[number];

const KIT_PIECE_COUNT_LABEL: Record<ToolsetKey, string> = {
  milwaukee: "13 PIECE KIT",
  dewalt: "14 PIECE KIT",
  makita: "15 PIECE KIT",
  ryobi: "19 PIECE KIT",
};

const TOOLSET_DISPLAY_NAME: Record<ToolsetKey, string> = {
  milwaukee: "Milwaukee",
  dewalt: "DeWalt",
  makita: "Makita",
  ryobi: "Ryobi",
};

// Same color-key mapping the prize carousel uses (PowerToolsetCarousel.tsx).
function getToolsetColorKey(toolset: ToolsetKey): string {
  if (toolset === "milwaukee") return "milwaukee-red";
  if (toolset === "dewalt") return "dewalt-yellow";
  if (toolset === "makita") return "makita-teal";
  return "ryobi-green";
}

// Surface tint alpha per brand — eyeball-tuned starting values from the spec.
const TINT_ALPHA_LIGHT: Record<ToolsetKey, number> = {
  milwaukee: 0.08,
  dewalt: 0.1,
  makita: 0.1,
  ryobi: 0.12,
};
const TINT_ALPHA_DARK: Record<ToolsetKey, number> = {
  milwaukee: 0.18,
  dewalt: 0.16,
  makita: 0.16,
  ryobi: 0.18,
};

// Animated badge content paired 1:1 with each brand — chip swaps in sync with the toolset.
const BADGE_CONFIG: Record<ToolsetKey, { icon: LucideIcon; title: string; subtitle: string }> = {
  milwaukee: { icon: Shield, title: "Secure", subtitle: "Payment" },
  dewalt: { icon: Star, title: "Premium", subtitle: "Partner Discounts" },
  makita: { icon: Gift, title: "Exclusive", subtitle: "Offers" },
  ryobi: { icon: Zap, title: "Drawn", subtitle: "Live" },
};

const ROTATION_INTERVAL_MS = 3500;

function RotatingToolsetCard() {
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = () => {
    if (prefersReducedMotion) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % TOOLSETS.length);
    }, ROTATION_INTERVAL_MS);
  };

  useEffect(() => {
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // startInterval only closes over prefersReducedMotion (in deps) and the stable
    // intervalRef, so omitting it from deps is safe. Including it would re-create
    // the closure every render and reset the interval on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion]);

  const handleDotClick = (i: number) => {
    setActiveIndex(i);
    startInterval(); // restart timer so user gets a full cycle on the brand they picked
  };

  const active = TOOLSETS[activeIndex];
  const photoSrc = POWERSET_IMAGES[active];
  const wordmarkSrc = POWERSET_BRAND_TEXT[active];
  const pillLabel = KIT_PIECE_COUNT_LABEL[active];
  const colorKey = getToolsetColorKey(active);
  const scheme = getPackageColorScheme(colorKey);
  const badgeStyle = getToolsetBadgeStyle(active);
  const brandTheme = getLandingPageThemeFromSlug(`${active}-milwaukee`);
  const brandPrimary = brandTheme.primary;
  const brandPrimaryDark = brandTheme.primaryDark; // darker variant — readable on white chip
  const tintLight = hexToRgbaString(brandPrimary, TINT_ALPHA_LIGHT[active]);
  const tintDark = hexToRgbaString(brandPrimary, TINT_ALPHA_DARK[active]);
  const badge = BADGE_CONFIG[active];
  const BadgeIcon = badge.icon;

  return (
    <div className="relative">
      {/* Card body — tinted per active brand, overflow-hidden so tint stays inside rounded shape */}
      <div
        className="relative overflow-hidden rounded-[10px] border border-transparent dark:border-neutral-700 p-4 sm:p-5 lg:p-7 transition-colors duration-500"
        style={{
          backgroundColor: "#f7fafc",
          backgroundImage: `linear-gradient(0deg, ${tintLight}, ${tintLight})`,
        }}
      >
        {/* Dark-mode surface override — neutral-900 base with the darker tint laid on top. */}
        <div className="pointer-events-none absolute inset-0 hidden dark:block bg-neutral-900" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 hidden dark:block transition-colors duration-500"
          style={{ backgroundColor: tintDark }}
          aria-hidden
        />

        {/* Two-column on lg+, stacked on smaller. Image+pill column on the right (lg) / top (small). */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:gap-5">
          {/* Image column (right on lg, top on mobile/tablet) */}
          <div className="order-1 lg:order-2 flex flex-col items-center shrink-0 lg:w-[210px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`wordmark-${active}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.25 }}
                className={`relative ${
                  active === "makita"
                    ? "h-5 w-24 sm:h-5 sm:w-24 lg:h-6 lg:w-28"
                    : "h-7 w-32 sm:h-7 sm:w-36 lg:h-8 lg:w-40"
                }`}
              >
                <Image
                  src={wordmarkSrc}
                  alt={`${TOOLSET_DISPLAY_NAME[active]} wordmark`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 128px, 160px"
                />
              </motion.div>
            </AnimatePresence>

            <div className="relative mt-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`photo-${active}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="relative h-[90px] w-[150px] sm:h-[105px] sm:w-[180px] lg:h-[120px] lg:w-[200px]"
                >
                  <motion.div
                    animate={prefersReducedMotion ? { y: 0 } : { y: [0, -6, 0] }}
                    transition={prefersReducedMotion ? {} : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="relative h-full w-full"
                  >
                    <Image
                      src={photoSrc}
                      alt={`${TOOLSET_DISPLAY_NAME[active]} toolset`}
                      fill
                      className="object-contain drop-shadow-2xl"
                      sizes="(max-width: 640px) 150px, (max-width: 1024px) 180px, 200px"
                      priority={active === "milwaukee"}
                    />
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`pill-${active}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="mt-2 w-fit rounded-xl px-2.5 py-1 sm:px-3 sm:py-1.5 shadow-xl backdrop-blur-md"
                style={{
                  background: badgeStyle.background,
                  boxShadow: badgeStyle.boxShadow,
                  border: badgeStyle.border,
                }}
              >
                <p className={cn("font-sans text-3xs sm:text-2xs font-extrabold leading-tight whitespace-nowrap", scheme.buttonText)}>
                  {pillLabel}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Text column (left on lg, below image on mobile/tablet) */}
          <div className="order-2 lg:order-1 mt-4 lg:mt-0 flex w-full min-w-0 flex-col items-center lg:items-start text-center lg:text-left lg:flex-1">
            <h2 className="w-full text-[17px] sm:text-[20px] lg:text-[26px] font-bold text-neutral-900 dark:text-neutral-50 tracking-[-0.5px] leading-[1.2] break-words">
              Earn Partner Discounts &amp; Win Tools
            </h2>
            <p className="mt-2 w-full max-w-[300px] lg:max-w-none text-[12px] sm:text-[13px] lg:text-[14px] text-[#475569] dark:text-neutral-300 leading-[1.5]">
              Become a member to enter our major draws for premium toolsets and unlock exclusive discounts across our partner brands.
            </p>

            {/* Dot indicators — each button is a ≥36×36 hit area with a centered 10×10 dot */}
            <div className="mt-3 sm:mt-4 flex items-center gap-1" aria-label="Toolset showcase">
              {TOOLSETS.map((t, i) => {
                const isActive = i === activeIndex;
                const dotBrand = getLandingPageThemeFromSlug(`${t}-milwaukee`).primary;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-label={`Show ${TOOLSET_DISPLAY_NAME[t]} toolset`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => handleDotClick(i)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                  >
                    <span
                      className={cn(
                        "block h-2.5 w-2.5 rounded-full transition-all duration-300",
                        !isActive && "bg-neutral-300 dark:bg-neutral-600"
                      )}
                      style={isActive ? { backgroundColor: dotBrand } : undefined}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Animated badge chip — fixed size; only inner content swaps per brand. */}
      <div className="absolute bottom-[-10px] right-3 sm:bottom-[-12px] sm:right-5 z-20 w-[180px] sm:w-[210px] h-[52px] sm:h-[64px] rounded-[10px] bg-white dark:bg-neutral-900 px-2 sm:px-3 shadow-[0px_2px_8px_rgba(0,0,0,0.08)] dark:shadow-none border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`badge-${active}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.3 }}
            className="flex h-full items-center gap-2"
          >
            <div
              className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
              style={{ backgroundColor: brandPrimary }}
            >
              <BadgeIcon className={cn("h-4 w-4 sm:h-5 sm:w-5", scheme.buttonText)} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p
                className="truncate text-2xs sm:text-[11px] font-medium tracking-[-0.2px]"
                style={{ color: brandPrimaryDark }}
              >
                {badge.title} +
              </p>
              <p
                className="truncate text-[13px] sm:text-[15px] font-bold tracking-[-0.3px]"
                style={{ color: brandPrimaryDark }}
              >
                {badge.subtitle}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoginPageContent() {
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

  const queryClient = useQueryClient();

  // Redirect if user is already logged in based on their role

  useEffect(() => {
    if (status === "authenticated" && session) {
      // Invalidate queries to ensure fresh data after login

      if (session.user?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.users.account(session.user.id) });

        queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(session.user.id) });

        queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(session.user.id) });
      }

      // Check user role and redirect accordingly

      if (session.user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/my-account");
      }
    }
  }, [status, session, router, queryClient]);

  // Show loading while checking authentication status

  if (status === "loading") {
    return (
      <div className="min-h-screen-svh flex items-center justify-center bg-white dark:bg-neutral-950">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500"></div>
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
        // Login successful - invalidate queries to ensure fresh data

        // Wait a moment for session to update, then invalidate

        setTimeout(async () => {
          const { getSession } = await import("next-auth/react");

          const updatedSession = await getSession();

          if (updatedSession?.user?.id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.users.account(updatedSession.user.id) });

            queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(updatedSession.user.id) });

            queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(updatedSession.user.id) });
          }
        }, 500);

        // Show success toast

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
      // Use redirect for login page (popup is only for LoginModal)

      await signIn("google", { redirect: false });

      // The useEffect will handle the redirect once the session updates
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
    <div className="h-screen-dvh bg-white dark:bg-neutral-950 flex flex-col lg:flex-row overflow-hidden text-neutral-900 dark:text-neutral-100">
      {/* Left Column - Login Form */}

      <div className="w-full lg:w-[591px] flex flex-col p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
        {/* Logo + theme */}

        <div className="mb-4 sm:mb-6 lg:mb-12 flex items-start justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0">
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
          </Link>
          <ThemeToggleButton className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white/90 shadow-sm transition-all duration-300 hover:scale-105 active:scale-95 dark:border-neutral-600 dark:bg-neutral-900/90" />
        </div>

        {/* Content Section */}

        <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-16">
          {/* Text Section — inline on mobile/tablet, stacked on lg+ */}

          <div className="mb-3 sm:mb-4 lg:mb-6">
            <div className="flex items-baseline gap-2 flex-wrap lg:block">
              <h1 className="text-[24px] sm:text-[28px] lg:text-[40px] font-bold text-neutral-900 dark:text-white tracking-[-1.6px] lg:mb-2">
                Sign in
              </h1>

              <p className="text-[13px] sm:text-[14px] lg:text-[18px] text-neutral-500 dark:text-neutral-400 leading-[1.5]">
                Please login to continue to your account.
              </p>
            </div>
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
                  className="w-full h-[45px] sm:h-[50px] lg:h-[59px] px-4 py-4 border-[1.5px] border-[#d9d9d9] dark:border-neutral-600 rounded-[10px] text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all duration-200"
                  placeholder=""
                  required
                />

                <label className="absolute -top-[10.5px] left-3 bg-white dark:bg-neutral-950 px-1 text-2xs sm:text-[12px] lg:text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
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

            {/* Remember Me + Forgot Password (single row) */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <SquareCheckbox
                  checked={formData.rememberMe}
                  onChange={(checked) => setFormData((prev) => ({ ...prev, rememberMe: checked }))}
                />

                <label className="text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-neutral-800 dark:text-neutral-200">
                  Keep me logged in
                </label>
              </div>

              <Link
                href="/reset-password"
                className="text-[12px] sm:text-[13px] lg:text-[14px] font-medium text-red-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {/* Error Message */}

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Sign In Button */}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[42px] sm:h-[48px] lg:h-[54px] bg-red-500 text-white rounded-[10px] font-semibold text-[14px] sm:text-[16px] lg:text-[18px] tracking-[-0.18px] hover:bg-[#d40000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            {/* Divider */}

            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-px bg-[#d9d9d9] dark:bg-neutral-600"></div>

              <span className="text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-neutral-500 dark:text-neutral-400">
                or
              </span>

              <div className="flex-1 h-px bg-[#d9d9d9] dark:bg-neutral-600"></div>
            </div>

            {/* Google Sign In */}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full h-[42px] sm:h-[48px] lg:h-[54px] bg-white dark:bg-neutral-900 border border-[#e6e8e7] dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 rounded-[10px] font-semibold text-[14px] sm:text-[16px] lg:text-[18px] tracking-[-0.18px] hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.03)] dark:shadow-none"
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          </form>

          {/* Sign Up Link */}

          <div className="mt-3 sm:mt-4 lg:mt-6 text-center">
            <p className="text-[14px] sm:text-[16px] lg:text-[18px] text-neutral-600 dark:text-neutral-400">
              Need an account?{" "}
              <Link
                href="/membership"
                className="text-red-600 font-semibold underline hover:no-underline"
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
          <Image
            src="/images/background/promo/landing/all-prizes/all-prizes-mobile.webp"
            alt="Tools Australia prize collage"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, calc(100vw - 591px)"
            priority
          />
        </div>
        <div className="absolute inset-0 z-[1] bg-black/25 dark:bg-black/55 pointer-events-none" aria-hidden />

        {/* Content Overlay */}

        <div className="relative z-10 h-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="max-w-[525px] w-full">
            {/* Rotating Toolset Card — extra bottom margin clears the overflowing badge chip */}
            <div className="mb-7 sm:mb-9 lg:mb-12">
              <RotatingToolsetCard />
            </div>

            {/* Bottom Text - Hidden on mobile */}

            <div className="hidden sm:block text-center mt-8 sm:mt-12 lg:mt-16 relative z-10">
              <h3 className="text-[20px] sm:text-[28px] lg:text-[40px] font-semibold text-white mb-2 sm:mb-3 lg:mb-4 leading-[1.385]">
                Premium Tools. Member Perks.
              </h3>

              <p className="text-[12px] sm:text-[16px] lg:text-[20px] text-[#cfd9e0] dark:text-neutral-300 leading-[1.385]">
                Track your draw entries and discover member-only partner discounts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen-svh flex items-center justify-center bg-white dark:bg-neutral-950">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500"></div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
