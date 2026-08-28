import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, validateRazorpayEnvironment } from "@/lib/razorpay";
import { findSessionByRazorpayOrderId, saveSession } from "@/lib/session";
import { saveOrder } from "@/lib/orders";
import { createAuditEvent, getAuditTrail } from "@/lib/audit";
import { isValidStateTransition } from "@/lib/stateTransition";

export async function POST(request: NextRequest) {
  try {
    // Validate that the Razorpay credentials and webhook secret are configured
    try {
      validateRazorpayEnvironment();
    } catch (envError: any) {
      console.error("Webhook environment validation failed:", envError);
      return NextResponse.json(
        { error: envError.message || "Server environment not properly configured." },
        { status: 500 }
      );
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Security Error: Missing x-razorpay-signature header." },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return NextResponse.json(
        { error: "Security Error: Webhook signature verification failed." },
        { status: 400 }
      );
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON body received." },
        { status: 400 }
      );
    }

    const event = payload.event;
    const payment = payload.payload?.payment?.entity;
    const orderId = payment?.order_id || payload.payload?.order?.entity?.id;
    const paymentId = payment?.id;

    if (!orderId) {
      return NextResponse.json(
        { success: true, message: "No order ID found in webhook payload. Event skipped." }
      );
    }

    // Locate the session linked to this order
    const session = findSessionByRazorpayOrderId(orderId);
    if (!session) {
      console.warn(`Webhook received valid signature but order was not found in active sessions: ${orderId}`);
      return NextResponse.json(
        { success: true, message: "Order ID not associated with any active server session." }
      );
    }

    const currentState = session.transactionState;

    if (event === "payment.captured" || event === "order.paid") {
      // Idempotency check: if already PAYMENT_COMPLETED, do not re-process
      if (currentState === "PAYMENT_COMPLETED") {
        return NextResponse.json({
          success: true,
          message: "Payment already marked as completed."
        });
      }

      // Check transition validity
      if (!isValidStateTransition(currentState, "PAYMENT_COMPLETED")) {
        return NextResponse.json(
          { error: `Invalid state transition from ${currentState} to PAYMENT_COMPLETED.` },
          { status: 400 }
        );
      }

      // Execute state transition
      session.transactionState = "PAYMENT_COMPLETED";
      session.razorpayPaymentId = paymentId;
      saveSession(session);

      // Log successful audit event
      createAuditEvent({
        eventType: "PAYMENT_COMPLETED",
        actor: "RAZORPAY_WEBHOOK",
        status: "SUCCESS",
        summary: `Payment captured via webhook (Event: ${event}). Payment ID: ${paymentId}`,
        details: {
          sessionId: session.sessionId,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId
        }
      });

      // Persist order in Firestore
      const basketAmount = session.currentBasket.reduce((sum, p) => sum + p.price, 0) - (session.requestedDiscount || 0);
      await saveOrder({
        orderId: orderId,
        sessionId: session.sessionId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        items: session.currentBasket,
        basket: session.currentBasket,
        amount: Math.max(0, basketAmount),
        currency: "INR",
        transactionState: "PAYMENT_COMPLETED",
        timestamp: new Date().toISOString(),
        auditHistory: getAuditTrail(),
        auditEvents: getAuditTrail()
      });

    } else if (event === "payment.failed") {
      if (currentState === "PAYMENT_COMPLETED") {
        // Safe check: a failed webhook event should NEVER overwrite a completed order
        return NextResponse.json({
          success: true,
          message: "Cannot mark completed transaction as failed."
        });
      }

      if (!isValidStateTransition(currentState, "PAYMENT_FAILED")) {
        return NextResponse.json(
          { error: `Invalid state transition from ${currentState} to PAYMENT_FAILED.` },
          { status: 400 }
        );
      }

      session.transactionState = "PAYMENT_FAILED";
      session.razorpayPaymentId = paymentId;
      saveSession(session);

      createAuditEvent({
        eventType: "ACTION_BLOCKED",
        actor: "RAZORPAY_WEBHOOK",
        status: "FAILED",
        summary: `Payment failed via webhook (Event: ${event}). Error description: ${payment?.error_description || "N/A"}`,
        details: {
          sessionId: session.sessionId,
          razorpayOrderId: orderId,
          error: payment?.error_description
        }
      });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Error processing Razorpay webhook:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during webhook processing." },
      { status: 500 }
    );
  }
}
