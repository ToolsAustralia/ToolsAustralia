"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useSidebar } from "@/contexts/SidebarContext";
import { useUserContext } from "@/contexts/UserContext";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
// User setup store removed - using unified modal priority system
import { useCart } from "@/contexts/CartContext";
import { hasPreservedBenefits, getDaysUntilBenefitsExpire } from "@/utils/membership/benefit-resolution";
import { usePixelTracking } from "@/hooks/usePixelTracking";
import { environmentFlags } from "@/lib/environment";
import { rewardsEnabled } from "@/config/featureFlags";
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
  Star,
  ChevronDown,
  Clock,
} from "lucide-react";

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
    console.log("🔍 Desktop user menu state changed:", isDesktopUserMenuOpen);
  }, [isDesktopUserMenuOpen]);

  useEffect(() => {
    console.log("🔍 Mobile user menu state changed:", isMobileUserMenuOpen);
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
  const { requestModal } = useModalPriorityStore();
  // Setup requirement check now handled through user data
  const checkSetupRequired = (userData: unknown) =>
    !(userData as { profileSetupCompleted?: boolean })?.profileSetupCompleted;

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
  console.log("🔍 Header - Setup detection:", {
    isAuthenticated,
    isSetupRequired,
    hasUserData: !!userData,
    profileSetupCompleted: userData?.profileSetupCompleted,
    userId: userData?._id,
    isTopBarHidden,
    shouldShowSetupBar: isAuthenticated && isSetupRequired,
  });
  const pathname = usePathname();
  const isRewardsFeatureEnabled = rewardsEnabled();

  // Get membership badge styling based on package ID - matches my-account page styling
  const getMembershipBadge = (
    packageData?: { name: string; type: "subscription" | "one-time" },
    isActive?: boolean,
    membershipType?: "subscription" | "one-time"
  ) => {
    if (!isActive || !packageData || !packageData.name) return null;

    const packageName = packageData.name.toLowerCase();
    const isSubscription = membershipType === "subscription" || packageData.type === "subscription";

    // Priority 1: Subscription packages (recurring memberships)
    if (isSubscription) {
      if (packageName.includes("boss")) {
        return {
          text: "BOSS",
          className:
            "bg-gradient-to-r from-gray-900 to-black text-yellow-400 font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse relative overflow-hidden",
          icon: <Star className="w-3 h-3 text-yellow-400 animate-pulse" />,
        };
      } else if (packageName.includes("foreman")) {
        return {
          text: "FOREMAN",
          className:
            "bg-gradient-to-r from-purple-600 to-purple-700 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <Crown className="w-3 h-3" />,
        };
      } else if (packageName.includes("tradie")) {
        return {
          text: "TRADIE",
          className:
            "bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <User className="w-3 h-3" />,
        };
      }
    }

    // Priority 2: One-time packages (only show if no active subscription)
    if (!isSubscription) {
      if (packageName.includes("power pack")) {
        return {
          text: "POWER",
          className:
            "bg-gradient-to-r from-gray-900 to-black text-yellow-400 font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse relative overflow-hidden",
          icon: <Star className="w-3 h-3 text-yellow-400 animate-pulse" />,
        };
      } else if (packageName.includes("foreman pack")) {
        return {
          text: "FOREMAN",
          className:
            "bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <Crown className="w-3 h-3" />,
        };
      } else if (packageName.includes("ultimate")) {
        return {
          text: "ULTIMATE",
          className:
            "bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <Trophy className="w-3 h-3" />,
        };
      } else if (packageName.includes("mega")) {
        return {
          text: "MEGA",
          className:
            "bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <Star className="w-3 h-3" />,
        };
      } else if (packageName.includes("apprentice pack")) {
        return {
          text: "APPRENTICE",
          className:
            "bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg flex items-center gap-1",
          icon: <User className="w-3 h-3" />,
        };
      }
    }

    return null;
  };

  // Handle mobile menu close with animation
  const handleCloseMobileMenu = useCallback(() => {
    console.log("🔍 Closing mobile menu - Saved scroll position:", scrollPositionRef.current);

    setIsClosingMobileMenu(true);
    setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsClosingMobileMenu(false);
    }, 300);
  }, [setIsMobileMenuOpen]);

  // Handle cart close with animation
  const handleCloseCart = useCallback(() => {
    console.log("🛒 Closing cart - Saved scroll position:", scrollPositionRef.current);

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
        console.log("🔍 Header - Top bar visibility logic:", {
          isAuthenticated,
          isSetupRequired,
          willHideTopBar: !isSetupRequired,
        });

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
        console.log("🖱️ Clicking outside desktop user menu, closing it");
        setIsDesktopUserMenuOpen(false);
      }

      // Close mobile user menu if clicking outside
      if (isMobileUserMenuOpen && mobileUserMenu && !mobileUserMenu.contains(target)) {
        console.log("🖱️ Clicking outside mobile user menu, closing it");
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
    // Clear localStorage when signing out
    localStorage.removeItem("wasAuthenticated");
    localStorage.removeItem("topBarHidden");
    // setWasAuthenticated(null);
    setIsTopBarHidden(false);
    signOut({ callbackUrl: "/" });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Track search event for pixel tracking
      trackSearch(searchQuery.trim());

      // TODO: Implement search functionality
      console.log("Searching for:", searchQuery);
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
      className={`bg-white ${
        isFixed ? "fixed top-0 left-0 right-0 z-40" : "relative"
      } shadow-sm w-full overflow-visible`}
    >
      {/* Top Bar - Promotional or Setup Reminder - Only show when authentication state is fully resolved */}
      {/* Hidden by default, only shows after auth state is confirmed (userData exists OR confirmed not authenticated) */}
      {!isTopBarHidden && authStateResolved && (
        <div
          data-top-bar
          className={`h-[24px] sm:h-[28px] w-full flex items-center justify-center relative animate-slideDown ${
            isAuthenticated && isSetupRequired
              ? "bg-blue-600" // Blue for setup reminder
              : "bg-[#ee0000]" // Red for promotional
          }`}
        >
          <div className="flex items-center justify-center w-full px-2 sm:px-3 overflow-hidden">
            {isAuthenticated && isSetupRequired ? (
              <p className="text-white text-[8px] sm:text-[10px] font-normal leading-tight text-center flex-1 animate-topbar-reappear">
                <span className="font-normal">Complete your profile to set up email/password login. </span>
                <button
                  onClick={forceShowSetupModal}
                  className="font-medium underline hover:text-gray-200 transition-colors"
                >
                  Complete Profile
                </button>
              </p>
            ) : (
              <p className="text-white text-[8px] sm:text-[10px] font-normal leading-tight text-center flex-1 animate-topbar-reappear">
                <span className="font-normal">Join Tools Australia for exclusive benefits and prize draws! </span>
                <Link href="/membership" className="font-medium underline hover:text-gray-200 transition-colors">
                  Join Now
                </Link>
              </p>
            )}
          </div>
          <button
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 hover:bg-white/20 rounded-full transition-colors flex items-center justify-center touch-manipulation"
            onClick={() => setIsTopBarHidden(true)}
            aria-label="Close banner"
          >
            <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
          </button>
        </div>
      )}

      {/* Main Navigation - Viewport Width Only */}
      <nav className="bg-white flex items-center justify-between py-0 h-[60px] sm:h-[72px] border-b border-gray-100 w-full relative">
        <div className="w-full px-2 sm:px-3  xl:px-20 flex items-center justify-between relative">
          {/* Left Side - Hamburger Menu (Mobile/Tablet) */}
          <div className="flex items-center">
            {/* Mobile Menu Button - Left Side with Animation */}
            <button
              className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 text-gray-700 hover:text-white transition-all duration-300 rounded-full hover:bg-gradient-to-br hover:from-red-600 hover:to-red-700 hover:scale-105 flex items-center justify-center touch-manipulation mr-1 sm:mr-2 group"
              onClick={() => (isMobileMenuOpen ? handleCloseMobileMenu() : setIsMobileMenuOpen(true))}
              aria-label="Toggle mobile menu"
            >
              <div className="relative w-5 h-5 sm:w-6 sm:h-6">
                {/* Animated Hamburger/X Icon */}
                <div
                  className={`absolute inset-0 transition-all duration-300 ${
                    isMobileMenuOpen ? "rotate-180 opacity-0" : "rotate-0 opacity-100"
                  }`}
                >
                  <Menu className="h-full w-full group-hover:scale-110 transition-transform duration-200" />
                </div>
                <div
                  className={`absolute inset-0 transition-all duration-300 ${
                    isMobileMenuOpen ? "rotate-0 opacity-100" : "rotate-180 opacity-0"
                  }`}
                >
                  <X className="h-full w-full group-hover:scale-110 transition-transform duration-200" />
                </div>
              </div>
            </button>

            {/* Logo - Optimized for Viewport Width */}
            <Link href="/" className="flex-shrink-0 touch-manipulation">
              <div className="h-[36px] w-[110px] sm:h-[44px] sm:w-[130px] lg:h-[48px] lg:w-[150px] flex items-center justify-center">
                <Image
                  src="/images/logo.png"
                  alt="Tools Australia"
                  width={160}
                  height={52}
                  className="h-full w-full object-contain"
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
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/") ? "page" : undefined}
            >
              Home
            </Link>
            <Link
              href="/shop"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/shop")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/shop") ? "page" : undefined}
            >
              Shop
            </Link>
            <Link
              href="/mini-draws"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/mini-draws")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/mini-draws") ? "page" : undefined}
            >
              Mini Draws
            </Link>
            <Link
              href="/membership"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/membership")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
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
                    ? "text-white bg-[#ee0000]"
                    : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
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
                className={`flex items-center gap-1 text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                  isResultsActive()
                    ? "text-white bg-[#ee0000]"
                    : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
                }`}
              >
                Results
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isResultsMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isResultsMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-[75] animate-fade-in">
                  <Link
                    href="/draw-results"
                    className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                    onClick={() => setIsResultsMenuOpen(false)}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Draw Results
                  </Link>
                </div>
              )}
            </div>
            <Link
              href="/partner"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/partner")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/partner") ? "page" : undefined}
            >
              Become a Partner
            </Link>
            <Link
              href="/faq"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/faq")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/faq") ? "page" : undefined}
            >
              FAQ
            </Link>
            <Link
              href="/contact"
              className={`text-[15px] xl:text-[16px] font-medium leading-normal transition-colors duration-200 py-2 px-3 rounded-lg ${
                isActiveLink("/contact")
                  ? "text-white bg-[#ee0000]"
                  : "text-black hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-red-700"
              }`}
              aria-current={isActiveLink("/contact") ? "page" : undefined}
            >
              Contact
            </Link>
          </div>

          {/* Right Side - User Stats and Icons */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* User Stats Display - Desktop Only - Clickable */}
            {isAuthenticated && userData && (
              <div className="hidden lg:flex items-center gap-4">
                {/* User Info with Stats - Clickable */}
                <div className="relative desktop-user-menu-container">
                  <button
                    onClick={() => setIsDesktopUserMenuOpen(!isDesktopUserMenuOpen)}
                    className="flex items-center gap-3 text-right hover:bg-gray-50 rounded-lg px-3 py-2 transition-all duration-200 hover:scale-105 cursor-pointer"
                  >
                    <div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 hover:text-red-600 transition-colors">
                            {userData?.firstName} {userData?.lastName}
                          </span>
                          {(() => {
                            let badge = null;
                            if (userData?.subscription?.isActive && userData.subscriptionPackageData) {
                              badge = getMembershipBadge(
                                userData.subscriptionPackageData,
                                userData.subscription.isActive,
                                "subscription"
                              );
                            } else if (
                              userData.enrichedOneTimePackages &&
                              userData.enrichedOneTimePackages.length > 0
                            ) {
                              const activePackage = userData.enrichedOneTimePackages
                                .filter((pkg) => pkg.isActive)
                                .sort(
                                  (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
                                )[0];
                              if (activePackage?.packageData) {
                                badge = getMembershipBadge(
                                  activePackage.packageData,
                                  activePackage.isActive,
                                  "one-time"
                                );
                              }
                            }
                            return badge ? (
                              <span className={badge.className}>
                                {badge.icon}
                                {badge.text}
                              </span>
                            ) : null;
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
                  </button>

                  {/* User Menu Dropdown */}
                  {isDesktopUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-[75] animate-fade-in">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">
                          {userData?.firstName} {userData?.lastName}
                        </p>
                        <p className="text-xs text-gray-500">{userData?.email}</p>
                      </div>
                      {userData?.role === "admin" ? (
                        <>
                          <Link
                            href="/admin"
                            className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
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
                            className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            My Account
                          </Link>
                          <Link
                            href="/draw-results"
                            className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                            onClick={() => setIsDesktopUserMenuOpen(false)}
                          >
                            Draw Results
                          </Link>
                        </>
                      )}
                      <hr className="my-2 border-gray-100" />
                      <button
                        onClick={handleSignOut}
                        className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* User Badge Display - Mobile Only */}
            {isAuthenticated && userData && (
              <div className="lg:hidden flex items-center">
                {(() => {
                  // Prioritize subscription over one-time packages
                  let badge = null;
                  if (userData?.subscription?.isActive && userData.subscriptionPackageData) {
                    badge = getMembershipBadge(
                      userData.subscriptionPackageData,
                      userData.subscription.isActive,
                      "subscription"
                    );
                  } else if (userData.enrichedOneTimePackages && userData.enrichedOneTimePackages.length > 0) {
                    const activePackage = userData.enrichedOneTimePackages
                      .filter((pkg) => pkg.isActive)
                      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
                    if (activePackage?.packageData) {
                      badge = getMembershipBadge(activePackage.packageData, activePackage.isActive, "one-time");
                    }
                  }
                  return badge ? (
                    <span className={badge.className}>
                      {badge.icon}
                      {badge.text}
                    </span>
                  ) : null;
                })()}
              </div>
            )}

            {/* Cart Button - With Item Count and Animation */}
            <button
              onClick={() => (isCartOpen ? handleCloseCart() : setIsCartOpen(true))}
              className="relative w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 text-gray-700 hover:text-red-600 transition-all duration-200 rounded-full hover:bg-gray-50 hover:scale-105 flex items-center justify-center touch-manipulation bg-gray-100 group z-10"
            >
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 group-hover:scale-110 transition-transform duration-200" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center min-w-[16px] text-[10px] animate-bounce">
                  {cartItemCount > 99 ? "99+" : cartItemCount}
                </span>
              )}
            </button>
            {/* Login Button for Mobile - Show when not authenticated */}
            {!isAuthenticated && (
              <Link
                href="/login"
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-white rounded-lg bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_8px_rgba(238,0,0,0.35)] hover:from-red-700 hover:to-red-800 hover:shadow-[0_0_12px_rgba(238,0,0,0.5)] transition-all duration-200 border border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
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
                    console.log("🖱️ Mobile user menu button clicked - isMobileUserMenuOpen:", isMobileUserMenuOpen);
                    console.log("🖱️ Setting isMobileUserMenuOpen to:", !isMobileUserMenuOpen);
                    setIsMobileUserMenuOpen(!isMobileUserMenuOpen);
                  }}
                  className="w-8 h-8 sm:w-10 sm:h-10 text-gray-700 hover:text-red-600 transition-colors duration-200 rounded-full hover:bg-gray-50 flex items-center justify-center touch-manipulation relative z-50"
                  aria-label="User menu"
                  type="button"
                >
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>

                {isMobileUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-[75] animate-fade-in">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">
                        {userData?.firstName} {userData?.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{userData?.email}</p>
                    </div>
                    {userData?.role === "admin" ? (
                      <>
                        <Link
                          href="/admin"
                          className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
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
                          className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          My Account
                        </Link>
                        <Link
                          href="/draw-results"
                          className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                          onClick={() => setIsMobileUserMenuOpen(false)}
                        >
                          Draw Results
                        </Link>
                      </>
                    )}
                    <hr className="my-2 border-gray-100" />
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Login Link for Non-Authenticated Users - Desktop Only */}
            {!isAuthenticated && (
              <Link
                href="/login"
                className="hidden lg:inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-red-600 to-red-700 shadow-[0_0_12px_rgba(238,0,0,0.35)] hover:from-red-700 hover:to-red-800 hover:shadow-[0_0_16px_rgba(238,0,0,0.5)] transition-all duration-200 border border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
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
        <div className="lg:hidden fixed inset-0 bg-white z-[55] animate-fade-in overflow-hidden w-full">
          <div className="flex items-center justify-between p-2 sm:p-3 border-b border-gray-200 w-full">
            <form onSubmit={handleSearchSubmit} className="flex-1 mr-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full px-3 py-2.5 pl-10 pr-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  autoFocus
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </form>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-2 sm:p-3 overflow-y-auto w-full">
            <p className="text-sm text-gray-500 mb-2">Popular searches:</p>
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
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
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
            className={`mobile-menu-container absolute top-0 left-0 h-full w-80 max-w-[85vw] bg-white z-10 shadow-2xl ${
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
                    src="/Social Media Profile_Primary.png"
                    alt="Tools Australia"
                    width={40}
                    height={40}
                    className="object-contain rounded-full"
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

            {/* User Profile Section */}
            {isAuthenticated && userData && (
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {userData?.firstName} {userData?.lastName}
                      </p>
                      {(() => {
                        // Prioritize subscription over one-time packages using enriched data
                        let badge = null;
                        if (userData?.subscription?.isActive && userData.subscriptionPackageData) {
                          badge = getMembershipBadge(
                            userData.subscriptionPackageData,
                            userData.subscription.isActive,
                            "subscription"
                          );
                        } else if (userData?.enrichedOneTimePackages && userData.enrichedOneTimePackages.length > 0) {
                          const activePackage = userData.enrichedOneTimePackages
                            .filter((pkg) => pkg.isActive)
                            .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
                          if (activePackage && activePackage.packageData) {
                            badge = getMembershipBadge(activePackage.packageData, activePackage.isActive, "one-time");
                          }
                        }
                        return badge ? (
                          <span className={badge.className}>
                            {badge.icon}
                            {badge.text}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-gray-600">Major Draw Active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Links - Scrollable Area */}
            <div className="flex-1 overflow-y-auto">
              <nav className="p-4 space-y-2">
                <Link
                  href="/"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/") ? "text-white bg-[#ee0000]" : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Home className="w-5 h-5" />
                  Home
                </Link>

                <Link
                  href="/shop"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/shop")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Store className="w-5 h-5" />
                  Shop
                </Link>

                <Link
                  href="/mini-draws"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/mini-draws")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                  aria-current={isActiveLink("/mini-draws") ? "page" : undefined}
                >
                  <Ticket className="w-5 h-5" />
                  Mini Draws
                </Link>

                <Link
                  href="/membership"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/membership")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
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
                    className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                      isActiveLink("/rewards")
                        ? "text-white bg-[#ee0000]"
                        : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
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
                    className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium w-full ${
                      isResultsActive()
                        ? "text-white bg-[#ee0000]"
                        : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
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
                        className={`sidebar-item flex items-center gap-3 py-2 px-3 transition-all duration-200 rounded-xl text-sm font-medium ${
                          isActiveLink("/draw-results")
                            ? "text-white bg-[#ee0000]"
                            : "text-gray-600 hover:text-red-600 hover:bg-gray-50"
                        }`}
                        onClick={handleCloseMobileMenu}
                      >
                        <BarChart3 className="w-4 h-4" />
                        Draw Results
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  href="/partner"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/partner")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Handshake className="w-5 h-5" />
                  Become a Partner
                </Link>

                <Link
                  href="/faq"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/faq")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <HelpCircle className="w-5 h-5" />
                  FAQ
                </Link>

                <Link
                  href="/contact"
                  className={`sidebar-item flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium ${
                    isActiveLink("/contact")
                      ? "text-white bg-[#ee0000]"
                      : "text-gray-700 hover:text-red-600 hover:bg-gray-50"
                  }`}
                  onClick={handleCloseMobileMenu}
                >
                  <Phone className="w-5 h-5" />
                  Contact
                </Link>

                {/* User Account Links */}
                {isAuthenticated && userData && (
                  <>
                    <div className="border-t border-gray-200 my-4"></div>
                    <Link
                      href="/my-account"
                      className="flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium text-gray-700 hover:text-red-600 hover:bg-gray-50"
                      onClick={handleCloseMobileMenu}
                    >
                      <UserCircle className="w-5 h-5" />
                      My Account
                    </Link>

                    <Link
                      href="/membership"
                      className="flex items-center gap-3 py-3 px-3 transition-all duration-200 rounded-xl text-base font-medium text-gray-700 hover:text-red-600 hover:bg-gray-50"
                      onClick={handleCloseMobileMenu}
                    >
                      <Crown className="w-5 h-5" />
                      My Membership
                    </Link>
                  </>
                )}
              </nav>
            </div>

            {/* Sidebar Footer - Always at Bottom */}
            <div className="border-t border-gray-200 bg-white flex-shrink-0">
              <div className="p-4">
                {isAuthenticated ? (
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
            className={`cart-sidebar-container absolute top-0 right-0 h-full w-96 max-w-[90vw] bg-white z-10 shadow-2xl ${
              isClosingCart ? "sidebar-slide-out-right" : "sidebar-slide-in-right"
            } flex flex-col`}
          >
            {/* Cart Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-6 w-6 text-gray-700" />
                <div>
                  <h2 className="text-gray-900 font-bold text-lg">Shopping Cart</h2>
                  <p className="text-gray-600 text-sm">
                    {cartItemCount} {cartItemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseCart}
                className="w-8 h-8 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart Items - Scrollable Area */}
            <div className="flex-1 overflow-y-auto">
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
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0">
                          <Image
                            src={itemImage}
                            alt={itemName}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm truncate">{itemName}</h3>
                          <p className="text-red-600 font-semibold">
                            ${itemPrice.toFixed(2)}
                            {cartItem.type === "ticket" && <span className="text-xs text-gray-500 ml-1">/ ticket</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleQuantityChange(cartItem.quantity - 1)}
                              className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-medium w-8 text-center">{cartItem.quantity}</span>
                            <button
                              onClick={() => handleQuantityChange(cartItem.quantity + 1)}
                              className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors"
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
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <ShoppingCart className="h-16 w-16 mb-4" />
                  <p className="text-lg font-medium">Your cart is empty</p>
                  <p className="text-sm">Add some tools to get started!</p>
                </div>
              )}
            </div>

            {/* Cart Footer - Always at Bottom */}
            <div className="border-t border-gray-200 bg-white flex-shrink-0">
              {cartItems.length > 0 ? (
                <div className="p-4">
                  {/* Subtotal */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-semibold text-gray-900">Subtotal:</span>
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
                    href="/checkout"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 mb-2"
                    onClick={handleCloseCart}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Proceed to Checkout
                  </Link>

                  {/* Continue Shopping */}
                  <button
                    onClick={handleCloseCart}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-xl transition-colors duration-200"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <div className="p-4">
                  <button
                    onClick={handleCloseCart}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-xl transition-colors duration-200"
                  >
                    Continue Shopping
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
