"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  Trophy,
  Star,
  CreditCard,
  Package,
  Activity,
  User,
  Users,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  Key,
  MessageSquare,
  Gift,
  Trash2,
} from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import Image from "next/image";
import { StaticImageData } from "next/image";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { membershipPackages, getPackageById } from "@/data/membershipPackages";
import { AdminUserUpdatePayload, UserActionType } from "@/types/admin";
import { useAdminUpdateUser, useAdminUserActions, useAdminUserDetail } from "@/hooks/queries/useAdminQueries";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { Z_INDEX } from "@/constants/z-index";
import ModalContent from "@/components/modals/ui/ModalContent";
import Input from "@/components/modals/ui/Input";
import Select from "@/components/modals/ui/Select";
import Checkbox from "@/components/modals/ui/Checkbox";
import { getPackageIconByName } from "@/utils/images/package-icons";
import defaultLogo from "../../../public/images/Tools Australia Logo/Social Media Profile_Black Background.png";

// Proper interfaces for user data structures
interface SubscriptionHistoryItem {
  packageId?: string;
  packageName?: string;
  timestamp?: string;
  status?: string;
  price?: number;
}

interface OrderItem {
  _id?: string;
  orderNumber?: string;
  createdAt?: string;
  total?: number;
  totalAmount?: number;
  status?: string;
}

interface OneTimePackageItem {
  packageId?: string;
  packageName?: string;
  purchaseDate?: string;
  startDate?: string;
  endDate?: string;
  price?: number;
  status?: string;
  entriesGranted?: number;
  isActive?: boolean;
}

interface MajorDrawParticipationItem {
  drawId?: string;
  title?: string;
  endDate?: string;
  entries?: number;
  totalEntries?: number;
  status?: string;
}

interface PaymentEventItem {
  eventType?: string;
  timestamp?: string;
  price?: number;
  status?: string;
  packageType?: string;
  data?: {
    price?: number;
  };
}

interface UserDetailModalProps {
  userId: string | null;
  isOpen: boolean;
  onCloseAction: () => void;
}

type TabType = "overview" | "subscription" | "purchases" | "activity";

const overviewFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  mobile: z.string().min(8, "Mobile number is too short").optional().or(z.literal("")),
  state: z.string().optional(),
  profession: z.string().max(100, "Profession cannot exceed 100 characters").optional().or(z.literal("")),
  role: z.enum(["user", "admin"]),
  isActive: z.boolean(),
  isEmailVerified: z.boolean(),
  isMobileVerified: z.boolean(),
  profileSetupCompleted: z.boolean(),
});

const subscriptionFormSchema = z.object({
  packageId: z.string().optional(),
  status: z.string().optional(),
  isActive: z.boolean(),
  autoRenew: z.boolean(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  rewardsPoints: z.number().min(0),
  accumulatedEntries: z.number().min(0),
  entryWallet: z.number().min(0),
});

const oneTimePackageFormSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  purchaseDate: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  isActive: z.boolean(),
  entriesGranted: z.number().min(0),
});

const miniDrawPackageFormSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  packageName: z.string().min(1, "Package name is required"),
  miniDrawId: z.string().optional(),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  isActive: z.boolean(),
  entriesGranted: z.number().min(0),
  price: z.number().min(0),
  partnerDiscountHours: z.number().min(0).optional(),
  partnerDiscountDays: z.number().min(0).optional(),
  stripePaymentIntentId: z.string().min(1, "Stripe payment intent ID is required"),
});

const purchasesFormSchema = z.object({
  oneTimePackages: z.array(oneTimePackageFormSchema),
  miniDrawPackages: z.array(miniDrawPackageFormSchema),
});

const majorDrawParticipationFormSchema = z.object({
  drawId: z.string().min(1, "Draw ID is required"),
  totalEntries: z.number().min(0),
});

const miniDrawParticipationFormSchema = z.object({
  miniDrawId: z.string().min(1, "Mini draw ID is required"),
  totalEntries: z.number().min(0),
  isActive: z.boolean().optional(),
});

const activityFormSchema = z.object({
  majorDrawParticipation: z.array(majorDrawParticipationFormSchema),
  miniDrawParticipation: z.array(miniDrawParticipationFormSchema),
});

type OverviewFormValues = z.infer<typeof overviewFormSchema>;
type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;
type PurchasesFormValues = z.infer<typeof purchasesFormSchema>;
type ActivityFormValues = z.infer<typeof activityFormSchema>;
type OneTimePackageFormValue = PurchasesFormValues["oneTimePackages"][number];
type MiniDrawPackageFormValue = PurchasesFormValues["miniDrawPackages"][number];
type MajorDrawParticipationFormValue = ActivityFormValues["majorDrawParticipation"][number];
type MiniDrawParticipationFormValue = ActivityFormValues["miniDrawParticipation"][number];

const formatDateTimeLocal = (value?: string | Date | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

const toISOStringOrUndefined = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const coerceDateTimeInput = (value: unknown): string =>
  formatDateTimeLocal(typeof value === "string" || value instanceof Date ? value : undefined);

const formatReferralStatus = (status: string) => {
  switch (status) {
    case "converted":
      return "Converted";
    case "pending":
      return "Pending";
    case "expired":
      return "Expired";
    case "flagged":
      return "Flagged";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

const formatReferralDate = (value?: string) => {
  if (!value) return "--";
  try {
    return format(new Date(value), "dd MMM yyyy, h:mm a");
  } catch {
    return value;
  }
};

// Helper function to get package icon image (uses centralized utility for consistency)
const getPackageIconImage = (packageName?: string | null): StaticImageData | null => {
  if (!packageName) return null;
  // Try subscription first, then one-time as fallback
  return getPackageIconByName(packageName, "subscription") || getPackageIconByName(packageName, "one-time");
};

// Helper function to get package color scheme (matching UsersManagement.tsx)
const getPackageColorScheme = (packageName?: string | null) => {
  if (!packageName) return null;
  const lowerName = packageName.toLowerCase();

  if (lowerName.includes("apprentice")) {
    return {
      gradient: "from-gray-300 via-slate-400 to-gray-500",
      text: "text-gray-300",
      border: "border-gray-400/40",
    };
  } else if (lowerName.includes("tradie")) {
    return {
      gradient: "from-blue-500 via-blue-600 to-blue-700",
      text: "text-blue-400",
      border: "border-blue-500/50",
    };
  } else if (lowerName.includes("foreman")) {
    return {
      gradient: "from-green-500 via-green-600 to-green-700",
      text: "text-green-300",
      border: "border-green-500/50",
    };
  } else if (lowerName.includes("boss")) {
    return {
      gradient: "from-yellow-400 via-amber-500 to-yellow-600",
      text: "text-yellow-400",
      border: "border-yellow-400/50",
    };
  } else if (lowerName.includes("power")) {
    return {
      gradient: "from-orange-600 via-red-500 to-orange-700",
      text: "text-orange-400",
      border: "border-orange-500/50",
    };
  }

  return null;
};

// Helper function to extract gradient color for border (matching UsersManagement.tsx)
const getGradientColor = (gradient: string): string => {
  if (gradient.includes("yellow-3") || gradient.includes("yellow-4")) return "#facc15";
  if (gradient.includes("blue")) return "#3b82f6";
  if (gradient.includes("purple")) return "#9333ea";
  if (gradient.includes("orange")) return "#f97316";
  if (gradient.includes("yellow-4") && gradient.includes("amber")) return "#fbbf24";
  if (gradient.includes("gray-300") || gradient.includes("slate-400")) return "#94a3b8"; // Silver
  if (gradient.includes("blue-500") || gradient.includes("blue-600")) return "#3b82f6"; // Blue
  if (gradient.includes("green-500") || gradient.includes("green-600")) return "#22c55e"; // Green
  return "#6b7280";
};

// Helper function to format activity event with detailed description
const formatActivityEvent = (event: PaymentEventItem, formatCurrency: (amount: number) => string) => {
  const eventData = event.data as Record<string, unknown> | undefined;
  const packageName = (eventData?.packageName as string) || (eventData?.offerTitle as string) || "Package";
  const packageType = event.packageType || "unknown";
  const price = (eventData?.price as number) || event.price || 0;
  const entries = (eventData?.entries as number) || 0;

  let description = "";
  if (packageType === "membership") {
    description = `${packageName} Subscription - ${formatCurrency(price)}/month`;
  } else if (packageType === "one-time") {
    description = `${packageName} Package - ${formatCurrency(price)}`;
  } else if (packageType === "mini-draw") {
    description = `${packageName} Mini Draw Package - ${formatCurrency(price)}`;
  } else if (packageType === "upsell") {
    const eventData = event.data as Record<string, unknown> | undefined;
    description = `${(eventData?.offerTitle as string) || "Upsell"} - ${formatCurrency(price)}`;
  } else {
    description = `${event.eventType || "Payment event"}`;
  }

  if (entries > 0) {
    description += ` - ${entries} entries granted`;
  }

  return description;
};

/**
 * Comprehensive user detail modal with tabbed interface
 * Shows complete user profile, subscription details, purchase history, and activity
 */
export default function UserDetailModal({ userId, isOpen, onCloseAction }: UserDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showActionModal, setShowActionModal] = useState<{
    action: UserActionType;
    title: string;
    description: string;
    requiresInput?: boolean;
    inputPlaceholder?: string;
  } | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletionSummary, setDeletionSummary] = useState<{
    majorDrawEntries: number;
    miniDrawEntries: number;
    affiliateCommissions: number;
    paymentEvents: number;
    orders: number;
    winners: number;
    referralEvents: { asReferrer: number; asInvitee: number; total: number };
    ticketEntries: number;
    warnings: {
      hasActiveSubscription: boolean;
      isWinner: boolean;
      winnerDraws?: Array<{ drawName: string; drawType: "major" | "mini" }>;
    };
  } | null>(null);
  const [isLoadingDeletionSummary, setIsLoadingDeletionSummary] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: user, isLoading, error } = useAdminUserDetail(userId || "");
  const userActions = useAdminUserActions();
  const updateUser = useAdminUpdateUser();
  const [activeEditTab, setActiveEditTab] = useState<TabType | null>(null);
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const rewardsFeatureEnabled = rewardsEnabled();
  const rewardsPauseMessage = rewardsDisabledMessage();
  const referralHistory = user?.referral?.history ?? [];

  const overviewDefaults = useMemo<OverviewFormValues>(
    () => ({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      email: user?.email ?? "",
      mobile: user?.mobile ?? "",
      state: user?.state ?? "",
      profession: user?.profession ?? "",
      role: user?.role ?? "user",
      isActive: user?.isActive ?? false,
      isEmailVerified: user?.isEmailVerified ?? false,
      isMobileVerified: user?.isMobileVerified ?? false,
      profileSetupCompleted: user?.profileSetupCompleted ?? false,
    }),
    [user]
  );

  const subscriptionDefaults = useMemo<SubscriptionFormValues>(
    () => ({
      packageId: user?.subscription?.packageId?.toString() ?? "",
      status: user?.subscription?.status ?? "",
      isActive: user?.subscription?.isActive ?? false,
      autoRenew: user?.subscription?.autoRenew ?? false,
      startDate: coerceDateTimeInput(user?.subscription?.startDate ?? null),
      endDate: coerceDateTimeInput(user?.subscription?.endDate ?? null),
      rewardsPoints: user?.rewardsPoints ?? 0,
      accumulatedEntries: user?.accumulatedEntries ?? 0,
      entryWallet: user?.entryWallet ?? 0,
    }),
    [user]
  );

  const purchasesDefaults = useMemo<PurchasesFormValues>(() => {
    const oneTimePackages = (user?.oneTimePackages ?? []).map((raw) => {
      const pkg = raw as {
        packageId?: string | { toString(): string };
        purchaseDate?: string | Date;
        startDate?: string | Date;
        endDate?: string | Date;
        isActive?: boolean;
        entriesGranted?: number;
      };

      const packageId = typeof pkg.packageId === "string" ? pkg.packageId : pkg.packageId?.toString() ?? "";

      return {
        packageId,
        purchaseDate: coerceDateTimeInput(pkg.purchaseDate ?? null),
        startDate: coerceDateTimeInput(pkg.startDate ?? null) || "",
        endDate: coerceDateTimeInput(pkg.endDate ?? null) || "",
        isActive: pkg.isActive ?? true,
        entriesGranted: typeof pkg.entriesGranted === "number" ? pkg.entriesGranted : 0,
      };
    });

    const miniDrawPackages = (user?.miniDrawPackages ?? []).map((raw) => {
      const pkg = raw as {
        packageId?: string;
        packageName?: string;
        miniDrawId?: { toString(): string } | string;
        purchaseDate?: string | Date;
        startDate?: string | Date;
        endDate?: string | Date;
        isActive?: boolean;
        entriesGranted?: number;
        price?: number;
        partnerDiscountHours?: number;
        partnerDiscountDays?: number;
        stripePaymentIntentId?: string;
      };

      return {
        packageId: pkg.packageId ?? "",
        packageName: pkg.packageName ?? "",
        miniDrawId: typeof pkg.miniDrawId === "string" ? pkg.miniDrawId : pkg.miniDrawId?.toString() ?? "",
        purchaseDate: coerceDateTimeInput(pkg.purchaseDate ?? null),
        startDate: coerceDateTimeInput(pkg.startDate ?? null) || "",
        endDate: coerceDateTimeInput(pkg.endDate ?? null) || "",
        isActive: pkg.isActive ?? true,
        entriesGranted: typeof pkg.entriesGranted === "number" ? pkg.entriesGranted : 0,
        price: typeof pkg.price === "number" ? pkg.price : 0,
        partnerDiscountHours: typeof pkg.partnerDiscountHours === "number" ? pkg.partnerDiscountHours : 0,
        partnerDiscountDays: typeof pkg.partnerDiscountDays === "number" ? pkg.partnerDiscountDays : 0,
        stripePaymentIntentId: pkg.stripePaymentIntentId ?? "",
      };
    });

    return {
      oneTimePackages,
      miniDrawPackages,
    };
  }, [user]);

  const activityDefaults = useMemo<ActivityFormValues>(() => {
    const majorDrawParticipation = (user?.majorDrawParticipation ?? []).map((raw) => {
      const draw = raw as {
        drawId?: string | { toString(): string };
        totalEntries?: number;
      };

      return {
        drawId: typeof draw.drawId === "string" ? draw.drawId : draw.drawId?.toString() ?? "",
        totalEntries: typeof draw.totalEntries === "number" ? draw.totalEntries : 0,
      };
    });

    const miniDrawParticipation = (user?.miniDrawParticipation ?? []).map((raw) => {
      const entry = raw as {
        miniDrawId?: string | { toString(): string };
        totalEntries?: number;
        isActive?: boolean;
      };

      return {
        miniDrawId: typeof entry.miniDrawId === "string" ? entry.miniDrawId : entry.miniDrawId?.toString() ?? "",
        totalEntries: typeof entry.totalEntries === "number" ? entry.totalEntries : 0,
        isActive: entry.isActive ?? true,
      };
    });

    return {
      majorDrawParticipation,
      miniDrawParticipation,
    };
  }, [user]);

  const subscriptionPackageOptions = useMemo(
    () => membershipPackages.filter((pkg) => pkg.type === "subscription" && pkg.isActive),
    []
  );
  const oneTimePackageOptions = useMemo(
    () => membershipPackages.filter((pkg) => pkg.type === "one-time" && pkg.isActive),
    []
  );

  const overviewForm = useForm<OverviewFormValues>({
    resolver: zodResolver(overviewFormSchema),
    defaultValues: overviewDefaults,
  });

  const subscriptionForm = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: subscriptionDefaults,
  });

  const purchasesForm = useForm<PurchasesFormValues>({
    resolver: zodResolver(purchasesFormSchema),
    defaultValues: purchasesDefaults,
  });

  const activityForm = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: activityDefaults,
  });

  useEffect(() => {
    overviewForm.reset(overviewDefaults);
  }, [overviewDefaults, overviewForm]);

  useEffect(() => {
    subscriptionForm.reset(subscriptionDefaults);
  }, [subscriptionDefaults, subscriptionForm]);

  useEffect(() => {
    purchasesForm.reset(purchasesDefaults);
  }, [purchasesDefaults, purchasesForm]);

  useEffect(() => {
    activityForm.reset(activityDefaults);
  }, [activityDefaults, activityForm]);

  useEffect(() => {
    setActiveEditTab((current) => (current === activeTab ? current : null));
  }, [activeTab]);

  const {
    fields: oneTimeFields,
    append: appendOneTime,
    remove: removeOneTime,
  } = useFieldArray({
    control: purchasesForm.control,
    name: "oneTimePackages",
  });

  const {
    fields: miniDrawPackageFields,
    append: appendMiniPackage,
    remove: removeMiniPackage,
  } = useFieldArray({
    control: purchasesForm.control,
    name: "miniDrawPackages",
  });

  const {
    fields: majorDrawFields,
    append: appendMajorDraw,
    remove: removeMajorDraw,
  } = useFieldArray({
    control: activityForm.control,
    name: "majorDrawParticipation",
  });

  const {
    fields: miniDrawFields,
    append: appendMiniDraw,
    remove: removeMiniDraw,
  } = useFieldArray({
    control: activityForm.control,
    name: "miniDrawParticipation",
  });

  const removedOneTimePackagesRef = useRef<OneTimePackageFormValue[]>([]);
  const removedMiniPackagesRef = useRef<MiniDrawPackageFormValue[]>([]);
  const removedMajorDrawRef = useRef<MajorDrawParticipationFormValue[]>([]);
  const removedMiniDrawRef = useRef<MiniDrawParticipationFormValue[]>([]);

  const tabs = [
    { id: "overview" as TabType, label: "Overview", icon: User },
    { id: "subscription" as TabType, label: "Subscription", icon: CreditCard },
    { id: "purchases" as TabType, label: "Purchases", icon: Package },
    { id: "activity" as TabType, label: "Activity", icon: Activity },
  ];

  const inputClasses =
    "mt-1 w-full rounded-lg border-2 border-gray-300 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#ee0000]";

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[90vh] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ee0000] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading user details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[90vh] flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Error Loading User</h3>
            <p className="text-gray-600 mb-4">{error?.message || "Failed to load user details"}</p>
            <button
              onClick={onCloseAction}
              className="px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleAction = async (action: UserActionType, note?: string, reason?: string) => {
    setActionLoading(action);
    try {
      await userActions.mutateAsync({
        userId: user.id,
        actionData: { action, note, reason },
      });

      // Show success message (you might want to add a toast notification here)
      alert("Action completed successfully!");
      setShowActionModal(null);
      setActionInput("");
    } catch (error) {
      console.error("Action failed:", error);
      alert("Action failed. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const showActionConfirmation = (
    action: UserActionType,
    title: string,
    description: string,
    requiresInput = false,
    inputPlaceholder = ""
  ) => {
    setShowActionModal({
      action,
      title,
      description,
      requiresInput,
      inputPlaceholder,
    });
  };

  const executeAction = () => {
    if (!showActionModal) return;

    const { action } = showActionModal;
    const note = showActionModal.requiresInput ? actionInput : undefined;
    const reason = action === "toggle_status" ? actionInput : undefined;

    handleAction(action, note, reason);
  };

  const handleSendEmail = async () => {
    if (!user) return;
    if (!emailSubject.trim() || !emailMessage.trim()) {
      alert("Subject and message are required.");
      return;
    }
    setActionLoading("send_email");
    try {
      await userActions.mutateAsync({
        userId: user.id,
        actionData: {
          action: "send_email",
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
        },
      });
      alert("Email sent successfully.");
      setEmailSubject("");
      setEmailMessage("");
      setShowSendEmailModal(false);
    } catch (error) {
      console.error("Send email failed:", error);
      alert("Failed to send email. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdminSetPassword = async () => {
    if (!user) return;
    if (adminNewPassword.trim().length < 6) {
      alert("New password must be at least 6 characters.");
      return;
    }
    setActionLoading("admin_set_password");
    try {
      await userActions.mutateAsync({
        userId: user.id,
        actionData: {
          action: "admin_set_password",
          newPassword: adminNewPassword.trim(),
        },
      });
      alert("Password updated successfully.");
      setAdminNewPassword("");
      setShowAdminPasswordModal(false);
    } catch (error) {
      console.error("Admin set password failed:", error);
      alert("Failed to update password. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch deletion summary
  const handleDeleteClick = async () => {
    if (!userId) return;

    setIsLoadingDeletionSummary(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/deletion-summary`);
      if (!response.ok) throw new Error("Failed to fetch deletion summary");

      const data = await response.json();
      setDeletionSummary(data.data);
      setShowDeleteModal(true);
    } catch (error) {
      console.error("Error fetching deletion summary:", error);
      alert("Failed to load deletion summary. Please try again.");
    } finally {
      setIsLoadingDeletionSummary(false);
    }
  };

  // Handle actual deletion
  const handleConfirmDelete = async () => {
    if (!userId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete user");
      }

      alert("User deleted successfully!");
      setShowDeleteModal(false);
      setDeletionSummary(null);
      onCloseAction(); // Close modal and refresh user list
    } catch (error) {
      console.error("Error deleting user:", error);
      alert(error instanceof Error ? error.message : "Failed to delete user. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const isEditing = (tab: TabType) => activeEditTab === tab;

  const handleCancelEdit = (tab: TabType) => {
    switch (tab) {
      case "overview":
        overviewForm.reset(overviewDefaults);
        break;
      case "subscription":
        subscriptionForm.reset(subscriptionDefaults);
        break;
      case "purchases":
        purchasesForm.reset(purchasesDefaults);
        removedOneTimePackagesRef.current = [];
        removedMiniPackagesRef.current = [];
        break;
      case "activity":
        activityForm.reset(activityDefaults);
        removedMajorDrawRef.current = [];
        removedMiniDrawRef.current = [];
        break;
      default:
        break;
    }

    setActiveEditTab(null);
  };

  const handleRemoveOneTime = (index: number) => {
    const value = purchasesForm.getValues(`oneTimePackages.${index}`);
    removedOneTimePackagesRef.current.push({ ...value, entriesGranted: 0, isActive: false });
    removeOneTime(index);
  };

  const handleRemoveMiniPackage = (index: number) => {
    const value = purchasesForm.getValues(`miniDrawPackages.${index}`);
    removedMiniPackagesRef.current.push({ ...value, entriesGranted: 0, isActive: false });
    removeMiniPackage(index);
  };

  const handleRemoveMajorDraw = (index: number) => {
    const value = activityForm.getValues(`majorDrawParticipation.${index}`);
    removedMajorDrawRef.current.push({ ...value, totalEntries: 0 });
    removeMajorDraw(index);
  };

  const handleRemoveMiniDraw = (index: number) => {
    const value = activityForm.getValues(`miniDrawParticipation.${index}`);
    removedMiniDrawRef.current.push({ ...value, totalEntries: 0, isActive: false });
    removeMiniDraw(index);
  };

  const handleAddOneTimePackage = () => {
    appendOneTime({
      packageId: "",
      purchaseDate: formatDateTimeLocal(new Date()),
      startDate: formatDateTimeLocal(new Date()),
      endDate: formatDateTimeLocal(new Date()),
      isActive: true,
      entriesGranted: 0,
    });
  };

  const handleAddMiniPackage = () => {
    appendMiniPackage({
      packageId: "",
      packageName: "",
      miniDrawId: "",
      purchaseDate: formatDateTimeLocal(new Date()),
      startDate: formatDateTimeLocal(new Date()),
      endDate: formatDateTimeLocal(new Date()),
      isActive: true,
      entriesGranted: 0,
      price: 0,
      partnerDiscountHours: 0,
      partnerDiscountDays: 0,
      stripePaymentIntentId: "",
    });
  };

  const handleAddMajorDraw = () => {
    appendMajorDraw({
      drawId: "",
      totalEntries: 0,
    });
  };

  const handleAddMiniDraw = () => {
    appendMiniDraw({
      miniDrawId: "",
      totalEntries: 0,
      isActive: true,
    });
  };

  const handleOverviewSubmit = async (values: OverviewFormValues) => {
    const payload: AdminUserUpdatePayload = {
      basicInfo: {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        mobile: values.mobile?.replace(/\s+/g, "") || undefined,
        state: values.state ? values.state.toUpperCase() : undefined,
        profession: values.profession?.trim() || undefined,
        role: values.role,
        isActive: values.isActive,
        isEmailVerified: values.isEmailVerified,
        isMobileVerified: values.isMobileVerified,
        profileSetupCompleted: values.profileSetupCompleted,
      },
    };

    try {
      await updateUser.mutateAsync({ userId: user.id, payload });
      alert("User details updated successfully.");
      setActiveEditTab(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update user details.");
    }
  };

  const handleSubscriptionSubmit = async (values: SubscriptionFormValues) => {
    const payload: AdminUserUpdatePayload = {
      subscription: {
        // Explicitly send null if empty string to clear packageId, otherwise send the value or undefined
        packageId: values.packageId && values.packageId.trim() ? values.packageId : null,
        status: values.status || undefined,
        isActive: values.isActive,
        autoRenew: values.autoRenew,
        startDate: toISOStringOrUndefined(values.startDate),
        endDate: toISOStringOrUndefined(values.endDate),
      },
    };

    if (rewardsFeatureEnabled) {
      payload.rewards = {
        rewardsPoints: values.rewardsPoints,
        accumulatedEntries: values.accumulatedEntries,
        entryWallet: values.entryWallet,
      };
    }

    try {
      await updateUser.mutateAsync({ userId: user.id, payload });
      alert("Subscription details updated successfully.");
      setActiveEditTab(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update subscription.");
    }
  };

  const handlePurchasesSubmit = async (values: PurchasesFormValues) => {
    const sanitizeOneTime = (entry: OneTimePackageFormValue) => {
      const startDateIso = toISOStringOrUndefined(entry.startDate);
      const endDateIso = toISOStringOrUndefined(entry.endDate);

      return {
        packageId: entry.packageId,
        purchaseDate: toISOStringOrUndefined(entry.purchaseDate) ?? entry.purchaseDate ?? undefined,
        startDate: startDateIso ?? entry.startDate,
        endDate: endDateIso ?? entry.endDate,
        isActive: entry.isActive,
        // ✅ FIX: Ensure entriesGranted is always a number (safety check)
        // Handles edge cases where value might still be a string despite onChange conversion
        entriesGranted: typeof entry.entriesGranted === "string" 
          ? Number(entry.entriesGranted) || 0 
          : entry.entriesGranted || 0,
      };
    };

    const sanitizeMiniPackage = (entry: MiniDrawPackageFormValue) => {
      const startDateIso = toISOStringOrUndefined(entry.startDate);
      const endDateIso = toISOStringOrUndefined(entry.endDate);

      return {
        packageId: entry.packageId,
        packageName: entry.packageName,
        miniDrawId: entry.miniDrawId ? entry.miniDrawId : undefined,
        purchaseDate: toISOStringOrUndefined(entry.purchaseDate) ?? entry.purchaseDate ?? undefined,
        startDate: startDateIso ?? entry.startDate,
        endDate: endDateIso ?? entry.endDate,
        isActive: entry.isActive,
        entriesGranted: entry.entriesGranted,
        price: entry.price,
        partnerDiscountHours: entry.partnerDiscountHours,
        partnerDiscountDays: entry.partnerDiscountDays,
        stripePaymentIntentId: entry.stripePaymentIntentId,
      };
    };

    const payload: AdminUserUpdatePayload = {
      oneTimePackages: [
        ...values.oneTimePackages.filter((pkg) => pkg.packageId.trim().length > 0).map(sanitizeOneTime),
        ...removedOneTimePackagesRef.current.map((pkg) => ({
          ...sanitizeOneTime(pkg),
          isActive: false,
          entriesGranted: 0,
        })),
      ],
      miniDrawPackages: [
        ...values.miniDrawPackages.filter((pkg) => pkg.packageId.trim().length > 0).map(sanitizeMiniPackage),
        ...removedMiniPackagesRef.current.map((pkg) => ({
          ...sanitizeMiniPackage(pkg),
          isActive: false,
          entriesGranted: 0,
        })),
      ],
    };

    try {
      await updateUser.mutateAsync({ userId: user.id, payload });
      alert("Package information updated successfully.");
      removedOneTimePackagesRef.current = [];
      removedMiniPackagesRef.current = [];
      setActiveEditTab(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update packages.");
    }
  };

  const handleActivitySubmit = async (values: ActivityFormValues) => {
    const payload: AdminUserUpdatePayload = {
      majorDrawParticipation: [
        ...values.majorDrawParticipation
          .filter((draw) => draw.drawId.trim().length > 0)
          .map((draw) => ({
            drawId: draw.drawId.trim(),
            totalEntries: draw.totalEntries,
          })),
        ...removedMajorDrawRef.current.map((draw) => ({
          drawId: draw.drawId.trim(),
          totalEntries: 0,
        })),
      ],
      miniDrawParticipation: [
        ...values.miniDrawParticipation
          .filter((entry) => entry.miniDrawId.trim().length > 0)
          .map((entry) => ({
            miniDrawId: entry.miniDrawId.trim(),
            totalEntries: entry.totalEntries,
            isActive: entry.isActive,
          })),
        ...removedMiniDrawRef.current.map((entry) => ({
          miniDrawId: entry.miniDrawId.trim(),
          totalEntries: 0,
          isActive: false,
        })),
      ],
    };

    try {
      await updateUser.mutateAsync({ userId: user.id, payload });
      alert("Draw participation updated successfully.");
      removedMajorDrawRef.current = [];
      removedMiniDrawRef.current = [];
      setActiveEditTab(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update draw participation.");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount); // Amount is already in dollars
  };

  // Icon color mapping for stats cards (matching AdminStatsCard)
  const getIconColorConfig = (color: string) => {
    const colorMap: Record<string, { bg: string; icon: string }> = {
      red: {
        bg: "bg-gradient-to-br from-red-500 via-red-600 to-red-700",
        icon: "text-white",
      },
      green: {
        bg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600",
        icon: "text-white",
      },
      blue: {
        bg: "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600",
        icon: "text-white",
      },
      yellow: {
        bg: "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600",
        icon: "text-white",
      },
      purple: {
        bg: "bg-gradient-to-br from-purple-500 via-purple-600 to-violet-600",
        icon: "text-white",
      },
      emerald: {
        bg: "bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-500",
        icon: "text-white",
      },
    };
    return colorMap[color] || colorMap.blue;
  };

  // Get avatar details (matching UsersManagement.tsx logic)
  const packageIcon = getPackageIconImage(user?.subscription?.packageName);
  const colorScheme = getPackageColorScheme(user?.subscription?.packageName);
  const hasActiveSubscription = user?.subscription?.isActive;
  const borderGradientColor = colorScheme ? getGradientColor(colorScheme.gradient) : "#6b7280";
  const isPremiumPackage =
    user?.subscription?.packageName?.toLowerCase().includes("boss") ||
    user?.subscription?.packageName?.toLowerCase().includes("power");

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div
          className="bg-white rounded-2xl shadow-2xl border-2 border-slate-200/50 max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fade-in"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b-2 border-slate-200/50 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 min-w-0 flex-1">
              {/* User Avatar - Logo or Package Icon (matching UsersManagement) */}
              {hasActiveSubscription && packageIcon ? (
                <span
                  className={`inline-flex items-center justify-center rounded-full shadow-lg relative overflow-hidden flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 ${
                    isPremiumPackage ? "animate-pulse" : ""
                  }`}
                  style={{
                    border: `2px solid transparent`,
                    backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${borderGradientColor}, transparent)`,
                    backgroundOrigin: `border-box`,
                    backgroundClip: `padding-box, border-box`,
                    padding: "3px",
                  }}
                >
                  <div className="relative w-full h-full flex-shrink-0 flex items-center justify-center">
                    <Image
                      src={packageIcon}
                      alt={user?.subscription?.packageName || "Package"}
                      className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 object-contain"
                      width={44}
                      height={44}
                    />
                  </div>
                </span>
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
                  <Image
                    src={defaultLogo}
                    alt="Tools Australia"
                    className="w-full h-full object-cover"
                    width={56}
                    height={56}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] sm:text-lg lg:text-2xl font-bold text-gray-900 truncate">
                  {user?.firstName} {user?.lastName}
                </h2>
                <p className="text-[10px] sm:text-xs lg:text-base text-gray-600 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={onCloseAction}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 p-1 sm:p-2"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </button>
          </div>

          {/* Tabs - Bigger on mobile for easy touching */}
          <div className="border-b-2 border-slate-200/50 bg-gradient-to-r from-slate-50 to-white sticky top-0 z-20 shadow-sm">
            <nav className="flex gap-1 sm:gap-2 lg:gap-4 px-2 sm:px-4 lg:px-6 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 py-4 sm:py-3 lg:py-4 px-4 sm:px-3 border-b-2 font-semibold text-xs sm:text-xs lg:text-sm transition-all whitespace-nowrap min-h-[48px] ${
                      isActive
                        ? "border-[#ee0000] text-[#ee0000] bg-red-50/30"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-4 sm:h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <ModalContent padding="lg" className="max-h-[calc(90vh-200px)]">
            {activeTab === "overview" && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Quick Stats - Elevated Design with Darker Icon Backgrounds */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
                  {[
                    {
                      title: "Total Spent",
                      value: formatCurrency(user.statistics.totalSpent),
                      icon: DollarSign,
                      color: "green",
                    },
                    {
                      title: "Major Draw Entries",
                      value: user.statistics.currentDrawEntries,
                      icon: Trophy,
                      color: "yellow",
                    },
                    {
                      title: "Rewards Points",
                      value: rewardsFeatureEnabled ? user.rewardsPoints : "Paused",
                      icon: Star,
                      color: "purple",
                    },
                    {
                      title: "Engagement Score",
                      value: `${user.statistics.engagementScore}/100`,
                      icon: Activity,
                      color: "blue",
                    },
                    ...(user.referral
                      ? [
                          {
                            title: "Referral Conversions",
                            value: user.referral.successfulConversions,
                            icon: Users,
                            color: "emerald",
                          },
                          {
                            title: "Referral Entries",
                            value: user.referral.totalEntriesAwarded,
                            icon: Gift,
                            color: "red",
                          },
                        ]
                      : []),
                  ].map((stat, idx) => {
                    const Icon = stat.icon;
                    const iconConfig = getIconColorConfig(stat.color);
                    return (
                      <div
                        key={idx}
                        className="relative rounded-xl shadow-lg border-2 border-slate-200/50 hover:border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden group"
                        style={{
                          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)",
                        }}
                      >
                        <div className="p-2 sm:p-3 lg:p-4">
                          <div className="flex items-start justify-between mb-1 sm:mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-600 font-semibold text-[9px] sm:text-[10px] lg:text-xs mb-0.5 sm:mb-1 truncate uppercase tracking-wide">
                                {stat.title}
                              </p>
                            </div>
                            <div
                              className={`w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 ${iconConfig.bg} rounded-lg sm:rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg flex-shrink-0`}
                            >
                              <Icon className={`w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 ${iconConfig.icon}`} />
                            </div>
                          </div>
                          <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 leading-none tracking-tight">
                            {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                          </p>
                        </div>
                        <div
                          className={`h-1 ${iconConfig.bg} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
                        ></div>
                      </div>
                    );
                  })}
                </div>

                {/* Basic Information - Minimized on mobile */}
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-2 sm:p-4 lg:p-6">
                  {isEditing("overview") ? (
                    <form
                      onSubmit={overviewForm.handleSubmit(handleOverviewSubmit)}
                      className="space-y-2 sm:space-y-4 lg:space-y-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">Basic Information</h3>
                          <p className="text-xs text-gray-500 hidden sm:block mt-0.5">
                            Update the user&apos;s profile and verification details. Changes sync immediately across the
                            admin dashboard.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("overview")}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updateUser.isPending ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <Controller
                          name="firstName"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="First Name"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="First name"
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="lastName"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Last Name"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="Last name"
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="email"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Email"
                              type="email"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="name@example.com"
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="mobile"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Mobile"
                              type="tel"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="0412 345 678"
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="state"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Select
                              label="State"
                              value={field.value || ""}
                              onChange={field.onChange}
                              options={[
                                { value: "", label: "Select state" },
                                ...AUSTRALIAN_STATES.map((state) => ({
                                  value: state.code,
                                  label: `${state.name} (${state.code})`,
                                })),
                              ]}
                              placeholder="Select state"
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="profession"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Profession"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="Enter profession"
                              maxLength={100}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          name="role"
                          control={overviewForm.control}
                          render={({ field }) => (
                            <Select
                              label="Role"
                              value={field.value || "user"}
                              onChange={field.onChange}
                              options={[
                                { value: "user", label: "User" },
                                { value: "admin", label: "Admin" },
                              ]}
                            />
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <Controller
                          control={overviewForm.control}
                          name="isActive"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Account is active"
                              />
                            </div>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="profileSetupCompleted"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Profile setup completed"
                              />
                            </div>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="isEmailVerified"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Email verified"
                              />
                            </div>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="isMobileVerified"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Mobile verified"
                              />
                            </div>
                          )}
                        />
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">Basic Information</h3>
                          <p className="text-xs text-gray-500 hidden sm:block mt-0.5">
                            Review contact details and verification status.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("overview")}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Details
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-start gap-2">
                          <Mail className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Email</p>
                            <p className="font-medium break-words text-sm mb-1">{user.email}</p>
                            <div className="flex items-center gap-1">
                              {user.isEmailVerified ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                              )}
                              <span className="text-xs text-gray-500">
                                {user.isEmailVerified ? "Verified" : "Unverified"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Mobile</p>
                            <p className="font-medium break-words text-sm mb-1">{user.mobile || "Not provided"}</p>
                            <div className="flex items-center gap-1">
                              {user.isMobileVerified ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                              )}
                              <span className="text-xs text-gray-500">
                                {user.isMobileVerified ? "Verified" : "Unverified"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Role</p>
                            <p className="font-medium capitalize text-sm">{user.role}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Account Status</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 col-span-2">
                          <CreditCard className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Saved payment methods</p>
                            {user.savedPaymentMethods && user.savedPaymentMethods.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {user.savedPaymentMethods.map((pm) => (
                                  <span
                                    key={pm.paymentMethodId}
                                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                                  >
                                    <span className="truncate max-w-[140px]">{pm.paymentMethodId}</span>
                                    {pm.isDefault && (
                                      <span className="ml-1 inline-flex items-center rounded-full bg-green-100 px-1 text-[10px] font-semibold text-green-700">
                                        Default
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No saved payment methods</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">State</p>
                            <p className="font-medium text-sm">{user.state || "Not provided"}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Profession</p>
                            <p className="font-medium text-sm">{user.profession || "Not provided"}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Member Since</p>
                            <p className="font-medium text-sm">{formatDate(user.createdAt)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{user.statistics.accountAge} days ago</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 mb-1">Last Login</p>
                            <p className="font-medium text-sm">
                              {user.lastLogin ? formatDate(user.lastLogin) : "No login recorded"}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {user.statistics.daysSinceLastLogin !== undefined &&
                              user.statistics.daysSinceLastLogin !== null
                                ? `${user.statistics.daysSinceLastLogin} days ago`
                                : "--"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {user.referral && (
                  <div className="bg-white rounded-xl border border-gray-100 p-2 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                      <div>
                        <h3 className="text-[11px] sm:text-base lg:text-lg font-semibold text-gray-900">
                          Referral Program
                        </h3>
                        <p className="text-[9px] sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                          Track referral conversions and rewards earned from {user.firstName}&apos;s invite code.
                        </p>
                      </div>
                      {user.referral.code && (
                        <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-semibold text-gray-700">
                          <span className="uppercase tracking-wide text-[9px] sm:text-xs text-gray-500">Code</span>
                          <span className="text-sm sm:text-lg font-bold text-gray-900">{user.referral.code}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 sm:mt-4 grid grid-cols-3 gap-1.5 sm:gap-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-[8px] sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Conversions</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.successfulConversions}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-[8px] sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Entries</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.totalEntriesAwarded}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-[8px] sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Pending</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.pendingCount}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      {referralHistory.length === 0 ? (
                        <p className="text-sm text-gray-500">No referral activity recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Role</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Friend Email</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Entries Awarded</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Conversion Date</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Recorded</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {referralHistory.map((event) => (
                                <tr key={event.id}>
                                  <td className="px-4 py-3 text-gray-700 capitalize">{event.role}</td>
                                  <td className="px-4 py-3 text-gray-700">{formatReferralStatus(event.status)}</td>
                                  <td className="px-4 py-3 text-gray-700">{event.friendEmail || "—"}</td>
                                  <td className="px-4 py-3 text-gray-700">{event.entriesAwarded}</td>
                                  <td className="px-4 py-3 text-gray-700">
                                    {formatReferralDate(event.conversionDate)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700">{formatReferralDate(event.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Actions - Minimized on mobile */}
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-2 sm:p-4 lg:p-6">
                  <h3 className="text-[11px] sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-4">
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
                    <button
                      onClick={() => setShowSendEmailModal(true)}
                      disabled={actionLoading === "send_email"}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-5 h-5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">Send Email</span>
                    </button>

                    <button
                      onClick={() => setShowAdminPasswordModal(true)}
                      disabled={actionLoading === "admin_set_password"}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                    >
                      <Key className="w-5 h-5 text-yellow-600" />
                      <span className="text-xs font-medium text-gray-700">Set Password</span>
                    </button>

                    <button
                      onClick={() =>
                        showActionConfirmation(
                          "clear_payment_methods",
                          "Clear Payment Methods",
                          "This will remove all saved payment methods from both the database and Stripe. This action cannot be undone.",
                          false
                        )
                      }
                      disabled={actionLoading === "clear_payment_methods" || !user?.savedPaymentMethods || user.savedPaymentMethods.length === 0}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors disabled:opacity-50"
                    >
                      <CreditCard className="w-5 h-5 text-orange-600" />
                      <span className="text-xs font-medium text-gray-700">Clear Payment Methods</span>
                    </button>

                    <button
                      onClick={handleDeleteClick}
                      disabled={isLoadingDeletionSummary || !userId}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <span className="text-xs font-medium text-gray-700">Delete User</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "subscription" && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-2 sm:p-4 lg:p-6">
                  {isEditing("subscription") ? (
                    <form
                      onSubmit={subscriptionForm.handleSubmit(handleSubscriptionSubmit)}
                      className="space-y-2 sm:space-y-4 lg:space-y-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                        <div>
                          <h3 className="text-[11px] sm:text-base lg:text-lg font-semibold text-gray-900">
                            Manage Subscription
                          </h3>
                          <p className="text-[9px] sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                            Assign or update the member&apos;s subscription package and adjust benefit totals.
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("subscription")}
                            className="rounded-lg border border-gray-300 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updateUser.isPending ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                        <Controller
                          name="packageId"
                          control={subscriptionForm.control}
                          render={({ field }) => (
                            <Select
                              label="Subscription Package"
                              value={field.value || ""}
                              onChange={field.onChange}
                              options={[
                                { value: "", label: "No active subscription" },
                                ...subscriptionPackageOptions.map((pkg) => ({
                                  value: pkg._id,
                                  label: pkg.name,
                                })),
                              ]}
                              placeholder="Select package"
                              className="text-[10px] sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                        <Controller
                          name="status"
                          control={subscriptionForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Status"
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="active | cancelled | past_due"
                              error={fieldState.error?.message}
                              wrapperClassName="text-[10px] sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                        <div>
                          <label className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-700">
                            Start Date
                          </label>
                          <input
                            type="datetime-local"
                            {...subscriptionForm.register("startDate")}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-700">
                            End Date
                          </label>
                          <input
                            type="datetime-local"
                            {...subscriptionForm.register("endDate")}
                            className={inputClasses}
                          />
                        </div>
                        <Controller
                          control={subscriptionForm.control}
                          name="isActive"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Subscription active"
                                className="text-[10px] sm:text-xs lg:text-sm"
                              />
                            </div>
                          )}
                        />
                        <Controller
                          control={subscriptionForm.control}
                          name="autoRenew"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 bg-white px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Auto renew enabled"
                                className="text-[10px] sm:text-xs lg:text-sm"
                              />
                            </div>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                        <Controller
                          name="rewardsPoints"
                          control={subscriptionForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Rewards Points"
                              type="number"
                              value={field.value || 0}
                              onChange={field.onChange}
                              min={0}
                              disabled={!rewardsFeatureEnabled}
                              error={
                                fieldState.error?.message || (!rewardsFeatureEnabled ? rewardsPauseMessage : undefined)
                              }
                              wrapperClassName="text-[10px] sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                        <Controller
                          name="accumulatedEntries"
                          control={subscriptionForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Accumulated Entries"
                              type="number"
                              value={field.value || 0}
                              onChange={field.onChange}
                              min={0}
                              disabled={!rewardsFeatureEnabled}
                              error={
                                fieldState.error?.message || (!rewardsFeatureEnabled ? rewardsPauseMessage : undefined)
                              }
                              wrapperClassName="text-[10px] sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                        <Controller
                          name="entryWallet"
                          control={subscriptionForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Entry Wallet"
                              type="number"
                              value={field.value || 0}
                              onChange={field.onChange}
                              min={0}
                              disabled={!rewardsFeatureEnabled}
                              error={
                                fieldState.error?.message || (!rewardsFeatureEnabled ? rewardsPauseMessage : undefined)
                              }
                              wrapperClassName="text-[10px] sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">Current Subscription</h3>
                          <p className="text-xs text-gray-500 hidden sm:block mt-0.5">
                            View the active membership plan, renewal schedule, and accumulated entries.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("subscription")}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Subscription
                        </button>
                      </div>

                      {user.subscription ? (
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Package</p>
                            <p className="font-medium text-sm">
                              {user.subscription.packageName || user.subscription.packageId}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Status</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.subscription.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {user.subscription.status}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Start Date</p>
                            <p className="font-medium text-sm">{formatDate(user.subscription.startDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">End Date</p>
                            <p className="font-medium text-sm">
                              {user.subscription.endDate ? formatDate(user.subscription.endDate) : "Active"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Auto Renew</p>
                            <span className="font-medium text-sm">
                              {user.subscription.autoRenew ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Rewards Points</p>
                            <p className="font-medium text-sm">
                              {rewardsFeatureEnabled ? user.rewardsPoints : "Unavailable"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Accumulated Entries</p>
                            <p className="font-medium text-sm">{user.subscription?.lastMonthAccumulatedEntries ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Entry Wallet</p>
                            <p className="font-medium text-sm">{user.entryWallet}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-8 text-center">
                          <Shield className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                          <h4 className="text-base font-semibold text-gray-900">No subscription assigned</h4>
                          <p className="mt-1 text-sm text-gray-500">
                            Click &quot;Edit Subscription&quot; above to allocate a membership package and grant
                            benefits.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Subscription History */}
                {user.subscriptionHistory.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">
                      Subscription History
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {user.subscriptionHistory.slice(0, 10).map((sub: SubscriptionHistoryItem, index: number) => {
                        // Resolve package name from packageId if packageName is not available
                        const resolvedPackageName =
                          sub.packageName || (sub.packageId ? getPackageById(sub.packageId)?.name : null);
                        const packageIcon = getPackageIconImage(resolvedPackageName);
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between gap-2 sm:gap-3 rounded-lg bg-white border border-gray-200 p-2 sm:p-3 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              {packageIcon ? (
                                (() => {
                                  const subColorScheme = getPackageColorScheme(resolvedPackageName);
                                  const subBorderGradientColor = subColorScheme
                                    ? getGradientColor(subColorScheme.gradient)
                                    : "#6b7280";
                                  const isSubPremium =
                                    resolvedPackageName?.toLowerCase().includes("boss") ||
                                    resolvedPackageName?.toLowerCase().includes("power");
                                  return (
                                    <span
                                      className={`inline-flex items-center justify-center rounded-full shadow-lg relative overflow-hidden flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${
                                        isSubPremium ? "animate-pulse" : ""
                                      }`}
                                      style={{
                                        border: `2px solid transparent`,
                                        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${subBorderGradientColor}, transparent)`,
                                        backgroundOrigin: `border-box`,
                                        backgroundClip: `padding-box, border-box`,
                                        padding: "2px",
                                      }}
                                    >
                                      <div className="relative w-full h-full flex-shrink-0 flex items-center justify-center">
                                        <Image
                                          src={packageIcon}
                                          alt={resolvedPackageName || "Package"}
                                          className="w-5 h-5 sm:w-7 sm:h-7 object-contain"
                                          width={28}
                                          height={28}
                                        />
                                      </div>
                                    </span>
                                  );
                                })()
                              ) : (
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
                                  <Image
                                    src={defaultLogo}
                                    alt="Tools Australia"
                                    className="w-full h-full object-cover"
                                    width={40}
                                    height={40}
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs sm:text-sm text-gray-900">
                                  {resolvedPackageName || sub.packageId || "Package"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-xs sm:text-sm text-gray-900">
                                {formatCurrency(sub.price || 0)}
                              </p>
                              <span
                                className={`inline-block mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium ${
                                  sub.status === "BenefitsGranted"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {sub.status || "Status not provided"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "purchases" && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Purchase Summary - Elevated Design with Darker Icon Backgrounds - 3 cards in 1 row on mobile */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-4">
                  {(() => {
                    // Calculate total orders - use orders array length if statistics is 0 or missing
                    const totalOrders =
                      user.statistics.totalOrders > 0 ? user.statistics.totalOrders : user.orders?.length || 0;

                    // Calculate average order value
                    const avgOrderValue =
                      user.statistics.averageOrderValue > 0
                        ? user.statistics.averageOrderValue
                        : user.statistics.totalSpent > 0 && totalOrders > 0
                        ? user.statistics.totalSpent / totalOrders
                        : 0;

                    return [
                      { title: "Total Orders", value: totalOrders, icon: Package, color: "blue" },
                      {
                        title: "Total Spent",
                        value: formatCurrency(user.statistics.totalSpent),
                        icon: DollarSign,
                        color: "green",
                      },
                      { title: "Average Order", value: formatCurrency(avgOrderValue), icon: Trophy, color: "purple" },
                    ];
                  })().map((stat, idx) => {
                    const Icon = stat.icon;
                    const iconConfig = getIconColorConfig(stat.color);
                    return (
                      <div
                        key={idx}
                        className="relative rounded-xl shadow-lg border-2 border-slate-200/50 hover:border-slate-300 hover:shadow-xl transition-all duration-300 overflow-hidden group"
                        style={{
                          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)",
                        }}
                      >
                        <div className="p-2 sm:p-3 lg:p-4">
                          <div className="flex items-start justify-between mb-1 sm:mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-600 font-semibold text-[9px] sm:text-[10px] lg:text-xs mb-0.5 sm:mb-1 truncate uppercase tracking-wide">
                                {stat.title}
                              </p>
                            </div>
                            <div
                              className={`w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 ${iconConfig.bg} rounded-lg sm:rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg flex-shrink-0`}
                            >
                              <Icon className={`w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 ${iconConfig.icon}`} />
                            </div>
                          </div>
                          <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 leading-none tracking-tight">
                            {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                          </p>
                        </div>
                        <div
                          className={`h-1 ${iconConfig.bg} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
                        ></div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-6">
                  {isEditing("purchases") ? (
                    <form onSubmit={purchasesForm.handleSubmit(handlePurchasesSubmit)} className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Manage Packages</h3>
                          <p className="text-sm text-gray-500">
                            Add or adjust one-time and mini draw packages. Removing a package will deactivate it and set
                            entries to zero.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("purchases")}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updateUser.isPending ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </div>

                      <section className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-base font-semibold text-gray-900">One-time Packages</h4>
                          <button
                            type="button"
                            onClick={handleAddOneTimePackage}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add One-time Package
                          </button>
                        </div>
                        <datalist id="one-time-package-options">
                          {oneTimePackageOptions.map((pkg) => (
                            <option key={pkg._id} value={pkg._id}>
                              {pkg.name}
                            </option>
                          ))}
                        </datalist>
                        <div className="space-y-4">
                          {oneTimeFields.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No one-time packages selected. Use the button above to grant a package.
                            </p>
                          ) : (
                            oneTimeFields.map((field, index) => {
                              const errors = purchasesForm.formState.errors.oneTimePackages?.[index];
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">
                                      One-time Package {index + 1}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOneTime(index)}
                                      className="text-sm font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Controller
                                      control={purchasesForm.control}
                                      name={`oneTimePackages.${index}.packageId` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Package ID"
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          placeholder="apprentice-pack"
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={purchasesForm.control}
                                      name={`oneTimePackages.${index}.entriesGranted` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Entries Granted"
                                          type="number"
                                          value={field.value || 0}
                                          onChange={(e) => {
                                            // ✅ FIX: Convert string to number for number input
                                            // HTML number inputs return strings, but schema expects number
                                            const numValue = e.target.value === "" ? 0 : Number(e.target.value);
                                            field.onChange(isNaN(numValue) ? 0 : numValue);
                                          }}
                                          min={0}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Purchase Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`oneTimePackages.${index}.purchaseDate` as const)}
                                        className={inputClasses}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Start Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`oneTimePackages.${index}.startDate` as const)}
                                        className={inputClasses}
                                      />
                                      {errors?.startDate && (
                                        <p className="mt-1 text-xs text-red-600">{errors.startDate.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">End Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`oneTimePackages.${index}.endDate` as const)}
                                        className={inputClasses}
                                      />
                                      {errors?.endDate && (
                                        <p className="mt-1 text-xs text-red-600">{errors.endDate.message}</p>
                                      )}
                                    </div>
                                    <Controller
                                      control={purchasesForm.control}
                                      name={`oneTimePackages.${index}.isActive` as const}
                                      render={({ field }) => (
                                        <div className="rounded-lg border-2 border-gray-200 bg-white px-4 py-3">
                                          <Checkbox
                                            checked={field.value}
                                            onChange={(e) => field.onChange(e.target.checked)}
                                            label="Package active"
                                          />
                                        </div>
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-base font-semibold text-gray-900">Mini Draw Packages</h4>
                          <button
                            type="button"
                            onClick={handleAddMiniPackage}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add Mini Draw Package
                          </button>
                        </div>
                        <div className="space-y-4">
                          {miniDrawPackageFields.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No mini draw packages are linked to this user. Add one to grant entries.
                            </p>
                          ) : (
                            miniDrawPackageFields.map((field, index) => {
                              const errors = purchasesForm.formState.errors.miniDrawPackages?.[index];
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">
                                      Mini Draw Package {index + 1}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniPackage(index)}
                                      className="text-sm font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Package ID</label>
                                      <input
                                        {...purchasesForm.register(`miniDrawPackages.${index}.packageId` as const)}
                                        className={inputClasses}
                                        placeholder="mini-pack-1"
                                      />
                                      {errors?.packageId && (
                                        <p className="mt-1 text-xs text-red-600">{errors.packageId.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Package Name</label>
                                      <input
                                        {...purchasesForm.register(`miniDrawPackages.${index}.packageName` as const)}
                                        className={inputClasses}
                                        placeholder="Mini Pack 1"
                                      />
                                      {errors?.packageName && (
                                        <p className="mt-1 text-xs text-red-600">{errors.packageName.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Mini Draw ID</label>
                                      <input
                                        {...purchasesForm.register(`miniDrawPackages.${index}.miniDrawId` as const)}
                                        className={inputClasses}
                                        placeholder="ObjectId"
                                      />
                                      {errors?.miniDrawId && (
                                        <p className="mt-1 text-xs text-red-600">{errors.miniDrawId.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Purchase Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`miniDrawPackages.${index}.purchaseDate` as const)}
                                        className={inputClasses}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Start Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`miniDrawPackages.${index}.startDate` as const)}
                                        className={inputClasses}
                                      />
                                      {errors?.startDate && (
                                        <p className="mt-1 text-xs text-red-600">{errors.startDate.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">End Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`miniDrawPackages.${index}.endDate` as const)}
                                        className={inputClasses}
                                      />
                                      {errors?.endDate && (
                                        <p className="mt-1 text-xs text-red-600">{errors.endDate.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Entries Granted</label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...purchasesForm.register(
                                          `miniDrawPackages.${index}.entriesGranted` as const,
                                          {
                                            valueAsNumber: true,
                                          }
                                        )}
                                        className={inputClasses}
                                      />
                                      {errors?.entriesGranted && (
                                        <p className="mt-1 text-xs text-red-600">{errors.entriesGranted.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Price (AUD)</label>
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        {...purchasesForm.register(`miniDrawPackages.${index}.price` as const, {
                                          valueAsNumber: true,
                                        })}
                                        className={inputClasses}
                                      />
                                      {errors?.price && (
                                        <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">
                                        Partner Discount Hours
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...purchasesForm.register(
                                          `miniDrawPackages.${index}.partnerDiscountHours` as const,
                                          { valueAsNumber: true }
                                        )}
                                        className={inputClasses}
                                      />
                                      {errors?.partnerDiscountHours && (
                                        <p className="mt-1 text-xs text-red-600">
                                          {errors.partnerDiscountHours.message}
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Partner Discount Days</label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...purchasesForm.register(
                                          `miniDrawPackages.${index}.partnerDiscountDays` as const,
                                          { valueAsNumber: true }
                                        )}
                                        className={inputClasses}
                                      />
                                      {errors?.partnerDiscountDays && (
                                        <p className="mt-1 text-xs text-red-600">
                                          {errors.partnerDiscountDays.message}
                                        </p>
                                      )}
                                    </div>
                                    <div className="md:col-span-2">
                                      <label className="text-sm font-medium text-gray-700">
                                        Stripe Payment Intent ID
                                      </label>
                                      <input
                                        {...purchasesForm.register(
                                          `miniDrawPackages.${index}.stripePaymentIntentId` as const
                                        )}
                                        className={inputClasses}
                                        placeholder="pi_..."
                                      />
                                      {errors?.stripePaymentIntentId && (
                                        <p className="mt-1 text-xs text-red-600">
                                          {errors.stripePaymentIntentId.message}
                                        </p>
                                      )}
                                    </div>
                                    <Controller
                                      control={purchasesForm.control}
                                      name={`miniDrawPackages.${index}.isActive` as const}
                                      render={({ field }) => (
                                        <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={field.value}
                                            onChange={(event) => field.onChange(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                                          />
                                          <span>Package active</span>
                                        </label>
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                        <div>
                          <h3 className="text-[11px] sm:text-base lg:text-lg font-semibold text-gray-900">
                            Packages & Entries
                          </h3>
                          <p className="text-[9px] sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                            Review package purchases below or switch to edit mode to grant additional entries.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("purchases")}
                          className="rounded-lg border border-gray-300 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Packages
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Recent Orders */}
                {!isEditing("purchases") && user.orders.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">
                      Recent Orders
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {user.orders.slice(0, 5).map((order: OrderItem, index: number) => (
                        <div
                          key={order._id || `order-${index}`}
                          className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs sm:text-sm text-gray-900">
                                Order #{order.orderNumber || order._id || "--"}
                              </p>
                              <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                                {formatDate(order.createdAt || new Date().toISOString())}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-xs sm:text-sm text-gray-900">
                              {formatCurrency(order.totalAmount || order.total || 0)}
                            </p>
                            <span
                              className={`inline-block mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-medium ${
                                order.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : order.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {order.status || "Unspecified"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* One-time Packages */}
                {!isEditing("purchases") && user.oneTimePackages.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">
                      One-time Packages
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {user.oneTimePackages.slice(0, 5).map((pkg: OneTimePackageItem, index: number) => {
                        const packageIcon = getPackageIconImage(pkg.packageName);
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              {packageIcon ? (
                                (() => {
                                  const pkgColorScheme = getPackageColorScheme(pkg.packageName);
                                  const pkgBorderGradientColor = pkgColorScheme
                                    ? getGradientColor(pkgColorScheme.gradient)
                                    : "#6b7280";
                                  const isPkgPremium =
                                    pkg.packageName?.toLowerCase().includes("boss") ||
                                    pkg.packageName?.toLowerCase().includes("power");
                                  return (
                                    <span
                                      className={`inline-flex items-center justify-center rounded-full shadow-lg relative overflow-hidden flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${
                                        isPkgPremium ? "animate-pulse" : ""
                                      }`}
                                      style={{
                                        border: `2px solid transparent`,
                                        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${pkgBorderGradientColor}, transparent)`,
                                        backgroundOrigin: `border-box`,
                                        backgroundClip: `padding-box, border-box`,
                                        padding: "2px",
                                      }}
                                    >
                                      <div className="relative w-full h-full flex-shrink-0 flex items-center justify-center">
                                        <Image
                                          src={packageIcon}
                                          alt={pkg.packageName || "Package"}
                                          className="w-5 h-5 sm:w-7 sm:h-7 object-contain"
                                          width={28}
                                          height={28}
                                        />
                                      </div>
                                    </span>
                                  );
                                })()
                              ) : (
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
                                  <Image
                                    src={defaultLogo}
                                    alt="Tools Australia"
                                    className="w-full h-full object-cover"
                                    width={40}
                                    height={40}
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs sm:text-sm text-gray-900">
                                  {pkg.packageName || pkg.packageId || "Package"}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <p className="text-[10px] sm:text-xs text-gray-600">
                                    {formatDate(pkg.purchaseDate || new Date().toISOString())}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-[10px] sm:text-xs lg:text-sm text-gray-900">
                                {pkg.entriesGranted || 0} entries
                              </p>
                              {pkg.price && (
                                <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-600 mt-0.5">
                                  {formatCurrency(pkg.price)}
                                </p>
                              )}
                              <span
                                className={`inline-block mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] lg:text-xs font-medium ${
                                  pkg.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {pkg.isActive ? "Active" : "Expired"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-2 sm:p-4 lg:p-6">
                  {isEditing("activity") ? (
                    <form
                      onSubmit={activityForm.handleSubmit(handleActivitySubmit)}
                      className="space-y-3 sm:space-y-4 lg:space-y-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900">Manage Draw Entries</h3>
                          <p className="text-xs text-gray-500 hidden sm:block mt-0.5">
                            Update the user&apos;s participation in major and mini draws. Removing an entry will clear
                            the draw record for this user.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("activity")}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-[#ee0000] to-[#ff4444] px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-[#cc0000] hover:to-[#e60000] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {updateUser.isPending ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </div>

                      <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-semibold text-gray-900">Major Draw Participation</h4>
                          <button
                            type="button"
                            onClick={handleAddMajorDraw}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add Entry
                          </button>
                        </div>
                        <div className="space-y-2">
                          {majorDrawFields.length === 0 ? (
                            <p className="text-xs text-gray-500">
                              No major draw entries recorded. Use the button above to add one.
                            </p>
                          ) : (
                            majorDrawFields.map((field, index) => {
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">Major Draw {index + 1}</h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMajorDraw(index)}
                                      className="text-xs font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`majorDrawParticipation.${index}.drawId` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Draw ID"
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          placeholder="Major draw ObjectId"
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`majorDrawParticipation.${index}.totalEntries` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Total Entries"
                                          type="number"
                                          value={field.value || 0}
                                          onChange={(e) => {
                                            const value = e.target.value === "" ? 0 : Number(e.target.value);
                                            field.onChange(isNaN(value) ? 0 : value);
                                          }}
                                          min={0}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs sm:text-sm font-semibold text-gray-900">Mini Draw Participation</h4>
                          <button
                            type="button"
                            onClick={handleAddMiniDraw}
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add Entry
                          </button>
                        </div>
                        <div className="space-y-2">
                          {miniDrawFields.length === 0 ? (
                            <p className="text-xs text-gray-500">
                              No mini draw entries recorded. Use the button above to add one.
                            </p>
                          ) : (
                            miniDrawFields.map((field, index) => {
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">Mini Draw {index + 1}</h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniDraw(index)}
                                      className="text-xs font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.miniDrawId` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Mini Draw ID"
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          placeholder="Mini draw ObjectId"
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.totalEntries` as const}
                                      render={({ field, fieldState }) => (
                                        <Input
                                          label="Total Entries"
                                          type="number"
                                          value={field.value || 0}
                                          onChange={(e) => {
                                            const value = e.target.value === "" ? 0 : Number(e.target.value);
                                            field.onChange(isNaN(value) ? 0 : value);
                                          }}
                                          min={0}
                                          error={fieldState.error?.message}
                                        />
                                      )}
                                    />
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.isActive` as const}
                                      render={({ field }) => (
                                        <div className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5">
                                          <Checkbox
                                            checked={field.value ?? true}
                                            onChange={(e) => field.onChange(e.target.checked)}
                                            label="Entry active"
                                          />
                                        </div>
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Draw Participation</h3>
                          <p className="text-sm text-gray-500">
                            Review draw entries below or switch to edit mode to adjust allocations.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("activity")}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Entries
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Major Draw Participation */}
                {!isEditing("activity") && user.majorDrawParticipation.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Major Draw Participation</h3>
                    <div className="space-y-2">
                      {user.majorDrawParticipation.map((draw: MajorDrawParticipationItem, index: number) => (
                        <div
                          key={draw.drawId || `draw-${index}`}
                          className="flex items-center justify-between p-2.5 sm:p-3 bg-white rounded-lg border border-gray-200"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{draw.title || draw.drawId || "Major draw"}</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {draw.endDate ? formatDate(draw.endDate) : "End date not set"}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="font-semibold text-sm sm:text-base">{draw.totalEntries || 0}</p>
                            <p className="text-xs text-gray-500">entries</p>
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                draw.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : draw.status === "active"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {draw.status || "Unspecified"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mini Draw Participation */}
                {!isEditing("activity") && user.miniDrawParticipation?.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Mini Draw Participation</h3>
                    <div className="space-y-2">
                      {user.miniDrawParticipation.map((entry, index: number) => {
                        const miniDrawName = (entry as { miniDrawName?: string }).miniDrawName;
                        const miniDrawStatus = (entry as { miniDrawStatus?: string }).miniDrawStatus;
                        const drawDate = (entry as { drawDate?: string | Date }).drawDate;
                        const drawDateValue = drawDate
                          ? typeof drawDate === "string"
                            ? drawDate
                            : (drawDate as Date).toISOString()
                          : undefined;
                        return (
                          <div
                            key={entry.miniDrawId?.toString?.() || `mini-${index}`}
                            className="flex items-center justify-between p-2.5 sm:p-3 bg-white rounded-lg border border-gray-200"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {miniDrawName || entry.miniDrawId?.toString?.() || "Mini draw"}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {drawDateValue ? formatDate(drawDateValue) : "Draw date not set"}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="font-semibold text-sm sm:text-base">{entry.totalEntries || 0}</p>
                              <p className="text-xs text-gray-500">entries</p>
                              <span
                                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  miniDrawStatus === "completed"
                                    ? "bg-green-100 text-green-800"
                                    : entry.isActive
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {miniDrawStatus || (entry.isActive ? "Active" : "Inactive")}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Payment Events */}
                {user.paymentEvents.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border-2 border-slate-200/50 shadow-lg p-3 sm:p-4 lg:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 lg:mb-4">
                      Recent Activity
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {user.paymentEvents.slice(0, 10).map((event: PaymentEventItem, index: number) => {
                        const eventDescription = formatActivityEvent(event, formatCurrency);
                        const eventIcon =
                          event.packageType === "membership"
                            ? CreditCard
                            : event.packageType === "one-time"
                            ? Package
                            : event.packageType === "mini-draw"
                            ? Trophy
                            : event.packageType === "upsell"
                            ? Gift
                            : Activity;
                        const Icon = eventIcon;

                        return (
                          <div
                            key={index}
                            className="flex items-start justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg border-2 border-slate-200/50 hover:shadow-md hover:border-slate-300 transition-all"
                          >
                            <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                              <div className="flex-shrink-0 mt-0.5">
                                <div
                                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${
                                    event.packageType === "membership"
                                      ? "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600"
                                      : event.packageType === "one-time"
                                      ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600"
                                      : event.packageType === "mini-draw"
                                      ? "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600"
                                      : event.packageType === "upsell"
                                      ? "bg-gradient-to-br from-purple-500 via-purple-600 to-violet-600"
                                      : "bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700"
                                  } shadow-md`}
                                >
                                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[10px] sm:text-xs lg:text-sm text-gray-900 break-words">
                                  {eventDescription}
                                </p>
                                <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-500 mt-0.5">
                                  {formatDate(event.timestamp || new Date().toISOString())}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {(() => {
                                const eventData = event.data as Record<string, unknown> | undefined;
                                const price = eventData?.price;
                                return price != null && typeof price === "number" ? (
                                  <p className="font-semibold text-[10px] sm:text-xs lg:text-sm text-gray-900">
                                    {formatCurrency(price)}
                                  </p>
                                ) : null;
                              })()}
                              {event.packageType && (
                                <span className="inline-block mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] lg:text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                                  {event.packageType.replace("-", " ")}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalContent>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{showActionModal.title}</h3>
            <p className="text-gray-600 mb-6">{showActionModal.description}</p>

            {showActionModal.requiresInput && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {showActionModal.action === "toggle_status" ? "Reason (optional)" : "Note"}
                </label>
                <textarea
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  placeholder={showActionModal.inputPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ee0000] focus:border-transparent"
                  rows={3}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setActionInput("");
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={actionLoading === showActionModal.action}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white rounded-lg hover:from-[#cc0000] hover:to-[#e60000] disabled:opacity-50 transition-all"
              >
                {actionLoading === showActionModal.action ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showSendEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Send Email</h3>
            <p className="text-gray-600 mb-6">Compose and send an email directly to the user.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  rows={5}
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Write your message..."
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSendEmailModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading === "send_email"}
                onClick={handleSendEmail}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {actionLoading === "send_email" ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Set Password Modal */}
      {showAdminPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Set New Password</h3>
            <p className="text-gray-600 mb-6">
              Set a new password for this user. Minimum length is enforced; no verification email is sent.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-yellow-500 focus:outline-none"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdminPasswordModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading === "admin_set_password"}
                onClick={handleAdminSetPassword}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-500 to-yellow-400 text-sm font-semibold text-white shadow-sm hover:from-yellow-600 hover:to-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {actionLoading === "admin_set_password" ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletionSummary(null);
        }}
        onConfirm={handleConfirmDelete}
        type="delete"
        title="Delete User"
        message="This will permanently delete the user and all associated data. This action cannot be undone."
        confirmText="Delete User"
        cancelText="Cancel"
        isLoading={isDeleting}
        details={{
          packageName: "", // Not used for deletion, but required by interface
          deletionDetails: deletionSummary || undefined,
          requireEmailConfirmation: true,
          userEmail: user?.email,
        }}
      />
    </>
  );
}
