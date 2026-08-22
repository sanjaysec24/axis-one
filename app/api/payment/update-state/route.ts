import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/session";
import { isValidStateTransition } from "@/lib/stateTransition";
import { createAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid request body. Expected JSON." },
        { status: 400 }
      );
    }

    const { sessionId, newState, paymentId, errorDetails } = body;

    if (!sessionId || !newState) {
      return NextResponse.json(
        { error: "Missing required parameters: 'sessionId' and 'newState'." },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 400 }
      );
    }

    const currentState = session.transactionState;
    if (!isValidStateTransition(currentState, newState)) {
      return NextResponse.json(
        { error: `Invalid state transition from ${currentState} to ${newState}.` },
        { status: 400 }
      );
    }

    // Execute state transition
    session.transactionState = newState;
    if (paymentId) {
      session.razorpayPaymentId = paymentId;
    }
    saveSession(session);

    // Audit logs for client-driven transitions
    if (newState === "PAYMENT_FAILED") {
      createAuditEvent({
        eventType: "ACTION_BLOCKED",
        actor: "RAZORPAY",
        status: "FAILED",
        summary: `Payment failed: ${errorDetails || "Payment declined or failed."}`,
        details: { sessionId, newState, errorDetails }
      });
    } else if (newState === "PAYMENT_CANCELLED") {
      createAuditEvent({
        eventType: "ACTION_BLOCKED",
        actor: "USER",
        status: "FAILED",
        summary: "Payment checkout was cancelled by the user.",
        details: { sessionId, newState }
      });
    } else if (newState === "PAYMENT_PROCESSING") {
      createAuditEvent({
        eventType: "PAYMENT_INITIATED",
        actor: "USER",
        status: "SUCCESS",
        summary: "Payment is being processed.",
        details: { sessionId, newState }
      });
    }

    return NextResponse.json({
      success: true,
      transactionState: newState
    });

  } catch (error: any) {
    console.error("Error updating transaction state:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during state update." },
      { status: 500 }
    );
  }
}
