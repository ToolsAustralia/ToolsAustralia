import { useMutation } from "@tanstack/react-query";

interface CreateSetupIntentResponse {
  success: boolean;
  client_secret?: string;
  setup_intent_id?: string;
  error?: string;
}

/**
 * Custom hook for creating SetupIntents following Stripe best practices
 * SetupIntents are the recommended way to save payment methods for future use
 */
export const useSetupIntent = () => {
  return useMutation<CreateSetupIntentResponse, Error>({
    mutationFn: async () => {
      const response = await fetch("/api/stripe/create-setup-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create setup intent");
      }

      return result;
    },
    onError: (error) => {
      console.error("SetupIntent creation failed:", error);
    },
  });
};
