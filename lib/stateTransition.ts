import { TransactionState } from "./types";

/**
 * Validates whether a transition from one TransactionState to another is allowed.
 * Prevents invalid state jumps and ensures idempotency.
 */
export function isValidStateTransition(from: TransactionState, to: TransactionState): boolean {
  if (from === to) return true; // Idempotent transitions are always valid

  switch (from) {
    case "EXPLORING":
      return to === "AWAITING_USER_APPROVAL" || to === "BLOCKED";
      
    case "AWAITING_USER_APPROVAL":
      return to === "USER_CONFIRMED" || to === "EXPLORING" || to === "BLOCKED" || to === "UPDATED";
      
    case "UPDATED":
      return to === "AWAITING_USER_APPROVAL" || to === "EXPLORING" || to === "BLOCKED";

    case "USER_CONFIRMED":
      return to === "PAYMENT_PENDING" || to === "EXPLORING";
      
    case "PAYMENT_PENDING":
      return (
        to === "PAYMENT_PROCESSING" ||
        to === "PAYMENT_COMPLETED" ||
        to === "PAYMENT_FAILED" ||
        to === "PAYMENT_CANCELLED"
      );
      
    case "PAYMENT_PROCESSING":
      return (
        to === "PAYMENT_COMPLETED" ||
        to === "PAYMENT_FAILED" ||
        to === "PAYMENT_CANCELLED"
      );
      
    case "PAYMENT_FAILED":
    case "PAYMENT_CANCELLED":
      // Allow user to retry the payment or reset back to exploring
      return (
        to === "PAYMENT_PENDING" ||
        to === "PAYMENT_PROCESSING" ||
        to === "EXPLORING"
      );
      
    case "PAYMENT_COMPLETED":
      // Final state: no further state changes are permitted
      return false;
      
    case "BLOCKED":
      return to === "EXPLORING" || to === "AWAITING_USER_APPROVAL";
      
    default:
      return false;
  }
}
