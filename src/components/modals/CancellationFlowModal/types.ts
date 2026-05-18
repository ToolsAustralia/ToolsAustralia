import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

export interface FlowState {
  step: 1 | 2 | 3 | 4;
  reason: CancellationReason | null;
  reasonText: string;
  eventId: string | null;
  offersShown: OfferType[];
  offerCursor: number;
  pastDue: boolean;
}

export interface CancellationFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
  onSaved: () => void;
  onResolvePayment: () => void;
}
