import { getProductById } from "./catalog";
import { Product, PolicyCheck, ValidationResult } from "./types";
import { merchantPolicyConfig } from "../data/policies";

export interface CartItem {
  productId: string;
  quantity: number;
}

/**
 * Calculates subtotal, discounts, and final total for a given cart,
 * enforcing merchant pricing policies.
 */
export function calculateCartTotal(items: CartItem[]): {
  subtotal: number;
  discount: number;
  total: number;
  appliedDiscounts: string[];
} {
  let subtotal = 0;
  let discount = 0;
  const appliedDiscounts: string[] = [];

  // Calculate base subtotal
  const resolvedItems = items.map(item => {
    const product = getProductById(item.productId);
    const price = product ? product.price : 0;
    subtotal += price * item.quantity;
    return { item, product };
  });

  // Evaluate promotional policies
  // Policy 1: NovaKey Wrist Support Cross-sell discount (10% off ErgoRest if NovaKey is also in cart)
  const hasNovaKey = resolvedItems.some(ri => ri.item.productId === "novakey-k75" && ri.item.quantity > 0);
  const ergoRestItem = resolvedItems.find(ri => ri.item.productId === "ergorest-wrist-support");

  if (hasNovaKey && ergoRestItem && ergoRestItem.product) {
    const discountAmount = Math.round(
      ergoRestItem.product.price * ergoRestItem.item.quantity * 0.10
    );
    discount += discountAmount;
    appliedDiscounts.push(`NovaKey Wrist Support Cross-sell Discount (-₹${discountAmount})`);
  }

  return {
    subtotal,
    discount,
    total: subtotal - discount,
    appliedDiscounts
  };
}

/**
 * Validates a pending purchase against all deterministic merchant policies.
 */
export function validateTransaction(
  selectedProducts: Product[],
  userBudget: number,
  requestedDiscount: number
): ValidationResult {
  const checks: PolicyCheck[] = [];
  const failureReasons: string[] = [];

  // --- CHECK 3: PRICE INTEGRITY (Run first to compute correct original total) ---
  let originalTotal = 0;
  let priceIntegrityStatus: "PASSED" | "FAILED" = "PASSED";
  let priceIntegrityExplanation = "All product prices verified against the official catalog.";
  
  for (const product of selectedProducts) {
    const catalogProduct = getProductById(product.id);
    if (!catalogProduct) {
      priceIntegrityStatus = "FAILED";
      priceIntegrityExplanation = `Product "${product.name}" (ID: ${product.id}) was not found in the official catalog.`;
      originalTotal += product.price; // fallback to input price
    } else {
      originalTotal += catalogProduct.price;
      if (product.price !== catalogProduct.price) {
        priceIntegrityStatus = "FAILED";
        priceIntegrityExplanation = `Price mismatch detected for "${product.name}". Expected ₹${catalogProduct.price} from catalog, got ₹${product.price}.`;
      }
    }
  }

  checks.push({
    rule: "PRICE_INTEGRITY",
    status: priceIntegrityStatus,
    expected: "Matched catalog prices",
    actual: priceIntegrityStatus === "PASSED" ? "Matched catalog prices" : "Price mismatch or missing item",
    explanation: priceIntegrityExplanation
  });
  if (priceIntegrityStatus === "FAILED") {
    failureReasons.push(priceIntegrityExplanation);
  }

  // Calculate final transaction amount based on verified prices
  const finalAmount = originalTotal - requestedDiscount;

  // --- CHECK 1: INVENTORY ---
  let inventoryStatus: "PASSED" | "FAILED" = "PASSED";
  let inventoryExplanation = "All selected products are in stock.";
  const minStock = merchantPolicyConfig.minimumStockRequired;

  for (const product of selectedProducts) {
    const catalogProduct = getProductById(product.id) || product;
    if (catalogProduct.stock < minStock) {
      inventoryStatus = "FAILED";
      inventoryExplanation = `Product "${product.name}" has insufficient stock (Stock: ${catalogProduct.stock}, Minimum required: ${minStock}).`;
      failureReasons.push(inventoryExplanation);
    }
  }

  checks.push({
    rule: "INVENTORY",
    status: inventoryStatus,
    expected: `>= ${minStock}`,
    actual: inventoryStatus === "PASSED" ? "Available" : "Below minimum stock threshold",
    explanation: inventoryExplanation
  });

  // --- CHECK 2: DISCOUNT LIMIT ---
  const maxDiscount = merchantPolicyConfig.maximumDiscount;
  let discountStatus: "PASSED" | "FAILED" = "PASSED";
  let discountExplanation = `Requested discount of ₹${requestedDiscount} is within the merchant limit of ₹${maxDiscount}.`;

  if (requestedDiscount > maxDiscount) {
    discountStatus = "FAILED";
    discountExplanation = `Requested discount of ₹${requestedDiscount} exceeds the merchant maximum discount of ₹${maxDiscount}.`;
    failureReasons.push(discountExplanation);
  }

  checks.push({
    rule: "DISCOUNT_LIMIT",
    status: discountStatus,
    expected: `<= ${maxDiscount}`,
    actual: requestedDiscount,
    explanation: discountExplanation
  });

  // --- CHECK 4: USER BUDGET ---
  let budgetStatus: "PASSED" | "FAILED" = "PASSED";
  let budgetExplanation = `Final basket of ₹${finalAmount} is within the user's ₹${userBudget} budget.`;

  if (finalAmount > userBudget) {
    budgetStatus = "FAILED";
    const overage = finalAmount - userBudget;
    budgetExplanation = `Final amount ₹${finalAmount} exceeds the user budget of ₹${userBudget} by ₹${overage}.`;
    failureReasons.push(budgetExplanation);
  }

  checks.push({
    rule: "USER_BUDGET",
    status: budgetStatus,
    expected: `<= ${userBudget}`,
    actual: finalAmount,
    explanation: budgetExplanation
  });

  // --- CHECK 5: MAXIMUM TRANSACTION AMOUNT ---
  const maxTrans = merchantPolicyConfig.maximumTransactionAmount;
  let transLimitStatus: "PASSED" | "FAILED" = "PASSED";
  let transLimitExplanation = `Transaction amount of ₹${finalAmount} is within the safe limit of ₹${maxTrans}.`;

  if (finalAmount > maxTrans) {
    transLimitStatus = "FAILED";
    transLimitExplanation = `Transaction total of ₹${finalAmount} exceeds the merchant maximum transaction amount of ₹${maxTrans}.`;
    failureReasons.push(transLimitExplanation);
  }

  checks.push({
    rule: "MAXIMUM_TRANSACTION_AMOUNT",
    status: transLimitStatus,
    expected: `<= ${maxTrans}`,
    actual: finalAmount,
    explanation: transLimitExplanation
  });

  // --- CHECK 6: NEGATIVE AMOUNT PROTECTION ---
  let negativeProtectionStatus: "PASSED" | "FAILED" = "PASSED";
  let negativeProtectionExplanation = "Final transaction amount is positive.";

  if (requestedDiscount >= originalTotal) {
    negativeProtectionStatus = "FAILED";
    negativeProtectionExplanation = `Requested discount of ₹${requestedDiscount} cannot be greater than or equal to the basket total of ₹${originalTotal}.`;
    failureReasons.push(negativeProtectionExplanation);
  }

  checks.push({
    rule: "NEGATIVE_AMOUNT_PROTECTION",
    status: negativeProtectionStatus,
    expected: `Discount < Basket Total (₹${originalTotal})`,
    actual: `Discount: ₹${requestedDiscount}`,
    explanation: negativeProtectionExplanation
  });

  // Approved only if all checks are PASSED
  const approved = checks.every(c => c.status === "PASSED");

  return {
    approved,
    originalTotal,
    requestedDiscount,
    finalAmount: Math.max(0, finalAmount),
    checks,
    failureReasons
  };
}
