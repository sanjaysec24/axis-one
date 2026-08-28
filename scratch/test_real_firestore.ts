import fs from "fs";
import path from "path";

// Load .env.local environment variables safely
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

import { getFirestoreDb, isFirebaseConfigured } from "../lib/firebaseAdmin";
import { saveOrder, getOrderById, getAllOrders } from "../lib/orders";
import { PersistentOrder, Product } from "../lib/types";

const testProduct: Product = {
  id: "novakey-k75",
  name: "NovaKey K75",
  category: "Mechanical Keyboard",
  price: 4499,
  stock: 10,
  description: "A premium wireless mechanical keyboard",
  features: ["Wireless", "RGB"],
  tags: ["wireless", "mechanical"],
  image: "/img.png",
  batteryLife: "80 hours",
  compatibleWith: ["Windows", "macOS"]
};

async function runRealFirestoreConnectionTest() {
  console.log("==================================================================");
  console.log("  AXIS ONE — REAL CLOUD FIRESTORE CONNECTION & PERSISTENCE TEST   ");
  console.log("==================================================================\n");

  const results: Record<string, string> = {
    "Firebase connection": "FAIL",
    "Firestore write": "FAIL",
    "Firestore read": "FAIL",
    "Idempotent update": "FAIL",
    "State transition safety": "FAIL",
    "Safe cleanup": "FAIL"
  };

  const testOrderId = `order_test_real_${Date.now()}`;
  const testSessionId = `sess_test_${Date.now()}`;

  try {
    // 1. Firebase Initialization & Reachability
    console.log("1. Checking Firebase Admin Configuration...");
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase is not configured in .env.local");
    }
    console.log(`   Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`   Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);

    const db = getFirestoreDb();
    const collections = await db.listCollections();
    console.log(`   Connected to Firestore! Collections present: [${collections.map(c => c.id).join(", ")}]`);
    results["Firebase connection"] = "PASS";

    // 2. Write Test Order
    console.log("\n2. Testing Real Firestore Order Write...");
    const initialOrder: PersistentOrder = {
      orderId: testOrderId,
      sessionId: testSessionId,
      razorpayOrderId: testOrderId,
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
    console.log(`   Successfully wrote test document '${testOrderId}' to 'orders' collection.`);
    results["Firestore write"] = "PASS";

    // 3. Read Test Order Back
    console.log("\n3. Testing Real Firestore Order Read...");
    const readDoc = await getOrderById(testOrderId);
    if (!readDoc) {
      throw new Error(`Failed to read order ${testOrderId} back from Firestore.`);
    }
    console.log(`   Read order document successfully:`);
    console.log(`   - Document ID: ${readDoc.orderId}`);
    console.log(`   - Session ID: ${readDoc.sessionId}`);
    console.log(`   - State: ${readDoc.transactionState}`);
    console.log(`   - Amount: ₹${readDoc.amount} ${readDoc.currency}`);
    console.log(`   - Items: ${readDoc.items?.map(i => i.name).join(", ")}`);

    if (readDoc.orderId === testOrderId && readDoc.transactionState === "PAYMENT_PENDING" && readDoc.amount === 4499) {
      results["Firestore read"] = "PASS";
    } else {
      throw new Error("Data mismatch in retrieved order.");
    }

    // 4. Update Order to PAYMENT_COMPLETED & Test Idempotency
    console.log("\n4. Testing Idempotent Update to PAYMENT_COMPLETED...");
    const completedOrder: PersistentOrder = {
      ...initialOrder,
      razorpayPaymentId: "pay_test_real_verified",
      transactionState: "PAYMENT_COMPLETED",
      timestamp: new Date().toISOString()
    };

    // Save twice to verify idempotency
    await saveOrder(completedOrder);
    await saveOrder(completedOrder);

    const updatedDoc = await getOrderById(testOrderId);
    console.log(`   Updated state in Firestore: ${updatedDoc?.transactionState}`);
    console.log(`   Verified Payment ID: ${updatedDoc?.razorpayPaymentId}`);

    if (updatedDoc?.transactionState === "PAYMENT_COMPLETED" && updatedDoc?.razorpayPaymentId === "pay_test_real_verified") {
      results["Idempotent update"] = "PASS";
    } else {
      throw new Error("Failed to idempotently update order state.");
    }

    // 5. Invariant Test: PAYMENT_FAILED cannot overwrite PAYMENT_COMPLETED
    console.log("\n5. Testing Safety Guard: FAILED cannot overwrite COMPLETED...");
    const attemptedDowngrade: PersistentOrder = {
      ...completedOrder,
      transactionState: "PAYMENT_FAILED"
    };

    await saveOrder(attemptedDowngrade);
    const guardedDoc = await getOrderById(testOrderId);
    console.log(`   State after downgrade attempt: ${guardedDoc?.transactionState}`);

    if (guardedDoc?.transactionState === "PAYMENT_COMPLETED") {
      results["State transition safety"] = "PASS";
      console.log("   Safety Invariant Preserved: PAYMENT_COMPLETED was not overwritten!");
    } else {
      throw new Error("Safety Invariant Broken: COMPLETED order was overwritten by FAILED.");
    }

    // 6. Safe Cleanup (Removes ONLY this test document)
    console.log("\n6. Testing Safe Cleanup (Targeted Deletion)...");
    const docRef = db.collection("orders").doc(testOrderId);
    await docRef.delete();

    const verifyDeleted = await getOrderById(testOrderId);
    if (!verifyDeleted) {
      results["Safe cleanup"] = "PASS";
      console.log(`   Cleaned up test document '${testOrderId}' successfully.`);
    } else {
      throw new Error("Test document was not removed during cleanup.");
    }

  } catch (error: any) {
    console.error("\n❌ Test execution error:", error);
  } finally {
    // Ensure cleanup of test document if error occurred
    try {
      const db = getFirestoreDb();
      await db.collection("orders").doc(testOrderId).delete();
    } catch (_) {}
  }

  console.log("\n==================================================================");
  console.log("                    LIVE TEST RESULTS SUMMARY                     ");
  console.log("==================================================================");
  for (const [testName, status] of Object.entries(results)) {
    console.log(`${testName.padEnd(26)}: ${status === "PASS" ? "✅ PASS" : "❌ FAIL"}`);
  }
  console.log("==================================================================\n");

  const allPassed = Object.values(results).every(s => s === "PASS");
  if (!allPassed) {
    process.exit(1);
  }
}

runRealFirestoreConnectionTest().catch(e => {
  console.error("Test Suite Failed:", e);
  process.exit(1);
});
