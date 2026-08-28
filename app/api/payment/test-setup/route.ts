import { NextRequest, NextResponse } from "next/server";
import { saveSession, clearAllSessions } from "@/lib/session";
import { clearAllOrders } from "@/lib/orders";
import { registerMockRazorpayClient } from "@/lib/razorpay";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, session } = body;

    if (action === "clear") {
      clearAllSessions();
      await clearAllOrders();
      return NextResponse.json({ success: true });
    }

    if (action === "setup_mock") {
      process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret_for_unit_testing";
      const mockRazorpay = {
        createOrder: async (amount: number, sessionId: string, productCount: number) => {
          return { id: "order_mock_400", amount, currency: "INR" };
        },
        verifySignature: (orderId: string, paymentId: string, signature: string) => {
          return signature === "valid_signature_for_test";
        },
        verifyWebhookSignature: (rawBody: string, signature: string) => {
          return signature === "valid_webhook_signature_for_test";
        }
      };
      registerMockRazorpayClient(mockRazorpay);
      return NextResponse.json({ success: true });
    }

    if (action === "save_session") {
      saveSession(session);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
