import fs from "fs";
import path from "path";
import { Product, PersistentOrder } from "../lib/types";

const ORDERS_FILE_PATH = path.join(process.cwd(), "data", "orders.json");

// Sample keyboard product
const testProduct: Product = {
  id: "novakey-k75",
  name: "NovaKey K75",
  category: "Mechanical Keyboard",
  price: 4499,
  stock: 10,
  description: "A keyboard",
  features: ["Wireless"],
  tags: ["wireless"],
  image: "/img.png",
  batteryLife: "80 hours",
  compatibleWith: []
};

// Helper to make HTTP requests to the running server
async function callApi(endpoint: string, options: { method?: string; headers?: Record<string, string>; body?: any } = {}) {
  const url = `http://localhost:3000${endpoint}`;
  const res = await fetch(url, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  
  let json = {};
  try {
    json = await res.json();
  } catch (e) {}

  return { status: res.status, data: json as any };
}

// Local helper to read orders file directly
function readOrdersFile(): PersistentOrder[] {
  if (!fs.existsSync(ORDERS_FILE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE_PATH, "utf-8") || "[]");
  } catch (e) {
    return [];
  }
}

async function runTests() {
  console.log("=== STARTING PHASE 4 PRODUCTION READINESS E2E TESTS ===\n");

  // 1. Reset server sessions and orders
  console.log("Initializing test mode mock client and clearing sessions...");
  await callApi("/api/payment/test-setup", { body: { action: "clear" } });
  await callApi("/api/payment/test-setup", { body: { action: "setup_mock" } });

  const testSessionId = "sess_test_1234567";
  
  // 2. Setup user session in USER_CONFIRMED state
  await callApi("/api/payment/test-setup", {
    body: {
      action: "save_session",
      session: {
        sessionId: testSessionId,
        originalIntent: { productCategory: "Mechanical Keyboard", budget: 5000, wireless: true },
        currentBasket: [testProduct],
        transactionState: "USER_CONFIRMED"
      }
    }
  });

  // --------------------------------------------------
  // TEST 1: Create Order
  // --------------------------------------------------
  console.log("--- TEST 1: Create Order & Verify State Transition to PENDING ---");
  const createRes = await callApi("/api/payment/create-order", {
    body: { sessionId: testSessionId }
  });
  console.log(" Create Status:", createRes.status);
  console.log(" Order ID created:", createRes.data.order?.id);
  console.log(" Transaction state is PENDING:", createRes.data.transactionState === "PAYMENT_PENDING");
  
  if (createRes.status !== 200 || createRes.data.transactionState !== "PAYMENT_PENDING") {
    console.error("Test 1 FAILED: Create order failed or state mismatch.");
    process.exit(1);
  }
  console.log(">> TEST 1 PASSED!");

  // --------------------------------------------------
  // TEST 2: Successful Verification & Persistent Order Storage
  // --------------------------------------------------
  console.log("\n--- TEST 2: Successful Verification & Persistent Order Storage ---");
  const verifyRes = await callApi("/api/payment/verify", {
    body: {
      sessionId: testSessionId,
      razorpay_payment_id: "pay_test_987",
      razorpay_order_id: "order_mock_400",
      razorpay_signature: "valid_signature_for_test"
    }
  });
  console.log(" Verify Status:", verifyRes.status);
  console.log(" Verification Success:", verifyRes.data.success);
  console.log(" Final Transaction State:", verifyRes.data.transactionState);

  // Check persistent storage file
  const persistentOrders = readOrdersFile();
  console.log(" Persistent Orders Count:", persistentOrders.length);
  const retrievedOrder = persistentOrders.find(o => o.orderId === "order_mock_400");
  console.log(" Retrieved Order exists in file:", !!retrievedOrder);
  console.log(" Saved Amount (INR):", retrievedOrder?.amount);
  console.log(" Saved State:", retrievedOrder?.transactionState);
  console.log(" Audit logs saved in order:", (retrievedOrder?.auditHistory?.length ?? 0) > 0);

  if (verifyRes.status !== 200 || !verifyRes.data.success || persistentOrders.length !== 1 || !retrievedOrder) {
    console.error("Test 2 FAILED: Order not persisted properly.");
    process.exit(1);
  }
  console.log(">> TEST 2 PASSED!");

  // --------------------------------------------------
  // TEST 3 & 4: Webhook Signature Checks
  // --------------------------------------------------
  console.log("\n--- TEST 3: Webhook Reject Invalid Signature ---");
  const invalidWebhookRes = await callApi("/api/payment/webhook", {
    headers: { "x-razorpay-signature": "invalid_sig_here" },
    body: { event: "order.paid", payload: { payment: { entity: { order_id: "order_mock_400", id: "pay_test_987" } } } }
  });
  console.log(" Webhook reject status:", invalidWebhookRes.status);
  if (invalidWebhookRes.status !== 400) {
    console.error("Test 3 FAILED: Webhook did not reject invalid signature.");
    process.exit(1);
  }
  console.log(">> TEST 3 PASSED!");

  console.log("\n--- TEST 4: Webhook Process Valid Signature ---");
  const webhookSessionId = "sess_webhook_789";
  await callApi("/api/payment/test-setup", {
    body: {
      action: "save_session",
      session: {
        sessionId: webhookSessionId,
        originalIntent: { productCategory: "Mechanical Keyboard", budget: 5000 },
        currentBasket: [testProduct],
        transactionState: "PAYMENT_PENDING",
        razorpayOrderId: "order_webhook_001"
      }
    }
  });

  const validWebhookRes = await callApi("/api/payment/webhook", {
    headers: { "x-razorpay-signature": "valid_webhook_signature_for_test" },
    body: {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            order_id: "order_webhook_001",
            id: "pay_webhook_abc",
            amount: 449900
          }
        }
      }
    }
  });
  console.log(" Webhook accept status:", validWebhookRes.status);

  // Check persistent storage file again
  const ordersAfterWebhook = readOrdersFile();
  const orderFromHook = ordersAfterWebhook.find(o => o.orderId === "order_webhook_001");
  console.log(" Webhook saved order to file:", !!orderFromHook);
  console.log(" Order state from hook:", orderFromHook?.transactionState);

  if (validWebhookRes.status !== 200 || !orderFromHook || orderFromHook.transactionState !== "PAYMENT_COMPLETED") {
    console.error("Test 4 FAILED: Webhook failed to process valid signature.");
    process.exit(1);
  }
  console.log(">> TEST 4 PASSED!");

  // --------------------------------------------------
  // TEST 5: Webhook Idempotency & Overwrite Block
  // --------------------------------------------------
  console.log("\n--- TEST 5: Webhook Idempotency & Overwrite Block ---");
  const failedWebhookRes = await callApi("/api/payment/webhook", {
    headers: { "x-razorpay-signature": "valid_webhook_signature_for_test" },
    body: {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            order_id: "order_webhook_001",
            id: "pay_webhook_abc"
          }
        }
      }
    }
  });
  console.log(" Webhook processing status for failed event:", failedWebhookRes.status);
  
  // Re-read file to verify order remains completed
  const ordersAfterFailedHook = readOrdersFile();
  const orderAfterFailed = ordersAfterFailedHook.find(o => o.orderId === "order_webhook_001");
  console.log(" Order remains completed in file:", orderAfterFailed?.transactionState === "PAYMENT_COMPLETED");

  if (orderAfterFailed?.transactionState !== "PAYMENT_COMPLETED") {
    console.error("Test 5 FAILED: Failed webhook incorrectly overwrote a completed order.");
    process.exit(1);
  }
  console.log(">> TEST 5 PASSED!");

  // --------------------------------------------------
  // TEST 6: Client Failed Payment Transition
  // --------------------------------------------------
  console.log("\n--- TEST 6: Client Failed Payment Transition ---");
  const failedSessionId = "sess_failed_555";
  await callApi("/api/payment/test-setup", {
    body: {
      action: "save_session",
      session: {
        sessionId: failedSessionId,
        originalIntent: { productCategory: "Mechanical Keyboard", budget: 5000 },
        currentBasket: [testProduct],
        transactionState: "PAYMENT_PENDING"
      }
    }
  });

  const failUpdateRes = await callApi("/api/payment/update-state", {
    body: {
      sessionId: failedSessionId,
      newState: "PAYMENT_FAILED",
      errorDetails: "Mock payment failure test"
    }
  });
  console.log(" Fail Status:", failUpdateRes.status);
  console.log(" New State is PAYMENT_FAILED:", failUpdateRes.data.transactionState === "PAYMENT_FAILED");

  if (failUpdateRes.status !== 200 || failUpdateRes.data.transactionState !== "PAYMENT_FAILED") {
    console.error("Test 6 FAILED: Failed state update failed.");
    process.exit(1);
  }
  console.log(">> TEST 6 PASSED!");

  // --------------------------------------------------
  // TEST 7: Client Cancelled Payment Transition
  // --------------------------------------------------
  console.log("\n--- TEST 7: Client Cancelled Payment Transition ---");
  const cancelSessionId = "sess_cancel_777";
  await callApi("/api/payment/test-setup", {
    body: {
      action: "save_session",
      session: {
        sessionId: cancelSessionId,
        originalIntent: { productCategory: "Mechanical Keyboard", budget: 5000 },
        currentBasket: [testProduct],
        transactionState: "PAYMENT_PENDING"
      }
    }
  });

  const cancelUpdateRes = await callApi("/api/payment/update-state", {
    body: {
      sessionId: cancelSessionId,
      newState: "PAYMENT_CANCELLED"
    }
  });
  console.log(" Cancel Status:", cancelUpdateRes.status);
  console.log(" New State is PAYMENT_CANCELLED:", cancelUpdateRes.data.transactionState === "PAYMENT_CANCELLED");

  if (cancelUpdateRes.status !== 200 || cancelUpdateRes.data.transactionState !== "PAYMENT_CANCELLED") {
    console.error("Test 7 FAILED: Cancelled state update failed.");
    process.exit(1);
  }
  console.log(">> TEST 7 PASSED!");

  // --------------------------------------------------
  // TEST 8: Invalid State Transition Validation
  // --------------------------------------------------
  console.log("\n--- TEST 8: Rejection of Invalid State Transitions ---");
  const completedTransitionRes = await callApi("/api/payment/update-state", {
    body: {
      sessionId: testSessionId, // State is PAYMENT_COMPLETED
      newState: "PAYMENT_FAILED"
    }
  });
  console.log(" Server rejected update on COMPLETED order status:", completedTransitionRes.status);

  if (completedTransitionRes.status !== 400) {
    console.error("Test 8 FAILED: State transition protection failed.");
    process.exit(1);
  }
  console.log(">> TEST 8 PASSED!");

  // --------------------------------------------------
  // TEST 9: Payment Retry Capability
  // --------------------------------------------------
  console.log("\n--- TEST 9: Payment Retry (FAILED -> PENDING) ---");
  const retryRes = await callApi("/api/payment/create-order", {
    body: { sessionId: failedSessionId } // State is currently PAYMENT_FAILED
  });
  console.log(" Retry Status:", retryRes.status);
  console.log(" Retried Order ID created:", retryRes.data.order?.id);
  console.log(" State restored to PAYMENT_PENDING:", retryRes.data.transactionState === "PAYMENT_PENDING");

  if (retryRes.status !== 200 || retryRes.data.transactionState !== "PAYMENT_PENDING") {
    console.error("Test 9 FAILED: Payment retry failed.");
    process.exit(1);
  }
  console.log(">> TEST 9 PASSED!");

  console.log("\n=== ALL PHASE 4 PRODUCTION READINESS E2E TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("Unhandled test exception:", err);
  process.exit(1);
});
