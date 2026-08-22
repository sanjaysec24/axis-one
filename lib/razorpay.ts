import Razorpay from "razorpay";
import crypto from "crypto";

let razorpayInstance: Razorpay | null = null;
let mockClient: any = null;

/**
 * Register a mock client for testing/simulation.
 */
export function registerMockRazorpayClient(client: any) {
  mockClient = client;
}

/**
 * Lazily retrieves the initialized Razorpay instance to prevent errors during build time.
 */
function getRazorpayInstance(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Server Configuration Error: Razorpay credentials are not configured on the server.");
  }
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
}

/**
 * Creates a Razorpay order in test mode.
 */
export async function createRazorpayOrder(
  amountInPaise: number,
  sessionId: string,
  productCount: number
): Promise<{ id: string; amount: number; currency: string }> {
  if (mockClient) {
    return mockClient.createOrder(amountInPaise, sessionId, productCount);
  }

  const razorpay = getRazorpayInstance();
  
  const options = {
    amount: amountInPaise,
    currency: "INR",
    receipt: `receipt_${sessionId.substring(0, 10)}_${Date.now().toString().substring(5)}`,
    notes: {
      sessionId,
      merchant: "NEXORA TECH",
      productCount: String(productCount)
    }
  };

  const order = await razorpay.orders.create(options);
  
  return {
    id: order.id,
    amount: typeof order.amount === "string" ? parseInt(order.amount, 10) : order.amount,
    currency: order.currency
  };
}

/**
 * Verifies the Razorpay payment signature server-side.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (mockClient && mockClient.verifySignature) {
    return mockClient.verifySignature(orderId, paymentId, signature);
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error("Server Configuration Error: Razorpay secret is not configured.");
  }
  
  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return generatedSignature === signature;
}

/**
 * Validates that all required Razorpay environment variables are set.
 * Throws a safe, developer-facing error description without exposing secrets.
 */
export function validateRazorpayEnvironment(): void {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const missing: string[] = [];
  if (!keyId) missing.push("RAZORPAY_KEY_ID");
  if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");
  if (!webhookSecret) missing.push("RAZORPAY_WEBHOOK_SECRET");

  if (missing.length > 0) {
    throw new Error(`Server Configuration Error: Missing required Razorpay credentials: ${missing.join(", ")}. Please configure them in your server environment.`);
  }
}

/**
 * Verifies a Razorpay webhook signature server-side.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  if (mockClient && mockClient.verifyWebhookSignature) {
    return mockClient.verifyWebhookSignature(rawBody, signature);
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Server Configuration Error: Razorpay webhook secret is not configured on the server.");
  }

  const generatedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  return generatedSignature === signature;
}
