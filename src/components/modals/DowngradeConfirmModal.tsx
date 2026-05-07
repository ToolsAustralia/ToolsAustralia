"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { ArrowDown, Check, Calendar, Tag, Percent, Sparkles } from "lucide-react";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";

type TierKey = "tradie" | "foreman" | "boss";

interface DowngradeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  fromPackageName: string;
  toPackageName: string;
  toPackagePrice: number;
  /** Order in body: partner offer access % → days of access → entries (matches MembershipSection). */
  toPartnerAccessPercent: number;
  toPartnerDiscountDays: number;
  toEntriesPerMonth: number;
  /** Display label for when the new plan activates, e.g. "Fri 26 Dec". */
  effectiveDateLabel?: string;
  currentEntries?: number;
  saveLabel?: string;
}

const TIER_FROM_NAME = (name?: string): TierKey => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  return "tradie";
};

const DowngradeConfirmModal: React.FC<DowngradeConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  fromPackageName,
  toPackageName,
  toPackagePrice,
  toPartnerAccessPercent,
  toPartnerDiscountDays,
  toEntriesPerMonth,
  effectiveDateLabel,
  currentEntries,
  saveLabel,
}) => {
  const fromTier = TIER_FROM_NAME(fromPackageName);
  const toTier = TIER_FROM_NAME(toPackageName);
  const fromIcon: PackageIconData | null = getPackageIconByName(fromPackageName, "subscription");
  const toIcon: PackageIconData | null = getPackageIconByName(toPackageName, "subscription");

  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      // Always clear inline overflow — never restore captured state, to avoid persisting a bad lock.
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dc-root fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="dc-stage relative" role="dialog" aria-modal="true" aria-labelledby="dc-headline">
        <button className="dc-close" type="button" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={`dc-frame tier-${toTier}`}>
          {/* HERO */}
          <div className="dc-hero">
            <div className="dc-eyebrow">
              <ArrowDown size={12} />
              <span>Schedule downgrade</span>
            </div>
            <h2 className="dc-headline" id="dc-headline">
              Switch to <span className="accent">{toPackageName}</span>
            </h2>
            <p className="dc-sub">
              Pay less, drop a tier — keep every entry you&apos;ve already earned.
            </p>

            {/* From → To */}
            <div className="dc-compare">
              <div className={`dc-tier-card from tier-${fromTier}`}>
                <div className="dc-tier-icon">
                  {fromIcon ? <Image src={fromIcon} alt={fromPackageName} width={56} height={56} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : null}
                </div>
                <div className="dc-tier-meta">
                  <div className="dc-tier-label">Current</div>
                  <div className="dc-tier-name">{fromPackageName}</div>
                </div>
              </div>
              <div className="dc-arrow">
                <ArrowDown size={14} />
              </div>
              <div className={`dc-tier-card to tier-${toTier}`}>
                <div className="dc-tier-icon">
                  {toIcon ? <Image src={toIcon} alt={toPackageName} width={56} height={56} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : null}
                </div>
                <div className="dc-tier-meta">
                  <div className="dc-tier-label">New</div>
                  <div className="dc-tier-name">{toPackageName}</div>
                  <div className="dc-tier-price">${toPackagePrice}/mo</div>
                </div>
              </div>
            </div>
          </div>

          {/* BODY — partner % → days → entries (consistent with MembershipSection) */}
          <div className="dc-body">
            <div className="dc-body-title">{toPackageName} benefits from your next billing date</div>

            <div className="dc-stat-grid">
              <div className="dc-stat">
                <div className="dc-stat-icon"><Percent size={18} /></div>
                <div className="dc-stat-num">{toPartnerAccessPercent}%</div>
                <div className="dc-stat-label">Partner offers</div>
              </div>
              <div className="dc-stat">
                <div className="dc-stat-icon"><Calendar size={18} /></div>
                <div className="dc-stat-num">{toPartnerDiscountDays}</div>
                <div className="dc-stat-label">Days access</div>
              </div>
              <div className="dc-stat">
                <div className="dc-stat-icon"><Sparkles size={18} /></div>
                <div className="dc-stat-num">{toEntriesPerMonth}</div>
                <div className="dc-stat-label">Free entries / cycle</div>
              </div>
            </div>

            <ul className="dc-checks">
              {typeof currentEntries === "number" && currentEntries > 0 ? (
                <li><Check size={12} />Your <strong>{currentEntries.toLocaleString()}</strong> accumulated entries stay locked in</li>
              ) : (
                <li><Check size={12} />Every entry you&apos;ve earned stays locked in</li>
              )}
              <li><Check size={12} />Keep current {fromPackageName} benefits until next billing</li>
              {saveLabel ? <li><Check size={12} /><strong>{saveLabel}</strong> from then on</li> : null}
              {effectiveDateLabel ? (
                <li><Check size={12} />New plan activates <strong>{effectiveDateLabel}</strong></li>
              ) : null}
              <li><Tag size={12} />No refund — you keep what you paid for</li>
            </ul>

            <div className="dc-actions">
              <button type="button" className="dc-btn dc-btn-cancel" onClick={onClose} disabled={isLoading}>
                Keep {fromPackageName}
              </button>
              <button type="button" className="dc-btn dc-btn-confirm" onClick={onConfirm} disabled={isLoading}>
                {isLoading ? "Scheduling…" : `Schedule downgrade to ${toPackageName}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dc-stage {
          width: 100%;
          max-width: 520px;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          color: #0a0a0a;
          max-height: calc(100dvh - 16px);
          display: flex;
        }
        .dc-frame {
          position: relative;
          width: 100%;
          background: #fff;
          border-radius: 20px;
          overflow-y: auto;
          overflow-x: hidden;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.25);
          max-height: 100%;
          scrollbar-width: thin;
        }
        .dc-frame::-webkit-scrollbar {
          width: 6px;
        }
        .dc-frame::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 999px;
        }
        .dc-close {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 10;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.55);
          color: rgba(255, 255, 255, 0.95);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(8px);
          transition: background 160ms ease;
        }
        .dc-close:hover {
          background: rgba(0, 0, 0, 0.75);
        }

        .dc-hero {
          position: relative;
          padding: 16px 18px 14px;
          background:
            radial-gradient(700px 280px at 50% -80px, var(--tier-glow-1), transparent 65%),
            radial-gradient(500px 220px at 50% 120%, var(--tier-glow-2), transparent 60%),
            linear-gradient(180deg, #0a0a0a 0%, #141416 60%, #0a0a0a 100%);
          color: #fff;
          overflow: hidden;
        }
        .dc-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            45deg,
            transparent 0 14px,
            rgba(255, 255, 255, 0.012) 14px 28px
          );
          pointer-events: none;
        }
        .dc-eyebrow {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--tier-color);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--tier-border);
          border-radius: 999px;
          padding: 4px 10px;
          margin-bottom: 8px;
        }
        .dc-headline {
          position: relative;
          font-family: "Anton", "Inter", sans-serif;
          font-size: 26px;
          line-height: 1;
          letter-spacing: 0.005em;
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .dc-headline .accent {
          color: var(--tier-color);
        }
        .dc-sub {
          position: relative;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.45;
          margin: 0 0 12px;
          max-width: 360px;
        }

        .dc-compare {
          position: relative;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 8px;
          align-items: stretch;
        }
        .dc-tier-card {
          display: grid;
          grid-template-columns: 44px 1fr;
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          min-width: 0;
        }
        .dc-tier-card.to {
          background: var(--tier-card-bg);
          border-color: var(--tier-border);
        }
        .dc-tier-card.from {
          opacity: 0.6;
        }
        .dc-tier-icon {
          width: 44px;
          height: 44px;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          flex: 0 0 44px;
        }
        .dc-tier-card.to .dc-tier-icon {
          background: var(--tier-icon-bg);
          border: 1px solid var(--tier-border);
        }
        .dc-tier-meta {
          min-width: 0;
        }
        .dc-tier-label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.55);
          margin-bottom: 1px;
        }
        .dc-tier-card.to .dc-tier-label {
          color: var(--tier-color);
        }
        .dc-tier-name {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.01em;
          line-height: 1.1;
          color: #fff;
        }
        .dc-tier-price {
          margin-top: 2px;
          font-size: 11px;
          font-weight: 700;
          color: var(--tier-color);
        }
        .dc-arrow {
          align-self: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--tier-cta-bg);
          color: var(--tier-cta-text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--tier-cta-shadow);
        }

        .dc-body {
          padding: 16px 18px 14px;
          background: #fff;
        }
        .dc-body-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #525252;
          text-align: center;
          margin-bottom: 12px;
        }
        .dc-stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 12px;
        }
        .dc-stat {
          text-align: center;
          padding: 12px 8px;
          border-radius: 12px;
          background: var(--tier-stat-bg);
          border: 1px solid var(--tier-stat-border);
        }
        .dc-stat-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          margin: 0 auto 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--tier-icon-bg-light);
          color: var(--tier-color-deep);
        }
        .dc-stat-num {
          font-family: "Anton", "Inter", sans-serif;
          font-size: 22px;
          line-height: 1;
          color: #0a0a0a;
        }
        .dc-stat-label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #525252;
          margin-top: 4px;
        }

        .dc-checks {
          list-style: none;
          padding: 0;
          margin: 0 0 14px;
          display: grid;
          gap: 6px;
        }
        .dc-checks li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #262626;
          line-height: 1.35;
        }
        .dc-checks li :global(svg) {
          color: var(--tier-color-deep);
          flex: 0 0 12px;
        }
        .dc-checks strong {
          font-weight: 800;
          color: #0a0a0a;
        }

        .dc-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 8px;
        }
        .dc-btn {
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.02em;
          line-height: 1.2;
          transition: transform 160ms ease, filter 160ms ease, background 160ms ease, border-color 160ms ease;
        }
        .dc-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .dc-btn-cancel {
          background: #fff;
          color: #525252;
          border: 1.5px solid #e5e5e5;
        }
        .dc-btn-cancel:hover:not(:disabled) {
          background: #fafafa;
          border-color: #a3a3a3;
        }
        .dc-btn-confirm {
          background: var(--tier-cta-bg);
          color: var(--tier-cta-text);
          border: 1.5px solid var(--tier-border);
          box-shadow: var(--tier-cta-shadow);
        }
        .dc-btn-confirm:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        /* === Tier themes — match MembershipSection MEMBERSHIP_TAB_COLOR_MAP === */
        /* Tradie membership card → makita-teal (#00c2ed cyan) */
        .dc-frame.tier-tradie {
          --tier-color: #5ce0ff;
          --tier-color-deep: #0b7e88;
          --tier-glow-1: rgba(0, 194, 237, 0.34);
          --tier-glow-2: rgba(92, 169, 236, 0.18);
          --tier-card-bg: rgba(0, 194, 237, 0.14);
          --tier-border: rgba(0, 194, 237, 0.42);
          --tier-icon-bg: rgba(0, 194, 237, 0.18);
          --tier-icon-bg-light: #e0f9ff;
          --tier-stat-bg: linear-gradient(180deg, #f0fbff, #fff);
          --tier-stat-border: #bae6fd;
          --tier-cta-bg: linear-gradient(135deg, #5ca9ec, #00c2ed);
          --tier-cta-text: #fff;
          --tier-cta-shadow: 0 8px 18px rgba(0, 194, 237, 0.42);
        }
        /* Foreman membership card → dewalt-yellow (#ffd200) */
        .dc-frame.tier-foreman {
          --tier-color: #ffe066;
          --tier-color-deep: #a17b00;
          --tier-glow-1: rgba(255, 210, 0, 0.32);
          --tier-glow-2: rgba(255, 210, 0, 0.16);
          --tier-card-bg: rgba(255, 210, 0, 0.14);
          --tier-border: rgba(255, 210, 0, 0.45);
          --tier-icon-bg: rgba(255, 210, 0, 0.2);
          --tier-icon-bg-light: #fffbe6;
          --tier-stat-bg: linear-gradient(180deg, #fffce6, #fff);
          --tier-stat-border: #fde68a;
          --tier-cta-bg: linear-gradient(135deg, #ffe066, #ffd200);
          --tier-cta-text: #0a0a0a;
          --tier-cta-shadow: 0 8px 18px rgba(255, 210, 0, 0.45);
        }
        /* Boss membership card → boss-red (#ee0000) */
        .dc-frame.tier-boss {
          --tier-color: #ff6b6b;
          --tier-color-deep: #b91c1c;
          --tier-glow-1: rgba(238, 0, 0, 0.34);
          --tier-glow-2: rgba(238, 0, 0, 0.16);
          --tier-card-bg: rgba(238, 0, 0, 0.14);
          --tier-border: rgba(238, 0, 0, 0.4);
          --tier-icon-bg: rgba(238, 0, 0, 0.18);
          --tier-icon-bg-light: #fef2f2;
          --tier-stat-bg: linear-gradient(180deg, #fff5f5, #fff);
          --tier-stat-border: #fee2e2;
          --tier-cta-bg: linear-gradient(135deg, #ff3333, #ee0000);
          --tier-cta-text: #fff;
          --tier-cta-shadow: 0 8px 18px rgba(238, 0, 0, 0.42);
        }

        @media (max-width: 540px) {
          .dc-frame {
            border-radius: 16px;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .dc-frame::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
          }
          .dc-hero {
            padding: 12px 12px 10px;
          }
          .dc-headline {
            font-size: 22px;
          }
          .dc-sub {
            font-size: 11px;
            margin-bottom: 10px;
          }
          .dc-compare {
            gap: 6px;
          }
          .dc-tier-card {
            grid-template-columns: 36px 1fr;
            gap: 8px;
            padding: 8px;
          }
          .dc-tier-icon {
            width: 36px;
            height: 36px;
            flex: 0 0 36px;
          }
          .dc-tier-name {
            font-size: 12px;
          }
          .dc-tier-price {
            font-size: 10px;
          }
          .dc-arrow {
            width: 22px;
            height: 22px;
          }
          .dc-body {
            padding: 12px;
          }
          .dc-stat-grid {
            gap: 6px;
            margin-bottom: 10px;
          }
          .dc-stat {
            padding: 8px 4px;
            border-radius: 10px;
          }
          .dc-stat-icon {
            width: 26px;
            height: 26px;
            margin-bottom: 4px;
          }
          .dc-stat-icon :global(svg) {
            width: 14px;
            height: 14px;
          }
          .dc-stat-num {
            font-size: 18px;
          }
          .dc-stat-label {
            font-size: 8px;
            letter-spacing: 0.08em;
          }
          .dc-checks li {
            font-size: 11px;
          }
          .dc-actions {
            grid-template-columns: 1fr;
          }
          .dc-btn {
            font-size: 11px;
            padding: 9px 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default DowngradeConfirmModal;
