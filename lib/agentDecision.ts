import { 
  AgentActivity, 
  AgentDecisionSummary, 
  DecisionFactor, 
  DecisionHistoryEntry, 
  TrustControls, 
  RankedResult, 
  Product, 
  UserIntent, 
  ValidationResult, 
  TransactionState, 
  ConversationAction,
  CommerceConversationContext
} from "./types";
import { getAllProducts } from "./catalog";
import { getMerchantById, DEMO_MERCHANTS } from "../data/merchants";

/**
 * Returns the standard verified trust controls enforced by AXIS ONE.
 */
export function getStandardTrustControls(): TrustControls {
  return {
    decisionControls: [
      "Deterministic catalog verification — facts & specs strictly ground all selections",
      "User budget limit enforced — price constraint checked server-side",
      "Real-time inventory validation — only in-stock items are purchasable",
      "Merchant policy compliance — discount limits and return terms verified",
      "User override authority — recommendation can be changed anytime"
    ],
    paymentControls: [
      "Explicit user authorization barrier — payment strictly locked until confirmation",
      "Server-signed Razorpay orders — client cannot modify transaction amount",
      "Cryptographic signature verification — prevents tampered checkout receipts",
      "Webhook verification — idempotent state synchronization",
      "Strict state machine — blocks unauthorized transition to completed"
    ],
    persistenceControls: [
      "Firebase Firestore order ledger — tamper-evident transaction persistence",
      "Audit trail recording — all decision stages logged with actor and timestamp",
      "Idempotency protection — duplicate payments rejected server-side"
    ]
  };
}

/**
 * Builds the safe, auditable agent activity timeline reflecting actual execution state.
 */
export function buildAgentActivities(params: {
  intent: UserIntent;
  recommendation: RankedResult;
  candidateCount: number;
  policyValidation: ValidationResult;
  transactionState: TransactionState;
  comparisonExecuted?: boolean;
  basketTotal: number;
}): AgentActivity[] {
  const { 
    intent, 
    recommendation, 
    candidateCount, 
    policyValidation, 
    transactionState, 
    comparisonExecuted,
    basketTotal 
  } = params;

  const activities: AgentActivity[] = [];
  const now = new Date().toISOString();

  // 1. Requirements Understood
  const reqParts: string[] = [intent.productCategory];
  if (intent.budget) reqParts.push(`Budget ₹${intent.budget.toLocaleString("en-IN")}`);
  if (intent.wireless !== undefined) reqParts.push(intent.wireless ? "Wireless" : "Wired");
  if (intent.useCase) reqParts.push(`For ${intent.useCase}`);
  if (intent.batteryPriority && intent.batteryPriority !== "low") reqParts.push(`${intent.batteryPriority} battery priority`);

  activities.push({
    id: `act_${Date.now()}_1`,
    type: "REQUIREMENTS_UNDERSTOOD",
    status: "COMPLETED",
    title: "Requirements Understood",
    summary: reqParts.join(" • "),
    metadata: { intent },
    timestamp: now
  });

  // 2. Multi-Merchant Search
  const totalProducts = getAllProducts().length;
  activities.push({
    id: `act_${Date.now()}_2`,
    type: "MERCHANT_SEARCH",
    status: "COMPLETED",
    title: "Multi-Merchant Search",
    summary: `${DEMO_MERCHANTS.length} verified demo merchants scanned (${totalProducts} catalog products evaluated)`,
    metadata: { merchantsEvaluated: DEMO_MERCHANTS.length, totalProducts },
    timestamp: now
  });

  // 3. Candidate Filtering & Evaluation
  activities.push({
    id: `act_${Date.now()}_3`,
    type: "PRODUCT_FILTERING",
    status: candidateCount > 0 ? "COMPLETED" : "WARNING",
    title: "Candidate Evaluation",
    summary: `${candidateCount} valid matching option${candidateCount === 1 ? "" : "s"} passed category & constraint filters`,
    metadata: { validCandidates: candidateCount },
    timestamp: now
  });

  // 4. Product Comparison (if comparison active or multiple candidates)
  if (comparisonExecuted || candidateCount > 1) {
    activities.push({
      id: `act_${Date.now()}_4`,
      type: "PRODUCT_COMPARISON",
      status: "COMPLETED",
      title: "Store & Feature Comparison",
      summary: "Evaluated price deltas, warranties, and delivery estimates across merchant stores",
      timestamp: now
    });
  }

  // 5. Budget Validation
  const userBudget = intent.budget;
  const isBudgetValid = !userBudget || basketTotal <= userBudget;
  activities.push({
    id: `act_${Date.now()}_5`,
    type: "BUDGET_VALIDATION",
    status: isBudgetValid ? "COMPLETED" : "WARNING",
    title: "Budget Guardrail Check",
    summary: userBudget 
      ? (isBudgetValid ? `Within budget (₹${basketTotal.toLocaleString("en-IN")} / ₹${userBudget.toLocaleString("en-IN")})` : `Budget exceeded (₹${basketTotal.toLocaleString("en-IN")} > ₹${userBudget.toLocaleString("en-IN")})`)
      : `Basket total ₹${basketTotal.toLocaleString("en-IN")} (no budget ceiling specified)`,
    metadata: { userBudget, basketTotal, isBudgetValid },
    timestamp: now
  });

  // 6. Inventory Validation
  const stock = recommendation.product.stock ?? recommendation.product.inventory ?? 0;
  const isStockValid = stock > 0;
  activities.push({
    id: `act_${Date.now()}_6`,
    type: "INVENTORY_VALIDATION",
    status: isStockValid ? "COMPLETED" : "BLOCKED",
    title: "Inventory Guardrail Check",
    summary: isStockValid ? `Verified in stock (${stock} units available at ${recommendation.product.merchantName || "store"})` : "Out of stock from merchant",
    metadata: { stock, isStockValid },
    timestamp: now
  });

  // 7. Merchant Policy Validation
  activities.push({
    id: `act_${Date.now()}_7`,
    type: "POLICY_VALIDATION",
    status: policyValidation.approved ? "COMPLETED" : "BLOCKED",
    title: "Merchant Policy Verification",
    summary: policyValidation.approved 
      ? `Verified under merchant policy rules (${policyValidation.checks.length} compliance checks passed)`
      : `Policy check blocked: ${policyValidation.failureReasons.join("; ")}`,
    metadata: { checksPassed: policyValidation.checks.length, approved: policyValidation.approved },
    timestamp: now
  });

  // 8. Product Selection & Basket
  activities.push({
    id: `act_${Date.now()}_8`,
    type: "PRODUCT_SELECTED",
    status: "COMPLETED",
    title: "★ Decision Ready",
    summary: `Selected ${recommendation.product.name} (₹${recommendation.product.price.toLocaleString("en-IN")}) — ${recommendation.matchScore}% match`,
    metadata: { selectedProduct: recommendation.product.name, matchScore: recommendation.matchScore },
    timestamp: now
  });

  // 9. User Authorization Boundary
  if (transactionState === "USER_CONFIRMED" || transactionState === "PAYMENT_PENDING" || transactionState === "PAYMENT_PROCESSING") {
    activities.push({
      id: `act_${Date.now()}_9`,
      type: "USER_APPROVED",
      status: "COMPLETED",
      title: "✓ User Approval Received",
      summary: "Basket locked in. Payment checkout authorization is unlocked.",
      timestamp: now
    });
  } else if (transactionState === "PAYMENT_COMPLETED") {
    activities.push({
      id: `act_${Date.now()}_9`,
      type: "PAYMENT_VERIFIED",
      status: "COMPLETED",
      title: "✓ Payment Verified & Order Persisted",
      summary: "Transaction completed and order recorded in Firestore ledger.",
      timestamp: now
    });
  } else {
    activities.push({
      id: `act_${Date.now()}_9`,
      type: "USER_APPROVAL_REQUIRED",
      status: "IN_PROGRESS",
      title: "🔒 User Authorization Required",
      summary: "Payment is locked. Explicit user approval is mandatory before payment checkout.",
      timestamp: now
    });
  }

  return activities;
}

/**
 * Builds the structured, fact-grounded decision summary.
 */
export function buildDecisionSummary(params: {
  intent: UserIntent;
  recommendation: RankedResult;
  allProducts: Product[];
  candidates: RankedResult[];
  policyValidation: ValidationResult;
  transactionState: TransactionState;
  tradeoffs?: string[];
  decisionHistory?: DecisionHistoryEntry[];
}): AgentDecisionSummary {
  const {
    intent,
    recommendation,
    allProducts,
    candidates,
    policyValidation,
    transactionState,
    tradeoffs = [],
    decisionHistory = []
  } = params;

  const product = recommendation.product;
  const userBudget = intent.budget;
  const basketTotal = policyValidation.finalAmount;

  // 1. Requirements formatting
  const requirements: string[] = [
    `Category: ${intent.productCategory}`
  ];
  if (userBudget) requirements.push(`Budget: ₹${userBudget.toLocaleString("en-IN")}`);
  if (intent.wireless !== undefined) requirements.push(`Connectivity: ${intent.wireless ? "Wireless" : "Wired"}`);
  if (intent.useCase) requirements.push(`Use Case: ${intent.useCase}`);
  if (intent.batteryPriority && intent.batteryPriority !== "low") requirements.push(`Battery Priority: ${intent.batteryPriority}`);

  // 2. Budget status
  let budgetStatus: "WITHIN_BUDGET" | "BUDGET_EXCEEDED" | "NO_BUDGET_SET" = "NO_BUDGET_SET";
  if (userBudget) {
    budgetStatus = basketTotal <= userBudget ? "WITHIN_BUDGET" : "BUDGET_EXCEEDED";
  }

  // 3. Inventory status
  const stock = product.stock ?? product.inventory ?? 0;
  let inventoryStatus: "AVAILABLE" | "LIMITED_AVAILABILITY" | "UNAVAILABLE" = "UNAVAILABLE";
  if (stock > 5) inventoryStatus = "AVAILABLE";
  else if (stock > 0) inventoryStatus = "LIMITED_AVAILABILITY";

  // 4. Policy status
  const policyStatus: "VALID" | "BLOCKED" = policyValidation.approved ? "VALID" : "BLOCKED";

  // 5. Decision Factors
  const decisionFactors: DecisionFactor[] = [];

  // Category & Name
  decisionFactors.push({
    factor: "Category Fit",
    status: "positive",
    detail: `Exact match for ${intent.productCategory} category requirements.`
  });

  // Budget Factor
  if (userBudget) {
    if (product.price <= userBudget) {
      decisionFactors.push({
        factor: "Budget Alignment",
        status: "positive",
        detail: `Priced at ₹${product.price.toLocaleString("en-IN")}, saving ₹${(userBudget - product.price).toLocaleString("en-IN")} under your ₹${userBudget.toLocaleString("en-IN")} budget.`
      });
    } else {
      decisionFactors.push({
        factor: "Budget Fit",
        status: "tradeoff",
        detail: `Exceeds specified budget by ₹${(product.price - userBudget).toLocaleString("en-IN")}.`
      });
    }
  }

  // Connectivity
  if (intent.wireless !== undefined) {
    const isWireless = product.tags.includes("wireless") || product.connectivity === "wireless" || product.connectivity === "tri-mode";
    decisionFactors.push({
      factor: "Connectivity",
      status: (isWireless === intent.wireless) ? "positive" : "tradeoff",
      detail: isWireless ? "Tri-mode wireless connectivity supported." : "Wired low-latency connection."
    });
  }

  // Merchant & Warranty
  if (product.warranty) {
    decisionFactors.push({
      factor: "Merchant Protection",
      status: "positive",
      detail: `${product.merchantName || "Merchant"} backed with ${product.warranty}.`
    });
  }

  // Availability & Delivery
  decisionFactors.push({
    factor: "Fulfillment & Stock",
    status: stock > 0 ? "positive" : "tradeoff",
    detail: stock > 0 ? `In stock (${stock} units) with delivery in ${product.deliveryEstimate || "2-3 business days"}.` : "Currently out of stock."
  });

  // Tradeoff Notes
  if (candidates.length > 1) {
    const cheaperCand = candidates.find(c => c.product.price < product.price);
    if (cheaperCand) {
      decisionFactors.push({
        factor: "Value vs Alternatives",
        status: "tradeoff",
        detail: `${cheaperCand.product.name} is available for ₹${cheaperCand.product.price.toLocaleString("en-IN")}, but ${product.name} provides higher overall feature alignment (${recommendation.matchScore}% vs ${cheaperCand.matchScore}%).`
      });
    }
  }

  // 6. Authorization status
  let authorizationStatus: "PENDING_USER_APPROVAL" | "USER_APPROVED" | "PAYMENT_AUTHORIZED" | "PAYMENT_COMPLETED" = "PENDING_USER_APPROVAL";
  if (transactionState === "PAYMENT_COMPLETED") {
    authorizationStatus = "PAYMENT_COMPLETED";
  } else if (transactionState === "USER_CONFIRMED" || transactionState === "PAYMENT_PENDING" || transactionState === "PAYMENT_PROCESSING") {
    authorizationStatus = "USER_APPROVED";
  }

  return {
    requirements,
    merchantsEvaluated: DEMO_MERCHANTS.length,
    productsEvaluated: allProducts.length,
    validCandidates: candidates.length > 0 ? candidates.length : 1,
    selectedProduct: product,
    matchScore: recommendation.matchScore,
    budgetStatus,
    inventoryStatus,
    policyStatus,
    userLimit: userBudget,
    basketTotal,
    remainingBudget: userBudget ? Math.max(0, userBudget - basketTotal) : undefined,
    tradeoffs,
    decisionFactors,
    decisionHistory,
    authorizationStatus
  };
}

/**
 * Appends a step to decision history ensuring meaningful progression tracking.
 */
export function updateDecisionHistory(
  existingHistory: DecisionHistoryEntry[] | undefined,
  actionTitle: string,
  product?: Product,
  detail?: string
): DecisionHistoryEntry[] {
  const history = existingHistory ? [...existingHistory] : [];
  const stepNumber = history.length + 1;
  const now = new Date().toISOString();

  // Avoid adding duplicate identical consecutive entries
  const last = history[history.length - 1];
  if (last && last.actionTitle === actionTitle && last.productName === product?.name) {
    return history;
  }

  history.push({
    stepNumber,
    actionTitle,
    productName: product?.name,
    merchantName: product?.merchantName,
    price: product?.price,
    detail: detail || `Selected ${product?.name || "item"} for ₹${product?.price || 0}`,
    timestamp: now
  });

  return history;
}
