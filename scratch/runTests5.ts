import { Product, PersistentOrder } from "../lib/types";
import { registerMockFirestore, resetMockFirestore } from "../lib/firebaseAdmin";
import { saveOrder, getOrderById, getAllOrders, clearAllOrders } from "../lib/orders";

const testProduct: Product = {
  id: "novakey-k75",
  name: "NovaKey K75",
  category: "Mechanical Keyboard",
  price: 4499,
  stock: 10,
  description: "A premium wireless keyboard",
  features: ["Wireless"],
  tags: ["wireless"],
  image: "/img.png",
  batteryLife: "80 hours",
  compatibleWith: []
};

// In-Memory Firestore Emulator for Isolated Unit Testing
class MockFirestoreCollection {
  private docs = new Map<string, any>();

  doc(id: string) {
    const self = this;
    return {
      id,
      get: async () => {
        const exists = self.docs.has(id);
        const data = exists ? self.docs.get(id) : undefined;
        return {
          id,
          exists,
          data: () => data
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        if (options?.merge && self.docs.has(id)) {
          self.docs.set(id, { ...self.docs.get(id), ...data });
        } else {
          self.docs.set(id, data);
        }
      },
      delete: async () => {
        self.docs.delete(id);
      }
    };
  }

  async get() {
    const docSnaps: any[] = [];
    this.docs.forEach((data, id) => {
      docSnaps.push({
        id,
        data: () => data
      });
    });
    return {
      empty: docSnaps.length === 0,
      forEach: (cb: (doc: any) => void) => docSnaps.forEach(cb),
      docs: docSnaps
    };
  }

  where(field: string, op: string, value: any) {
    const self = this;
    return {
      limit: (n: number) => ({
        get: async () => {
          const matches: any[] = [];
          self.docs.forEach((data, id) => {
            if (data[field] === value) {
              matches.push({ id, data: () => data });
            }
          });
          return {
            empty: matches.length === 0,
            docs: matches.slice(0, n)
          };
        }
      })
    };
  }
}

class MockFirestoreDb {
  private collections = new Map<string, MockFirestoreCollection>();

  collection(name: string): MockFirestoreCollection {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockFirestoreCollection());
    }
    return this.collections.get(name)!;
  }

  batch() {
    const self = this;
    const deletes: any[] = [];
    return {
      delete: (ref: any) => {
        deletes.push(ref);
      },
      commit: async () => {
        for (const ref of deletes) {
          await ref.delete();
        }
      }
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const self = this;
    const transaction = {
      get: async (docRef: any) => {
        return docRef.get();
      },
      set: async (docRef: any, data: any, options?: any) => {
        return docRef.set(data, options);
      }
    };
    return updateFunction(transaction);
  }
}

async function runTests() {
  console.log("=== STARTING PHASE 5A FIREBASE CLOUD FIRESTORE PERSISTENCE TESTS ===\n");

  const mockDb = new MockFirestoreDb();
  registerMockFirestore(mockDb);

  // --------------------------------------------------
  // TEST 1: Save Order & Confirm Firestore Document Exists
  // --------------------------------------------------
  console.log("--- TEST 1: Save Order & Confirm Firestore Document Exists ---");
  await clearAllOrders();

  const initialOrder: PersistentOrder = {
    orderId: "order_mock_500",
    sessionId: "sess_500",
    razorpayOrderId: "order_mock_500",
    items: [testProduct],
    basket: [testProduct],
    amount: 4499,
    currency: "INR",
    transactionState: "PAYMENT_PENDING",
    timestamp: new Date().toISOString(),
    auditHistory: [],
    auditEvents: []
  };

  await saveOrder(initialOrder);

  const docFromDb = await getOrderById("order_mock_500");
  console.log(" Document exists in Firestore:", !!docFromDb);
  console.log(" Document ID:", docFromDb?.orderId);
  console.log(" Initial Transaction State:", docFromDb?.transactionState);
  console.log(" Amount (INR):", docFromDb?.amount);

  if (!docFromDb || docFromDb.orderId !== "order_mock_500" || docFromDb.transactionState !== "PAYMENT_PENDING") {
    throw new Error("Test 1 FAILED: Order document was not saved correctly to Firestore.");
  }
  console.log(">> TEST 1 PASSED!");

  // --------------------------------------------------
  // TEST 2: Successful Payment Verification Updates Document
  // --------------------------------------------------
  console.log("\n--- TEST 2: Successful Payment Verification Updates Document ---");
  const completedOrder: PersistentOrder = {
    ...initialOrder,
    razorpayPaymentId: "pay_verified_500",
    transactionState: "PAYMENT_COMPLETED",
    timestamp: new Date().toISOString(),
    auditHistory: [{
      id: "evt_1",
      timestamp: new Date().toISOString(),
      eventType: "PAYMENT_COMPLETED",
      actor: "RAZORPAY",
      status: "SUCCESS",
      summary: "Payment verified successfully.",
      details: {}
    }]
  };

  await saveOrder(completedOrder);

  const updatedDoc = await getOrderById("order_mock_500");
  console.log(" Updated State in Firestore:", updatedDoc?.transactionState);
  console.log(" Verified Payment ID:", updatedDoc?.razorpayPaymentId);
  console.log(" Audit events count:", updatedDoc?.auditEvents?.length);

  if (updatedDoc?.transactionState !== "PAYMENT_COMPLETED" || updatedDoc?.razorpayPaymentId !== "pay_verified_500") {
    throw new Error("Test 2 FAILED: Firestore document was not updated to PAYMENT_COMPLETED.");
  }
  console.log(">> TEST 2 PASSED!");

  // --------------------------------------------------
  // TEST 3: Repeated Verification (Idempotent & No Duplicates)
  // --------------------------------------------------
  console.log("\n--- TEST 3: Repeated Verification Idempotency ---");
  await saveOrder(completedOrder);
  await saveOrder(completedOrder);

  const allOrders = await getAllOrders();
  console.log(" Total persistent orders count:", allOrders.length);
  if (allOrders.length !== 1) {
    throw new Error("Test 3 FAILED: Duplicate documents were created in Firestore.");
  }
  console.log(">> TEST 3 PASSED!");

  // --------------------------------------------------
  // TEST 4 & 5: Webhook Event Ingestion
  // --------------------------------------------------
  console.log("\n--- TEST 4 & 5: Webhook Order Persistence ---");
  const webhookOrder: PersistentOrder = {
    orderId: "order_webhook_999",
    sessionId: "sess_webhook_999",
    razorpayOrderId: "order_webhook_999",
    razorpayPaymentId: "pay_webhook_999",
    items: [testProduct],
    basket: [testProduct],
    amount: 4499,
    currency: "INR",
    transactionState: "PAYMENT_COMPLETED",
    timestamp: new Date().toISOString(),
    auditHistory: []
  };

  await saveOrder(webhookOrder);

  const webhookSaved = await getOrderById("order_webhook_999");
  console.log(" Webhook document exists in Firestore:", !!webhookSaved);
  console.log(" Webhook order transaction state:", webhookSaved?.transactionState);

  if (!webhookSaved || webhookSaved.transactionState !== "PAYMENT_COMPLETED") {
    throw new Error("Test 5 FAILED: Webhook order was not saved properly to Firestore.");
  }
  console.log(">> TEST 5 PASSED!");

  // --------------------------------------------------
  // TEST 6: FAILED or CANCELLED cannot overwrite PAYMENT_COMPLETED
  // --------------------------------------------------
  console.log("\n--- TEST 6: Safety Guard: FAILED cannot overwrite PAYMENT_COMPLETED ---");
  const attemptedFailedOverride: PersistentOrder = {
    orderId: "order_webhook_999",
    razorpayOrderId: "order_webhook_999",
    items: [testProduct],
    basket: [testProduct],
    amount: 4499,
    currency: "INR",
    transactionState: "PAYMENT_FAILED",
    timestamp: new Date().toISOString(),
    auditHistory: []
  };

  await saveOrder(attemptedFailedOverride);

  const checkSafetyDoc = await getOrderById("order_webhook_999");
  console.log(" Document state after attempted failed override:", checkSafetyDoc?.transactionState);
  if (checkSafetyDoc?.transactionState !== "PAYMENT_COMPLETED") {
    throw new Error("Test 6 FAILED: PAYMENT_COMPLETED was incorrectly overwritten by PAYMENT_FAILED.");
  }
  console.log(">> TEST 6 PASSED!");

  // --------------------------------------------------
  // TEST 7: Timestamp Normalization at API Boundary
  // --------------------------------------------------
  console.log("\n--- TEST 7: Timestamp Normalization ---");
  const list = await getAllOrders();
  for (const ord of list) {
    const isIsoString = !isNaN(Date.parse(ord.timestamp));
    console.log(` Order ${ord.orderId} timestamp is valid ISO string:`, isIsoString);
    if (!isIsoString) {
      throw new Error(`Test 7 FAILED: Order ${ord.orderId} has invalid timestamp format: ${ord.timestamp}`);
    }
  }
  console.log(">> TEST 7 PASSED!");

  // Clean up
  resetMockFirestore();

  console.log("\n=== ALL PHASE 5A FIRESTORE PERSISTENCE TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
