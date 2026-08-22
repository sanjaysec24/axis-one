import { AuditEvent } from "./types";

// In-memory list to store audit events chronologically
const auditTrail: AuditEvent[] = [];

/**
 * Creates a unique audit event ID.
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates and records an audit event in chronological order.
 */
export function createAuditEvent(eventData: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  const event: AuditEvent = {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    ...eventData
  };
  auditTrail.push(event);
  return event;
}

/**
 * Returns the recorded audit trail in chronological order.
 */
export function getAuditTrail(): AuditEvent[] {
  return [...auditTrail];
}

/**
 * Clears all recorded events from the in-memory audit trail.
 */
export function clearAuditTrail(): void {
  auditTrail.length = 0;
}
