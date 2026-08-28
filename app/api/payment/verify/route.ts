import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/session";
import { verifyRazorpaySignature, validateRazorpayEnvironment } from "@/lib/razorpay";
import { createAuditEvent, getAuditTrail } from "@/lib/audit";
import { saveOrder } from "@/lib/orders";

export async function POST(request: NextRequest) {
  try {
    // Validate credentials configuration
    try {
      validateRazorpayEnvironment();
    } catch (envError: any) {
      console.error("Payment Verification blocked due to missing environment variables:", envError);
      return NextResponse.json(
        { error: envError.message || "Server environment not configured properly." },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { status: 400 }
      );
    }

    const { sessionId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    // 1. Validate all required fields
    if (!sessionId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required parameters: 'sessionId', 'razorpay_payment_id', 'razorpay_order_id', and 'razorpay_signature' are all required." },
        { status: 400 }
      );
    }

    // 2. Retrieve the server-side session
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session context not found." },
        { status: 400 }
      );
    }

    const basketAmount = session.currentBasket.reduce((sum, p) => sum + p.price, 0) - (session.requestedDiscount || 0);

    // 3. Idempotent check: If already PAYMENT_COMPLETED
    if (session.transactionState === "PAYMENT_COMPLETED") {
      return NextResponse.json({
        success: true,
        transactionState: "PAYMENT_COMPLETED",
        payment: {
          paymentId: session.razorpayPaymentId || razorpay_payment_id,
          orderId: session.razorpayOrderId || razorpay_order_id,
          amount: Math.max(0, basketAmount),
          currency: "INR",
          verified: true
        }
      });
    }

    // 4. Verify transactionState is PAYMENT_PENDING or PAYMENT_PROCESSING
    if (session.transactionState !== "PAYMENT_PENDING" && session.transactionState !== "PAYMENT_PROCESSING") {
      return NextResponse.json(
        { error: `Payment verification is not allowed in transaction state: ${session.transactionState}. State must be PAYMENT_PENDING or PAYMENT_PROCESSING.` },
        { status: 400 }
      );
    }

    // 5. Verify razorpay_order_id matches the order stored in session
    if (razorpay_order_id !== session.razorpayOrderId) {
      return NextResponse.json(
        { error: `Order ID mismatch. Expected: ${session.razorpayOrderId}, received: ${razorpay_order_id}.` },
        { status: 400 }
      );
    }

    // 6. Verify the Razorpay signature server-side
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      // Record failed audit event
      createAuditEvent({
        eventType: "ACTION_BLOCKED",
        actor: "RAZORPAY",
        status: "FAILED",
        summary: "Payment signature verification failed.",
        details: {
          sessionId,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id
        }
      });

      return NextResponse.json(
        { error: "Razorpay signature verification failed. Transaction was not approved." },
        { status: 400 }
      );
    }

    // 7. Successful Payment Flow
    session.transactionState = "PAYMENT_COMPLETED";
    session.razorpayPaymentId = razorpay_payment_id;
    saveSession(session);

    // Save order to persistent storage
    await saveOrder({
      orderId: razorpay_order_id,
      sessionId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      items: session.currentBasket,
      basket: session.currentBasket,
      amount: Math.max(0, basketAmount),
      currency: "INR",
      transactionState: "PAYMENT_COMPLETED",
      timestamp: new Date().toISOString(),
      auditHistory: getAuditTrail(),
      auditEvents: getAuditTrail()
    });

    // 8. Record PAYMENT_COMPLETED audit event
    createAuditEvent({
      eventType: "PAYMENT_COMPLETED",
      actor: "RAZORPAY",
      status: "SUCCESS",
      summary: "Payment successfully verified.",
      details: {
        sessionId,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        amount: Math.max(0, basketAmount),
        currency: "INR"
      }
    });

    return NextResponse.json({
      success: true,
      transactionState: "PAYMENT_COMPLETED",
      payment: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount: Math.max(0, basketAmount),
        currency: "INR",
        verified: true
      }
    });

  } catch (error: any) {
    console.error("Error verifying payment signature:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during payment verification." },
      { status: 500 }
    );
  }
}
