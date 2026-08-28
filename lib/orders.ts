import { getFirestoreDb, isFirebaseConfigured } from "./firebaseAdmin";
import { PersistentOrder } from "./types";
import { isValidStateTransition } from "./stateTransition";

const ORDERS_COLLECTION = "orders";

// In-memory fallback repository for development when Firebase credentials are not yet set
let memoryOrdersFallback: Map<string, PersistentOrder> = new Map();

/**
 * Normalizes Firestore document data into a clean, JSON-serializable PersistentOrder object.
 */
function normalizeOrderData(id: string, data: any): PersistentOrder {
  const parseTimestamp = (val: any): string => {
    if (!val) return new Date().toISOString();
    if (typeof val === "string") return val;
    if (val.toDate && typeof val.toDate === "function") return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return new Date().toISOString();
  };

  const timestamp = parseTimestamp(data.timestamp || data.createdAt || data.updatedAt);
  const items = data.items || data.basket || [];

  return {
    orderId: data.orderId || id,
    sessionId: data.sessionId || "",
    razorpayOrderId: data.razorpayOrderId || data.orderId || id,
    razorpayPaymentId: data.razorpayPaymentId || undefined,
    items,
    basket: items,
    amount: typeof data.amount === "number" ? data.amount : Number(data.amount || 0),
    currency: data.currency || "INR",
    transactionState: data.transactionState || "PAYMENT_PENDING",
    createdAt: parseTimestamp(data.createdAt || timestamp),
    updatedAt: parseTimestamp(data.updatedAt || timestamp),
    timestamp,
    auditEvents: data.auditEvents || data.auditHistory || [],
    auditHistory: data.auditHistory || data.auditEvents || []
  };
}

/**
 * Loads all persistent orders from Cloud Firestore (or fallback in-memory store).
 */
export async function getAllOrders(): Promise<PersistentOrder[]> {
  try {
    const db = getFirestoreDb();
    const snapshot = await db.collection(ORDERS_COLLECTION).get();
    
    if (snapshot.empty) {
      return [];
    }

    const orders: PersistentOrder[] = [];
    snapshot.forEach(doc => {
      orders.push(normalizeOrderData(doc.id, doc.data()));
    });

    // Sort descending by createdAt or updatedAt timestamp
    return orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error: any) {
    if (!isFirebaseConfigured()) {
      return Array.from(memoryOrdersFallback.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }
    console.error("Error reading orders from Firestore:", error);
    return [];
  }
}

/**
 * Retrieves a single persistent order by its orderId or Razorpay order ID.
 */
export async function getOrderById(orderId: string): Promise<PersistentOrder | undefined> {
  if (!orderId) return undefined;

  try {
    const db = getFirestoreDb();
    const docRef = db.collection(ORDERS_COLLECTION).doc(orderId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      return normalizeOrderData(docSnap.id, docSnap.data());
    }

    // Query by razorpayOrderId or orderId field if document ID differs
    const querySnap = await db
      .collection(ORDERS_COLLECTION)
      .where("razorpayOrderId", "==", orderId)
      .limit(1)
      .get();

    if (!querySnap.empty) {
      const doc = querySnap.docs[0];
      return normalizeOrderData(doc.id, doc.data());
    }

    return undefined;
  } catch (error: any) {
    if (!isFirebaseConfigured()) {
      return memoryOrdersFallback.get(orderId);
    }
    console.error(`Error retrieving order ${orderId} from Firestore:`, error);
    return undefined;
  }
}

/**
 * Persists or updates an order in Cloud Firestore.
 * Enforces idempotency and prevents invalid state overrides (e.g. FAILED cannot overwrite COMPLETED).
 */
export async function saveOrder(order: PersistentOrder): Promise<void> {
  const docId = order.razorpayOrderId || order.orderId;
  if (!docId) {
    throw new Error("Cannot persist order without orderId or razorpayOrderId.");
  }

  const now = new Date().toISOString();
  const items = order.items || order.basket || [];

  const documentPayload = {
    orderId: order.orderId || docId,
    sessionId: order.sessionId || "",
    razorpayOrderId: order.razorpayOrderId || docId,
    razorpayPaymentId: order.razorpayPaymentId || null,
    items,
    basket: items,
    amount: order.amount,
    currency: order.currency || "INR",
    transactionState: order.transactionState,
    createdAt: order.createdAt || order.timestamp || now,
    updatedAt: now,
    timestamp: order.timestamp || now,
    auditEvents: order.auditEvents || order.auditHistory || [],
    auditHistory: order.auditHistory || order.auditEvents || []
  };

  try {
    const db = getFirestoreDb();
    const docRef = db.collection(ORDERS_COLLECTION).doc(docId);

    // Use transaction to ensure safe state transitions and avoid race conditions
    await db.runTransaction(async (transaction: any) => {
      const docSnap = await transaction.get(docRef);

      if (docSnap.exists) {
        const existingData = docSnap.data();
        const existingState = existingData?.transactionState;

        // Safety Invariant: Once an order is PAYMENT_COMPLETED, it cannot be downgraded
        if (existingState === "PAYMENT_COMPLETED" && order.transactionState !== "PAYMENT_COMPLETED") {
          console.warn(`Blocked attempt to overwrite PAYMENT_COMPLETED order ${docId} with ${order.transactionState}`);
          return;
        }

        // Validate state transition
        if (existingState && !isValidStateTransition(existingState, order.transactionState)) {
          console.warn(`Invalid state transition for order ${docId}: ${existingState} -> ${order.transactionState}`);
          return;
        }

        transaction.set(docRef, {
          ...documentPayload,
          createdAt: existingData?.createdAt || documentPayload.createdAt
        }, { merge: true });
      } else {
        transaction.set(docRef, documentPayload);
      }
    });

  } catch (error: any) {
    if (!isFirebaseConfigured()) {
      const existing = memoryOrdersFallback.get(docId);
      if (existing?.transactionState === "PAYMENT_COMPLETED" && order.transactionState !== "PAYMENT_COMPLETED") {
        return;
      }
      memoryOrdersFallback.set(docId, normalizeOrderData(docId, documentPayload));
      return;
    }
    console.error(`Error saving order ${docId} to Firestore:`, error);
    throw error;
  }
}

/**
 * Helper to identify whether an order ID belongs to an automated test run.
 */
function isTestOrderId(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.startsWith("order_mock_") ||
    lower.startsWith("order_test_") ||
    lower.startsWith("test_") ||
    lower.startsWith("order_webhook_") ||
    lower.startsWith("sess_test_") ||
    lower.startsWith("mock_")
  );
}

/**
 * Development test helper to clear orders.
 * SAFETY INVARIANT: When operating on real Firestore, this function strictly deletes
 * ONLY test-prefixed documents (e.g. order_mock_*, order_test_*, test_*) to prevent accidental
 * loss of real customer orders.
 */
export async function clearAllOrders(onlyTestOrders: boolean = true): Promise<void> {
  try {
    const db = getFirestoreDb();
    const snapshot = await db.collection(ORDERS_COLLECTION).get();
    
    if (snapshot.empty) return;

    const batch = db.batch();
    let deleteCount = 0;

    snapshot.forEach(doc => {
      if (!onlyTestOrders || isTestOrderId(doc.id)) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });
    
    if (deleteCount > 0) {
      await batch.commit();
    }
  } catch (error: any) {
    if (!isFirebaseConfigured()) {
      if (onlyTestOrders) {
        for (const key of Array.from(memoryOrdersFallback.keys())) {
          if (isTestOrderId(key)) {
            memoryOrdersFallback.delete(key);
          }
        }
      } else {
        memoryOrdersFallback.clear();
      }
      return;
    }
    console.error("Error clearing orders collection from Firestore:", error);
  }
}
