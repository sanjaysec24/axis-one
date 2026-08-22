import { CommerceConversationContext } from "./types";

// In-memory store for user sessions
const sessionsStore = new Map<string, CommerceConversationContext>();

/**
 * Retrieves the session context for a given sessionId.
 */
export function getSession(sessionId: string): CommerceConversationContext | undefined {
  return sessionsStore.get(sessionId);
}

/**
 * Saves or updates a session context.
 */
export function saveSession(session: CommerceConversationContext): void {
  sessionsStore.set(session.sessionId, session);
}

/**
 * Generates a unique sessionId.
 */
export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Searches user sessions to locate the one matching a specific Razorpay order ID.
 */
export function findSessionByRazorpayOrderId(orderId: string): CommerceConversationContext | undefined {
  for (const session of sessionsStore.values()) {
    if (session.razorpayOrderId === orderId) {
      return session;
    }
  }
  return undefined;
}

/**
 * Development test helper to clear sessions map.
 */
export function clearAllSessions(): void {
  sessionsStore.clear();
}
