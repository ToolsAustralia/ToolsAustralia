import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Modal Priority System
 *
 * Priority Order: Upsell → User Setup → SpecialPackages
 * Session Tracking: User Setup & SpecialPackages show only once per session
 *
 * This store manages modal conflicts and ensures proper priority handling
 */

export type ModalType = "user-setup" | "upsell" | "special-packages" | "pixel-consent";

interface ModalData {
  [key: string]: unknown;
}

interface ModalPriorityState {
  // Current active modal
  activeModal: ModalType | null;
  activeModalData: ModalData | null;

  // Session tracking for one-time modals
  sessionShownModals: Set<ModalType>;

  // Modal queue for pending modals
  modalQueue: Array<{ type: ModalType; data?: ModalData }>;

  // Track if upsell should show after user setup completion
  pendingUpsellAfterSetup: boolean;
  pendingUpsellData: ModalData | null; // Store the upsell data for later use

  // Actions
  requestModal: (modalType: ModalType, force?: boolean, data?: ModalData) => boolean;
  closeModal: () => void;
  canShowModal: (modalType: ModalType) => boolean;
  markModalShown: (modalType: ModalType) => void;
  clearSession: () => void;
  clearModalFromSession: (modalType: ModalType) => void;
  setPendingUpsellAfterSetup: (pending: boolean, data?: ModalData) => void;

  // Utilities
  getNextModal: () => ModalType | null;
  isModalActive: (modalType: ModalType) => boolean;
}

// Modal priority order (higher number = higher priority)
// Note: Upsell gets highest priority to ensure post-purchase conversions
const MODAL_PRIORITIES: Record<ModalType, number> = {
  upsell: 3, // NEW: Highest priority (was 2)
  "user-setup": 2, // NEW: Second priority (was 3)
  "special-packages": 1, // Lower priority
  "pixel-consent": 0, // Lowest priority
};

// Modals that should only show once per session
const SESSION_ONCE_MODALS: Set<ModalType> = new Set(["user-setup", "special-packages"]);

export const useModalPriorityStore = create<ModalPriorityState>()(
  devtools(
    (set, get) => ({
      // Initial state
      activeModal: null,
      activeModalData: null,
      sessionShownModals: new Set(),
      modalQueue: [],
      pendingUpsellAfterSetup: false,
      pendingUpsellData: null,

      // Request to show a modal
      requestModal: (modalType: ModalType, force: boolean = false, data?: ModalData) => {
        const { canShowModal, activeModal, modalQueue } = get();

        console.log(`🎭 Modal request: ${modalType}`, { force, activeModal, queue: modalQueue });

        // Check if modal can be shown
        if (!force && !canShowModal(modalType)) {
          console.log(`🚫 Modal ${modalType} cannot be shown`);
          return false;
        }

        // If no active modal, show immediately
        if (!activeModal) {
          set({ activeModal: modalType, activeModalData: data || null }, false, `modalPriority/show${modalType}`);
          console.log(`✅ Modal ${modalType} shown immediately`);
          return true;
        }

        // Check if requesting modal has higher priority
        const currentPriority = MODAL_PRIORITIES[activeModal];
        const requestedPriority = MODAL_PRIORITIES[modalType];

        if (requestedPriority > currentPriority) {
          // Higher priority modal - queue current modal and show new one
          const currentData = get().activeModalData;
          const newQueue = [...modalQueue, { type: activeModal, data: currentData || undefined }];
          set(
            {
              activeModal: modalType,
              activeModalData: data || null,
              modalQueue: newQueue,
            },
            false,
            `modalPriority/replace${modalType}`
          );

          console.log(`🔄 Higher priority modal ${modalType} replacing ${activeModal}`);
          return true;
        } else {
          // Lower or equal priority - add to queue
          const modalInQueue = modalQueue.find((item) => item.type === modalType);
          if (!modalInQueue) {
            set({ modalQueue: [...modalQueue, { type: modalType, data }] }, false, `modalPriority/queue${modalType}`);
            console.log(`📋 Modal ${modalType} added to queue`);
          }
          return false;
        }
      },

      // Close current modal and show next in queue
      closeModal: () => {
        const { modalQueue } = get();

        if (modalQueue.length > 0) {
          // Show next modal in queue
          const nextModal = modalQueue[0];
          const remainingQueue = modalQueue.slice(1);

          set(
            {
              activeModal: nextModal.type,
              activeModalData: nextModal.data ? nextModal.data : null,
              modalQueue: remainingQueue,
            },
            false,
            `modalPriority/showNext${nextModal.type}`
          );

          console.log(`➡️ Showing next modal: ${nextModal.type}`);
        } else {
          // No more modals in queue
          set({ activeModal: null, activeModalData: null }, false, "modalPriority/closeAll");
          console.log(`✅ All modals closed`);
        }
      },

      // Check if modal can be shown
      canShowModal: (modalType: ModalType) => {
        const { sessionShownModals } = get();

        // Check if modal should only show once per session
        if (SESSION_ONCE_MODALS.has(modalType) && sessionShownModals.has(modalType)) {
          console.log(`🚫 Modal ${modalType} already shown this session`);
          return false;
        }

        return true;
      },

      // Mark modal as shown in this session
      markModalShown: (modalType: ModalType) => {
        const { sessionShownModals } = get();
        const newShownModals = new Set(sessionShownModals);
        newShownModals.add(modalType);

        set({ sessionShownModals: newShownModals }, false, `modalPriority/markShown${modalType}`);
        console.log(`📝 Modal ${modalType} marked as shown this session`);
      },

      // Clear session tracking (for testing or new sessions)
      clearSession: () => {
        set(
          {
            sessionShownModals: new Set(),
            activeModal: null,
            activeModalData: null,
            modalQueue: [],
            pendingUpsellAfterSetup: false,
            pendingUpsellData: null,
          },
          false,
          "modalPriority/clearSession"
        );
        console.log(`🔄 Modal session cleared`);
      },

      // Clear specific modal from session tracking
      clearModalFromSession: (modalType: ModalType) => {
        const { sessionShownModals } = get();
        const newShownModals = new Set(sessionShownModals);
        newShownModals.delete(modalType);

        set({ sessionShownModals: newShownModals }, false, `modalPriority/clearModal${modalType}`);
        console.log(`🔄 Modal ${modalType} cleared from session tracking`);
      },

      // Get next modal in queue
      getNextModal: () => {
        const { modalQueue } = get();
        return modalQueue.length > 0 ? modalQueue[0].type : null;
      },

      // Check if specific modal is active
      isModalActive: (modalType: ModalType) => {
        const { activeModal } = get();
        return activeModal === modalType;
      },

      // Set pending upsell after setup
      setPendingUpsellAfterSetup: (pending: boolean, data?: ModalData) => {
        set(
          {
            pendingUpsellAfterSetup: pending,
            pendingUpsellData: data || null,
          },
          false,
          "modalPriority/setPendingUpsellAfterSetup"
        );
        console.log(`🎯 Pending upsell after setup: ${pending}`, data ? "with data" : "no data");

        // CRITICAL: Immediately persist to sessionStorage to survive page navigation
        // This fixes the tab-switching bug by ensuring data is ALWAYS available
        if (typeof window !== "undefined") {
          try {
            if (pending && data) {
              sessionStorage.setItem("pendingUpsell", JSON.stringify(data));
              sessionStorage.setItem("pendingUpsellFlag", "true");
              console.log("💾 Saved pending upsell to sessionStorage for immediate availability");
            } else {
              sessionStorage.removeItem("pendingUpsell");
              sessionStorage.removeItem("pendingUpsellFlag");
              console.log("🗑️ Cleared pending upsell from sessionStorage");
            }
          } catch (error) {
            console.error("Failed to save pending upsell:", error);
          }
        }
      },
    }),
    {
      name: "modal-priority-store",
    }
  )
);

/**
 * Session Storage Integration
 * Persists session tracking across page refreshes
 */
export const initializeModalSession = () => {
  if (typeof window === "undefined") return;

  try {
    const stored = sessionStorage.getItem("modalSessionShown");
    if (stored) {
      const shownModals = JSON.parse(stored) as ModalType[];
      const { markModalShown } = useModalPriorityStore.getState();

      shownModals.forEach((modalType) => {
        markModalShown(modalType);
      });

      console.log(`🔄 Restored modal session: ${shownModals.join(", ")}`);
    }

    // CRITICAL: Restore pending upsell from sessionStorage
    // This ensures it's available BEFORE the my-account page effect runs
    const pendingUpsellFlag = sessionStorage.getItem("pendingUpsellFlag");
    const pendingUpsell = sessionStorage.getItem("pendingUpsell");

    if (pendingUpsellFlag === "true" && pendingUpsell) {
      try {
        const data = JSON.parse(pendingUpsell);
        const store = useModalPriorityStore.getState();
        // Use set directly to avoid recursion (don't call setPendingUpsellAfterSetup)
        store.pendingUpsellAfterSetup = true;
        store.pendingUpsellData = data;
        console.log(`🔄 Restored pending upsell from sessionStorage (fixes tab-switching bug)`);
      } catch (e) {
        console.error("Failed to restore pending upsell:", e);
        sessionStorage.removeItem("pendingUpsell");
        sessionStorage.removeItem("pendingUpsellFlag");
      }
    }
  } catch (error) {
    console.error("Failed to restore modal session:", error);
  }
};

export const saveModalSession = () => {
  if (typeof window === "undefined") return;

  try {
    const { sessionShownModals } = useModalPriorityStore.getState();
    const shownArray = Array.from(sessionShownModals);
    sessionStorage.setItem("modalSessionShown", JSON.stringify(shownArray));
  } catch (error) {
    console.error("Failed to save modal session:", error);
  }
};

// Subscribe to session changes and save to sessionStorage
useModalPriorityStore.subscribe(() => {
  // Save session whenever sessionShownModals changes
  saveModalSession();
});
