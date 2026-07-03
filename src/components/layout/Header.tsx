"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { totalSignOut } from "@/utils/auth/total-sign-out";
import { useSidebar } from "@/contexts/SidebarContext";
import { useUserContext } from "@/contexts/UserContext";
import { useUserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
// User setup store removed - using unified modal priority system
import { useCart } from "@/contexts/CartContext";
import { useAffiliateAuth } from "@/hooks/useAffiliateAuth";
import { hasPreservedBenefits, getDaysUntilBenefitsExpire } from "@/utils/membership/benefit-resolution";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { formatDisplayName, formatNamePart } from "@/utils/display-name";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { usePermissions } from "@/hooks/usePermissions";
import { environmentFlags } from "@/lib/environment";
import { rewardsEnabled } from "@/config/featureFlags";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import MetallicButton from "@/components/ui/MetallicButton";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";
import MembershipBadge from "@/components/ui/MembershipBadge";
import PackageDetailModal, {
  type PackageDetailModalPackageData,
  type SubscriptionAccumulationData,
} from "@/components/modals/PackageDetailModal";
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  Home,
  Store,
  Ticket,
  Trophy,
  BarChart3,
  Handshake,
  HelpCircle,
  Phone,
  UserCircle,
  Crown,
  LogOut,
  LogIn,
  Trash2,
  Plus,
  Minus,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/utils/cn";

/** Full wordmark: light UI uses default PNG; dark UI uses high-contrast white artwork */
const HEADER_LOGO_LIGHT_SRC = "/images/logo.webp";
const HEADER_LOGO_DARK_SRC = "/images/Tools Australia Logo/White-Text Logo.webp";

/**
 * Leaf component owning the 3s alternation between the membership CTA and the
 * promotional/giveaway CTA in the top bar. Only this small component re-renders
 * on the toggle — the entire Header used to re-render every 3 seconds.
 */
function TopBarPromoLeaf({
  topBarActivePromoMultiplier,
}: {
  topBarActivePromoMultiplier: number | null | undefined;
}) {
  const [slide, setSlide] = useState<0 | 1>(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => (s === 0 ? 1 : 0));
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex-1 min-h-[1.25rem] flex items-center justify-center text-center" aria-live="polite">
      {slide === 0 ? (
        <p
          key="topbar-membership"
          className="text-white text-3xs sm:text-2xs font-normal leading-tight animate-topbar-reappear-once"
        >
          <span className="font-normal">Join Tools Australia for exclusive benefits and prize draws! </span>
          <Link href="/membership" className="font-medium underline hover:text-gray-200 transition-colors">
            Join Now
          </Link>
        </p>
      ) : (
        <p
          key={`topbar-giveaway-${topBarActivePromoMultiplier ?? "none"}`}
          className="text-white text-3xs sm:text-2xs font-normal leading-tight animate-topbar-reappear-once"
        >
          {topBarActivePromoMultiplier != null ? (
            <>
              <span className="font-semibold">{topBarActivePromoMultiplier}x bonus entries</span>
              <span className="font-normal"> are live now — monthly tool giveaway. </span>
            </>
          ) : (
            <span className="font-normal">Monthly tool giveaway. </span>
          )}
          <Link href="/promotion" className="font-medium underline hover:text-gray-200 transition-colors">
            View giveaway
          </Link>
        </p>
      )}
    </div>
  );
}

type HeaderProps = {
  /**
   * Controls whether the header stays fixed to the top of the viewport.
   * Pass false on pages (like promotions) where the header should scroll away with the content.
   */
  isFixed?: boolean;
};

export default function Header({ isFixed = true }: HeaderProps) {
  const { isMobileMenuOpen, setIsMobileMenuOpen, isCartOpen, setIsCartOpen } = useSidebar();
  const [isDesktopUserMenuOpen, setIsDesktopUserMenuOpen] = useState(false);
  const [isMobileUserMenuOpen, setIsMobileUserMenuOpen] = useState(false);
  const { trackSearch } = usePixelTracking();

  // Ref to store scroll position for proper restoration
  const scrollPositionRef = useRef<number>(0);
  // Ref to track if we've completed at least one loading cycle (to ensure auth state is verified)
  const hasCompletedLoadingCycle = useRef<boolean>(false);

  // Debug effect to track user menu state
  useEffect(() => {
    // console.log("🔍 Desktop user menu state changed:", isDesktopUserMenuOpen);
  }, [isDesktopUserMenuOpen]);

  useEffect(() => {
    // console.log("🔍 Mobile user menu state changed:", isMobileUserMenuOpen);
  }, [isMobileUserMenuOpen]);
  const [isResultsMenuOpen, setIsResultsMenuOpen] = useState(false);
  const [isMobileResultsOpen, setIsMobileResultsOpen] = useState(false);
  const [isTopBarHidden, setIsTopBarHidden] = useState(false);
  const [authStateResolved, setAuthStateResolved] = useState(false); // Track if authentication state has been resolved
  // const [wasAuthenticated, // setWasAuthenticated] = useState<boolean | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isClosingMobileMenu, setIsClosingMobileMenu] = useState(false);
  const [isClosingCart, setIsClosingCart] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { items: cartItems, summary, updateCartItem, removeFromCart } = useCart();
  const cartItemCount = summary?.totalItems || 0;
  const { userData, isAuthenticated, loading } = useUserContext();
  const { isStaff } = usePermissions();
  // Additional-pack access = active subscription OR current-draw entries (canonical helper), used by
  // the badge-click PackageDetailModal below so a one-time/past-due entrant with entries gets the
  // discounted one-time packs CTA, not just active subscribers.
  const { data: userMajorDrawStats } = useUserMajorDrawStats(userData?._id);

  const resolvedActivePackage = useMemo(
    () => (userData ? getActivePackage(userData as unknown as ActivePackageUserInput) : null),
    [userData]
  );
  const { requestModal } = useModalPriorityStore();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const router = useRouter();
  const { isAuthenticated: isAffiliateAuthenticated, affiliateData, loading: affiliateLoading } = useAffiliateAuth();

  // Package detail modal (badge click)
  const [packageDetailModalOpen, setPackageDetailModalOpen] = useState(false);
  const [packageDetailModalData, setPackageDetailModalData] = useState<{
    packageData: PackageDetailModalPackageData;
    membershipType: "subscription" | "one-time";
    accumulation: SubscriptionAccumulationData | null;
  } | null>(null);

  const openPackageDetailModal = useCallback(
    (packageData: PackageDetailModalPackageData, membershipType: "subscription" | "one-time") => {
      let accumulation: SubscriptionAccumulationData | null = null;
      if (membershipType === "subscription" && packageData.entriesPerMonth != null) {
        const sub = userData?.subscription as { lastMonthAccumulatedEntries?: number; packageId?: string } | undefined;
        accumulation = {
          entriesPerMonth: packageData.entriesPerMonth,
          lastMonthAccumulatedEntries: sub?.lastMonthAccumulatedEntries ?? packageData.entriesPerMonth,
        };
      }
      setPackageDetailModalData({ packageData, membershipType, accumulation });
      setPackageDetailModalOpen(true);
    },
    [userData?.subscription]
  );
  // Setup requirement check - includes birthdate for existing users who haven't set it
  const checkSetupRequired = (userData: unknown) => {
    const u = userData as { profileSetupCompleted?: boolean; birthdate?: string | Date } | null;
    if (!u) return true;
    if (!u.profileSetupCompleted) return true;
    const hasBirthdate = !!(u.birthdate && String(u.birthdate).trim().length > 0);
    return !hasBirthdate;
  };

  // Check if user needs setup
  const isSetupRequired = checkSetupRequired(userData);

  // Check if user needs email verification (has password and state but not email verified)
  // Only show this if email verification is mandatory
  const needsEmailVerification =
    userData &&
    userData.profileSetupCompleted &&
    !userData.isEmailVerified &&
    environmentFlags.emailVerificationMandatory();

  // Function to trigger user setup modal
  const forceShowSetupModal = () => {
    requestModal("user-setup", true); // true = force show
  };

  // Function to trigger email verification modal
  const forceShowEmailVerificationModal = () => {
    requestModal("user-setup", true, { initialStep: 3 }); // true = force show, start at step 3
  };

  // Debug logging for header setup detection
  // console.log("🔍 Header - Setup detection:", {
  //   isAuthenticated,
  //   isSetupRequired,
  //   hasUserData: !!userData,
  //   profileSetupCompleted: userData?.profileSetupCompleted,
  //   userId: userData?._id,
  //   isTopBarHidden,
  //   shouldShowSetupBar: isAuthenticated && isSetupRequired,
  // });
  const pathname = usePathname();
  const isRewardsFeatureEnabled = rewardsEnabled();

  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  /** Same pick as PrizeShowcase hero: membership multiplier if >1, else one-time. */
  const topBarActivePromoMultiplier = useMemo(() => {
    if (resolvedMembershipMultiplier != null && resolvedMembershipMultiplier > 1) {
      return resolvedMembershipMultiplier;
    }
    if (resolvedOneTimeMultiplier != null && resolvedOneTimeMultiplier > 1) {
      return resolvedOneTimeMultiplier;
    }
    return null;
  }, [resolvedMembershipMultiplier, resolvedOneTimeMultiplier]);

  // Check if we're on an affiliate page or login page (hide top bar on these pages)
  const isAffiliatePage = pathname?.startsWith("/affiliate");
  const isLoginPage = pathname === "/login";
  const shouldHideTopBar = isAffiliatePage || isLoginPage;


  // Handle mobile menu close with animation
  const handleCloseMobileMenu = useCallback(() => {
    // console.log("🔍 Closing mobile menu - Saved scroll position:", scrollPositionRef.current);

    setIsClosingMobileMenu(true);
    setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsClosingMobileMenu(false);
    }, 300);
  }, [setIsMobileMenuOpen]);

  // Handle cart close with animation
  const handleCloseCart = useCallback(() => {
    // console.log("🛒 Closing cart - Saved scroll position:", scrollPositionRef.current);

    setIsClosingCart(true);
    setTimeout(() => {
      setIsCartOpen(false);
      setIsClosingCart(false);
    }, 300);
  }, [setIsCartOpen]);

  // Handle keyboard navigation (Escape key with animation)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Use animated close functions for sidebars
        if (isMobileMenuOpen) {
          handleCloseMobileMenu();
        }
        if (isCartOpen) {
          handleCloseCart();
        }
        // Instant close for other overlays
        setIsDesktopUserMenuOpen(false);
        setIsMobileUserMenuOpen(false);
        setIsResultsMenuOpen(false);
        setIsMobileResultsOpen(false);
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen, isCartOpen, handleCloseMobileMenu, handleCloseCart]);

  // Note: the 3s top-bar promo alternation is now owned by <TopBarPromoLeaf>
  // so the entire Header no longer re-renders every 3 seconds.

  // Initialize localStorage values on mount for better UX
  useEffect(() => {
    // Check if user has previously hidden the top bar
    const topBarHidden = localStorage.getItem("topBarHidden") === "true";
    setIsTopBarHidden(topBarHidden);

    // Check if user was previously authenticated (for UI hints only)
    const prevAuthState = localStorage.getItem("wasAuthenticated");
    if (prevAuthState !== null) {
      // setWasAuthenticated(prevAuthState === "true");
    }
  }, []);

  // Track when authentication state has been fully resolved
  useEffect(() => {
    // Mark that we've completed a loading cycle once loading becomes false
    if (!loading) {
      hasCompletedLoadingCycle.current = true;
    }

    // Auth state is resolved when:
    // 1. We've completed at least one loading cycle (ensures we've actually checked)
    // 2. Loading is complete
    // 3. We have a definitive answer: userData exists (authenticated) OR confirmed not authenticated
    if (!loading && hasCompletedLoadingCycle.current) {
      // Only mark as resolved if we have userData (authenticated) OR we've confirmed no session exists
      // This prevents showing the bar before we've actually verified the auth state
      const isResolved = userData !== null || !isAuthenticated;
      if (isResolved) {
        setAuthStateResolved(true);
      }
    } else {
      // Reset resolved state when loading starts (e.g., on page reload)
      setAuthStateResolved(false);
    }
  }, [loading, userData, isAuthenticated]);

  // Update localStorage when authentication status changes (for UI hints only)
  useEffect(() => {
    if (isAuthenticated !== undefined) {
      localStorage.setItem("wasAuthenticated", isAuthenticated.toString());
      // setWasAuthenticated(isAuthenticated);

      // If user is authenticated, only hide top bar if they don't need setup
      if (isAuthenticated) {
        // console.log("🔍 Header - Top bar visibility logic:", {
        //   isAuthenticated,
        //   isSetupRequired,
        //   willHideTopBar: !isSetupRequired,
        // });

        // Only hide if user has completed profile setup
        if (!isSetupRequired) {
          setIsTopBarHidden(true);
          localStorage.setItem("topBarHidden", "true");
        } else {
          // User needs setup, ensure top bar is visible
          setIsTopBarHidden(false);
          localStorage.removeItem("topBarHidden");
        }
      }
    }
  }, [isAuthenticated, isSetupRequired]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSearchOpen(false);
    setIsCartOpen(false);
    setIsResultsMenuOpen(false);
    setIsMobileResultsOpen(false);
  }, [pathname, setIsMobileMenuOpen, setIsCartOpen]);

  // Handle click outside for Results dropdown and user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const resultsDropdown = document.querySelector(".results-dropdown-container");
      const desktopUserMenu = document.querySelector(".desktop-user-menu-container");
      const mobileUserMenu = document.querySelector(".mobile-user-menu-container");
      const target = event.target as Element;

      // Close Results dropdown if clicking outside
      if (isResultsMenuOpen && resultsDropdown && !resultsDropdown.contains(target)) {
        setIsResultsMenuOpen(false);
      }

      // Close desktop user menu if clicking outside
      if (isDesktopUserMenuOpen && desktopUserMenu && !desktopUserMenu.contains(target)) {
        // console.log("🖱️ Clicking outside desktop user menu, closing it");
        setIsDesktopUserMenuOpen(false);
      }

      // Close mobile user menu if clicking outside
      if (isMobileUserMenuOpen && mobileUserMenu && !mobileUserMenu.contains(target)) {
        // console.log("🖱️ Clicking outside mobile user menu, closing it");
        setIsMobileUserMenuOpen(false);
      }
    };

    // Add both mouse and touch events for better mobile support
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isResultsMenuOpen, isDesktopUserMenuOpen, isMobileUserMenuOpen]);

  // Disable background scrolling when sidebars are open
  useEffect(() => {
    if (isMobileMenuOpen || isCartOpen) {
      // Save scroll position to ref
      scrollPositionRef.current = window.scrollY;

      // Disable scrolling
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.width = "100%";
    } else {
      // Re-enable scrolling
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";

      // Restore scroll position from ref
      if (scrollPositionRef.current > 0) {
        window.scrollTo(0, scrollPositionRef.current);
        scrollPositionRef.current = 0;
      }
    }

    // Cleanup function to restore scrolling if component unmounts
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, [isMobileMenuOpen, isCartOpen]);

  const handleSignOut = () => {
    setIsTopBarHidden(false);
    // Total sign-out: clears user-scoped client storage, then ends the session.
    void totalSignOut({ callbackUrl: "/" });
  };

  const handleAffiliateLogout = async () => {
    try {
      await fetch("/api/affiliate/logout", { method: "POST" });
      window.location.href = "/affiliate/login";
    } catch (error) {
      console.error("Error logging out affiliate:", error);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Track search event for pixel tracking
      trackSearch(searchQuery.trim());

      // TODO: Implement search functionality
      // console.log("Searching for:", searchQuery);
      setIsSearchOpen(false);
      setSearchQuery("");
    }
  };

  // Helper function to check if a link is active
  const isActiveLink = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  // Helper function to check if Results dropdown should be active
  const isResultsActive = () => {
    return pathname.startsWith("/draw-results");
  };

  return (
    <header
      data-sticky="true"
      className={`bg-white dark:bg-neutral-900 ${
        isFixed ? "fixed top-0 left-0 right-0 z-40" : "relative"
      } shadow-sm dark:shadow-none dark:border-b dark:border-neutral-800 w-full overflow-visible`}
    >
      {/* Top Bar - Promotional or Setup Reminder - Only show when authentication state is fully resolved */}
      {/* Hidden by default, only shows after auth state is confirmed (userData exists OR confirmed not authenticated) */}
      {/* Also hidden on affiliate and login pages */}
      {!isTopBarHidden && authStateResolved && !shouldHideTopBar && (
        <div
          data-top-bar
          className={`w-full flex items-center justify-center relative z-[1] animate-slideDown shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${
            isAuthenticated && isSetupRequired
              ? "bg-blue-600 h-[24px] sm:h-[28px]" // Blue for setup reminder
              : "bg-red-600 h-[24px] sm:h-[28px]" // Red for promotional — single line, rotating CTAs
          }`}
        >
          <div
            className={`flex w-full px-2 sm:px-3 overflow-hidden items-center justify-center ${
              isAuthenticated && isSetupRequired ? "" : "pr-7 sm:pr-8"
            }`}
          >
            {isAuthenticated && isSetupRequired ? (
              <p className="text-white text-3xs sm:text-2xs font-normal leading-tight text-center flex-1 animate-topbar-reappear">
                <span className="font-normal">Complete your profile to set up email/password login. </span>
                <button
                  onClick={forceShowSetupModal}
                  className="font-medium underline hover:text-gray-200 transition-colors"
                >
                  Complete Profile
                </button>
              </p>
            ) : (
              <TopBarPromoLeaf topBarActivePromoMultiplier={topBarActivePromoMultiplier} />
            )}
          </div>
          <button
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 hover:bg-white/20 rounded-full transition-colors flex items-center justify-center touch-manipulation"
            onClick={() => setIsTopBarHidden(true)}
            aria-label="Close banner"
            suppressHydrationWarning
          >
            <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
          </button>
        </div>
      )}

      {/* Main Navigation - Viewport Width Only */}
      <nav className="bg-white dark:bg-neutral-900 flex items-center justify-between py-0 h-[60px] sm:h-[72px] border-b border-gray-100 dark:border-neutral-800 w-full relative">
        <div className="w-full px-2 sm:px-3  xl:px-20 flex items-center justify-between relative">
          {/* Left Side - Hamburger Menu (Mobile/Tablet) */}
          <div className="flex items-center">
            {/* Mobile Menu Button - Left Side with Animation */}
            <button
              className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 text-gray-700 dark:text-white hover:text-white transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-full hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 hover:scale-105 flex items-center justify-center touch-manipulation mr-1 sm:mr-2 group"
              onClick={() => (isMobileMenuOpen ? handleCloseMobileMenu() : setIsMobileMenuOpen(true))}
              aria-label="Toggle mobile menu"
              suppressHydrationWarning
            >
              <div className="relative w-5 h-5 sm:w-6 sm:h-6">
                {/* Animated Hamburger/X Icon */}
                <div
                  className={`absolute inset-0 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] ${
                    isMobileMenuOpen ? "rotate-180 opacity-0" : "rotate-0 opacity-100"
                  }`}
                >
                  <Menu className="h-full w-full group-hover:scale-110 transition-transform duration-200" />
                </div>
                <div
                  className={`absolute inset-0 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] ${
                    isMobileMenuOpen ? "rotate-0 opacity-100" : "rotate-180 opacity-0"
                  }`}
                >
                  <X className="h-full w-full group-hover:scale-110 transition-transform duration-200" />
                </div>
              </div>
            </button>

            {/* Logo - Optimized for Viewport Width */}
            <Link href="/" className="flex-shrink-0 touch-manipulation">
              <div className="relative h-[30px] w-[92px] sm:h-[40px] sm:w-[122px] lg:h-[48px] lg:w-[150px] flex items-center justify-center">
                <Image
                  src={HEADER_LOGO_LIGHT_SRC}
                  alt="Tools Australia"
                  width={160}
                  height={52}
                  className="h-full w-full object-contain dark:hidden"
                  sizes="(max-width: 640px) 92px, (max-width: 1024px) 122px, 150px"
                  priority
                />
                <Image
                  src={HEADER_LOGO_DARK_SRC}
                  alt="Tools Australia"
                  width={160}
                  height={52}
                  className="hidden h-full w-full object-contain dark:block"
                  sizes="(max-width: 640px) 92px, (max-width: 1024px) 122px, 150px"
                  priority
                />
              </div>
            </Link>
          </div>

          {/* Desktop Navigation - Hidden on Mobile/Tablet */}
          <div className="hidden lg:flex items-center gap-3 xl:gap-2">
            <Link
              href="/"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/") ? "page" : undefined}
            >
              Home
            </Link>
            <Link
              href="/shop"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/shop")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/shop") ? "page" : undefined}
            >
              Shop
            </Link>
            <Link
              href="/mini-draws"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/mini-draws")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/mini-draws") ? "page" : undefined}
            >
              Mini Draws
            </Link>
            <Link
              href="/membership"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/membership")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/membership") ? "page" : undefined}
            >
              Membership
            </Link>
            {isAuthenticated && isRewardsFeatureEnabled && (
              <Link
                href="/rewards"
                className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                  isActiveLink("/rewards")
                    ? "text-white bg-red-600"
                    : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
                }`}
                aria-current={isActiveLink("/rewards") ? "page" : undefined}
              >
                Rewards
              </Link>
            )}
            {/* Results Dropdown */}
            <div className="relative results-dropdown-container">
              <button
                onClick={() => setIsResultsMenuOpen(!isResultsMenuOpen)}
                suppressHydrationWarning
                className={`flex items-center gap-1 text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                  isResultsActive()
                    ? "text-white bg-red-600"
                    : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
                }`}
              >
                Results
                <ChevronDown
                  className={cn("w-4 h-4 transition-transform duration-200", isResultsMenuOpen ? "rotate-180" : "")}
                />
              </button>

              {isResultsMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-gray-200 dark:border-neutral-700 py-2 z-[75] animate-fade-in">
                  <Link
                    href="/draw-results"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                    onClick={() => setIsResultsMenuOpen(false)}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Draw Results
                  </Link>
                  <Link
                    href="/winners"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                    onClick={() => setIsResultsMenuOpen(false)}
                  >
                    <Trophy className="w-4 h-4" />
                    Winners 
                  </Link>
                </div>
              )}
            </div>
            <Link
              href="/partner"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/partner")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/partner") ? "page" : undefined}
            >
              Become a Partner
            </Link>
            <Link
              href="/faq"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/faq")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/faq") ? "page" : undefined}
            >
              FAQ
            </Link>
            <Link
              href="/contact"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/contact")
                  ? "text-white bg-red-600"
                  : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/contact") ? "page" : undefined}
            >
              Contact
            </Link>
          </div>

          {/* Right Side - User Stats and Icons */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Affiliate Navigation - Show when affiliate is logged in */}
            {!affiliateLoading && isAffiliateAuthenticated && affiliateData && (
              <div className="hidden lg:flex items-center gap-4">
                <Link
                  href="/affiliate"
                  className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                    pathname.startsWith("/affiliate")
                      ? "text-white bg-red-600"
                      : "text-black dark:text-white hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
                  }`}
                >
                  Dashboard
                </Link>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                  <span className="font-medium">{affiliateData.name}</span>
                </div>
                <button
                  onClick={handleAffiliateLogout}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:text-red-600 transition-colors duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
            {/* User Stats Display - Desktop Only - Clickable */}
            {!affiliateLoading && !isAffiliateAuthenticated && isAuthenticated && userData && (
              <div className="hidden lg:flex items-center gap-4">
                {/* User Info with Stats - Clickable */}
                <div className="relative desktop-user-menu-container">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsDesktopUserMenuOpen(!isDesktopUserMenuOpen)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setIsDesktopUserMenuOpen(!isDesktopUserMenuOpen);
                      }
                    }}
                    className="flex items-center gap-3 text-right rounded-full border border-gray-200 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-[var(--ta-blur)] transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] hover:scale-105 hover:shadow-md cursor-pointer dark:border-gray-700 dark:bg-black/90"
                  >
                    <div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 transition-colors">
                            {formatNamePart(userData?.firstName)}
                          </span>
                          {(() => {
                            // Prioritize subscription over one-time packages
                            if (
                              resolvedActivePackage?.source === "subscription" &&
                              resolvedActivePackage.packageData &&
                              userData?.subscription?.isActive
                            ) {
                              const pkg = resolvedActivePackage.packageData;
                              return (
                                <MembershipBadge
                                  packageData={pkg}
                                  isActive={userData.subscription.isActive}
                                  membershipType="subscription"
                                  onClick={() => {
                                    setIsDesktopUserMenuOpen(false);
                                    openPackageDetailModal(pkg, "subscription");
                                  }}
                                />
                              );
                            } else if (
                              userData.enrichedOneTimePackages &&
                              userData.enrichedOneTimePackages.length > 0
                            ) {
                              const queue = (userData as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
                              const activePackageIds = new Set(
                                queue
                                  .filter(
                                    (item) =>
                                      item.status === "active" &&
                                      ["one-time", "mini-draw", "upsell"].includes(item.packageType)
                                  )
                                  .map((item) => String(item.packageId))
                              );
                              const activePackage = userData.enrichedOneTimePackages
                                .filter(
                                  (pkg) =>
                                    pkg.isActive &&
                                    pkg.packageData &&
                                    activePackageIds.has(String(pkg.packageId))
                                )
                                .sort(
                                  (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
                                )[0];
                              if (activePackage?.packageData) {
                                return (
                                  <MembershipBadge
                                    packageData={activePackage.packageData}
                                    isActive={activePackage.isActive}
                                    membershipType="one-time"
                                    onClick={() => {
                                      setIsDesktopUserMenuOpen(false);
                                      openPackageDetailModal(activePackage.packageData!, "one-time");
                                    }}
                                  />
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                        {/* Show preserved benefits countdown if user has downgraded */}
                        {userData &&
                          hasPreservedBenefits(userData as unknown as Partial<import("@/models/User").IUser>) && (
                            <div className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                              <Clock className="w-3 h-3" />
                              Premium benefits:{" "}
                              {getDaysUntilBenefitsExpire(
                                userData as unknown as Partial<import("@/models/User").IUser>
                              )}{" "}
                              days left
                            </div>
                          )}
                      </div>
                    </div>
                  </div>

                  {/* User Menu Dropdown */}
                  {isDesktopUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-gray-200 dark:border-neutral-700 py-2 z-[75] animate-fade-in">
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-neutral-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDisplayName(userData?.firstName, userData?.lastName)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-neutral-400">{userData?.email}</p>
                      </div>
                      {isStaff ? (
                        <>
                          <Link
                            href="/admin"
                            className="block px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            Admin Dashboard
                          </Link>
                        </>
                      ) : (
                        <>
                          {/* Email Verification Option - Show if user has completed profile but not verified email */}
                          {needsEmailVerification && (
                            <button
                              onClick={() => {
                                setIsDesktopUserMenuOpen(false);
                                forceShowEmailVerificationModal();
                              }}
                              className="block w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 font-medium"
                            >
                              Verify Email
                            </button>
                          )}
                          {/* Complete Profile Option - Show if setup is required and not email verification */}
                          {isSetupRequired && !needsEmailVerification && (
                            <button
                              onClick={() => {
                                setIsDesktopUserMenuOpen(false);
                                forceShowSetupModal();
                              }}
                              className="block w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 font-medium"
                            >
                              Complete Profile
                            </button>
                          )}
                          <Link
                            href="/my-account"
                            className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            <UserCircle className="w-4 h-4 text-red-500" />
                            My Account
                          </Link>
                          <Link
                            href="/my-account/rewards"
                            className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            <Handshake className="w-4 h-4 text-red-500" />
                            Partner Benefits
                          </Link>
                          <Link
                            href="/draw-results"
                            className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            <Trophy className="w-4 h-4 text-red-500" />
                            Draw Results
                          </Link>
                        </>
                      )}
                      <hr className="my-2 border-gray-100 dark:border-neutral-700" />
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Affiliate Mobile Menu */}
            {!affiliateLoading && isAffiliateAuthenticated && affiliateData && (
              <div className="lg:hidden flex items-center gap-2">
                <Link
                  href="/affiliate"
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:text-red-600 transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleAffiliateLogout}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* User Badge Display - Mobile Only */}
            {!affiliateLoading && !isAffiliateAuthenticated && isAuthenticated && userData && (
              <div className="lg:hidden flex items-center">
                {(() => {
                  if (
                    resolvedActivePackage?.source === "subscription" &&
                    resolvedActivePackage.packageData &&
                    userData?.subscription?.isActive
                  ) {
                    const pkg = resolvedActivePackage.packageData;
                    return (
                      <MembershipBadge
                        packageData={pkg}
                        isActive={userData.subscription.isActive}
                        membershipType="subscription"
                        onClick={() => openPackageDetailModal(pkg, "subscription")}
                      />
                    );
                  } else if (userData.enrichedOneTimePackages && userData.enrichedOneTimePackages.length > 0) {
                    const queue = (userData as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
                    const activePackageIds = new Set(
                      queue
                        .filter(
                          (item) =>
                            item.status === "active" &&
                            ["one-time", "mini-draw", "upsell"].includes(item.packageType)
                        )
                        .map((item) => String(item.packageId))
                    );
                    const activePackage = userData.enrichedOneTimePackages
                      .filter(
                        (pkg) =>
                          pkg.isActive &&
                          pkg.packageData &&
                          activePackageIds.has(String(pkg.packageId))
                      )
                      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
                    if (activePackage?.packageData) {
                      return (
                        <MembershipBadge
                          packageData={activePackage.packageData}
                          isActive={activePackage.isActive}
                          membershipType="one-time"
                          onClick={() => openPackageDetailModal(activePackage.packageData!, "one-time")}
                        />
                      );
                    }
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Theme (replaces cart until shop is live) */}
            <div className="relative z-10 flex items-center justify-center">
              <ThemeToggleButton
                className="group relative flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow-md backdrop-blur-[var(--ta-blur)] transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] hover:scale-110 hover:shadow-lg active:scale-95 dark:border-gray-700 dark:bg-black/90 sm:h-10 sm:w-10 lg:h-11 lg:w-11 [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5"
              />
            </div>
            {/* Login Button for Mobile - Show when not authenticated (user or affiliate) */}
            {!affiliateLoading && !isAffiliateAuthenticated && !isAuthenticated && (
              <Link
                href="/login"
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-white rounded-lg bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_8px_rgba(238,0,0,0.35)] hover:from-red-700 hover:to-red-800 hover:shadow-[0_0_12px_rgba(238,0,0,0.5)] transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] border border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                aria-label="Login to your account"
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Login</span>
              </Link>
            )}
            {/* User Menu - Only show user icon on mobile when logged in */}
            {isAuthenticated && userData && (
              <div className="relative mobile-user-menu-container lg:hidden">
                <button
                  onClick={() => {
                    // console.log("🖱️ Mobile user menu button clicked - isMobileUserMenuOpen:", isMobileUserMenuOpen);
                    // console.log("🖱️ Setting isMobileUserMenuOpen to:", !isMobileUserMenuOpen);
                    setIsMobileUserMenuOpen(!isMobileUserMenuOpen);
                  }}
                  className="relative z-50 flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow-md backdrop-blur-[var(--ta-blur)] transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] hover:scale-105 hover:shadow-lg active:scale-95 dark:border-gray-700 dark:bg-black/90 sm:h-10 sm:w-10 text-gray-700 dark:text-neutral-200 hover:text-red-600"
                  aria-label="User menu"
                  type="button"
                >
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>

                {isMobileUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-gray-200 dark:border-neutral-700 py-2 z-[75] animate-fade-in">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-neutral-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDisplayName(userData?.firstName, userData?.lastName)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-neutral-400">{userData?.email}</p>
                    </div>
                    {isStaff ? (
                      <>
                        <Link
                          href="/admin"
                          className="block px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          Admin Dashboard
                        </Link>
                      </>
                    ) : (
                      <>
                        {/* Email Verification Option - Show if user has completed profile but not verified email */}
                        {needsEmailVerification && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsMobileUserMenuOpen(false);
                              forceShowEmailVerificationModal();
                            }}
                            className="block w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 font-medium"
                            type="button"
                          >
                            Verify Email
                          </button>
                        )}
                        {/* Complete Profile Option - Show if setup is required and not email verification */}
                        {isSetupRequired && !needsEmailVerification && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsMobileUserMenuOpen(false);
                              forceShowSetupModal();
                            }}
                            className="block w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 font-medium"
                            type="button"
                          >
                            Complete Profile
                          </button>
                        )}
                        <Link
                          href="/my-account"
                          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          <UserCircle className="w-4 h-4 text-red-500" />
                          My Account
                        </Link>
                        <Link
                          href="/my-account/rewards"
                          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          <Handshake className="w-4 h-4 text-red-500" />
                          Partner Benefits
                        </Link>
                        <Link
                          href="/draw-results"
                          className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          <Trophy className="w-4 h-4 text-red-500" />
                          Draw Results
                        </Link>
                      </>
                    )}
                    <hr className="my-2 border-gray-100 dark:border-neutral-700" />
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-150"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Login Link for Non-Authenticated Users - Desktop Only */}
            {!affiliateLoading && !isAffiliateAuthenticated && !isAuthenticated && (
              <Link
                href="/login"
                className="hidden lg:inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_12px_rgba(238,0,0,0.35)] hover:from-red-700 hover:to-red-800 hover:shadow-[0_0_16px_rgba(238,0,0,0.5)] transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] border border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Login to your account"
              >
                <LogIn className="w-4 h-4" />
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Search Overlay - Viewport Width Only */}
      {isSearchOpen && (
        <div className="lg:hidden fixed inset-0 bg-white dark:bg-neutral-900 z-[55] animate-fade-in overflow-hidden w-full">
          <div className="flex items-center justify-between p-2 sm:p-3 border-b border-gray-200 dark:border-neutral-700 w-full">
            <form onSubmit={handleSearchSubmit} className="flex-1 mr-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full px-3 py-2.5 pl-10 pr-3 text-sm sm:text-base border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-neutral-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  autoFocus
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-neutral-500" />
              </div>
            </form>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="w-9 h-9 flex items-center justify-center text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:text-neutral-200 dark:hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-2 sm:p-3 overflow-y-auto w-full brand-scrollbar">
            <p className="text-sm text-gray-500 dark:text-neutral-400 mb-2">Popular searches:</p>
            <div className="flex flex-wrap gap-2">
              {["Power Tools", "Hand Tools", "Safety Equipment", "Cordless Drills"].map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setSearchQuery(term);
                    const formEvent = new Event("submit", {
                      bubbles: true,
                      cancelable: true,
                    }) as unknown as React.FormEvent<HTMLFormElement>;
                    handleSearchSubmit(formEvent);
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 rounded-full hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Navigation - Modern Slide-in */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[110]">
          {/* Backdrop Overlay with Blur */}
          <div className="absolute inset-0 bg-black/50 sidebar-overlay animate-fade-in" />

          {/* Sidebar */}
          <div
            className={`mobile-menu-container absolute top-0 left-0 h-full w-80 max-w-[85vw] bg-white dark:bg-neutral-900 z-10 shadow-2xl ${
              isClosingMobileMenu ? "sidebar-slide-out" : "sidebar-slide-in"
            } flex flex-col`}
            role="navigation"
            aria-label="Mobile navigation menu"
            tabIndex={-1}
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-red-600 to-red-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex items-center justify-center">
                  <Image
                    src="/images/Tools Australia Logo/Social Media Profile_Primary.webp"
                    alt="Tools Australia"
                    width={40}
                    height={40}
                    className="object-contain rounded-full"
                    sizes="40px"
                  />
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Tools Australia</h2>
                  <p className="text-white/80 text-sm">Premium Tool Store</p>
                </div>
              </div>
              <button
                onClick={handleCloseMobileMenu}
                className="w-8 h-8 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Affiliate Profile Section */}
            {!affiliateLoading && isAffiliateAuthenticated && affiliateData && (
              <div className="p-4 bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{affiliateData.name}</p>
                    <p className="text-sm text-gray-600 dark:text-neutral-400">{affiliateData.email}</p>
                  </div>
                </div>
              </div>
            )}
            {/* User Profile Section */}
            {!affiliateLoading && !isAffiliateAuthenticated && isAuthenticated && userData && (
              <div className="p-4 bg-gray-50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatDisplayName(userData?.firstName, userData?.lastName)}
                      </p>
                      {(() => {
                        if (
                          resolvedActivePackage?.source === "subscription" &&
                          resolvedActivePackage.packageData &&
                          userData?.subscription?.isActive
                        ) {
                          const pkg = resolvedActivePackage.packageData;
                          return (
                            <MembershipBadge
                              packageData={pkg}
                              isActive={userData.subscription.isActive}
                              membershipType="subscription"
                            />
                          );
                        } else if (userData?.enrichedOneTimePackages && userData.enrichedOneTimePackages.length > 0) {
                          const queue = (userData as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
                          const activePackageIds = new Set(
                            queue
                              .filter(
                                (item) =>
                                  item.status === "active" &&
                                  ["one-time", "mini-draw", "upsell"].includes(item.packageType)
                              )
                              .map((item) => String(item.packageId))
                          );
                          const activePackage = userData.enrichedOneTimePackages
                            .filter(
                              (pkg) =>
                                pkg.isActive &&
                                pkg.packageData &&
                                activePackageIds.has(String(pkg.packageId))
                            )
                            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
                          if (activePackage && activePackage.packageData) {
                            return (
                              <MembershipBadge
                                packageData={activePackage.packageData}
                                isActive={activePackage.isActive}
                                membershipType="one-time"
                              />
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-gray-600 dark:text-neutral-400">Major Draw Active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Links - Scrollable Area */}
            <div className="flex-1 overflow-y-auto brand-scrollbar">
              <nav className="p-4 space-y-2">
                <Link
                  href="/"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/") ? "text-white bg-red-600" : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Home className="w-5 h-5" />
                  Home
                </Link>

                <Link
                  href="/shop"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/shop")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Store className="w-5 h-5" />
                  Shop
                </Link>

                <Link
                  href="/mini-draws"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/mini-draws")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                  aria-current={isActiveLink("/mini-draws") ? "page" : undefined}
                >
                  <Ticket className="w-5 h-5" />
                  Mini Draws
                </Link>

                <Link
                  href="/membership"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/membership")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                  aria-current={isActiveLink("/membership") ? "page" : undefined}
                >
                  <Crown className="w-5 h-5" />
                  Membership
                </Link>

                {isAuthenticated && isRewardsFeatureEnabled && (
                  <Link
                    href="/rewards"
                    className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                      isActiveLink("/rewards")
                        ? "text-white bg-red-600"
                        : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    }`}
                    onClick={handleCloseMobileMenu}
                  >
                    <Trophy className="w-5 h-5" />
                    Rewards
                  </Link>
                )}

                {/* Results Collapsible Section */}
                <div>
                  <button
                    onClick={() => setIsMobileResultsOpen(!isMobileResultsOpen)}
                    className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium w-full ${
                      isResultsActive()
                        ? "text-white bg-red-600"
                        : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <Trophy className="w-5 h-5" />
                    Results
                    <ChevronDown
                      className={`w-5 h-5 ml-auto transition-transform duration-200 ${
                        isMobileResultsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isMobileResultsOpen && (
                    <div className="ml-8 mt-2 space-y-1">
                      <Link
                        href="/draw-results"
                        className={`sidebar-item flex items-center gap-3 py-2 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-sm font-medium ${
                          isActiveLink("/draw-results")
                            ? "text-white bg-red-600"
                            : "text-gray-600 dark:text-neutral-400 hover:text-red-600 hover:bg-gray-50"
                        }`}
                        onClick={handleCloseMobileMenu}
                      >
                        <BarChart3 className="w-4 h-4" />
                        Draw Results
                      </Link>
                      <Link
                        href="/winners"
                        className={`sidebar-item flex items-center gap-3 py-2 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-sm font-medium ${
                          isActiveLink("/winners")
                            ? "text-white bg-red-600"
                            : "text-gray-600 dark:text-neutral-400 hover:text-red-600 hover:bg-gray-50"
                        }`}
                        onClick={handleCloseMobileMenu}
                      >
                        <Trophy className="w-4 h-4" />
                        Winners Hall of Fame
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  href="/partner"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/partner")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Handshake className="w-5 h-5" />
                  Become a Partner
                </Link>

                <Link
                  href="/faq"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/faq")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <HelpCircle className="w-5 h-5" />
                  FAQ
                </Link>

                <Link
                  href="/contact"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium ${
                    isActiveLink("/contact")
                      ? "text-white bg-red-600"
                      : "text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Phone className="w-5 h-5" />
                  Contact
                </Link>

                {/* Affiliate Links */}
                {!affiliateLoading && isAffiliateAuthenticated && affiliateData && (
                  <>
                    <div className="border-t border-gray-200 my-4"></div>
                    <Link
                      href="/affiliate"
                      className="flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      onClick={handleCloseMobileMenu}
                    >
                      <UserCircle className="w-5 h-5" />
                      Dashboard
                    </Link>
                  </>
                )}
                {/* User Account Links */}
                {!affiliateLoading && !isAffiliateAuthenticated && isAuthenticated && userData && (
                  <>
                    <div className="border-t border-gray-200 my-4"></div>
                    <Link
                      href="/my-account"
                      className="flex items-center gap-3 py-3 px-3 transition-[colors,transform,opacity] duration-[var(--ta-transition-dur)] rounded-xl text-base font-medium text-gray-700 dark:text-neutral-200 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-neutral-800"
                      onClick={handleCloseMobileMenu}
                    >
                      <UserCircle className="w-5 h-5" />
                      My Account
                    </Link>
                  </>
                )}
              </nav>
            </div>

            {/* Sidebar Footer - Always at Bottom */}
            <div className="border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex-shrink-0">
              <div className="p-4">
                {!affiliateLoading && isAffiliateAuthenticated ? (
                  <button
                    onClick={() => {
                      handleAffiliateLogout();
                      handleCloseMobileMenu();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                ) : isAuthenticated ? (
                  <button
                    onClick={() => {
                      handleSignOut();
                      handleCloseMobileMenu();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
                    onClick={handleCloseMobileMenu}
                  >
                    <LogIn className="w-5 h-5" />
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sidebar - Slide-in from Right */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[110]">
          {/* Backdrop Overlay with Blur */}
          <div className="absolute inset-0 bg-black/50 sidebar-overlay animate-fade-in" />

          {/* Cart Sidebar */}
          <div
            className={`cart-sidebar-container absolute top-0 right-0 h-full w-96 max-w-[90vw] bg-white dark:bg-neutral-900 z-10 shadow-2xl ${
              isClosingCart ? "sidebar-slide-out-right" : "sidebar-slide-in-right"
            } flex flex-col`}
          >
            {/* Cart Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-neutral-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 flex-shrink-0">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-6 w-6 text-gray-700 dark:text-neutral-200" />
                <div>
                  <h2 className="text-gray-900 dark:text-white font-bold text-lg">Shopping Cart</h2>
                  <p className="text-gray-600 dark:text-neutral-400 text-sm">
                    {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseCart}
                className="w-8 h-8 text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:text-neutral-200 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-neutral-700 rounded-full transition-colors flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items - Scrollable Area */}
            <div className="flex-1 overflow-y-auto brand-scrollbar">
              {cartItems.length > 0 ? (
                <div className="p-4 space-y-4">
                  {cartItems.map((item) => {
                    const cartItem = item;
                    const itemPrice = typeof cartItem.price === "number" && !isNaN(cartItem.price) ? cartItem.price : 0;

                    const itemName = cartItem.product?.name || cartItem.miniDraw?.name || "Unknown Item";

                    const itemImage =
                      cartItem.product?.images?.[0] ||
                      cartItem.miniDraw?.prize?.images?.[0] ||
                      "/images/placeholder.jpg";

                    const handleQuantityChange = (newQuantity: number) => {
                      if (newQuantity < 1) return;
                      updateCartItem({
                        productId: cartItem.type === "product" ? cartItem.productId : undefined,
                        miniDrawId: cartItem.type === "ticket" ? cartItem.miniDrawId : undefined,
                        quantity: newQuantity,
                      });
                    };

                    const handleRemove = () => {
                      const itemId = cartItem.productId || cartItem.miniDrawId || "";
                      removeFromCart(itemId, cartItem.type);
                    };

                    return (
                      <div
                        key={`${cartItem.type}-${cartItem.productId}`}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-neutral-800/80 rounded-lg"
                      >
                        <div className="w-16 h-16 bg-white dark:bg-neutral-900 rounded-lg overflow-hidden flex-shrink-0">
                          <Image
                            src={itemImage}
                            alt={itemName}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover"
                            sizes="64px"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{itemName}</h3>
                          <p className="text-red-600 font-semibold">
                            ${itemPrice.toFixed(2)}
                            {cartItem.type === "ticket" && (
                              <span className="text-xs text-gray-500 dark:text-neutral-400 ml-1">/ ticket</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleQuantityChange(cartItem.quantity - 1)}
                              className="w-6 h-6 bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 rounded-full flex items-center justify-center transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-medium w-8 text-center">{cartItem.quantity}</span>
                            <button
                              onClick={() => handleQuantityChange(cartItem.quantity + 1)}
                              className="w-6 h-6 bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 rounded-full flex items-center justify-center transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={handleRemove}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
                  <div className="text-gray-400 mb-6">
                    <Clock className="w-20 h-20 mx-auto text-gray-300" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 font-['Poppins']">
                    Coming Soon
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-neutral-300 mb-6 max-w-sm mx-auto font-['Inter']">
                    Our shop is currently being set up. In the meantime, check out our exciting mini-draws where you can
                    win amazing tools!
                  </p>
                  <MetallicButton
                    href="/mini-draws"
                    variant="primary"
                    size="md"
                    borderRadius="lg"
                    className="w-full max-w-xs"
                  >
                    Visit Mini Draws
                  </MetallicButton>
                </div>
              )}
            </div>

            {/* Cart Footer - Always at Bottom */}
            <div className="border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex-shrink-0">
              {cartItems.length > 0 ? (
                <div className="p-4">
                  {/* Subtotal */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">Subtotal:</span>
                    <span className="text-xl font-bold text-red-600">
                      $
                      {cartItems
                        .reduce((total: number, item) => {
                          const cartItem = item;
                          const itemPrice =
                            cartItem.type === "product" && cartItem.product
                              ? cartItem.product.price
                              : cartItem.type === "ticket" && cartItem.miniDraw
                              ? cartItem.miniDraw.ticketPrice
                              : 0;
                          return total + itemPrice * cartItem.quantity;
                        }, 0)
                        .toFixed(2)}
                    </span>
                  </div>

                  {/* Checkout Button */}
                  <Link
                    href="/shop"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 mb-2"
                    onClick={handleCloseCart}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Proceed to Checkout
                  </Link>

                  {/* Continue Shopping */}
                  <button
                    onClick={handleCloseCart}
                    className="w-full bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium py-2 px-4 rounded-xl transition-colors duration-200"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <div className="p-4">
                  <button
                    onClick={handleCloseCart}
                    className="w-full bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-200 font-medium py-2 px-4 rounded-xl transition-colors duration-200"
                  >
                    Continue Shopping
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Package detail modal (from badge click) */}
      {packageDetailModalData && (
        <PackageDetailModal
          isOpen={packageDetailModalOpen}
          onClose={() => {
            setPackageDetailModalOpen(false);
            setPackageDetailModalData(null);
          }}
          packageData={packageDetailModalData.packageData}
          membershipType={packageDetailModalData.membershipType}
          accumulation={packageDetailModalData.accumulation}
          hasActiveSubscription={userData?.subscription?.isActive === true}
          hasAccessToAdditionalPackages={hasAdditionalPackageAccess(userData, userMajorDrawStats)}
          onOpenSettingsSubscription={() => router.push("/my-account?open=subscription")}
          onOpenMembershipModal={() => router.push("/membership")}
          onOpenSpecialPackages={() =>
            whenGatesOpenElseGateModal(() => requestModal("special-packages", true))
          }
        />
      )}
    </header>
  );
}
