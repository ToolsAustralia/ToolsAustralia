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
  UserCheck,
  UserX,
  MessageSquare,
  Gift,
} from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { membershipPackages } from "@/data/membershipPackages";
import { AdminUserUpdatePayload, UserActionType } from "@/types/admin";
import { useAdminUpdateUser, useAdminUserActions, useAdminUserDetail } from "@/hooks/queries/useAdminQueries";
import { UserStatsCardCompact } from "./UserStatsCard";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

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

  const { data: user, isLoading, error } = useAdminUserDetail(userId || "");
  const userActions = useAdminUserActions();
  const updateUser = useAdminUpdateUser();
  const [activeEditTab, setActiveEditTab] = useState<TabType | null>(null);
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
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ee0000]";

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4">
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4">
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
        packageId: values.packageId || undefined,
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
        entriesGranted: entry.entriesGranted,
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

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-[#ee0000] to-[#ff4444] rounded-full flex items-center justify-center text-white font-bold text-lg">
                {user.firstName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-gray-600">{user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {user.role === "admin" ? "Admin" : "User"}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onCloseAction} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
            <nav className="flex gap-6 px-6 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      isActive
                        ? "border-[#ee0000] text-[#ee0000]"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  <UserStatsCardCompact
                    title="Total Spent"
                    value={formatCurrency(user.statistics.totalSpent)}
                    icon={DollarSign}
                    color="green"
                  />
                  <UserStatsCardCompact
                    title="Major Draw Entries"
                    value={user.statistics.currentDrawEntries}
                    icon={Trophy}
                    color="yellow"
                  />
                  <UserStatsCardCompact
                    title="Rewards Points"
                    value={rewardsFeatureEnabled ? user.rewardsPoints : "Paused"}
                    icon={Star}
                    color="purple"
                  />
                  <UserStatsCardCompact
                    title="Engagement Score"
                    value={`${user.statistics.engagementScore}/100`}
                    icon={Activity}
                    color="blue"
                  />
                  {user.referral && (
                    <>
                      <UserStatsCardCompact
                        title="Referral Conversions"
                        value={user.referral.successfulConversions}
                        icon={Users}
                        color="emerald"
                      />
                      <UserStatsCardCompact
                        title="Referral Entries"
                        value={user.referral.totalEntriesAwarded}
                        icon={Gift}
                        color="red"
                      />
                    </>
                  )}
                </div>

                {/* Basic Information */}
                <div className="bg-gray-50 rounded-xl p-6">
                  {isEditing("overview") ? (
                    <form onSubmit={overviewForm.handleSubmit(handleOverviewSubmit)} className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                          <p className="text-sm text-gray-500">
                            Update the user&apos;s profile and verification details. Changes sync immediately across the
                            admin dashboard.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("overview")}
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">First Name</label>
                          <input
                            {...overviewForm.register("firstName")}
                            className={inputClasses}
                            placeholder="First name"
                          />
                          {overviewForm.formState.errors.firstName && (
                            <p className="mt-1 text-xs text-red-600">
                              {overviewForm.formState.errors.firstName.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Last Name</label>
                          <input
                            {...overviewForm.register("lastName")}
                            className={inputClasses}
                            placeholder="Last name"
                          />
                          {overviewForm.formState.errors.lastName && (
                            <p className="mt-1 text-xs text-red-600">
                              {overviewForm.formState.errors.lastName.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Email</label>
                          <input
                            type="email"
                            {...overviewForm.register("email")}
                            className={inputClasses}
                            placeholder="name@example.com"
                          />
                          {overviewForm.formState.errors.email && (
                            <p className="mt-1 text-xs text-red-600">{overviewForm.formState.errors.email.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Mobile</label>
                          <input
                            {...overviewForm.register("mobile")}
                            className={inputClasses}
                            placeholder="0412 345 678"
                          />
                          {overviewForm.formState.errors.mobile && (
                            <p className="mt-1 text-xs text-red-600">{overviewForm.formState.errors.mobile.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">State</label>
                          <select {...overviewForm.register("state")} className={inputClasses}>
                            <option value="">Select state</option>
                            {AUSTRALIAN_STATES.map((state) => (
                              <option key={state.code} value={state.code}>
                                {state.name} ({state.code})
                              </option>
                            ))}
                          </select>
                          {overviewForm.formState.errors.state && (
                            <p className="mt-1 text-xs text-red-600">{overviewForm.formState.errors.state.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Role</label>
                          <select {...overviewForm.register("role")} className={inputClasses}>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={overviewForm.control}
                          name="isActive"
                          render={({ field }) => (
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Account is active</span>
                            </label>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="profileSetupCompleted"
                          render={({ field }) => (
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Profile setup completed</span>
                            </label>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="isEmailVerified"
                          render={({ field }) => (
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Email verified</span>
                            </label>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="isMobileVerified"
                          render={({ field }) => (
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Mobile verified</span>
                            </label>
                          )}
                        />
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                          <p className="text-sm text-gray-500">Review contact details and verification status.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("overview")}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Details
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <Mail className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Email</p>
                            <p className="font-medium break-words">{user.email}</p>
                            <div className="flex items-center gap-1 mt-1">
                              {user.isEmailVerified ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              )}
                              <span className="text-xs text-gray-500">
                                {user.isEmailVerified ? "Verified" : "Unverified"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Mobile</p>
                            <p className="font-medium break-words">{user.mobile || "Not provided"}</p>
                            <div className="flex items-center gap-1 mt-1">
                              {user.isMobileVerified ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              )}
                              <span className="text-xs text-gray-500">
                                {user.isMobileVerified ? "Verified" : "Unverified"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <User className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Role</p>
                            <p className="font-medium capitalize">{user.role}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Shield className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Account Status</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                user.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">State</p>
                            <p className="font-medium">{user.state || "Not provided"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Member Since</p>
                            <p className="font-medium">{formatDate(user.createdAt)}</p>
                            <p className="text-xs text-gray-500">{user.statistics.accountAge} days ago</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-sm text-gray-600">Last Login</p>
                            <p className="font-medium">
                              {user.lastLogin ? formatDate(user.lastLogin) : "No login recorded"}
                            </p>
                            <p className="text-xs text-gray-500">
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
                  <div className="bg-white rounded-xl border border-gray-100 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Referral Program</h3>
                        <p className="text-sm text-gray-500">
                          Track referral conversions and rewards earned from {user.firstName}&apos;s invite code.
                        </p>
                      </div>
                      {user.referral.code && (
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
                          <span className="uppercase tracking-wide text-xs text-gray-500">Code</span>
                          <span className="text-lg font-bold text-gray-900">{user.referral.code}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs uppercase text-gray-500 mb-1">Successful Conversions</p>
                        <p className="text-2xl font-bold text-gray-900">{user.referral.successfulConversions}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs uppercase text-gray-500 mb-1">Total Entries Awarded</p>
                        <p className="text-2xl font-bold text-gray-900">{user.referral.totalEntriesAwarded}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs uppercase text-gray-500 mb-1">Pending Conversions</p>
                        <p className="text-2xl font-bold text-gray-900">{user.referral.pendingCount}</p>
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

                {/* Quick Actions */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      onClick={() =>
                        showActionConfirmation(
                          "resend_verification",
                          "Resend Verification Email",
                          "Send a new email verification code to this user."
                        )
                      }
                      disabled={actionLoading === "resend_verification"}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      <Send className="w-5 h-5 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">Resend Email</span>
                    </button>

                    <button
                      onClick={() =>
                        showActionConfirmation(
                          "reset_password",
                          "Reset Password",
                          "Send a password reset email to this user."
                        )
                      }
                      disabled={actionLoading === "reset_password"}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                    >
                      <Key className="w-5 h-5 text-yellow-600" />
                      <span className="text-xs font-medium text-gray-700">Reset Password</span>
                    </button>

                    <button
                      onClick={() =>
                        showActionConfirmation(
                          "toggle_status",
                          user.isActive ? "Deactivate Account" : "Activate Account",
                          user.isActive
                            ? "Deactivate this user account. They will not be able to log in."
                            : "Activate this user account. They will be able to log in again.",
                          true,
                          "Reason for this action (optional)"
                        )
                      }
                      disabled={actionLoading === "toggle_status"}
                      className={`flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 transition-colors disabled:opacity-50 ${
                        user.isActive
                          ? "hover:border-red-300 hover:bg-red-50"
                          : "hover:border-green-300 hover:bg-green-50"
                      }`}
                    >
                      {user.isActive ? (
                        <UserX className="w-5 h-5 text-red-600" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-green-600" />
                      )}
                      <span className="text-xs font-medium text-gray-700">
                        {user.isActive ? "Deactivate" : "Activate"}
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        showActionConfirmation(
                          "add_note",
                          "Add Admin Note",
                          "Add an internal note about this user for other admins.",
                          true,
                          "Enter your note here..."
                        )
                      }
                      disabled={actionLoading === "add_note"}
                      className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >
                      <MessageSquare className="w-5 h-5 text-purple-600" />
                      <span className="text-xs font-medium text-gray-700">Add Note</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "subscription" && (
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-6">
                  {isEditing("subscription") ? (
                    <form onSubmit={subscriptionForm.handleSubmit(handleSubscriptionSubmit)} className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Manage Subscription</h3>
                          <p className="text-sm text-gray-500">
                            Assign or update the member&apos;s subscription package and adjust benefit totals.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("subscription")}
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

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Subscription Package</label>
                          <select {...subscriptionForm.register("packageId")} className={inputClasses}>
                            <option value="">No active subscription</option>
                            {subscriptionPackageOptions.map((pkg) => (
                              <option key={pkg._id} value={pkg._id}>
                                {pkg.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Status</label>
                          <input
                            {...subscriptionForm.register("status")}
                            className={inputClasses}
                            placeholder="active | cancelled | past_due"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Start Date</label>
                          <input
                            type="datetime-local"
                            {...subscriptionForm.register("startDate")}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">End Date</label>
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
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Subscription active</span>
                            </label>
                          )}
                        />
                        <Controller
                          control={subscriptionForm.control}
                          name="autoRenew"
                          render={({ field }) => (
                            <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={(event) => field.onChange(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                              />
                              <span>Auto renew enabled</span>
                            </label>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Rewards Points</label>
                          <input
                            type="number"
                            {...subscriptionForm.register("rewardsPoints", { valueAsNumber: true })}
                            className={`${inputClasses} ${
                              !rewardsFeatureEnabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                            min={0}
                            disabled={!rewardsFeatureEnabled}
                            title={!rewardsFeatureEnabled ? rewardsPauseMessage : undefined}
                          />
                          {!rewardsFeatureEnabled && (
                            <p className="mt-1 text-xs text-gray-500">{rewardsPauseMessage}</p>
                          )}
                          {subscriptionForm.formState.errors.rewardsPoints && (
                            <p className="mt-1 text-xs text-red-600">
                              {subscriptionForm.formState.errors.rewardsPoints.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Accumulated Entries</label>
                          <input
                            type="number"
                            {...subscriptionForm.register("accumulatedEntries", { valueAsNumber: true })}
                            className={`${inputClasses} ${
                              !rewardsFeatureEnabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                            min={0}
                            disabled={!rewardsFeatureEnabled}
                            title={!rewardsFeatureEnabled ? rewardsPauseMessage : undefined}
                          />
                          {!rewardsFeatureEnabled && (
                            <p className="mt-1 text-xs text-gray-500">{rewardsPauseMessage}</p>
                          )}
                          {subscriptionForm.formState.errors.accumulatedEntries && (
                            <p className="mt-1 text-xs text-red-600">
                              {subscriptionForm.formState.errors.accumulatedEntries.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Entry Wallet</label>
                          <input
                            type="number"
                            {...subscriptionForm.register("entryWallet", { valueAsNumber: true })}
                            className={`${inputClasses} ${
                              !rewardsFeatureEnabled ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                            min={0}
                            disabled={!rewardsFeatureEnabled}
                            title={!rewardsFeatureEnabled ? rewardsPauseMessage : undefined}
                          />
                          {!rewardsFeatureEnabled && (
                            <p className="mt-1 text-xs text-gray-500">{rewardsPauseMessage}</p>
                          )}
                          {subscriptionForm.formState.errors.entryWallet && (
                            <p className="mt-1 text-xs text-red-600">
                              {subscriptionForm.formState.errors.entryWallet.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Current Subscription</h3>
                          <p className="text-sm text-gray-500">
                            View the active membership plan, renewal schedule, and accumulated entries.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("subscription")}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Subscription
                        </button>
                      </div>

                      {user.subscription ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Package</p>
                            <p className="font-medium">
                              {user.subscription.packageName || user.subscription.packageId}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Status</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                user.subscription.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {user.subscription.status}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Start Date</p>
                            <p className="font-medium">{formatDate(user.subscription.startDate)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">End Date</p>
                            <p className="font-medium">
                              {user.subscription.endDate ? formatDate(user.subscription.endDate) : "Active"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Auto Renew</p>
                            <span className="font-medium">{user.subscription.autoRenew ? "Enabled" : "Disabled"}</span>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Rewards Points</p>
                            <p className="font-medium">{rewardsFeatureEnabled ? user.rewardsPoints : "Paused"}</p>
                            {!rewardsFeatureEnabled && <p className="text-xs text-gray-500">{rewardsPauseMessage}</p>}
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Accumulated Entries</p>
                            <p className="font-medium">{user.accumulatedEntries}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Entry Wallet</p>
                            <p className="font-medium">{user.entryWallet}</p>
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
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription History</h3>
                    <div className="space-y-3">
                      {user.subscriptionHistory.slice(0, 10).map((sub: SubscriptionHistoryItem, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-4 rounded-lg bg-white p-3">
                          <div>
                            <p className="font-medium">{sub.packageName || sub.packageId || "Package"}</p>
                            <p className="text-sm text-gray-600">
                              {formatDate(sub.timestamp || new Date().toISOString())}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(sub.price || 0)}</p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                sub.status === "BenefitsGranted"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {sub.status || "Status not provided"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "purchases" && (
              <div className="space-y-6">
                {/* Purchase Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <UserStatsCardCompact
                    title="Total Orders"
                    value={user.statistics.totalOrders}
                    icon={Package}
                    color="blue"
                  />
                  <UserStatsCardCompact
                    title="Total Spent"
                    value={formatCurrency(user.statistics.totalSpent)}
                    icon={DollarSign}
                    color="green"
                  />
                  <UserStatsCardCompact
                    title="Average Order"
                    value={formatCurrency(user.statistics.averageOrderValue)}
                    icon={Trophy}
                    color="purple"
                  />
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
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
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Package ID</label>
                                      <input
                                        list="one-time-package-options"
                                        {...purchasesForm.register(`oneTimePackages.${index}.packageId` as const)}
                                        className={inputClasses}
                                        placeholder="apprentice-pack"
                                      />
                                      {errors?.packageId && (
                                        <p className="mt-1 text-xs text-red-600">{errors.packageId.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Entries Granted</label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...purchasesForm.register(`oneTimePackages.${index}.entriesGranted` as const, {
                                          valueAsNumber: true,
                                        })}
                                        className={inputClasses}
                                      />
                                      {errors?.entriesGranted && (
                                        <p className="mt-1 text-xs text-red-600">{errors.entriesGranted.message}</p>
                                      )}
                                    </div>
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
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Packages & Entries</h3>
                          <p className="text-sm text-gray-500">
                            Review package purchases below or switch to edit mode to grant additional entries.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveEditTab("purchases")}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit Packages
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Recent Orders */}
                {!isEditing("purchases") && user.orders.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h3>
                    <div className="space-y-3">
                      {user.orders.slice(0, 5).map((order: OrderItem, index: number) => (
                        <div
                          key={order._id || `order-${index}`}
                          className="flex items-center justify-between p-3 bg-white rounded-lg"
                        >
                          <div>
                            <p className="font-medium">Order #{order.orderNumber || order._id || "--"}</p>
                            <p className="text-sm text-gray-600">
                              {formatDate(order.createdAt || new Date().toISOString())}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(order.totalAmount || 0)}</p>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">One-time Packages</h3>
                    <div className="space-y-3">
                      {user.oneTimePackages.slice(0, 5).map((pkg: OneTimePackageItem, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg">
                          <div>
                            <p className="font-medium">{pkg.packageName || pkg.packageId || "Package"}</p>
                            <p className="text-sm text-gray-600">
                              {formatDate(pkg.purchaseDate || new Date().toISOString())}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{pkg.entriesGranted || 0} entries</p>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                pkg.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {pkg.isActive ? "Active" : "Expired"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-xl p-6">
                  {isEditing("activity") ? (
                    <form onSubmit={activityForm.handleSubmit(handleActivitySubmit)} className="space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Manage Draw Entries</h3>
                          <p className="text-sm text-gray-500">
                            Update the user&apos;s participation in major and mini draws. Removing an entry will clear
                            the draw record for this user.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("activity")}
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
                          <h4 className="text-base font-semibold text-gray-900">Major Draw Participation</h4>
                          <button
                            type="button"
                            onClick={handleAddMajorDraw}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add Major Draw Entry
                          </button>
                        </div>
                        <div className="space-y-4">
                          {majorDrawFields.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No major draw entries recorded. Use the button above to add one.
                            </p>
                          ) : (
                            majorDrawFields.map((field, index) => {
                              const errors = activityForm.formState.errors.majorDrawParticipation?.[index];
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">Major Draw {index + 1}</h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMajorDraw(index)}
                                      className="text-sm font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Draw ID</label>
                                      <input
                                        {...activityForm.register(`majorDrawParticipation.${index}.drawId` as const)}
                                        className={inputClasses}
                                        placeholder="Major draw ObjectId"
                                      />
                                      {errors?.drawId && (
                                        <p className="mt-1 text-xs text-red-600">{errors.drawId.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Total Entries</label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...activityForm.register(
                                          `majorDrawParticipation.${index}.totalEntries` as const,
                                          { valueAsNumber: true }
                                        )}
                                        className={inputClasses}
                                      />
                                      {errors?.totalEntries && (
                                        <p className="mt-1 text-xs text-red-600">{errors.totalEntries.message}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <section className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-base font-semibold text-gray-900">Mini Draw Participation</h4>
                          <button
                            type="button"
                            onClick={handleAddMiniDraw}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Add Mini Draw Entry
                          </button>
                        </div>
                        <div className="space-y-4">
                          {miniDrawFields.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No mini draw entries recorded. Use the button above to add one.
                            </p>
                          ) : (
                            miniDrawFields.map((field, index) => {
                              const errors = activityForm.formState.errors.miniDrawParticipation?.[index];
                              return (
                                <div
                                  key={field.id}
                                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">Mini Draw {index + 1}</h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniDraw(index)}
                                      className="text-sm font-medium text-[#ee0000] hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Mini Draw ID</label>
                                      <input
                                        {...activityForm.register(`miniDrawParticipation.${index}.miniDrawId` as const)}
                                        className={inputClasses}
                                        placeholder="Mini draw ObjectId"
                                      />
                                      {errors?.miniDrawId && (
                                        <p className="mt-1 text-xs text-red-600">{errors.miniDrawId.message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Total Entries</label>
                                      <input
                                        type="number"
                                        min={0}
                                        {...activityForm.register(
                                          `miniDrawParticipation.${index}.totalEntries` as const,
                                          { valueAsNumber: true }
                                        )}
                                        className={inputClasses}
                                      />
                                      {errors?.totalEntries && (
                                        <p className="mt-1 text-xs text-red-600">{errors.totalEntries.message}</p>
                                      )}
                                    </div>
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.isActive` as const}
                                      render={({ field }) => (
                                        <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                                          <input
                                            type="checkbox"
                                            checked={field.value ?? true}
                                            onChange={(event) => field.onChange(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-[#ee0000] focus:ring-[#ee0000]"
                                          />
                                          <span>Entry active</span>
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
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Major Draw Participation</h3>
                    <div className="space-y-3">
                      {user.majorDrawParticipation.map((draw: MajorDrawParticipationItem, index: number) => (
                        <div
                          key={draw.drawId || `draw-${index}`}
                          className="flex items-center justify-between p-3 bg-white rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{draw.title || draw.drawId || "Major draw"}</p>
                            <p className="text-sm text-gray-600">
                              {draw.endDate ? formatDate(draw.endDate) : "End date not set"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{draw.totalEntries || 0} entries</p>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Mini Draw Participation</h3>
                    <div className="space-y-3">
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
                            className="flex items-center justify-between p-3 bg-white rounded-lg"
                          >
                            <div>
                              <p className="font-medium">
                                {miniDrawName || entry.miniDrawId?.toString?.() || "Mini draw"}
                              </p>
                              <p className="text-sm text-gray-600">
                                {drawDateValue ? formatDate(drawDateValue) : "Draw date not set"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{entry.totalEntries || 0} entries</p>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                    <div className="space-y-3">
                      {user.paymentEvents.slice(0, 10).map((event: PaymentEventItem, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg">
                          <div>
                            <p className="font-medium">{event.eventType || "Payment event"}</p>
                            <p className="text-sm text-gray-600">
                              {formatDate(event.timestamp || new Date().toISOString())}
                            </p>
                          </div>
                          <div className="text-right">
                            {event.data?.price && <p className="font-medium">{formatCurrency(event.data.price)}</p>}
                            <span className="text-xs text-gray-500">{event.packageType || "Not specified"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
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
    </>
  );
}
