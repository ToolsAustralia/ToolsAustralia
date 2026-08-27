"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, Gift, Loader2, Target, Users } from "lucide-react";
import {
  ModalContainer,
  ModalHeader,
  ModalContent,
  FormSection,
  Input,
  Button,
  DateTimePicker,
} from "@/components/modals/ui";
import Dropdown from "@/components/modals/ui/Dropdown";
import CampaignTargetingModal, {
  type CampaignTargetingConfirmPayload,
  type RedeemableTierId,
} from "@/components/modals/CampaignTargetingModal";
import { BONUS_CODE_BY_TRIGGER } from "@/config/bonusCodes";
import {
  NEVER_EXPIRES_ISSUANCE_DATE,
  campaignExpiryShape,
  isOpenEndedDate,
  type CampaignExpiryShape,
} from "@/utils/redeemables/bonus-code-policy";

type CampaignMode = "global" | "unique" | "both";
type TargetingMode = "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
type PurchaseRequirement = "none" | "membership" | "one-time" | "any";

export interface MonthlyRedeemableSegmentConfig {
  minInactiveDays?: number;
  maxInactiveDays?: number;
  requiresEmailVerified?: boolean;
  requiresRecentPurchaseDays?: number;
  includeUserIds?: string[];
  excludeUserIds?: string[];
  states?: string[];
  membershipTiers?: string[];
  topEntriesPercent?: number;
}

interface AdminMonthlyRedeemablesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editingCampaign?: {
    id: string;
    monthKey: string;
    name: string;
    displayLabel?: string;
    entriesAmount: number;
    campaignMode: CampaignMode;
    targetingMode: TargetingMode;
    startsAt: string;
    endsAt?: string;
    neverExpires?: boolean;
    /** Per-customer window in HOURS, counted from the issuing instant; mutually exclusive with neverExpires. */
    validForHours?: number;
    code: string;
    requiresPurchase?: boolean;
    purchaseRequirement?: PurchaseRequirement;
    segmentConfig?: MonthlyRedeemableSegmentConfig | null;
    /** Total issuances (any status) — drives the "already has issuances" edit warning. */
    issuanceCount?: number;
  } | null;
}

const campaignModeOptions = [
  { value: "both", label: "Both (Global + Unique)" },
  { value: "global", label: "Global" },
  { value: "unique", label: "Unique" },
];

const targetingModeOptions = [
  { value: "all-active-subscribers", label: "All Active Subscribers" },
  { value: "manual-users", label: "Manual Users" },
  { value: "csv-users", label: "CSV Users" },
  { value: "dynamic-segment", label: "Dynamic Segment" },
];

const purchaseRequirementOptions = [
  { value: "none", label: "No purchase required" },
  { value: "membership", label: "Membership purchase" },
  { value: "one-time", label: "One-time package purchase" },
  { value: "any", label: "Any purchase" },
];

/**
 * The ONE question this form asks up front. The three stored fields (`endsAt`,
 * `neverExpires`, `validForHours`) answer TWO different clocks — how long the CAMPAIGN
 * keeps handing codes out, and how long each CUSTOMER has to use theirs — and the old
 * form showed all three side by side with no hint of which was which.
 *
 * Deliberately NO default on create: a default is how the previous form quietly produced
 * campaigns whose expiry shape nobody had actually chosen.
 */
const EXPIRY_SHAPE_CARDS: ReadonlyArray<{
  shape: CampaignExpiryShape;
  title: string;
  /**
   * Takes the operator's CURRENT hours value (the `72` prefill while the field is blank).
   * The hours number is editable, so any copy that quotes it must be interpolated — a
   * hardcoded "72" beside an input set to 48 is the form lying about its own settings,
   * which is the exact failure this section exists to remove.
   */
  body: (hours: string) => string;
}> = [
  {
    shape: "fixed-end",
    title: "Everyone shares one end date",
    body: () =>
      "One end date for the whole campaign. Every code stops working at the same moment, whoever got it and whenever they got it. This is the normal monthly coupon.",
  },
  {
    shape: "personal-window",
    title: "Each customer gets their own countdown",
    body: (hours) =>
      `The code stops working a fixed number of hours after it lands in that person's account. Someone who gets it today and someone who gets it in March each get the same ${hours} hours. Use this for codes a Klaviyo flow hands out one person at a time — BACKIN200, LOCKIN100, EXTRA100.`,
  },
  {
    shape: "never-expires",
    title: "No deadline at all",
    body: () => "Codes never stop working and the campaign never closes. Rare — an always-on offer only.",
  },
];

const COPY = {
  sectionSub: "Two different clocks. Pick the one that matches how this coupon reaches people.",
  startsHelper: "First moment anyone can be issued this code.",
  fixedEndHelper: "Last moment anyone can be issued this code — and the moment every code stops working.",
  hoursHelper: (hours: string) =>
    `Each customer's ${hours} hours starts the instant the Klaviyo flow calls us — the step just before their discount email, not the moment the customer qualified. Those are usually days apart.`,
  hoursCaution:
    "Heads up — our support bot currently tells customers this window is a fixed 72 hours. Change that copy in the same task or it will be wrong.",
  backstopLabel: "Stop issuing new codes on a date",
  backstopOffHelper:
    "Left off, this coupon keeps issuing until you switch it off with the Disable button on the campaign card.",
  backstopOnHelper:
    "This only stops NEW customers getting a code. Anyone already holding one still gets their full window.",
  triggerBannerTitle: "This makes it a trigger coupon.",
  triggerBannerBody:
    "Codes go out only when a customer does something specific — clicks cancel, starts checkout, or buys a one-time pack — and only when the marketing flow asks us for one. The monthly issuance job skips this coupon entirely, so nobody gets it just for being a member.",
  monthKeyHelperStandard: "The monthly issuance job only hands this coupon out during this month.",
  monthKeyHelperTrigger:
    "A reporting label only — a trigger coupon is issued by the marketing flow, not by the monthly job, so this month gates nothing.",
  campaignModeHelperTrigger:
    "Global is right for a trigger coupon — everyone uses the same code, the one hardcoded into the marketing email. Unique or Both would also mint a per-customer code that nobody ever sees.",
  purchaseHelperTrigger:
    'Keep this as "No purchase required" — a customer who just clicked cancel has no purchase to qualify on, and the others apply the code as they buy.',
  codeHintTrigger:
    "Trigger coupons must match the code the marketing flow asks for: BACKIN200 (cancel), LOCKIN100 (abandoned checkout), EXTRA100 (one-time buyer).",
  codeMismatchTrigger:
    "This isn't a code the marketing flow asks for, so no customer can ever be issued it. If it's meant to be one of BACKIN200 / LOCKIN100 / EXTRA100, fix the spelling — a mismatch means the email still sends and the code is refused at checkout, with no error anywhere.",
  confirmLosingWindow:
    "Removing the per-customer window turns this from a trigger coupon into a normal one. On the next monthly issuance run it will be issued to your entire targeted audience at once, and every one of them burns their one-per-person grant. Continue?",
  confirmStranded:
    "This campaign already has issuances. Existing issuances are NOT re-stamped — they keep their original deadline. Only NEW issuances minted after this save will use the updated window. Continue?",
} as const;

const TRIGGER_CODES = Object.values(BONUS_CODE_BY_TRIGGER);

const COUPON_CODE_PATTERN = /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeCouponCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatInstant(date: Date): string {
  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A `datetime-local` form value rendered for the consequence sentence; "…" while blank. */
function formatPickerValue(value: string): string {
  if (!value.trim()) return "…";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "…" : formatInstant(date);
}

function tierLabel(id: string): string {
  if (id === "tradie-subscription") return "Tradie";
  if (id === "foreman-subscription") return "Foreman";
  if (id === "boss-subscription") return "Boss";
  return id;
}

export default function AdminMonthlyRedeemablesModal({
  isOpen,
  onClose,
  onSuccess,
  editingCampaign,
}: AdminMonthlyRedeemablesModalProps) {
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("both");
  const [targetingMode, setTargetingMode] = useState<TargetingMode>("all-active-subscribers");
  const [purchaseRequirement, setPurchaseRequirement] = useState<PurchaseRequirement>("none");
  const [expiryShape, setExpiryShape] = useState<CampaignExpiryShape | null>(null);
  /** Personal-window only: does the campaign also stop MINTING on a date? */
  const [hasBackstop, setHasBackstop] = useState(false);
  const [formData, setFormData] = useState({
    monthKey: getCurrentMonthKey(),
    name: "",
    displayLabel: "",
    entriesAmount: "100",
    startsAt: "",
    endsAt: "",
    code: "",
    validForHours: "",
    minInactiveDays: "",
    maxInactiveDays: "",
    requiresEmailVerified: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetingOpen, setTargetingOpen] = useState(false);
  const [audiencePick, setAudiencePick] = useState<CampaignTargetingConfirmPayload | null>(null);

  const isTriggerShape = expiryShape === "personal-window";

  /**
   * The three stored expiry fields, derived from the ONE shape answer. Single source for
   * both `canSubmit` and the submit payload so the form can never validate one shape and
   * post another.
   *
   * The sentinel is emitted from the CONSTANT, never round-tripped through the picker —
   * `datetime-local` reinterprets its value as local time, which would shift the stored
   * instant by the UTC offset on every save. See `isOpenEndedDate`.
   */
  const expiryFields = useMemo(() => {
    const hoursRaw = formData.validForHours.trim();
    const hours = Number(hoursRaw);
    const hoursValid = hoursRaw !== "" && Number.isInteger(hours) && hours >= 1;

    if (expiryShape === "personal-window") {
      return {
        endsAt: hasBackstop ? formData.endsAt : NEVER_EXPIRES_ISSUANCE_DATE.toISOString(),
        neverExpires: false,
        validForHours: hoursValid ? hours : undefined,
        hoursValid,
      };
    }
    if (expiryShape === "never-expires") {
      return { endsAt: undefined, neverExpires: true, validForHours: undefined, hoursValid };
    }
    return { endsAt: formData.endsAt, neverExpires: false, validForHours: undefined, hoursValid };
  }, [expiryShape, hasBackstop, formData.endsAt, formData.validForHours]);

  const endsAfterStart = useMemo(() => {
    if (!formData.startsAt || !formData.endsAt) return false;
    const start = new Date(formData.startsAt).getTime();
    const end = new Date(formData.endsAt).getTime();
    return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
  }, [formData.startsAt, formData.endsAt]);

  const normalizedCode = useMemo(() => normalizeCouponCode(formData.code), [formData.code]);

  const codeIsTriggerCode = TRIGGER_CODES.includes(normalizedCode);

  const canSubmit = useMemo(() => {
    const entries = Number(formData.entriesAmount);
    const baseOk =
      MONTH_KEY_PATTERN.test(formData.monthKey.trim()) &&
      formData.name.trim().length >= 3 &&
      Number.isInteger(entries) &&
      entries >= 1 &&
      COUPON_CODE_PATTERN.test(normalizedCode) &&
      Boolean(formData.startsAt) &&
      expiryShape !== null;
    if (!baseOk) return false;

    if (expiryShape === "fixed-end" && !endsAfterStart) return false;
    if (expiryShape === "personal-window") {
      if (!expiryFields.hoursValid) return false;
      if (hasBackstop && !endsAfterStart) return false;
    }

    // Unreachable by construction — the shape selector cannot emit both. Kept anyway:
    // `formData` is still a mutable object, and deleting a guard to celebrate that a form
    // got better is how the mass-mint defect this branch already caught once comes back.
    return !(expiryFields.neverExpires && expiryFields.validForHours);
  }, [
    formData.entriesAmount,
    formData.monthKey,
    formData.name,
    formData.startsAt,
    normalizedCode,
    expiryShape,
    endsAfterStart,
    hasBackstop,
    expiryFields,
  ]);

  /** The two clocks composed into one sentence, with the operator's real values. */
  const consequenceSentence = useMemo(() => {
    const endsLabel = formatPickerValue(formData.endsAt);
    const hoursRaw = formData.validForHours.trim();
    const hoursLabel = hoursRaw || "…";

    if (expiryShape === "fixed-end") {
      return `New codes are issued until ${endsLabel}. Every code stops working at ${endsLabel} — the same moment for everyone.`;
    }
    if (expiryShape === "personal-window") {
      if (!hasBackstop) {
        return `New codes are issued until you switch this coupon off. Each customer has ${hoursLabel} hours from the moment their code is issued.`;
      }
      const backstop = new Date(formData.endsAt);
      const lastLabel =
        formData.endsAt && !Number.isNaN(backstop.getTime()) && expiryFields.validForHours
          ? formatInstant(new Date(backstop.getTime() + expiryFields.validForHours * HOUR_MS))
          : "…";
      return `New codes are issued until ${endsLabel}. Each customer has ${hoursLabel} hours from the moment their code is issued — a code issued on the last day still works until ${lastLabel}.`;
    }
    if (expiryShape === "never-expires") {
      return "New codes are issued until you switch this coupon off. Codes never stop working.";
    }
    return null;
  }, [expiryShape, hasBackstop, formData.endsAt, formData.validForHours, expiryFields.validForHours]);

  /**
   * The hours value every piece of static-looking copy quotes. Falls back to the `72`
   * prefill while the field is blank so the card and helper read naturally before the
   * operator has typed — never to a literal that could contradict a typed value.
   */
  const hoursLabelForCopy = formData.validForHours.trim() || "72";

  /** `72` → `= 3 days`. Guards the validForDays → validForHours rename (2026-08-26). */
  const hoursAsDaysHint = useMemo(() => {
    const hours = Number(formData.validForHours.trim());
    if (!Number.isInteger(hours) || hours < 24 || hours % 24 !== 0) return null;
    const days = hours / 24;
    return `= ${days} ${days === 1 ? "day" : "days"}`;
  }, [formData.validForHours]);

  const audienceSummary = useMemo(() => {
    if (!audiencePick) return null;
    const parts: string[] = [];
    const sc = audiencePick.segmentConfig;
    if (sc.membershipTiers?.length) {
      parts.push(sc.membershipTiers.map(tierLabel).join(" + "));
    }
    if (sc.states?.length) {
      parts.push(sc.states.join(", "));
    }
    if (typeof sc.topEntriesPercent === "number") {
      parts.push(`Top ${sc.topEntriesPercent}% draw entries`);
    }
    if (audiencePick.includeUserIds.length) {
      parts.push(`${audiencePick.includeUserIds.length} pinned`);
    }
    return parts.length ? parts.join(" · ") : null;
  }, [audiencePick]);

  const resetForm = () => {
    setCampaignMode("both");
    setTargetingMode("all-active-subscribers");
    setPurchaseRequirement("none");
    setExpiryShape(null);
    setHasBackstop(false);
    setFormData({
      monthKey: getCurrentMonthKey(),
      name: "",
      displayLabel: "",
      entriesAmount: "100",
      startsAt: "",
      endsAt: "",
      code: "",
      validForHours: "",
      minInactiveDays: "",
      maxInactiveDays: "",
      requiresEmailVerified: true,
    });
    setError(null);
    setAudiencePick(null);
  };

  /**
   * Operator picked a shape. Selecting the trigger shape prefills the 72 hours and
   * defaults the coupon mode to "global" ONCE — a default, not a lock, so a campaign
   * created through Norm or curl with a different mode is never silently rewritten.
   */
  const handleSelectShape = (shape: CampaignExpiryShape) => {
    if (shape === "personal-window" && expiryShape !== "personal-window") {
      setCampaignMode("global");
    }
    setExpiryShape(shape);
    if (shape === "personal-window") {
      setFormData((prev) => (prev.validForHours.trim() ? prev : { ...prev, validForHours: "72" }));
    } else {
      setHasBackstop(false);
    }
  };

  const buildSegmentConfigPayload = (): MonthlyRedeemableSegmentConfig | undefined => {
    if (targetingMode === "all-active-subscribers") return undefined;

    const pick = audiencePick;
    const sc = pick?.segmentConfig;
    const out: MonthlyRedeemableSegmentConfig = {};

    if (targetingMode === "dynamic-segment") {
      if (formData.minInactiveDays.trim()) {
        out.minInactiveDays = Number(formData.minInactiveDays);
      }
      if (formData.maxInactiveDays.trim()) {
        out.maxInactiveDays = Number(formData.maxInactiveDays);
      }
      out.requiresEmailVerified = sc?.requiresEmailVerified ?? formData.requiresEmailVerified;
    } else if (sc?.requiresEmailVerified === false) {
      out.requiresEmailVerified = false;
    }

    if (pick?.includeUserIds?.length) {
      out.includeUserIds = pick.includeUserIds;
    }

    if (sc?.states?.length) {
      out.states = sc.states;
    }
    if (sc?.membershipTiers?.length) {
      out.membershipTiers = sc.membershipTiers;
    }
    if (typeof sc?.topEntriesPercent === "number") {
      out.topEntriesPercent = sc.topEntriesPercent;
    }

    const hasKeys = Object.keys(out).length > 0;
    if (!hasKeys) return undefined;
    return out;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (targetingMode === "manual-users" && !audiencePick?.includeUserIds?.length) {
      setError("For manual targeting, open Configure audience and pin at least one user (or switch targeting mode).");
      return;
    }

    const isEdit = Boolean(editingCampaign?.id);
    const hadHours = editingCampaign?.validForHours != null;

    // A — losing the personal window re-opens mass-minting. Deliberately independent of
    // issuanceCount: the consequence is about the AUDIENCE the cron would sweep, not about
    // rows that already exist.
    if (isEdit && hadHours && expiryShape !== "personal-window") {
      if (!window.confirm(COPY.confirmLosingWindow)) return;
    }

    // B — existing issuances are stamped at MINT time and never re-stamped, so ANY change
    // to the effective customer window (the shape, or the hours number) strands them.
    const storedShape = editingCampaign ? campaignExpiryShape(editingCampaign) : null;
    const windowChanged =
      storedShape !== expiryShape ||
      (expiryShape === "personal-window" && expiryFields.validForHours !== editingCampaign?.validForHours);
    if (isEdit && (editingCampaign?.issuanceCount ?? 0) > 0 && windowChanged) {
      if (!window.confirm(COPY.confirmStranded)) return;
    }

    // Clearing sentinel: only meaningful on an edit of a campaign that previously HAD
    // validForHours set — the create route's zod schema is `.optional()`, not `.nullable()`,
    // so `null` must never be sent on create.
    const validForHoursPayload =
      expiryFields.validForHours ?? (isEdit && hadHours ? null : undefined);

    setIsSubmitting(true);
    setError(null);
    try {
      const segmentConfig = buildSegmentConfigPayload();
      const response = await fetch(
        isEdit ? `/api/admin/monthly-coupon/campaign/${editingCampaign?.id}` : "/api/admin/monthly-coupon/campaign",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            monthKey: formData.monthKey.trim(),
            name: formData.name.trim(),
            displayLabel: formData.displayLabel.trim() || undefined,
            entriesAmount: Number(formData.entriesAmount),
            campaignMode,
            targetingMode,
            startsAt: formData.startsAt,
            endsAt: expiryFields.endsAt,
            neverExpires: expiryFields.neverExpires,
            validForHours: validForHoursPayload,
            code: normalizedCode,
            purchaseRequirement,
            segmentConfig,
            // Activation is owned SOLELY by the campaign card's Disable / Activate toggle,
            // which PUTs `{ isActive }` on its own. An edit must never carry it: with the
            // open-ended backstop shape, `isActive` is the ONLY remaining stop on minting
            // (`isCampaignLive` and the issuance lookup are both satisfied forever by the
            // year-9999 sentinel), and `deleteCampaign` is a soft delete that only sets
            // `isActive: false` — so re-sending `true` here silently resurrects a coupon an
            // operator had disabled, or one they had deleted, with nothing on screen saying so.
            ...(isEdit ? {} : { isActive: true }),
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        const detailedMessage =
          Array.isArray(data?.details) && data.details.length > 0
            ? data.details[0]?.message || data.error
            : data?.error;
        throw new Error(detailedMessage || "Failed to create coupon");
      }

      onSuccess?.();
      if (!editingCampaign) {
        resetForm();
      }
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create coupon");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!editingCampaign) {
      resetForm();
      return;
    }
    setCampaignMode(editingCampaign.campaignMode);
    setTargetingMode(editingCampaign.targetingMode);
    setPurchaseRequirement(
      editingCampaign.purchaseRequirement ?? (editingCampaign.requiresPurchase ? "membership" : "none")
    );

    // The stored shape is derived through the SAME precedence chain resolveIssuanceExpiry
    // uses, so what the form says is what the mint path will do.
    const shape = campaignExpiryShape(editingCampaign);
    // An open-ended endsAt must NEVER reach the picker — a datetime-local round-trip
    // reinterprets it as local time and drifts the stored instant on every save.
    const openEnded = isOpenEndedDate(editingCampaign.endsAt);
    setExpiryShape(shape);
    setHasBackstop(shape === "personal-window" && !openEnded && Boolean(editingCampaign.endsAt));

    const sc = editingCampaign.segmentConfig;
    setFormData({
      monthKey: editingCampaign.monthKey,
      name: editingCampaign.name,
      displayLabel: editingCampaign.displayLabel || "",
      entriesAmount: String(editingCampaign.entriesAmount),
      // FULL ISO, not `.slice(0, 16)`. `DateTimePicker` EMITS a full ISO instant
      // (`utcDate.toISOString()`), so hydrating a bare `YYYY-MM-DDTHH:mm` would put two
      // different representations into the same field: `new Date()` reads the bare form as
      // browser-LOCAL, so the consequence sentence rendered UTC digits as local time and
      // disagreed with the campaign list by the browser's UTC offset (10h in Sydney).
      // `parseValueToUtcInstant` handles a full ISO directly, so the picker displays the
      // true local time too.
      startsAt: editingCampaign.startsAt ? new Date(editingCampaign.startsAt).toISOString() : "",
      endsAt: editingCampaign.endsAt && !openEnded ? new Date(editingCampaign.endsAt).toISOString() : "",
      code: editingCampaign.code,
      validForHours: editingCampaign.validForHours != null ? String(editingCampaign.validForHours) : "",
      minInactiveDays: sc?.minInactiveDays != null ? String(sc.minInactiveDays) : "",
      maxInactiveDays: sc?.maxInactiveDays != null ? String(sc.maxInactiveDays) : "",
      requiresEmailVerified: sc?.requiresEmailVerified ?? true,
    });

    if (sc) {
      setAudiencePick({
        includeUserIds: sc.includeUserIds ?? [],
        segmentConfig: {
          requiresEmailVerified: sc.requiresEmailVerified ?? true,
          states: sc.states,
          membershipTiers: sc.membershipTiers as RedeemableTierId[] | undefined,
          topEntriesPercent: sc.topEntriesPercent,
          minInactiveDays: sc.minInactiveDays,
          maxInactiveDays: sc.maxInactiveDays,
        },
      });
    } else {
      setAudiencePick(null);
    }
    setError(null);
  }, [editingCampaign, isOpen]);

  useEffect(() => {
    if (targetingMode === "all-active-subscribers") {
      setAudiencePick(null);
    }
  }, [targetingMode]);

  return (
    <>
      <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
        <ModalHeader
          title={editingCampaign ? "Edit Monthly Redeemables Coupon" : "Create Monthly Redeemables Coupon"}
          onClose={onClose}
          showLogo={false}
        />
        <ModalContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormSection title="How this coupon ends">
              <p className="-mt-2 text-xs text-gray-500 dark:text-neutral-500">{COPY.sectionSub}</p>

              <div className="grid grid-cols-1 gap-2">
                {EXPIRY_SHAPE_CARDS.map((card) => {
                  const selected = expiryShape === card.shape;
                  return (
                    <button
                      key={card.shape}
                      type="button"
                      onClick={() => handleSelectShape(card.shape)}
                      aria-pressed={selected}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        selected
                          ? "border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/20"
                          : "border-gray-300 bg-white hover:border-red-400 dark:border-neutral-700 dark:bg-neutral-900"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                            selected
                              ? "border-red-600 bg-red-600 ring-2 ring-inset ring-white dark:ring-neutral-900"
                              : "border-gray-400 dark:border-neutral-600"
                          }`}
                          aria-hidden
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-900 dark:text-neutral-100">
                            {card.title}
                          </span>
                          <span className="mt-1 block text-xs text-gray-600 dark:text-neutral-400">
                            {card.body(hoursLabelForCopy)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300">
                {consequenceSentence ?? "Pick one of the three above and this line will spell out exactly what happens."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-red-600" />
                      Starts
                    </span>
                  </label>
                  <DateTimePicker
                    id="monthly-start-date"
                    name="startsAt"
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.startsHelper}</p>
                </div>

                {expiryShape === "fixed-end" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-red-600" />
                        Ends
                      </span>
                    </label>
                    <DateTimePicker
                      id="monthly-end-date"
                      name="endsAt"
                      type="datetime-local"
                      value={formData.endsAt}
                      onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.fixedEndHelper}</p>
                  </div>
                )}
              </div>

              {isTriggerShape && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                      Hours each customer gets
                      {hoursAsDaysHint && (
                        <span className="ml-2 font-normal text-gray-500 dark:text-neutral-500">{hoursAsDaysHint}</span>
                      )}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.validForHours}
                      onChange={(e) => setFormData((prev) => ({ ...prev, validForHours: e.target.value }))}
                      placeholder="72"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
                      {COPY.hoursHelper(hoursLabelForCopy)}
                    </p>
                    {formData.validForHours.trim() !== "" && formData.validForHours.trim() !== "72" && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{COPY.hoursCaution}</p>
                    )}
                  </div>

                  <div>
                    <label className="h-11 px-3 rounded-lg border border-gray-300 bg-white dark:border-neutral-600 dark:bg-neutral-900 flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                      <input
                        type="checkbox"
                        checked={hasBackstop}
                        onChange={(e) => {
                          setHasBackstop(e.target.checked);
                          if (!e.target.checked) setFormData((prev) => ({ ...prev, endsAt: "" }));
                        }}
                      />
                      {COPY.backstopLabel}
                    </label>
                    {hasBackstop ? (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-neutral-200 mb-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-red-600" />
                            Stop issuing new codes after
                          </span>
                        </label>
                        <DateTimePicker
                          id="monthly-end-date"
                          name="endsAt"
                          type="datetime-local"
                          value={formData.endsAt}
                          onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.backstopOnHelper}</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.backstopOffHelper}</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                    <p className="font-semibold">{COPY.triggerBannerTitle}</p>
                    <p className="mt-1">{COPY.triggerBannerBody}</p>
                  </div>
                </div>
              )}
            </FormSection>

            <FormSection title="Coupon Basics">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Reporting month (YYYY-MM)"
                    value={formData.monthKey}
                    onChange={(e) => setFormData((prev) => ({ ...prev, monthKey: e.target.value }))}
                    placeholder="YYYY-MM"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">
                    {isTriggerShape ? COPY.monthKeyHelperTrigger : COPY.monthKeyHelperStandard}
                  </p>
                </div>
                <Input
                  label="Free entries granted when redeemed"
                  type="number"
                  min={1}
                  value={formData.entriesAmount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, entriesAmount: e.target.value }))}
                  placeholder="100"
                />
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Coupon name"
                />
                <Input
                  value={formData.displayLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, displayLabel: e.target.value }))}
                  placeholder="Display label (e.g. Toolbox Code)"
                />
              </div>
            </FormSection>

            <FormSection title="Modes">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Dropdown
                    options={campaignModeOptions}
                    value={campaignMode}
                    onChange={(value) => setCampaignMode(value as CampaignMode)}
                  />
                  {isTriggerShape && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.campaignModeHelperTrigger}</p>
                  )}
                </div>
                <Dropdown
                  options={targetingModeOptions}
                  value={targetingMode}
                  onChange={(value) => setTargetingMode(value as TargetingMode)}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        code: normalizeCouponCode(e.target.value),
                      }))
                    }
                    placeholder="Coupon code (required, e.g. TOOLBOX-APR26)"
                  />
                  {isTriggerShape && (
                    <>
                      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.codeHintTrigger}</p>
                      {normalizedCode.length > 0 && !codeIsTriggerCode && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                          <span>{COPY.codeMismatchTrigger}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <Dropdown
                    options={purchaseRequirementOptions}
                    value={purchaseRequirement}
                    onChange={(value) => setPurchaseRequirement(value as PurchaseRequirement)}
                  />
                  {isTriggerShape && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-neutral-500">{COPY.purchaseHelperTrigger}</p>
                  )}
                </div>
              </div>
            </FormSection>

            {targetingMode !== "all-active-subscribers" && (
              <FormSection title="Audience">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                  <Button type="button" variant="outline" size="md" onClick={() => setTargetingOpen(true)} className="inline-flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Configure audience…
                  </Button>
                  {audienceSummary && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 border border-gray-200 dark:border-neutral-700">
                      {audienceSummary}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-neutral-500 mt-2">
                  Filter by membership tier, state, verified email, and top % of major draw entries. Pin specific users so they always receive the redeemable when eligible.
                </p>
              </FormSection>
            )}

            {targetingMode === "dynamic-segment" && (
              <FormSection title="Dynamic Segment Rules">
                <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900/50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2">
                    <Target className="w-4 h-4 text-red-600" />
                    Inactivity (optional)
                  </div>
                  <p className="text-xs text-gray-500 dark:text-neutral-500 mb-2">
                    Email verification for dynamic segments is also set in <strong>Configure audience</strong> (or use the checkbox below as default before opening the picker).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      type="number"
                      min={0}
                      value={formData.minInactiveDays}
                      onChange={(e) => setFormData((prev) => ({ ...prev, minInactiveDays: e.target.value }))}
                      placeholder="Min inactive days"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={formData.maxInactiveDays}
                      onChange={(e) => setFormData((prev) => ({ ...prev, maxInactiveDays: e.target.value }))}
                      placeholder="Max inactive days"
                    />
                    <label className="h-11 px-3 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 flex items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                      <input
                        type="checkbox"
                        checked={formData.requiresEmailVerified}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, requiresEmailVerified: e.target.checked }))
                        }
                      />
                      Email verified only
                    </label>
                  </div>
                </div>
              </FormSection>
            )}

            {error && (
              <div className="text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-neutral-800">
              <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    {editingCampaign ? "Save Coupon" : "Create Coupon"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </ModalContent>
      </ModalContainer>

      <CampaignTargetingModal
        isOpen={targetingOpen}
        onClose={() => setTargetingOpen(false)}
        onConfirm={setAudiencePick}
        parentSegmentDefaults={{
          minInactiveDays: formData.minInactiveDays.trim() ? Number(formData.minInactiveDays) : undefined,
          maxInactiveDays: formData.maxInactiveDays.trim() ? Number(formData.maxInactiveDays) : undefined,
          requiresEmailVerified: formData.requiresEmailVerified,
        }}
        initialIncludeUserIds={audiencePick?.includeUserIds}
        initialPersistedSegment={audiencePick?.segmentConfig}
      />
    </>
  );
}
