/**
 * Utility for checking payment processing status
 */

export interface PaymentStatusResponse {
  success: boolean;
  processed: boolean;
  status: "pending" | "completed" | "failed" | "timeout";
  data: {
    paymentIntentId: string;
    eventType?: string;
    packageType?: string;
    packageName?: string;
    entries?: number;
    points?: number;
    processedBy?: string;
    timestamp?: string;
    message?: string;
  };
}

/**
 * Check if payment benefits have been processed
 */
export async function checkPaymentStatus(paymentIntentId: string): Promise<PaymentStatusResponse> {
  try {
    const response = await fetch(`/api/payment-status/${paymentIntentId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking payment status:", error);
    return {
      success: false,
      processed: false,
      status: "failed",
      data: {
        paymentIntentId,
        message: "Failed to check payment status",
      },
    };
  }
}

/**
 * Poll payment status until processed or timeout
 */
export async function pollPaymentStatus(
  paymentIntentId: string,
  options: {
    interval?: number; // milliseconds between polls
    timeout?: number; // maximum time to poll
    onUpdate?: (status: PaymentStatusResponse) => void;
  } = {}
): Promise<PaymentStatusResponse> {
  const { interval = 2000, timeout = 30000, onUpdate } = options;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const poll = async () => {
      try {
        const status = await checkPaymentStatus(paymentIntentId);

        if (onUpdate) {
          onUpdate(status);
        }

        if (status.processed || status.status === "failed") {
          resolve(status);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          resolve({
            success: false,
            processed: false,
            status: "timeout",
            data: {
              paymentIntentId,
              message: "Payment processing timeout - benefits may still be processing",
            },
          });
          return;
        }

        // Continue polling
        setTimeout(poll, interval);
      } catch (error) {
        console.error("Error in payment status polling:", error);
        resolve({
          success: false,
          processed: false,
          status: "failed",
          data: {
            paymentIntentId,
            message: "Error checking payment status",
          },
        });
      }
    };

    poll();
  });
}

/**
 * Poll payment status with cancellation support
 */
export function pollPaymentStatusWithCancel(
  paymentIntentId: string,
  options: {
    interval?: number; // milliseconds between polls
    timeout?: number; // maximum time to poll
    onUpdate?: (status: PaymentStatusResponse) => void;
  } = {}
): { promise: Promise<PaymentStatusResponse>; cancel: () => void } {
  const { interval = 2000, timeout = 30000, onUpdate } = options;
  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  let isCancelled = false;

  const promise = new Promise<PaymentStatusResponse>((resolve) => {
    const poll = async () => {
      if (isCancelled) return;

      try {
        const status = await checkPaymentStatus(paymentIntentId);

        if (isCancelled) return;

        if (onUpdate) {
          onUpdate(status);
        }

        if (status.processed || status.status === "failed") {
          resolve(status);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          resolve({
            success: false,
            processed: false,
            status: "timeout",
            data: {
              paymentIntentId,
              message: "Payment processing timeout - benefits may still be processing",
            },
          });
          return;
        }

        // Continue polling
        if (!isCancelled) {
          timeoutId = setTimeout(poll, interval);
        }
      } catch (error) {
        if (isCancelled) return;

        console.error("Error in payment status polling:", error);
        resolve({
          success: false,
          processed: false,
          status: "failed",
          data: {
            paymentIntentId,
            message: "Error checking payment status",
          },
        });
      }
    };

    poll();
  });

  const cancel = () => {
    isCancelled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { promise, cancel };
}
