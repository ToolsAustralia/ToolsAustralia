"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  XCircle,
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
  Clock,
  Send,
  Key,
  Gift,
  Trash2,
  Cake,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Flame,
  type LucideIcon,
} from "lucide-react";
import ActivityTab from "./UserDetailModal/ActivityTab";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import Image from "next/image";
import { StaticImageData } from "next/image";
import { AUSTRALIAN_STATES } from "@/data/australianStates";
import { formatDisplayName } from "@/utils/display-name";
import { membershipPackages, getPackageById } from "@/data/membershipPackages";
import { AdminUserUpdatePayload, UserActionType } from "@/types/admin";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminCancelSubscription,
  useAdminUpdateUser,
  useAdminUserActions,
  useAdminUserDetail,
  useAdminUserPaymentEventsInfinite,
} from "@/hooks/queries/useAdminQueries";
import { rewardsEnabled } from "@/config/featureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import ChargePastDueUserModal from "@/components/admin/ChargePastDueUserModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import { Z_INDEX } from "@/constants/z-index";
import ModalContent from "@/components/modals/ui/ModalContent";
import Input from "@/components/modals/ui/Input";
import Select from "@/components/modals/ui/Select";
import Checkbox from "@/components/modals/ui/Checkbox";
import DrawSelect, { type DrawSelectOption } from "@/components/admin/DrawSelect";
import { useAdminMajorDrawsList } from "@/hooks/queries/admin/useAdminMajorDrawsList";
import { useAdminMiniDrawsList } from "@/hooks/queries/admin/useAdminMiniDrawsList";
import { getPackageIconByName } from "@/utils/images/package-icons";
import { getPackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import defaultLogo from "../../../public/images/Tools Australia Logo/Social Media Profile_Black Background.webp";
import {
  getAdminPaymentKindLabel,
  resolveAdminPaymentEventTitle,
} from "@/utils/admin/adminPaymentEventDisplay";
import {
  AccountActiveBadge,
  ActiveOrInactiveBadge,
  AdminBadge,
  DrawParticipationStatusBadge,
  EntrySourceBadge,
  MiniDrawParticipationStatusBadge,
  OrderStatusBadge,
  renderMembershipStatusBadge,
  renderSubscriptionStateBadge,
  SubscriptionHistoryStatusBadge,
  VerificationBadge,
} from "@/components/admin/ui/AdminBadge";
import AccessRing from "@/components/ui/AccessRing";
import { deriveMembershipDisplayStatus } from "@/utils/subscription/subscription-helpers";
import { cn } from "@/utils/cn";

// Proper interfaces for user data structures
interface SubscriptionHistoryItem {
  packageId?: string;
  packageName?: string;
  timestamp?: string;
  status?: string;
  price?: number;
  billingReason?: string;
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
  entries?: Array<{
    totalEntries?: number;
    entriesBySource?: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
      referral?: number;
      "bonus-entry-promo"?: number;
    };
  }>;
  totalEntries?: number;
  status?: string;
}

interface PaymentEventItem {
  _id?: string;
  eventType?: string;
  paymentIntentId?: string;
  hasRefundProcessed?: boolean;
  refundProcessedAt?: string;
  /** BenefitsGranted row: Stripe issued a partial refund — ledger not reversed */
  hasPartialRefundSkipped?: boolean;
  partialRefundAmountCents?: number;
  /** Snapshot from matching RefundProcessed (JSON-serializable) */
  refundReversedSummary?: unknown;
  refundReversalIssues?: Array<{ step?: string; error?: string }>;
  timestamp?: string;
  price?: number;
  status?: string;
  packageType?: string;
  packageId?: string;
  packageName?: string;
  data?: {
    price?: number;
    [key: string]: unknown;
  };
}

const SCROLL_CHUNK_SIZE = 8;

/**
 * Expand a list in chunks when the sentinel scrolls into view (modal body scroll).
 */
function useScrollChunk<T>(items: readonly T[] | undefined, resetKey: string | undefined, enabled: boolean) {
  const total = items?.length ?? 0;
  const [visible, setVisible] = useState(SCROLL_CHUNK_SIZE);

  useEffect(() => {
    setVisible(SCROLL_CHUNK_SIZE);
  }, [resetKey, total]);

  const slice = useMemo(() => (items ?? []).slice(0, visible), [items, visible]);
  const hasMore = total > visible;

  const loadMore = useCallback(() => {
    setVisible((v) => Math.min(v + SCROLL_CHUNK_SIZE, total));
  }, [total]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastFireRef = useRef(0);

  useEffect(() => {
    if (!enabled || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const now = Date.now();
        if (now - lastFireRef.current < 180) return;
        lastFireRef.current = now;
        loadMore();
      },
      { root: null, rootMargin: "160px 0px", threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, hasMore, loadMore, total]);

  return { slice, sentinelRef, hasMore, total };
}

interface UserDetailModalProps {
  userId: string | null;
  isOpen: boolean;
  onCloseAction: () => void;
}

type TabType = "overview" | "subscription" | "activity" | "staff-activity";
type EditTabType = TabType | "purchases";

const overviewFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email"),
  mobile: z.string().min(8, "Mobile number is too short").optional().or(z.literal("")),
  state: z.string().optional(),
  profession: z.string().max(100, "Profession cannot exceed 100 characters").optional().or(z.literal("")),
  birthdate: z
    .union([z.string(), z.literal("")])
    .optional()
    .refine(
      (val) =>
        val === undefined ||
        val === "" ||
        (!Number.isNaN(new Date(val).getTime()) && new Date(val).getTime() <= Date.now()),
      { message: "Enter a valid date of birth (cannot be in the future)" }
    ),
  role: z.enum(["user", "admin"]),
  isActive: z.boolean(),
  isEmailVerified: z.boolean(),
  isMobileVerified: z.boolean(),
  profileSetupCompleted: z.boolean(),
  /** Klaviyo promotional / marketing email (not transactional) */
  acceptsPromotionalEmail: z.boolean(),
});

const subscriptionFormSchema = z.object({
  packageId: z.string().optional(),
  status: z.string().optional(),
  isActive: z.boolean(),
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

/**
 * Comprehensive user detail modal with tabbed interface
 * Shows complete user profile, subscription details, purchase history, and activity
 */
export default function UserDetailModal({ userId, isOpen, onCloseAction }: UserDetailModalProps) {
  const queryClient = useQueryClient();
  // Per-action permission gating. Mutation endpoints already enforce each
  // permission server-side; these flags just hide controls the current role
  // is forbidden from using, so we don't surface 403s to staff.
  const { has } = usePermissions();
  const canEditUser = has("users.edit");
  const canCharge = has("users.charge");
  const canCancelSubscription = has("users.cancelSubscription");
  const canDeleteUser = has("users.delete");
  const canViewAudit = has("audit.view");
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
  const cancelSubscriptionMutation = useAdminCancelSubscription();
  const [activeEditTab, setActiveEditTab] = useState<EditTabType | null>(null);
  const isEditing = (tab: EditTabType) => activeEditTab === tab;
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [showCancelSubscriptionModal, setShowCancelSubscriptionModal] = useState(false);
  const [showChargePastDueUserModal, setShowChargePastDueUserModal] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);
  const [headerEmailCopied, setHeaderEmailCopied] = useState(false);
  const headerEmailCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardsFeatureEnabled = rewardsEnabled();
  const rewardsPauseMessage = rewardsDisabledMessage();
  const referralHistory = user?.referral?.history ?? [];

  const paymentEventsInfinite = useAdminUserPaymentEventsInfinite(
    userId,
    isOpen && activeTab === "activity"
  );

  const activityEvents = useMemo(() => {
    const pages = paymentEventsInfinite.data?.pages;
    if (pages && pages.length > 0) return pages.flatMap((p) => p.events);
    return user?.paymentEvents ?? [];
  }, [paymentEventsInfinite.data, user?.paymentEvents]);

  const activityPaymentTotal =
    paymentEventsInfinite.data?.pages[0]?.total ?? user?.paymentEventsTotal ?? activityEvents.length;

  const ordersScroll = useScrollChunk(
    user?.orders,
    userId ?? undefined,
    !isEditing("purchases") && activeTab === "activity"
  );
  const oneTimeScroll = useScrollChunk(
    user?.oneTimePackages,
    userId ?? undefined,
    !isEditing("purchases") && activeTab === "activity"
  );
  const miniDrawPackagesScroll = useScrollChunk(
    user?.miniDrawPackages,
    userId ?? undefined,
    !isEditing("purchases") && activeTab === "activity"
  );
  const subscriptionHistoryScroll = useScrollChunk(
    user?.subscriptionHistory,
    userId ?? undefined,
    activeTab === "overview"
  );

  const paymentActivitySentinelRef = useRef<HTMLDivElement>(null);
  const paymentEventsInfiniteRef = useRef(paymentEventsInfinite);
  paymentEventsInfiniteRef.current = paymentEventsInfinite;

  useEffect(() => {
    if (!isOpen || activeTab !== "activity") return;
    const el = paymentActivitySentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const inf = paymentEventsInfiniteRef.current;
        if (inf.hasNextPage && !inf.isFetchingNextPage) {
          void inf.fetchNextPage();
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [isOpen, activeTab, userId, activityEvents.length, paymentEventsInfinite.hasNextPage]);

  useEffect(() => {
    if (!isOpen) {
      setHeaderEmailCopied(false);
      if (headerEmailCopyTimeoutRef.current) {
        clearTimeout(headerEmailCopyTimeoutRef.current);
        headerEmailCopyTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  const overviewDefaults = useMemo<OverviewFormValues>(
    () => ({
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      email: user?.email ?? "",
      mobile: user?.mobile ?? "",
      state: user?.state ?? "",
      profession: user?.profession ?? "",
      birthdate: user?.birthdate ? String(user.birthdate).slice(0, 10) : "",
      role: user?.role ?? "user",
      isActive: user?.isActive ?? false,
      isEmailVerified: user?.isEmailVerified ?? false,
      isMobileVerified: user?.isMobileVerified ?? false,
      profileSetupCompleted: user?.profileSetupCompleted ?? false,
      acceptsPromotionalEmail: user?.acceptsPromotionalEmail !== false,
    }),
    [user]
  );

  const subscriptionDefaults = useMemo<SubscriptionFormValues>(
    () => ({
      packageId: user?.subscription?.packageId?.toString() ?? "",
      status: user?.subscription?.status ?? "",
      isActive: user?.subscription?.isActive ?? false,
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
    setActiveEditTab((current) => {
      if (!current) return null;
      if (current === activeTab) return current;
      // Package grants edit lives on Activity tab (not a main tab id)
      if (current === "purchases" && activeTab === "activity") return current;
      return null;
    });
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

  const activityEditing = activeEditTab === "activity";
  const majorDrawsQ = useAdminMajorDrawsList(activityEditing);
  const miniDrawsQ = useAdminMiniDrawsList(activityEditing);

  const majorDrawOptions = useMemo<DrawSelectOption[]>(
    () =>
      (majorDrawsQ.data ?? []).map((d) => ({
        id: d._id,
        name: d.name,
        imageUrl: d.prize?.images?.[0],
        status: d.status,
      })),
    [majorDrawsQ.data]
  );

  const miniDrawOptions = useMemo<DrawSelectOption[]>(
    () =>
      (miniDrawsQ.data ?? []).map((d) => ({
        id: d._id,
        name: d.name,
        imageUrl: d.prize?.images?.[0],
        status: d.status,
      })),
    [miniDrawsQ.data]
  );

  const watchedMajorDraws = activityForm.watch("majorDrawParticipation");
  const watchedMiniDraws = activityForm.watch("miniDrawParticipation");

  const getOtherSelectedMajorIds = (currentIndex: number): string[] =>
    (watchedMajorDraws ?? [])
      .map((row, i) => (i !== currentIndex ? row?.drawId : ""))
      .filter((id): id is string => !!id);

  const getOtherSelectedMiniIds = (currentIndex: number): string[] =>
    (watchedMiniDraws ?? [])
      .map((row, i) => (i !== currentIndex ? row?.miniDrawId : ""))
      .filter((id): id is string => !!id);

  const tabs = [
    { id: "overview" as TabType, label: "Overview", icon: User },
    { id: "subscription" as TabType, label: "Subscription", icon: CreditCard },
    { id: "activity" as TabType, label: "Activity", icon: Activity },
    ...(canViewAudit
      ? [{ id: "staff-activity" as TabType, label: "Staff actions", icon: ShieldCheck }]
      : []),
  ];

  const inputClasses =
    "mt-1 w-full rounded-lg border-2 border-gray-300 px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 lg:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-red-600";

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl dark:shadow-none max-w-4xl w-full h-[90vh] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-neutral-400">Loading user details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl dark:shadow-none max-w-4xl w-full h-[90vh] flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Error Loading User</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-4">{error?.message || "Failed to load user details"}</p>
            <button
              onClick={onCloseAction}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-400 text-white rounded-lg hover:from-red-675 hover:to-red-650 transition-all"
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

  const handleCancelEdit = (tab: EditTabType) => {
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
        birthdate: values.birthdate?.trim() ?? "",
        role: values.role,
        isActive: values.isActive,
        isEmailVerified: values.isEmailVerified,
        isMobileVerified: values.isMobileVerified,
        profileSetupCompleted: values.profileSetupCompleted,
        acceptsPromotionalEmail: values.acceptsPromotionalEmail,
      },
    };

    try {
      const { warning } = await updateUser.mutateAsync({ userId: user.id, payload });
      alert(
        warning
          ? `User details updated successfully.\n\n${warning}`
          : "User details updated successfully."
      );
      setActiveEditTab(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update user details.");
    }
  };

  const handleKlaviyoMarketingPreference = async (acceptsPromotionalEmail: boolean) => {
    if (!user?.id) return;
    try {
      const { warning } = await updateUser.mutateAsync({
        userId: user.id,
        payload: { basicInfo: { acceptsPromotionalEmail } },
      });
      alert(
        warning
          ? `Marketing preference updated.\n\n${warning}`
          : "Marketing preference updated."
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update marketing preference.");
    }
  };

  const handleCopyHeaderEmail = async () => {
    const email = user?.email?.trim();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      if (headerEmailCopyTimeoutRef.current) clearTimeout(headerEmailCopyTimeoutRef.current);
      setHeaderEmailCopied(true);
      headerEmailCopyTimeoutRef.current = setTimeout(() => {
        setHeaderEmailCopied(false);
        headerEmailCopyTimeoutRef.current = null;
      }, 2000);
    } catch {
      alert("Could not copy email. Check clipboard permissions.");
    }
  };

  const handleSubscriptionSubmit = async (values: SubscriptionFormValues) => {
    const payload: AdminUserUpdatePayload = {
      subscription: {
        // Explicitly send null if empty string to clear packageId, otherwise send the value or undefined
        packageId: values.packageId && values.packageId.trim() ? values.packageId : null,
        status: values.status || undefined,
        isActive: values.isActive,
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
      const { warning } = await updateUser.mutateAsync({ userId: user.id, payload });
      alert(
        warning
          ? `Subscription details updated successfully.\n\n${warning}`
          : "Subscription details updated successfully."
      );
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
      const { warning } = await updateUser.mutateAsync({ userId: user.id, payload });
      alert(
        warning
          ? `Package information updated successfully.\n\n${warning}`
          : "Package information updated successfully."
      );
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
        ...removedMajorDrawRef.current
          .filter((draw) => draw.drawId.trim().length > 0)
          .map((draw) => ({
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
        ...removedMiniDrawRef.current
          .filter((entry) => entry.miniDrawId.trim().length > 0)
          .map((entry) => ({
            miniDrawId: entry.miniDrawId.trim(),
            totalEntries: 0,
            isActive: false,
          })),
      ],
    };

    try {
      const { warning } = await updateUser.mutateAsync({ userId: user.id, payload });
      alert(
        warning
          ? `Draw participation updated successfully.\n\n${warning}`
          : "Draw participation updated successfully."
      );
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

  const formatBirthdateDisplay = (isoDate?: string) => {
    if (!isoDate || !String(isoDate).trim()) return "Not provided";
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return "Not provided";
    return d.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
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
  const colorScheme = user?.subscription?.packageName
    ? getPackageColorScheme(user.subscription.packageName)
    : null;
  const hasActiveSubscription = user?.subscription?.isActive;
  const borderGradientColor = colorScheme?.accentHex ?? "#6b7280";
  const isPremiumPackage =
    user?.subscription?.packageName?.toLowerCase().includes("boss") ||
    user?.subscription?.packageName?.toLowerCase().includes("power");

  // Header badge + partner-access ring + next-renewal preview. All three are
  // server-derived (shared canonical helpers) — the modal only formats them.
  const membershipDisplayStatus = deriveMembershipDisplayStatus(user.subscription);
  const partnerAccessRing = user.partnerAccessRing ?? null;
  const nextRenewalEntries = user.subscription?.nextRenewalEntries ?? null;
  const renewalLandsInCurrentDraw = user.subscription?.renewalLandsInCurrentDraw ?? false;
  // "+N …" preview badge under the Major Draw Entries card. Shown ONLY when those
  // entries will land in the CURRENTLY-displayed draw — otherwise it misleads
  // ("+N on renewal" next to this draw when the renewal is a future draw's grant):
  //  - past-due: settling adds entries to the current draw immediately → "on recovery"
  //  - active: only when the renewal falls within the current draw cycle (a
  //    next-cycle renewal lands in a different draw → no badge).
  // Renewal-landing date for the active preview — same source the draw gate uses
  // (subscription.endDate → renewalLandsInCurrentDraw), so the shown date matches the
  // "lands in this draw" gate. Past-due recovery grants immediately on settle → no future date.
  const renewalDateLabel = user.subscription?.endDate
    ? new Date(user.subscription.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : null;
  const majorDrawRenewalBadge =
    nextRenewalEntries != null && nextRenewalEntries > 0
      ? membershipDisplayStatus === "past_due"
        ? `${nextRenewalEntries.toLocaleString()} on recovery`
        : renewalLandsInCurrentDraw
          ? renewalDateLabel
            ? `${nextRenewalEntries.toLocaleString()} on renewal · ${renewalDateLabel}`
            : `${nextRenewalEntries.toLocaleString()} on renewal`
          : undefined
      : undefined;

  // Partner-access ring (same instrument as the /my-account hero). On mobile it
  // REPLACES the avatar (header is too tight for both); on sm+ the avatar shows
  // on the left and this renders on the right with a label. Rendered once here so
  // both placements stay in sync. `null` when the member has no partner access.
  const hasPartnerRing = !!partnerAccessRing && partnerAccessRing.state !== "none";
  const renderPartnerRing = (size: number, showLabel: boolean) => {
    if (!partnerAccessRing || partnerAccessRing.state === "none") return null;
    const isPaused = partnerAccessRing.state === "pastdue";
    return (
      <div
        className="flex flex-col items-center gap-0.5"
        title="Partner-catalogue access — same ring the member sees on /my-account"
      >
        {isPaused ? (
          <AccessRing percent={100} size={size} stroke={5} color="#fbbf24" trackColor="rgba(128,128,128,.18)">
            <ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: "#fbbf24" }} />
          </AccessRing>
        ) : (
          <AccessRing
            percent={partnerAccessRing.percent}
            size={size}
            stroke={5}
            color={hasActiveSubscription ? borderGradientColor : "#10b981"}
            trackColor="rgba(128,128,128,.18)"
          >
            <span className="num text-2xs sm:text-xs font-extrabold text-slate-900 dark:text-white">
              {partnerAccessRing.percent}%
            </span>
          </AccessRing>
        )}
        {showLabel ? (
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-neutral-400 whitespace-nowrap">
            {isPaused
              ? "Paused"
              : partnerAccessRing.state === "onetime" && partnerAccessRing.expiryLabel
                ? `${partnerAccessRing.expiryLabel} left`
                : "Partner access"}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED }}>
        <div className="rounded-2xl shadow-2xl dark:shadow-none border-2 border-slate-200/50 dark:border-neutral-700 max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fade-in bg-gradient-to-br from-white via-slate-50 to-white dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950">
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 lg:p-6 border-b-2 border-slate-200/50 dark:border-neutral-700 bg-gradient-to-r from-slate-50 to-white dark:from-neutral-900 dark:to-neutral-950">
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 min-w-0 flex-1">
              {/* Mobile: the partner-access ring stands in for the avatar (no room
                  for both in the mobile header). Falls back to the avatar when the
                  member has no partner access. */}
              {hasPartnerRing && <div className="flex sm:hidden flex-shrink-0">{renderPartnerRing(42, false)}</div>}
              {/* User Avatar - Logo or Package Icon (matching UsersManagement).
                  Hidden on mobile when the ring took its place. */}
              <div className={hasPartnerRing ? "hidden sm:block flex-shrink-0" : "flex-shrink-0"}>
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
                      sizes="(max-width: 640px) 28px, (max-width: 1024px) 36px, 44px"
                    />
                  </div>
                </span>
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100 dark:bg-neutral-800 ring-1 ring-gray-200/80 dark:ring-neutral-600">
                  <Image
                    src={defaultLogo}
                    alt="Tools Australia"
                    className="w-full h-full object-cover"
                    width={56}
                    height={56}
                    sizes="(max-width: 640px) 40px, (max-width: 1024px) 48px, 56px"
                  />
                </div>
              )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                  <h2 className="text-[14px] sm:text-lg lg:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {formatDisplayName(user?.firstName, user?.lastName)}
                  </h2>
                  {/* Membership lifecycle at a glance: Active / Past Due / Paused /
                      Cancels {date} / Cancelled / Guest — derived from the same
                      subscription fields the customer lifecycle uses. */}
                  <span className="flex-shrink-0">{renderMembershipStatusBadge(user?.subscription)}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 mt-0.5">
                  <p className="text-2xs sm:text-xs lg:text-base text-gray-600 dark:text-neutral-400 truncate min-w-0">
                    {user?.email}
                  </p>
                  {user?.email ? (
                    <button
                      type="button"
                      onClick={() => void handleCopyHeaderEmail()}
                      className="rounded-lg border border-gray-300 dark:border-neutral-600 p-1 sm:p-1.5 text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 flex-shrink-0 transition-colors"
                      aria-label={headerEmailCopied ? "Email copied to clipboard" : "Copy email address"}
                      title={headerEmailCopied ? "Copied" : "Copy email"}
                    >
                      {headerEmailCopied ? (
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400" strokeWidth={2.5} />
                      ) : (
                        <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2} />
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {/* Partner-access ring on the right — sm+ only (mobile shows it in
                place of the avatar). Amber shield while past-due access is paused,
                "{N} left" caption for one-time windows. */}
            {hasPartnerRing && (
              <div className="hidden sm:flex flex-shrink-0 mr-2 lg:mr-3">
                {renderPartnerRing(52, true)}
              </div>
            )}
            <button
              onClick={onCloseAction}
              className="rounded-lg text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-gray-100/80 dark:hover:bg-neutral-800 transition-colors flex-shrink-0 p-1 sm:p-2"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </button>
          </div>

          {/* Tabs - Bigger on mobile for easy touching */}
          <div className="border-b-2 border-slate-200/50 dark:border-neutral-700 bg-gradient-to-r from-slate-50 to-white dark:from-neutral-900 dark:to-neutral-950 sticky top-0 z-20 shadow-sm dark:shadow-none">
            <nav className="flex gap-1 sm:gap-2 lg:gap-4 px-2 sm:px-4 lg:px-6 overflow-x-auto brand-scrollbar">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 py-4 sm:py-3 lg:py-4 px-4 sm:px-3 border-b-2 font-semibold text-xs sm:text-xs lg:text-sm transition-all whitespace-nowrap min-h-[48px] ${
                      isActive
                        ? "border-red-600 text-red-600 bg-red-50/30 dark:bg-red-950/25"
                        : "border-transparent text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:border-gray-300 dark:hover:border-neutral-600 hover:bg-gray-50/50 dark:hover:bg-neutral-800/50"
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
                  {([
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
                      // What the next renewal (or past-due recovery) grants INTO THIS DRAW —
                      // gated server-side to the current draw cycle (renewalLandsInCurrentDraw).
                      badge: majorDrawRenewalBadge,
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
                  ] as Array<{
                    title: string;
                    value: string | number;
                    icon: LucideIcon;
                    color: string;
                    badge?: string;
                  }>).map((stat, idx) => {
                    const Icon = stat.icon;
                    const iconConfig = getIconColorConfig(stat.color);
                    return (
                      <div
                        key={idx}
                        className="relative flex flex-col rounded-xl shadow-lg dark:shadow-none border-2 border-slate-200/50 dark:border-neutral-600 hover:border-slate-300 dark:hover:border-neutral-500 hover:shadow-xl dark:hover:shadow-none transition-all duration-300 overflow-hidden group bg-gradient-to-br from-white via-slate-50 to-white dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950"
                      >
                        <div className="p-2 sm:p-3 lg:p-4 flex-1">
                          <div className="flex items-start justify-between mb-1 sm:mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-600 dark:text-neutral-400 font-semibold text-3xs sm:text-2xs lg:text-xs mb-0.5 sm:mb-1 truncate uppercase tracking-wide">
                                {stat.title}
                              </p>
                            </div>
                            <div
                              className={cn("w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10", iconConfig.bg, "rounded-lg sm:rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg flex-shrink-0")}
                            >
                              <Icon className={cn("w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5", iconConfig.icon)} />
                            </div>
                          </div>
                          <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">
                            {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                          </p>
                          {stat.badge ? (
                            <span className="mt-1.5 inline-flex max-w-full items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-3xs sm:text-2xs font-bold leading-tight text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/70 dark:ring-emerald-500/25">
                              {stat.badge}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={cn("h-1", iconConfig.bg, "opacity-60 group-hover:opacity-100 transition-opacity duration-300")}
                        ></div>
                      </div>
                    );
                  })}
                </div>

                {/* Current Draw Entries by Source - when user has entries */}
                {user.statistics.currentDrawEntries > 0 && (() => {
                  const activeDraw = user.majorDrawParticipation?.find((d) => d.status === "active");
                  const entriesBySource = (activeDraw?.entries ?? []).reduce(
                    (acc, e) => {
                      const src = (e as { entriesBySource?: Record<string, number> }).entriesBySource ?? {};
                      Object.entries(src).forEach(([k, v]) => {
                        if (typeof v === "number" && v > 0) acc[k] = (acc[k] ?? 0) + v;
                      });
                      return acc;
                    },
                    {} as Record<string, number>
                  );
                  const hasBreakdown = Object.keys(entriesBySource).length > 0;
                  return hasBreakdown ? (
                    <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Current draw entries by source</h3>
                      
                      <div className="flex flex-wrap gap-2">
                        {entriesBySource.membership != null && entriesBySource.membership > 0 && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Membership: {entriesBySource.membership}</span>
                        )}
                        {entriesBySource["one-time-package"] != null && entriesBySource["one-time-package"] > 0 && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">One-time: {entriesBySource["one-time-package"]}</span>
                        )}
                        {entriesBySource.upsell != null && entriesBySource.upsell > 0 && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">Upsell: {entriesBySource.upsell}</span>
                        )}
                        {entriesBySource["mini-draw"] != null && entriesBySource["mini-draw"] > 0 && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">Mini-draw: {entriesBySource["mini-draw"]}</span>
                        )}
                        {entriesBySource.referral != null && entriesBySource.referral > 0 && (
                          <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded text-xs">Referral: {entriesBySource.referral}</span>
                        )}
                        {entriesBySource["bonus-entry-promo"] != null && entriesBySource["bonus-entry-promo"] > 0 && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">Campaign/Promo: {entriesBySource["bonus-entry-promo"]}</span>
                        )}
                        {entriesBySource["cancellation-upsell"] != null && entriesBySource["cancellation-upsell"] > 0 && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">Retention: {entriesBySource["cancellation-upsell"]}</span>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Basic Information - Minimized on mobile */}
                <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-2 sm:p-4 lg:p-6">
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
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
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
                          name="birthdate"
                          control={overviewForm.control}
                          render={({ field, fieldState }) => (
                            <Input
                              label="Date of birth"
                              type="date"
                              value={field.value || ""}
                              onChange={field.onChange}
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
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
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
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
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
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
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
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Mobile verified"
                              />
                            </div>
                          )}
                        />
                        <Controller
                          control={overviewForm.control}
                          name="acceptsPromotionalEmail"
                          render={({ field }) => (
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5 col-span-2 space-y-2">
                              <div>
                                <p className="text-xs font-medium text-gray-800 dark:text-neutral-200">
                                  Klaviyo marketing (email & SMS)
                                </p>
                                <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                                  {field.value
                                    ? "Opted in in the app. Click Save to apply and sync to Klaviyo."
                                    : "Opted out in the app. Click Save to apply and sync to Klaviyo."}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {field.value ? (
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(false)}
                                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors"
                                  >
                                    Unsubscribe from marketing
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(true)}
                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:border-neutral-600 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    Subscribe to marketing
                                  </button>
                                )}
                              </div>
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
                        <div className="flex flex-wrap items-center gap-2">
                          {user.acceptsPromotionalEmail !== false ? (
                            <button
                              type="button"
                              disabled={updateUser.isPending}
                              onClick={() => void handleKlaviyoMarketingPreference(false)}
                              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {updateUser.isPending ? "Updating..." : "Unsubscribe from marketing"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={updateUser.isPending}
                              onClick={() => void handleKlaviyoMarketingPreference(true)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:border-neutral-600 dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {updateUser.isPending ? "Updating..." : "Subscribe to marketing"}
                            </button>
                          )}
                          {canEditUser && (
                            <button
                              type="button"
                              onClick={() => setActiveEditTab("overview")}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                            >
                              Edit Details
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-start gap-2">
                          <Mail className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Email</p>
                            <p className="font-medium break-words text-xs sm:text-sm mb-1 leading-snug text-gray-900 dark:text-neutral-100">
                              {user.email}
                            </p>
                            <div className="mt-0.5">
                              <VerificationBadge verified={user.isEmailVerified} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Mobile</p>
                            <p className="font-medium break-words text-xs sm:text-sm mb-1 leading-snug text-gray-900 dark:text-neutral-100">
                              {user.mobile || "Not provided"}
                            </p>
                            <div className="mt-0.5">
                              <VerificationBadge verified={!!user.isMobileVerified} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Role</p>
                            <p className="font-medium capitalize text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {user.role}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Account Status</p>
                            <AccountActiveBadge isActive={user.isActive} />
                          </div>
                        </div>

                        <div className="flex items-start gap-2 col-span-2">
                          <Send className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">
                              Klaviyo marketing
                            </p>
                            <AdminBadge variant={user.acceptsPromotionalEmail !== false ? "success" : "neutral"}>
                              {user.acceptsPromotionalEmail !== false ? "Subscribed (app)" : "Unsubscribed (app)"}
                            </AdminBadge>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 col-span-2">
                          <CreditCard className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Saved payment methods</p>
                            {user.savedPaymentMethods && user.savedPaymentMethods.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {user.savedPaymentMethods.map((pm) => (
                                  <AdminBadge
                                    key={pm.paymentMethodId}
                                    variant="neutral"
                                    icon={CreditCard}
                                    iconClassName="opacity-70 shrink-0"
                                    className="max-w-[min(100%,280px)] flex-wrap"
                                  >
                                    <span className="truncate max-w-[140px]">{pm.paymentMethodId}</span>
                                    {pm.isDefault && (
                                      <AdminBadge variant="success" className="!px-1.5 !py-0 !text-2xs !gap-1">
                                        Default
                                      </AdminBadge>
                                    )}
                                  </AdminBadge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs sm:text-sm text-gray-500 leading-snug">No saved payment methods</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">State</p>
                            <p className="font-medium text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {user.state || "Not provided"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Profession</p>
                            <p className="font-medium text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {user.profession || "Not provided"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Cake className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Date of birth</p>
                            <p className="font-medium text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {formatBirthdateDisplay(user.birthdate)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Member Since</p>
                            <p className="font-medium text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {formatDate(user.createdAt)}
                            </p>
                            <p className="text-2xs sm:text-xs text-gray-500 mt-0.5 leading-snug">
                              {user.statistics.accountAge} days ago
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Last Login</p>
                            <p className="font-medium text-xs sm:text-sm leading-snug text-gray-900 dark:text-neutral-100">
                              {user.lastLogin ? formatDate(user.lastLogin) : "No login recorded"}
                            </p>
                            <p className="text-2xs sm:text-xs text-gray-500 mt-0.5 leading-snug">
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
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-100 dark:border-neutral-700 p-2 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                      <div>
                        <h3 className="text-2xs sm:text-base lg:text-lg font-semibold text-gray-900">
                          Referral Program
                        </h3>
                        <p className="text-3xs sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                          Track referral conversions and rewards earned from {user.firstName}&apos;s invite code.
                        </p>
                      </div>
                      {user.referral.code && (
                        <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 sm:px-4 py-1.5 sm:py-2 text-2xs sm:text-sm font-semibold text-gray-700 dark:text-neutral-200">
                          <span className="uppercase tracking-wide text-3xs sm:text-xs text-gray-500">Code</span>
                          <span className="text-sm sm:text-lg font-bold text-gray-900">{user.referral.code}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 sm:mt-4 grid grid-cols-3 gap-1.5 sm:gap-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-3xs sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Conversions</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.successfulConversions}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-3xs sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Entries</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.totalEntriesAwarded}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-4">
                        <p className="text-3xs sm:text-xs uppercase text-gray-500 mb-0.5 sm:mb-1">Pending</p>
                        <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">
                          {user.referral.pendingCount}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      {referralHistory.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-neutral-400">No referral activity recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-700 text-sm">
                            <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Role</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Status</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Friend Email</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Entries Awarded</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Conversion Date</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-800 dark:text-neutral-100">Recorded</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                              {referralHistory.map((event) => (
                                <tr key={event.id} className="hover:bg-gray-50/80 dark:hover:bg-neutral-800/50">
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200 capitalize">{event.role}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">{formatReferralStatus(event.status)}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">{event.friendEmail || "—"}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">{event.entriesAwarded}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">
                                    {formatReferralDate(event.conversionDate)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-neutral-200">{formatReferralDate(event.createdAt)}</td>
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
                <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-2 sm:p-4 lg:p-6">
                  <h3 className="text-2xs sm:text-base lg:text-lg font-semibold text-gray-900 mb-2 sm:mb-4">
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
                    {/* Send Email + Set Password + Clear Payment Methods are
                        all gated by users.edit (POST /actions endpoint). */}
                    {canEditUser && (
                      <button
                        onClick={() => setShowSendEmailModal(true)}
                        disabled={actionLoading === "send_email"}
                        className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-50"
                      >
                        <Send className="w-5 h-5 text-blue-600" />
                        <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">Send Email</span>
                      </button>
                    )}

                    {canEditUser && (
                      <button
                        onClick={() => setShowAdminPasswordModal(true)}
                        disabled={actionLoading === "admin_set_password"}
                        className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-yellow-300 dark:hover:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30 transition-colors disabled:opacity-50"
                      >
                        <Key className="w-5 h-5 text-yellow-600" />
                        <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">Set Password</span>
                      </button>
                    )}

                    {canEditUser && (
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
                        className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors disabled:opacity-50"
                      >
                        <CreditCard className="w-5 h-5 text-orange-600" />
                        <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">Clear Payment Methods</span>
                      </button>
                    )}

                    {/* Delete User — separate, far stronger permission. */}
                    {canDeleteUser && (
                      <button
                        onClick={handleDeleteClick}
                        disabled={isLoadingDeletionSummary || !userId}
                        className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-red-300 dark:hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-5 h-5 text-red-600" />
                        <span className="text-xs font-medium text-gray-700 dark:text-neutral-200">Delete User</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "subscription" && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-2 sm:p-4 lg:p-6">
                  {isEditing("subscription") ? (
                    <form
                      onSubmit={subscriptionForm.handleSubmit(handleSubscriptionSubmit)}
                      className="space-y-2 sm:space-y-4 lg:space-y-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                        <div>
                          <h3 className="text-2xs sm:text-base lg:text-lg font-semibold text-gray-900">
                            Manage Subscription
                          </h3>
                          <p className="text-3xs sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                            Assign or update the member&apos;s subscription package and adjust benefit totals.
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelEdit("subscription")}
                            className="rounded-lg border border-gray-300 px-2 sm:px-4 py-1.5 sm:py-2 text-2xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-2 sm:px-4 py-1.5 sm:py-2 text-2xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
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
                              className="text-2xs sm:text-xs lg:text-sm"
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
                              wrapperClassName="text-2xs sm:text-xs lg:text-sm"
                            />
                          )}
                        />
                        <div>
                          <label className="text-2xs sm:text-xs lg:text-sm font-medium text-gray-700 dark:text-neutral-200">
                            Start Date
                          </label>
                          <input
                            type="datetime-local"
                            {...subscriptionForm.register("startDate")}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label className="text-2xs sm:text-xs lg:text-sm font-medium text-gray-700 dark:text-neutral-200">
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
                            <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3">
                              <Checkbox
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                                label="Subscription active"
                                className="text-2xs sm:text-xs lg:text-sm"
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
                              wrapperClassName="text-2xs sm:text-xs lg:text-sm"
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
                              wrapperClassName="text-2xs sm:text-xs lg:text-sm"
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
                              wrapperClassName="text-2xs sm:text-xs lg:text-sm"
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
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Show for active OR past_due: past_due has isActive=false but still has Stripe sub to cancel */}
                          {canCancelSubscription &&
                            (user.subscription?.isActive || user.subscription?.status === "past_due") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelAtPeriodEnd(true);
                                  setShowCancelSubscriptionModal(true);
                                }}
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Cancel Subscription
                              </button>
                            )}
                          {canCharge && user.subscription?.status === "past_due" && userId && (
                            <button
                              type="button"
                              onClick={() => setShowChargePastDueUserModal(true)}
                              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs sm:text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                            >
                              Retry past due charge
                            </button>
                          )}
                          {canEditUser && (
                            <button
                              type="button"
                              onClick={() => setActiveEditTab("subscription")}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                            >
                              Edit Subscription
                            </button>
                          )}
                        </div>
                      </div>

                      {user.subscription ? (
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Package</p>
                            <p className="font-medium text-sm">
                              {user.subscription.packageName || user.subscription.packageId}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Status</p>
                            {renderSubscriptionStateBadge(user.subscription)}
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Start Date</p>
                            <p className="font-medium text-sm">{formatDate(user.subscription.startDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">End Date</p>
                            <p className="font-medium text-sm">
                              {user.subscription.endDate ? formatDate(user.subscription.endDate) : "Active"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Auto Renew</p>
                            <span className="font-medium text-sm">
                              {user.subscription.autoRenew ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Membership Streak</p>
                            {(user.subscription.streakMonths ?? 0) > 0 ? (
                              <p className="font-medium text-sm inline-flex items-center gap-1">
                                <Flame className="h-3.5 w-3.5 text-amber-500" />
                                {user.subscription.streakMonths} renewal{user.subscription.streakMonths === 1 ? "" : "s"}
                                {(user.subscription.streakGeneration ?? 1) > 1 && (
                                  <span
                                    className="text-xs text-gray-500 dark:text-neutral-400"
                                    title="Streak generation — this member lapsed and started a new streak; milestones are re-earnable per generation"
                                  >
                                    · gen {user.subscription.streakGeneration}
                                  </span>
                                )}
                              </p>
                            ) : (
                              <p className="font-medium text-sm text-gray-500 dark:text-neutral-400">No streak yet</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Rewards Points</p>
                            <p className="font-medium text-sm">
                              {rewardsFeatureEnabled ? user.rewardsPoints : "Unavailable"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Accumulated Entries</p>
                            <p className="font-medium text-sm">{user.subscription?.lastMonthAccumulatedEntries ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 dark:text-neutral-400 mb-1">Entry Wallet</p>
                            <p className="font-medium text-sm">{user.entryWallet}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-6 py-8 text-center">
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
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Subscription History</h3>
                      {subscriptionHistoryScroll.total > 0 && (
                        <p className="text-xs text-gray-500">
                          Showing {subscriptionHistoryScroll.slice.length} of {subscriptionHistoryScroll.total}
                          {subscriptionHistoryScroll.hasMore ? " · scroll for more" : ""}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {subscriptionHistoryScroll.slice.map((sub: SubscriptionHistoryItem, index: number) => {
                        // Resolve package name from packageId if packageName is not available
                        const resolvedPackageName =
                          sub.packageName || (sub.packageId ? getPackageById(sub.packageId)?.name : null);
                        const packageIcon = getPackageIconImage(resolvedPackageName);
                        const billingKind = getAdminPaymentKindLabel({
                          packageType: "membership",
                          data: { billingReason: sub.billingReason },
                        });
                        return (
                          <div
                            key={`${sub.timestamp ?? ""}-${sub.packageId ?? ""}-${index}`}
                            className="flex items-center justify-between gap-2 sm:gap-3 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 p-2 sm:p-3 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              {packageIcon ? (
                                (() => {
                                  const subColorScheme = resolvedPackageName
                                    ? getPackageColorScheme(resolvedPackageName)
                                    : null;
                                  const subBorderGradientColor = subColorScheme?.accentHex ?? "#6b7280";
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
                                          sizes="(max-width: 640px) 20px, 28px"
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
                                    sizes="(max-width: 640px) 32px, 40px"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs sm:text-sm text-gray-900">
                                  {resolvedPackageName || sub.packageId || "Package"}
                                </p>
                                <p className="text-2xs sm:text-xs text-slate-600 mt-0.5">{billingKind}</p>
                                {sub.timestamp && (
                                  <p className="text-2xs text-gray-500 mt-0.5">
                                    {formatDate(
                                      typeof sub.timestamp === "string" ? sub.timestamp : String(sub.timestamp)
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-xs sm:text-sm text-gray-900">
                                {formatCurrency(sub.price || 0)}
                              </p>
                              <div className="mt-1 flex justify-end">
                                <SubscriptionHistoryStatusBadge status={sub.status} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {subscriptionHistoryScroll.hasMore && (
                        <div ref={subscriptionHistoryScroll.sentinelRef} className="h-2 w-full shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "activity" && (
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
                        className="relative flex flex-col rounded-xl shadow-lg dark:shadow-none border-2 border-slate-200/50 dark:border-neutral-600 hover:border-slate-300 dark:hover:border-neutral-500 hover:shadow-xl dark:hover:shadow-none transition-all duration-300 overflow-hidden group bg-gradient-to-br from-white via-slate-50 to-white dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950"
                      >
                        <div className="p-2 sm:p-3 lg:p-4 flex-1">
                          <div className="flex items-start justify-between mb-1 sm:mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-600 dark:text-neutral-400 font-semibold text-3xs sm:text-2xs lg:text-xs mb-0.5 sm:mb-1 truncate uppercase tracking-wide">
                                {stat.title}
                              </p>
                            </div>
                            <div
                              className={cn("w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10", iconConfig.bg, "rounded-lg sm:rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg flex-shrink-0")}
                            >
                              <Icon className={cn("w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5", iconConfig.icon)} />
                            </div>
                          </div>
                          <p className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">
                            {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                          </p>
                        </div>
                        <div
                          className={cn("h-1", iconConfig.bg, "opacity-60 group-hover:opacity-100 transition-opacity duration-300")}
                        ></div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-6">
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
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
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
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
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
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">
                                      One-time Package {index + 1}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOneTime(index)}
                                      className="text-sm font-medium text-red-600 hover:underline"
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Purchase Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`oneTimePackages.${index}.purchaseDate` as const)}
                                        className={inputClasses}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Start Date</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">End Date</label>
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
                                        <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3">
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
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
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
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-sm font-semibold text-gray-900">
                                      Mini Draw Package {index + 1}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniPackage(index)}
                                      className="text-sm font-medium text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Package ID</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Package Name</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Mini Draw ID</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Purchase Date</label>
                                      <input
                                        type="datetime-local"
                                        {...purchasesForm.register(`miniDrawPackages.${index}.purchaseDate` as const)}
                                        className={inputClasses}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Start Date</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">End Date</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Entries Granted</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Price (AUD)</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">Partner Discount Days</label>
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
                                      <label className="text-sm font-medium text-gray-700 dark:text-neutral-200">
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
                                        <label className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-gray-700 dark:text-neutral-200">
                                          <input
                                            type="checkbox"
                                            checked={field.value}
                                            onChange={(event) => field.onChange(event.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
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
                          <h3 className="text-2xs sm:text-base lg:text-lg font-semibold text-gray-900">
                            Packages & Entries
                          </h3>
                          <p className="text-3xs sm:text-xs lg:text-sm text-gray-500 hidden sm:block">
                            Review package purchases below or switch to edit mode to grant additional entries.
                          </p>
                        </div>
                        {canEditUser && (
                          <button
                            type="button"
                            onClick={() => setActiveEditTab("purchases")}
                            className="rounded-lg border border-gray-300 px-2 sm:px-4 py-1.5 sm:py-2 text-2xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Edit Packages
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Recent Orders */}
                {!isEditing("purchases") && user.orders.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Orders</h3>
                      <p className="text-xs text-gray-500">
                        Showing {ordersScroll.slice.length} of {ordersScroll.total}
                        {ordersScroll.hasMore ? " · scroll for more" : ""}
                      </p>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {ordersScroll.slice.map((order: OrderItem, index: number) => (
                        <div
                          key={order._id || `order-${index}`}
                          className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs sm:text-sm text-gray-900">
                                Order #{order.orderNumber || order._id || "--"}
                              </p>
                              <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                {formatDate(order.createdAt || new Date().toISOString())}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-xs sm:text-sm text-gray-900">
                              {formatCurrency(order.totalAmount || order.total || 0)}
                            </p>
                            <div className="mt-0.5 flex justify-end">
                              <OrderStatusBadge status={order.status} />
                            </div>
                          </div>
                        </div>
                      ))}
                      {ordersScroll.hasMore && (
                        <div ref={ordersScroll.sentinelRef} className="h-2 w-full shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                )}

                {/* One-time Packages */}
                {!isEditing("purchases") && user.oneTimePackages.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">One-time Packages</h3>
                      <p className="text-xs text-gray-500">
                        Showing {oneTimeScroll.slice.length} of {oneTimeScroll.total}
                        {oneTimeScroll.hasMore ? " · scroll for more" : ""}
                      </p>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {oneTimeScroll.slice.map((pkg: OneTimePackageItem, index: number) => {
                        const packageIcon = getPackageIconImage(pkg.packageName);
                        return (
                          <div
                            key={`${pkg.packageId ?? ""}-${pkg.purchaseDate ?? ""}-${index}`}
                            className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              {packageIcon ? (
                                (() => {
                                  const pkgColorScheme = pkg.packageName
                                    ? getPackageColorScheme(pkg.packageName)
                                    : null;
                                  const pkgBorderGradientColor = pkgColorScheme?.accentHex ?? "#6b7280";
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
                                          sizes="(max-width: 640px) 20px, 28px"
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
                                    sizes="(max-width: 640px) 32px, 40px"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs sm:text-sm text-gray-900">
                                  {pkg.packageName || pkg.packageId || "Package"}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400">
                                    {formatDate(pkg.purchaseDate || new Date().toISOString())}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-2xs sm:text-xs lg:text-sm text-gray-900">
                                {pkg.entriesGranted || 0} entries
                              </p>
                              {pkg.price && (
                                <p className="text-3xs sm:text-2xs lg:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                  {formatCurrency(pkg.price)}
                                </p>
                              )}
                              <div className="mt-0.5 flex justify-end">
                                <ActiveOrInactiveBadge active={!!pkg.isActive} activeLabel="Active" inactiveLabel="Expired" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {oneTimeScroll.hasMore && (
                        <div ref={oneTimeScroll.sentinelRef} className="h-2 w-full shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                )}

                {/* Mini Draw Packages (read-only) */}
                {!isEditing("purchases") && user.miniDrawPackages.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Mini Draw Packages</h3>
                      <p className="text-xs text-gray-500">
                        Showing {miniDrawPackagesScroll.slice.length} of {miniDrawPackagesScroll.total}
                        {miniDrawPackagesScroll.hasMore ? " · scroll for more" : ""}
                      </p>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {miniDrawPackagesScroll.slice.map((pkg, index: number) => {
                        const md = pkg as OneTimePackageItem & {
                          miniDrawId?: string;
                          packageName?: string;
                          stripePaymentIntentId?: string;
                        };
                        return (
                          <div
                            key={`${md.miniDrawId ?? ""}-${md.stripePaymentIntentId ?? ""}-${index}`}
                            className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-200">
                                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-700" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-xs sm:text-sm text-gray-900">
                                  {md.packageName || md.packageId || "Mini draw package"}
                                </p>
                                <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                  {formatDate(md.purchaseDate || new Date().toISOString())}
                                  {md.miniDrawId ? ` · Draw ${md.miniDrawId}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-2xs sm:text-xs lg:text-sm text-gray-900">
                                {md.entriesGranted || 0} entries
                              </p>
                              {md.price != null && (
                                <p className="text-3xs sm:text-2xs lg:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                  {formatCurrency(Number(md.price))}
                                </p>
                              )}
                              <div className="mt-0.5 flex justify-end">
                                <ActiveOrInactiveBadge active={!!md.isActive} activeLabel="Active" inactiveLabel="Expired" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {miniDrawPackagesScroll.hasMore && (
                        <div ref={miniDrawPackagesScroll.sentinelRef} className="h-2 w-full shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                )}

                {/* Partner Discount Access (read-only, reconciled current entitlement) */}
                {!isEditing("purchases") &&
                  user.partnerDiscountSummary &&
                  (user.partnerDiscountSummary.active.isActive ||
                    user.partnerDiscountSummary.queued.length > 0) && (
                    <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                      <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Partner Discount Access</h3>
                        {user.partnerDiscountSummary.totalQueuedItems > 0 && (
                          <p className="text-xs text-gray-500">
                            {user.partnerDiscountSummary.totalQueuedItems} queued ·{" "}
                            {user.partnerDiscountSummary.totalQueuedDays} days total
                          </p>
                        )}
                      </div>

                      {/* Currently active period */}
                      {user.partnerDiscountSummary.active.isActive ? (
                        <div className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 border border-emerald-300">
                              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-700" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-xs sm:text-sm text-gray-900">
                                {user.partnerDiscountSummary.active.packageName || "Active partner discount"}
                                {user.partnerDiscountSummary.active.source && (
                                  <span className="ml-1.5 text-2xs sm:text-xs font-normal uppercase tracking-wide text-emerald-700">
                                    {user.partnerDiscountSummary.active.source}
                                  </span>
                                )}
                              </p>
                              <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                {user.partnerDiscountSummary.active.isRecurring
                                  ? `Recurring · while membership active${
                                      user.partnerDiscountSummary.active.endsAt
                                        ? ` (renews ${formatDate(user.partnerDiscountSummary.active.endsAt)})`
                                        : ""
                                    }`
                                  : user.partnerDiscountSummary.active.endsAt
                                  ? `Ends ${formatDate(user.partnerDiscountSummary.active.endsAt)}`
                                  : "Active"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-2xs sm:text-xs lg:text-sm text-emerald-700">
                              {user.partnerDiscountSummary.active.isRecurring
                                ? "Active"
                                : user.partnerDiscountSummary.active.daysRemaining >= 1
                                ? `${user.partnerDiscountSummary.active.daysRemaining} day${
                                    user.partnerDiscountSummary.active.daysRemaining === 1 ? "" : "s"
                                  } left`
                                : `${user.partnerDiscountSummary.active.hoursRemaining} hour${
                                    user.partnerDiscountSummary.active.hoursRemaining === 1 ? "" : "s"
                                  } left`}
                            </p>
                            <div className="mt-0.5 flex justify-end">
                              <ActiveOrInactiveBadge active activeLabel="Active" inactiveLabel="Expired" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700">
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
                            No active partner discount period.
                          </p>
                        </div>
                      )}

                      {/* Queued / upcoming periods (activate automatically when the active period ends) */}
                      {user.partnerDiscountSummary.queued.length > 0 && (
                        <div className="mt-2 sm:mt-3">
                          <p className="text-2xs sm:text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                            Upcoming (queued)
                          </p>
                          <div className="space-y-2 sm:space-y-3">
                            {user.partnerDiscountSummary.queued.map((q, index) => (
                              <div
                                key={`pd-queued-${q.queuePosition}-${index}`}
                                className="flex items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 hover:shadow-sm transition-shadow"
                              >
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-sky-50 border border-sky-200">
                                    <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-sky-700" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-xs sm:text-sm text-gray-900">
                                      {q.packageName}
                                      <span className="ml-1.5 text-2xs sm:text-xs font-normal text-gray-400">
                                        #{q.queuePosition}
                                      </span>
                                    </p>
                                    <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                      Purchased {q.purchaseDate ? formatDate(q.purchaseDate) : "—"} · use by{" "}
                                      {q.expiryDate ? formatDate(q.expiryDate) : "—"}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="font-semibold text-2xs sm:text-xs lg:text-sm text-gray-900">
                                    {q.daysOfAccess >= 1
                                      ? `${q.daysOfAccess} day${q.daysOfAccess === 1 ? "" : "s"}`
                                      : `${q.hoursOfAccess} hour${q.hoursOfAccess === 1 ? "" : "s"}`}
                                  </p>
                                  <p className="text-3xs sm:text-2xs lg:text-xs text-gray-500 mt-0.5">access</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="mt-2 sm:mt-3 text-3xs sm:text-2xs text-gray-400">
                        Reflects current entitlement (reconciled). Queued periods activate automatically when the
                        active period ends.
                      </p>
                    </div>
                  )}

                <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-2 sm:p-4 lg:p-6">
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
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={updateUser.isPending}
                            className="rounded-lg bg-gradient-to-r from-red-600 to-red-400 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:from-red-675 hover:to-red-650 disabled:cursor-not-allowed disabled:opacity-60"
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
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
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
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">
                                      {majorDrawOptions.find((o) => o.id === watchedMajorDraws?.[index]?.drawId)?.name ??
                                        `Major Draw ${index + 1}`}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMajorDraw(index)}
                                      className="text-xs font-medium text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`majorDrawParticipation.${index}.drawId` as const}
                                      render={({ field, fieldState }) => (
                                        <DrawSelect
                                          label="Draw"
                                          placeholder="Select major draw…"
                                          options={majorDrawOptions}
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          disabledIds={getOtherSelectedMajorIds(index)}
                                          loading={majorDrawsQ.isLoading}
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
                            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
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
                                  className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-xs font-semibold text-gray-900">
                                      {miniDrawOptions.find((o) => o.id === watchedMiniDraws?.[index]?.miniDrawId)?.name ??
                                        `Mini Draw ${index + 1}`}
                                    </h5>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveMiniDraw(index)}
                                      className="text-xs font-medium text-red-600 hover:underline"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Controller
                                      control={activityForm.control}
                                      name={`miniDrawParticipation.${index}.miniDrawId` as const}
                                      render={({ field, fieldState }) => (
                                        <DrawSelect
                                          label="Mini draw"
                                          placeholder="Select mini draw…"
                                          options={miniDrawOptions}
                                          value={field.value || ""}
                                          onChange={field.onChange}
                                          disabledIds={getOtherSelectedMiniIds(index)}
                                          loading={miniDrawsQ.isLoading}
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
                                        <div className="rounded-lg border-2 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5">
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
                        {canEditUser && (
                          <button
                            type="button"
                            onClick={() => setActiveEditTab("activity")}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-100 transition-colors"
                          >
                            Edit Entries
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Major Draw Participation */}
                {!isEditing("activity") && user.majorDrawParticipation.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Major Draw Participation</h3>
                    <div className="space-y-2">
                      {user.majorDrawParticipation.map((draw: MajorDrawParticipationItem, index: number) => {
                        const entriesBySource = (draw.entries ?? []).reduce(
                          (acc, e) => {
                            const src = e.entriesBySource ?? {};
                            Object.entries(src).forEach(([k, v]) => {
                              if (typeof v === "number" && v > 0) acc[k] = (acc[k] ?? 0) + v;
                            });
                            return acc;
                          },
                          {} as Record<string, number>
                        );
                        const hasBreakdown = Object.keys(entriesBySource).length > 0;
                        return (
                          <div
                            key={draw.drawId || `draw-${index}`}
                            className="p-2.5 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700"
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{draw.title || draw.drawId || "Major draw"}</p>
                                <p className="text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                  {draw.endDate ? formatDate(draw.endDate) : "End date not set"}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-3">
                                <p className="font-semibold text-sm sm:text-base">{draw.totalEntries || 0}</p>
                                <p className="text-xs text-gray-500">entries</p>
                                <div className="mt-1 flex justify-end">
                                  <DrawParticipationStatusBadge status={draw.status} />
                                </div>
                              </div>
                            </div>
                            {hasBreakdown && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Entries by source</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {entriesBySource.membership != null && entriesBySource.membership > 0 && (
                                    <EntrySourceBadge sourceKey="membership">
                                      Membership: {entriesBySource.membership}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource["one-time-package"] != null && entriesBySource["one-time-package"] > 0 && (
                                    <EntrySourceBadge sourceKey="one-time-package">
                                      One-time: {entriesBySource["one-time-package"]}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource.upsell != null && entriesBySource.upsell > 0 && (
                                    <EntrySourceBadge sourceKey="upsell">
                                      Upsell: {entriesBySource.upsell}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource["mini-draw"] != null && entriesBySource["mini-draw"] > 0 && (
                                    <EntrySourceBadge sourceKey="mini-draw">
                                      Mini-draw: {entriesBySource["mini-draw"]}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource.referral != null && entriesBySource.referral > 0 && (
                                    <EntrySourceBadge sourceKey="referral">
                                      Referral: {entriesBySource.referral}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource["bonus-entry-promo"] != null && entriesBySource["bonus-entry-promo"] > 0 && (
                                    <EntrySourceBadge sourceKey="bonus-entry-promo">
                                      Campaign/Promo: {entriesBySource["bonus-entry-promo"]}
                                    </EntrySourceBadge>
                                  )}
                                  {entriesBySource["cancellation-upsell"] != null && entriesBySource["cancellation-upsell"] > 0 && (
                                    <EntrySourceBadge sourceKey="cancellation-upsell">
                                      Retention: {entriesBySource["cancellation-upsell"]}
                                    </EntrySourceBadge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mini Draw Participation */}
                {!isEditing("activity") && user.miniDrawParticipation?.length > 0 && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
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
                            className="flex items-center justify-between p-2.5 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {miniDrawName || entry.miniDrawId?.toString?.() || "Mini draw"}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                                {drawDateValue ? formatDate(drawDateValue) : "Draw date not set"}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="font-semibold text-sm sm:text-base">{entry.totalEntries || 0}</p>
                              <p className="text-xs text-gray-500">entries</p>
                              <div className="mt-1 flex justify-end">
                                <MiniDrawParticipationStatusBadge
                                  miniDrawStatus={miniDrawStatus}
                                  isActive={entry.isActive}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Payment events — paginated via infinite scroll */}
                {(activityPaymentTotal > 0 || activityEvents.length > 0) && (
                  <div className="bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950 rounded-xl border-2 border-slate-200/50 dark:border-neutral-700 shadow-lg dark:shadow-none p-3 sm:p-4 lg:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Payment activity</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Newest first. Scroll down to load older events.
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 tabular-nums">
                        Showing {activityEvents.length} of {activityPaymentTotal}
                        {paymentEventsInfinite.hasNextPage ? " · more below" : ""}
                      </p>
                    </div>
                    {paymentEventsInfinite.isPending && activityEvents.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">Loading activity…</p>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {activityEvents.map((event: PaymentEventItem, index: number) => {
                          const title = resolveAdminPaymentEventTitle(event);
                          const kind = getAdminPaymentKindLabel(event);
                          const eventData = event.data as Record<string, unknown> | undefined;
                          const entries =
                            typeof eventData?.entries === "number" ? eventData.entries : 0;
                          const priceRaw = eventData?.price;
                          const price =
                            typeof priceRaw === "number"
                              ? priceRaw
                              : typeof priceRaw === "string"
                              ? Number.parseFloat(priceRaw)
                              : NaN;
                          const fallbackIcon =
                            event.eventType === "RefundProcessed" || event.eventType === "RefundPartial"
                              ? Activity
                              : event.packageType === "membership"
                              ? CreditCard
                              : event.packageType === "one-time"
                              ? Package
                              : event.packageType === "mini-draw"
                              ? Trophy
                              : event.packageType === "upsell"
                              ? Gift
                              : Activity;
                          const FallbackIcon = fallbackIcon;
                          const packageImg =
                            event.packageType === "upsell"
                              ? null
                              : getPackageIconImage(title);

                          return (
                            <div
                              key={event._id ?? `${event.timestamp ?? ""}-${index}`}
                              className="flex items-start justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-white dark:bg-neutral-900 rounded-lg border-2 border-slate-200/50 dark:border-neutral-700 hover:shadow-md hover:border-slate-300 dark:hover:border-neutral-600 transition-all"
                            >
                              <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                                <div className="flex-shrink-0 mt-0.5">
                                  {packageImg ? (
                                    <span
                                      className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-sm overflow-hidden"
                                    >
                                      <Image
                                        src={packageImg}
                                        alt={title}
                                        className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
                                        width={28}
                                        height={28}
                                        sizes="(max-width: 640px) 24px, 28px"
                                      />
                                    </span>
                                  ) : (
                                    <div
                                      className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl shadow-md ${
                                        event.packageType === "membership"
                                          ? "bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600"
                                          : event.packageType === "one-time"
                                          ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-600"
                                          : event.packageType === "mini-draw"
                                          ? "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600"
                                          : event.packageType === "upsell"
                                          ? "bg-gradient-to-br from-purple-500 via-purple-600 to-violet-600"
                                          : "bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700"
                                      }`}
                                    >
                                      <FallbackIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-xs sm:text-sm text-gray-900 break-words">
                                    {title}
                                  </p>
                                  <p className="text-3xs sm:text-2xs text-slate-600 mt-0.5">{kind}</p>
                                  {event.eventType === "BenefitsGranted" &&
                                    event.hasRefundProcessed &&
                                    (event.refundProcessedAt ? (
                                      <p className="text-3xs sm:text-2xs mt-0.5">
                                        <span className="font-semibold text-amber-800 dark:text-amber-200">
                                          Refunded
                                        </span>
                                        <span className="text-gray-600 dark:text-neutral-400 ml-1">
                                          {formatDate(event.refundProcessedAt)}
                                        </span>
                                      </p>
                                    ) : (
                                      <p className="text-3xs sm:text-2xs font-semibold text-amber-800 dark:text-amber-200 mt-0.5">
                                        Refunded
                                      </p>
                                    ))}
                                  {event.eventType === "BenefitsGranted" &&
                                    event.hasPartialRefundSkipped &&
                                    typeof event.partialRefundAmountCents === "number" && (
                                      <p className="text-3xs sm:text-2xs mt-0.5">
                                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                                          Partial refund — no benefits reversed ($
                                          {(event.partialRefundAmountCents / 100).toFixed(2)})
                                        </span>
                                      </p>
                                    )}
                                  {event.eventType === "BenefitsGranted" &&
                                    Array.isArray(event.refundReversalIssues) &&
                                    event.refundReversalIssues.length > 0 && (
                                      <p className="text-3xs sm:text-2xs text-amber-900 dark:text-amber-100 mt-0.5">
                                        {event.refundReversalIssues.length} reversal follow-up(s) — check
                                        RefundProcessed row
                                      </p>
                                    )}
                                  {event.eventType === "RefundProcessed" &&
                                    event.data &&
                                    typeof (event.data as { reversed?: unknown }).reversed === "object" &&
                                    (event.data as { reversed?: unknown }).reversed != null && (
                                      <p className="text-3xs sm:text-2xs text-gray-600 dark:text-neutral-400 mt-0.5 break-words max-w-full">
                                        Ledger:{" "}
                                        {JSON.stringify((event.data as { reversed: unknown }).reversed)}
                                      </p>
                                    )}
                                  {event.eventType === "RefundProcessed" &&
                                    Array.isArray((event.data as { reversalIssues?: unknown[] })?.reversalIssues) &&
                                    ((event.data as { reversalIssues: { step?: string; error?: string }[] })
                                      .reversalIssues?.length ?? 0) > 0 && (
                                      <p className="text-3xs sm:text-2xs text-amber-900 dark:text-amber-100 mt-0.5">
                                        {
                                          (event.data as { reversalIssues: unknown[] }).reversalIssues
                                            ?.length
                                        }{" "}
                                        non-fatal issue(s)
                                      </p>
                                    )}
                                  <p className="text-3xs sm:text-2xs lg:text-xs text-gray-500 mt-0.5">
                                    {formatDate(event.timestamp || new Date().toISOString())}
                                  </p>
                                  {entries > 0 && (
                                    <p className="text-3xs sm:text-2xs text-gray-500 mt-0.5">
                                      +{entries} entries
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 max-w-[40%]">
                                {!Number.isNaN(price) && (
                                  <p className="font-semibold text-2xs sm:text-xs lg:text-sm text-gray-900">
                                    {formatCurrency(price)}
                                  </p>
                                )}
                                <div className="mt-0.5 flex justify-end">
                                  <AdminBadge variant="neutral" className="!text-3xs sm:!text-3xs lg:!text-xs">
                                    {kind}
                                  </AdminBadge>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {paymentEventsInfinite.hasNextPage && (
                          <div
                            ref={paymentActivitySentinelRef}
                            className="flex min-h-[48px] items-center justify-center py-2"
                            aria-hidden
                          >
                            {paymentEventsInfinite.isFetchingNextPage ? (
                              <span className="text-xs text-gray-500">Loading more…</span>
                            ) : (
                              <span className="text-2xs text-gray-400">Scroll for more</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "staff-activity" && userId && (
              <ActivityTab userId={userId} enabled={activeTab === "staff-activity"} />
            )}
          </ModalContent>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}>
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl dark:shadow-none max-w-md w-full p-6 animate-fade-in border border-gray-200 dark:border-neutral-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{showActionModal.title}</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-6">{showActionModal.description}</p>

            {showActionModal.requiresInput && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-2">
                  {showActionModal.action === "toggle_status" ? "Reason (optional)" : "Note"}
                </label>
                <textarea
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  placeholder={showActionModal.inputPlaceholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:border-transparent"
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
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 dark:text-neutral-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={actionLoading === showActionModal.action}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-red-600 to-red-400 text-white rounded-lg hover:from-red-675 hover:to-red-650 disabled:opacity-50 transition-all"
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
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl dark:shadow-none max-w-lg w-full p-6 animate-fade-in border border-gray-200 dark:border-neutral-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Send Email</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-6">Compose and send an email directly to the user.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Subject</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">Message</label>
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
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 dark:text-neutral-200 hover:bg-gray-50"
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
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl dark:shadow-none max-w-md w-full p-6 animate-fade-in border border-gray-200 dark:border-neutral-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Set New Password</h3>
            <p className="text-gray-600 dark:text-neutral-400 mb-6">
              Set a new password for this user. Minimum length is enforced; no verification email is sent.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1">New password</label>
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
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 dark:text-neutral-200 hover:bg-gray-50"
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

      {showChargePastDueUserModal && userId && (
        <ChargePastDueUserModal
          isOpen={showChargePastDueUserModal}
          onClose={() => setShowChargePastDueUserModal(false)}
          targetUserId={userId}
          memberLabel={
            user
              ? `${formatDisplayName(user.firstName, user.lastName) || user.email} · ${user.email}`
              : undefined
          }
          onConfirm={async () => {
            const response = await fetch(`/api/admin/users/${userId}/charge-past-due`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmation: "CHARGE" }),
            });
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.message || data.error || "Failed to charge invoice");
            }
            await queryClient.invalidateQueries({ queryKey: ["admin", "users", "detail", userId] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "users", "list"] });
            return data;
          }}
        />
      )}

      {/* Cancel Subscription Modal */}
      {showCancelSubscriptionModal && user?.id && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: Z_INDEX.MODAL_NESTED_SECONDARY }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCancelSubscriptionModal(false)}
          />
          <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl dark:shadow-none w-full max-w-md mx-auto border border-gray-200 dark:border-neutral-700">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-neutral-700">
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cancel Subscription</h3>
              </div>
              <button
                onClick={() => setShowCancelSubscriptionModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-700 dark:text-neutral-200">
                How would you like to cancel this user&apos;s subscription?
              </p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 cursor-pointer has-[:checked]:border-red-300 dark:has-[:checked]:border-red-700 has-[:checked]:bg-red-50/50 dark:has-[:checked]:bg-red-950/30">
                  <input
                    type="radio"
                    name="cancelOption"
                    checked={cancelAtPeriodEnd}
                    onChange={() => setCancelAtPeriodEnd(true)}
                    className="mt-1 text-red-600"
                  />
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">Cancel at end of billing period</span>
                    <p className="text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                      User keeps access until the current period ends.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-gray-200 dark:border-neutral-600 hover:border-gray-300 dark:hover:border-neutral-500 cursor-pointer has-[:checked]:border-red-300 dark:has-[:checked]:border-red-700 has-[:checked]:bg-red-50/50 dark:has-[:checked]:bg-red-950/30">
                  <input
                    type="radio"
                    name="cancelOption"
                    checked={!cancelAtPeriodEnd}
                    onChange={() => setCancelAtPeriodEnd(false)}
                    className="mt-1 text-red-600"
                  />
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">Cancel immediately</span>
                    <p className="text-xs text-gray-600 dark:text-neutral-400 mt-0.5">
                      Access revoked now. No refund for unused time.
                    </p>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex gap-3 p-4 sm:p-6 pt-0">
              <button
                type="button"
                onClick={() => setShowCancelSubscriptionModal(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-200 hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-60"
                disabled={cancelSubscriptionMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await cancelSubscriptionMutation.mutateAsync({
                      userId: user.id,
                      cancelAtPeriodEnd,
                    });
                    setShowCancelSubscriptionModal(false);
                    alert(
                      cancelAtPeriodEnd
                        ? "Subscription will be canceled at the end of the billing period."
                        : "Subscription canceled successfully."
                    );
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed to cancel subscription.");
                  }
                }}
                disabled={cancelSubscriptionMutation.isPending}
                className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {cancelSubscriptionMutation.isPending ? "Canceling..." : "Confirm"}
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
