import { POST as agentHandler } from "../app/api/agent/route";
import { POST as createOrderHandler } from "../app/api/payment/create-order/route";
import { POST as verifyHandler } from "../app/api/payment/verify/route";
import { getSession } from "../lib/session";
import { getAuditTrail } from "../lib/audit";
import { registerMockRazorpayClient } from "../lib/razorpay";
import { NextRequest } from "next/server";
import crypto from "crypto";

import { registerMockFirestore } from "../lib/firebaseAdmin";

// Setup isolated mock Firestore for fast unit tests
const mockFirestoreStorage = new Map<string, any>();
registerMockFirestore({
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => ({ id, exists: mockFirestoreStorage.has(id), data: () => mockFirestoreStorage.get(id) }),
      set: async (d: any) => { mockFirestoreStorage.set(id, d); }
    }),
    get: async () => ({ empty: mockFirestoreStorage.size === 0, forEach: (cb: any) => mockFirestoreStorage.forEach((v, k) => cb({ id: k, data: () => v })) })
  }),
  runTransaction: async (fn: any) => fn({
    get: async (ref: any) => ref.get(),
    set: async (ref: any, d: any, opt?: any) => ref.set(d, opt)
  }),
  batch: () => ({ delete: (ref: any) => {}, commit: async () => {} })
});

// 1. Setup Environment
process.env.GEMINI_API_KEY = "dummy_gemini_key";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret_for_unit_testing";

// 2. Mock Global Fetch for Gemini
const originalFetch = global.fetch;
global.fetch = async (url: any, options: any) => {
  const urlStr = String(url);
  if (urlStr.includes("generativelanguage.googleapis.com")) {
    let body: any = {};
    try {
      body = JSON.parse(options.body || "{}");
    } catch (e) {}

    const contentsText = JSON.stringify(body.contents || []);
    const systemInstruction = body.systemInstruction?.parts?.[0]?.text || "";
    let textResponse = "";

    if (systemInstruction.includes("intent extraction")) {
      textResponse = JSON.stringify({
        productCategory: "Mechanical Keyboard",
        budget: 5000,
        wireless: true,
        batteryPriority: "high",
        useCase: "programming"
      });
    } else if (systemInstruction.includes("classification")) {
      if (contentsText.includes("take it") || contentsText.includes("confirm")) {
        textResponse = JSON.stringify({ action: "CONFIRM_SELECTION" });
      } else {
        textResponse = JSON.stringify({ action: "NEW_SEARCH" });
      }
    } else {
      // Explanation
      textResponse = JSON.stringify({
        recommendationExplanation: "Matches your request.",
        upsellExplanation: "Complements selection.",
        budgetExplanation: "Fits your budget.",
        policyExplanation: "Passed checks.",
        summary: "NovaKey K75 recommended."
      });
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: textResponse }] } }]
      })
    } as any;
  }
  return originalFetch(url, options);
};

// 3. Register Mock Razorpay Client
let mockOrderIdCounter = 100;
registerMockRazorpayClient({
  createOrder: async (amount: number, sessionId: string, productCount: number) => {
    return {
      id: `order_mock_${mockOrderIdCounter++}`,
      amount: amount,
      currency: "INR"
    };
  },
  verifySignature: (orderId: string, paymentId: string, signature: string) => {
    const secret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_key_secret";
    const generated = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return generated === signature;
  }
});

// Helper to construct POST requests to NextJS API handlers
async function callApi(handler: any, body: any) {
  const request = new NextRequest("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const res = await handler(request);
  const json = await res.json();
  return { status: res.status, data: json };
}

function calculateHMACSignature(orderId: string, paymentId: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

async function runTests() {
  console.log("=== STARTING PHASE 3.1 RAZORPAY PAYMENT TESTS ===");

  // --------------------------------------------------
  // SETUP: Create a fresh session and confirm it
  // --------------------------------------------------
  console.log("\nSetup: Creating session and confirming selection...");
  const agentRes1 = await callApi(agentHandler, {
    message: "I need a wireless mechanical keyboard for programming under ₹5,000 with good battery life."
  });
  const sessionId = agentRes1.data.sessionId;
  console.log("Session created ID:", sessionId);

  const agentRes2 = await callApi(agentHandler, {
    message: "Okay, I'll take it.",
    sessionId
  });
  console.log("Session Confirmed. Transaction State:", agentRes2.data.transactionState);
  
  if (agentRes2.data.transactionState !== "USER_CONFIRMED") {
    console.error("Setup Failure: State is not USER_CONFIRMED", agentRes2.data);
    process.exit(1);
  }

  // --------------------------------------------------
  // TEST 1 — CREATE ORDER
  // --------------------------------------------------
  console.log("\n--- TEST 1: Create Order ---");
  const t1 = await callApi(createOrderHandler, { sessionId });
  console.log("Status:", t1.status);
  console.log("Data:", t1.data);

  if (t1.status !== 200 || !t1.data.success) {
    console.error("Test 1 Failed: Order was not created.");
    process.exit(1);
  }
  if (t1.data.order.amount !== 489800) {
    console.error("Test 1 Failed: Amount is not 489800 paise.");
    process.exit(1);
  }
  if (t1.data.transactionState !== "PAYMENT_PENDING") {
    console.error("Test 1 Failed: Transaction state is not PAYMENT_PENDING.");
    process.exit(1);
  }
  console.log(">> TEST 1 PASSED!");

  const validOrderId = t1.data.order.id;

  // --------------------------------------------------
  // TEST 2 — AMOUNT TAMPERING
  // --------------------------------------------------
  console.log("\n--- TEST 2: Amount Tampering ---");
  const session = getSession(sessionId);
  if (session) {
    session.transactionState = "USER_CONFIRMED";
    session.razorpayOrderId = undefined;
    session.lastBasketHash = undefined;
  }

  const t2 = await callApi(createOrderHandler, { sessionId, amount: 1 });
  console.log("Status:", t2.status);
  console.log("Data:", t2.data);

  if (t2.data.order.amount === 100 || t2.data.order.amount === 1) {
    console.error("Test 2 Failed: Server accepted tampered amount!");
    process.exit(1);
  }
  if (t2.data.order.amount !== 489800) {
    console.error("Test 2 Failed: Order amount is incorrect.");
    process.exit(1);
  }
  console.log(">> TEST 2 PASSED!");

  const activeOrderId = t2.data.order.id;

  // --------------------------------------------------
  // TEST 3 — PAYMENT BEFORE CONFIRMATION
  // --------------------------------------------------
  console.log("\n--- TEST 3: Payment Before Confirmation ---");
  const t3Setup = await callApi(agentHandler, { message: "Looking for keyboards" });
  const freshSessionId = t3Setup.data.sessionId;
  
  const t3 = await callApi(createOrderHandler, { sessionId: freshSessionId });
  console.log("Status:", t3.status);
  console.log("Data:", t3.data);

  if (t3.status === 200) {
    console.error("Test 3 Failed: Created order for unconfirmed session.");
    process.exit(1);
  }
  console.log(">> TEST 3 PASSED!");

  // --------------------------------------------------
  // TEST 4 — INVALID SIGNATURE
  // --------------------------------------------------
  console.log("\n--- TEST 4: Invalid Signature ---");
  const mainSession = getSession(sessionId);
  if (mainSession) {
    mainSession.transactionState = "PAYMENT_PENDING";
    mainSession.razorpayOrderId = activeOrderId;
  }

  const t4 = await callApi(verifyHandler, {
    sessionId,
    razorpay_payment_id: "pay_mock_1",
    razorpay_order_id: activeOrderId,
    razorpay_signature: "fake_signature_hash"
  });
  console.log("Status:", t4.status);
  console.log("Data:", t4.data);

  if (t4.status === 200 || getSession(sessionId)?.transactionState === "PAYMENT_COMPLETED") {
    console.error("Test 4 Failed: Accepted payment verification with invalid signature.");
    process.exit(1);
  }
  console.log(">> TEST 4 PASSED!");

  // --------------------------------------------------
  // TEST 5 — ORDER MISMATCH
  // --------------------------------------------------
  console.log("\n--- TEST 5: Order Mismatch ---");
  const badOrderId = "order_mismatch_123";
  const fakeSig = calculateHMACSignature(badOrderId, "pay_mock_1", "rzp_test_key_secret");

  const t5 = await callApi(verifyHandler, {
    sessionId,
    razorpay_payment_id: "pay_mock_1",
    razorpay_order_id: badOrderId,
    razorpay_signature: fakeSig
  });
  console.log("Status:", t5.status);
  console.log("Data:", t5.data);

  if (t5.status === 200) {
    console.error("Test 5 Failed: Verification accepted mismatched order ID.");
    process.exit(1);
  }
  console.log(">> TEST 5 PASSED!");

  // --------------------------------------------------
  // TEST 6 — DUPLICATE ORDER CREATION
  // --------------------------------------------------
  console.log("\n--- TEST 6: Duplicate Order Creation ---");
  const activeSession = getSession(sessionId);
  const currentBasketHash = activeSession!.currentBasket
    .map(p => `${p.id}_${p.price}`)
    .sort()
    .join("|");
    
  if (activeSession) {
    activeSession.transactionState = "PAYMENT_PENDING";
    activeSession.razorpayOrderId = activeOrderId;
    activeSession.lastBasketHash = currentBasketHash;
  }

  const t6_1 = await callApi(createOrderHandler, { sessionId });
  const t6_2 = await callApi(createOrderHandler, { sessionId });

  console.log("Order 1 ID:", t6_1.data.order.id);
  console.log("Order 2 ID:", t6_2.data.order.id);

  if (t6_1.data.order.id !== t6_2.data.order.id) {
    console.error("Test 6 Failed: Generated a new order ID on duplicate request instead of reusing.");
    process.exit(1);
  }
  console.log(">> TEST 6 PASSED!");

  // --------------------------------------------------
  // TEST 7 — DUPLICATE VERIFICATION
  // --------------------------------------------------
  console.log("\n--- TEST 7: Duplicate Verification ---");
  const paymentId = "pay_mock_success_777";
  const validSignature = calculateHMACSignature(activeOrderId, paymentId, "rzp_test_key_secret");

  console.log("Sending verification 1...");
  const t7_1 = await callApi(verifyHandler, {
    sessionId,
    razorpay_payment_id: paymentId,
    razorpay_order_id: activeOrderId,
    razorpay_signature: validSignature
  });
  console.log("Verif 1 Status:", t7_1.status, "State:", t7_1.data.transactionState);

  if (t7_1.status !== 200 || t7_1.data.transactionState !== "PAYMENT_COMPLETED") {
    console.error("Test 7 Setup Failed: Verification 1 rejected.");
    process.exit(1);
  }

  const auditLengthAfter1 = getAuditTrail().length;

  console.log("Sending verification 2 (duplicate)...");
  const t7_2 = await callApi(verifyHandler, {
    sessionId,
    razorpay_payment_id: paymentId,
    razorpay_order_id: activeOrderId,
    razorpay_signature: validSignature
  });
  console.log("Verif 2 Status:", t7_2.status, "State:", t7_2.data.transactionState);

  const auditLengthAfter2 = getAuditTrail().length;

  if (t7_2.status !== 200) {
    console.error("Test 7 Failed: Duplicate verification failed instead of returning idempotent success.");
    process.exit(1);
  }
  if (auditLengthAfter2 > auditLengthAfter1) {
    console.error("Test 7 Failed: Duplicate PAYMENT_COMPLETED audit event logged!");
    process.exit(1);
  }
  console.log(">> TEST 7 PASSED!");

  // --------------------------------------------------
  // E2E AUDIT TRAIL VERIFICATION
  // --------------------------------------------------
  console.log("\n--- Verification: Full End-to-End Audit Event List ---");
  const e2eRes1 = await callApi(agentHandler, {
    message: "I need a wireless mechanical keyboard for programming under ₹5,000 with good battery life."
  });
  const e2eSessionId = e2eRes1.data.sessionId;

  await callApi(agentHandler, {
    message: "Okay, I'll take it.",
    sessionId: e2eSessionId
  });

  const e2eOrder = await callApi(createOrderHandler, { sessionId: e2eSessionId });
  const e2eOrderId = e2eOrder.data.order.id;

  const e2ePaymentId = "pay_mock_e2e_999";
  const e2eSig = calculateHMACSignature(e2eOrderId, e2ePaymentId, "rzp_test_key_secret");

  await callApi(verifyHandler, {
    sessionId: e2eSessionId,
    razorpay_payment_id: e2ePaymentId,
    razorpay_order_id: e2eOrderId,
    razorpay_signature: e2eSig
  });

  const finalTrail = getAuditTrail();
  const finalEventTypes = finalTrail.map(t => t.eventType);
  console.log("Full E2E sequence of events:");
  console.log(finalEventTypes);

  const checkOrder = [
    "INTENT_RECEIVED",
    "CATALOG_SEARCHED",
    "PRODUCTS_RANKED",
    "PRODUCT_SELECTED",
    "UPSELL_IDENTIFIED",
    "POLICY_VALIDATED",
    "USER_APPROVED",
    "PAYMENT_INITIATED",
    "PAYMENT_COMPLETED"
  ];

  for (const eventName of checkOrder) {
    if (!finalEventTypes.includes(eventName as any)) {
      console.error(`Audit E2E Failure: Event '${eventName}' is missing from the trail.`);
      process.exit(1);
    }
  }

  // Verify chronology
  let lastIndex = -1;
  for (const eventName of checkOrder) {
    const idx = finalEventTypes.indexOf(eventName as any);
    if (idx < lastIndex) {
      console.error(`Audit E2E Failure: Chronological order violation for event '${eventName}'.`);
      process.exit(1);
    }
    lastIndex = idx;
  }

  console.log(">> E2E Audit trail verify passed! All 9 audit events are present and in chronological order.");
  console.log("\n=== ALL PHASE 3.1 PAYMENT TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch(err => {
  console.error("Test script execution error:", err);
  process.exit(1);
});
