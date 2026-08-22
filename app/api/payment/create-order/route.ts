import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/session";
import { validateTransaction } from "@/lib/policy";
import { createRazorpayOrder, validateRazorpayEnvironment } from "@/lib/razorpay";
import { createAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    // Validate credentials configuration
    try {
      validateRazorpayEnvironment();
    } catch (envError: any) {
      console.error("Payment Order Creation blocked due to missing environment variables:", envError);
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

    const { sessionId } = body;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: 'sessionId'." },
        { status: 400 }
      );
    }

    // 1. Retrieve the existing session
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session context not found." },
        { status: 400 }
      );
    }

    // 2. Compute current basket hash to detect changes
    const basketHash = session.currentBasket
      .map(p => `${p.id}_${p.price}`)
      .sort()
      .join("|");

    // 3. Idempotency Check:
    // If state is already PAYMENT_PENDING and we have a valid order ID for the same basket:
    if (
      session.transactionState === "PAYMENT_PENDING" &&
      session.razorpayOrderId &&
      session.lastBasketHash === basketHash
    ) {
      const existingAmount = session.currentBasket.reduce((sum, p) => sum + p.price, 0) - (session.requestedDiscount || 0);
      return NextResponse.json({
        success: true,
        transactionState: "PAYMENT_PENDING",
        order: {
          id: session.razorpayOrderId,
          amount: Math.max(0, existingAmount) * 100, // in paise
          currency: "INR"
        },
        checkout: {
          keyId: process.env.RAZORPAY_KEY_ID || ""
        }
      });
    }

    // 4. Verify transactionState allows order creation (USER_CONFIRMED, PAYMENT_PENDING, or retry states)
    if (
      session.transactionState !== "USER_CONFIRMED" &&
      session.transactionState !== "PAYMENT_PENDING" &&
      session.transactionState !== "PAYMENT_FAILED" &&
      session.transactionState !== "PAYMENT_CANCELLED"
    ) {
      return NextResponse.json(
        { error: `Payment creation is not allowed in transaction state: ${session.transactionState}. State must be USER_CONFIRMED.` },
        { status: 400 }
      );
    }

    // 5. Retrieve current basket and verify it is not empty
    const basketItems = session.currentBasket;
    if (!basketItems || basketItems.length === 0) {
      return NextResponse.json(
        { error: "Proposed basket is empty. Cannot initiate payment." },
        { status: 400 }
      );
    }

    // 6. Re-run policy validation
    const budgetLimit = session.originalIntent.budget ?? 999999;
    const requestedDiscount = session.requestedDiscount || 0;
    const policyValidation = validateTransaction(basketItems, budgetLimit, requestedDiscount);

    if (!policyValidation.approved) {
      return NextResponse.json(
        {
          error: "Merchant policy validation failed for the current basket.",
          failures: policyValidation.failureReasons
        },
        { status: 400 }
      );
    }

    // 7. Calculate finalAmount (ignoring any client amount)
    const finalAmountInINR = policyValidation.finalAmount;
    const finalAmountInPaise = Math.round(finalAmountInINR * 100);

    // 8. Create Razorpay order
    let order;
    try {
      order = await createRazorpayOrder(finalAmountInPaise, sessionId, basketItems.length);
    } catch (err: any) {
      console.error("Razorpay order creation failed:", err);
      return NextResponse.json(
        { error: `Razorpay payment order creation failed: ${err.message}` },
        { status: 500 }
      );
    }

    // 9. Update server-side session
    session.transactionState = "PAYMENT_PENDING";
    session.razorpayOrderId = order.id;
    session.lastBasketHash = basketHash;
    saveSession(session);

    // 10. Record PAYMENT_INITIATED audit event
    createAuditEvent({
      eventType: "PAYMENT_INITIATED",
      actor: "AXIS_ONE",
      status: "PENDING",
      summary: "Razorpay payment order created for the confirmed basket.",
      details: {
        sessionId,
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });

    return NextResponse.json({
      success: true,
      transactionState: "PAYMENT_PENDING",
      order: {
        id: order.id,
        amount: order.amount,
        currency: "INR"
      },
      checkout: {
        keyId: process.env.RAZORPAY_KEY_ID || ""
      }
    });

  } catch (error: any) {
    console.error("Error creating payment order:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during payment initiation." },
      { status: 500 }
    );
  }
}
