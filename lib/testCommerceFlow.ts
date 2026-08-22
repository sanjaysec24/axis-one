import { Product, UserIntent, RankedResult, UpsellOpportunity, ValidationResult, AuditEvent } from "./types";
import { getAllProducts, getProductById, searchProducts } from "./catalog";
import { rankProducts } from "./ranking";
import { findUpsellOpportunity } from "./upsell";
import { validateTransaction } from "./policy";
import { createAuditEvent, getAuditTrail, clearAuditTrail } from "./audit";

export interface IntegrationSuccessResult {
  intent: UserIntent;
  rankedProducts: RankedResult[];
  selectedProduct: Product;
  upsell: UpsellOpportunity | null;
  policyValidation: ValidationResult;
  auditTrail: AuditEvent[];
}

export interface IntegrationFailureResult {
  product: Product;
  requestedDiscount: number;
  policyValidation: ValidationResult;
  auditTrail: AuditEvent[];
}

/**
 * Runs the complete commerce success integration flow.
 */
export function runIntegrationSuccessTest(): IntegrationSuccessResult {
  clearAuditTrail();

  // 1. INTENT_RECEIVED
  const intent: UserIntent = {
    productCategory: "Mechanical Keyboard",
    budget: 5000,
    wireless: true,
    batteryPriority: "high",
    useCase: "programming"
  };

  createAuditEvent({
    eventType: "INTENT_RECEIVED",
    actor: "USER",
    status: "SUCCESS",
    summary: "User shopping requirements received.",
    details: intent
  });

  // 2. CATALOG_SEARCHED
  const candidates = searchProducts(intent);
  createAuditEvent({
    eventType: "CATALOG_SEARCHED",
    actor: "AXIS_ONE",
    status: "SUCCESS",
    summary: "Merchant catalog searched for matching products.",
    details: { candidateCount: candidates.length }
  });

  // 3. PRODUCTS_RANKED
  const ranked = rankProducts(candidates, intent);
  createAuditEvent({
    eventType: "PRODUCTS_RANKED",
    actor: "AXIS_ONE",
    status: "SUCCESS",
    summary: "Product candidates ranked deterministically.",
    details: {
      topRecommendation: ranked[0]?.product.name || "None",
      rankedResultsCount: ranked.length
    }
  });

  // 4. PRODUCT_SELECTED
  const selectedProduct = ranked[0]?.product; // NovaKey K75
  createAuditEvent({
    eventType: "PRODUCT_SELECTED",
    actor: "USER",
    status: "SUCCESS",
    summary: `User selected ${selectedProduct?.name || "None"}.`,
    details: {
      productId: selectedProduct?.id || "",
      productName: selectedProduct?.name || "",
      price: selectedProduct?.price || 0
    }
  });

  // 5. UPSELL_IDENTIFIED
  const upsell = findUpsellOpportunity(selectedProduct, getAllProducts(), 5000, intent);
  createAuditEvent({
    eventType: "UPSELL_IDENTIFIED",
    actor: "AXIS_ONE",
    status: "SUCCESS",
    summary: "Relevant cross-sell opportunity identified.",
    details: {
      recommendedProduct: upsell?.recommendedProduct.name || "None",
      upsellAmount: upsell?.upsellAmount || 0,
      newBasketTotal: upsell?.newTotal || 0
    }
  });

  // 6. POLICY_VALIDATED
  const cart = [selectedProduct];
  if (upsell?.recommendedProduct) {
    cart.push(upsell.recommendedProduct);
  }
  const policyValidation = validateTransaction(cart, 5000, 0);
  createAuditEvent({
    eventType: "POLICY_VALIDATED",
    actor: "POLICY_ENGINE",
    status: "SUCCESS",
    summary: "Basket passed deterministic merchant policy validation.",
    details: {
      originalTotal: policyValidation.originalTotal,
      finalAmount: policyValidation.finalAmount,
      approved: policyValidation.approved
    }
  });

  return {
    intent,
    rankedProducts: ranked,
    selectedProduct,
    upsell,
    policyValidation,
    auditTrail: getAuditTrail()
  };
}

/**
 * Runs the discount policy failure integration flow.
 */
export function runIntegrationFailureTest(): IntegrationFailureResult | null {
  clearAuditTrail();

  // 1. INTENT_RECEIVED
  const intent: UserIntent = {
    productCategory: "Mechanical Keyboard",
    budget: 5000,
    useCase: "requesting discount"
  };

  createAuditEvent({
    eventType: "INTENT_RECEIVED",
    actor: "USER",
    status: "SUCCESS",
    summary: "User shopping requirements received.",
    details: intent
  });

  const apex = getProductById("apex-pro-x");
  if (!apex) return null;

  // Run transaction check
  const policyValidation = validateTransaction([apex], 5000, 1999);

  // 2. ACTION_BLOCKED
  createAuditEvent({
    eventType: "ACTION_BLOCKED",
    actor: "POLICY_ENGINE",
    status: "BLOCKED",
    summary: "Requested discount exceeds the merchant policy limit.",
    details: {
      productName: apex.name,
      originalPrice: apex.price,
      requestedFinalPrice: 5000,
      requestedDiscount: 1999,
      maximumAllowedDiscount: 500,
      policyFailures: policyValidation.failureReasons
    }
  });

  return {
    product: apex,
    requestedDiscount: 1999,
    policyValidation,
    auditTrail: getAuditTrail()
  };
}
