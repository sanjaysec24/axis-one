import { runAgentWorkflow } from "../lib/agentWorkflow";
import { routeConversationalMessage } from "../lib/conversationRouter";
import { buildAgentActivities, buildDecisionSummary, getStandardTrustControls, updateDecisionHistory } from "../lib/agentDecision";
import { getAllProducts, searchProducts } from "../lib/catalog";
import { rankProducts } from "../lib/ranking";
import { validateTransaction } from "../lib/policy";
import { clearSessionStore, getSession } from "../lib/session";
import { UserIntent, RankedResult } from "../lib/types";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`✅ [PASS ${passCount}] ${testName}`);
  } else {
    failCount++;
    console.error(`❌ [FAIL] ${testName}`);
    if (detail) console.error(`   Details: ${detail}`);
  }
}

async function runAllPhase5DTests() {
  console.log("=======================================================");
  console.log("  AXIS ONE — PHASE 5D AUTOMATED TEST SUITE (25+ TESTS)");
  console.log("=======================================================\n");

  clearSessionStore();

  // -------------------------------------------------------------
  // GROUP 1: Agent Activity Timeline Engine
  // -------------------------------------------------------------
  console.log("--- GROUP 1: Agent Activity Timeline Engine ---");

  const mockIntent: UserIntent = {
    productCategory: "Mechanical Keyboard",
    budget: 5000,
    wireless: true,
    useCase: "Programming"
  };
  const mockCandidates = rankProducts(searchProducts(mockIntent), mockIntent);
  const mockValidation = validateTransaction([mockCandidates[0].product], 5000, 0);

  const activities = buildAgentActivities({
    intent: mockIntent,
    recommendation: mockCandidates[0],
    candidateCount: mockCandidates.length,
    policyValidation: mockValidation,
    transactionState: "AWAITING_USER_APPROVAL",
    basketTotal: mockCandidates[0].product.price
  });

  assert(activities.length >= 7, "Agent activities list contains full pipeline stages");
  assert(activities.some(a => a.type === "REQUIREMENTS_UNDERSTOOD" && a.status === "COMPLETED"), "REQUIREMENTS_UNDERSTOOD is COMPLETED");
  assert(activities.some(a => a.type === "MERCHANT_SEARCH" && a.summary.includes("5 verified demo merchants")), "MERCHANT_SEARCH scans 5 demo merchants");
  assert(activities.some(a => a.type === "PRODUCT_FILTERING" && a.status === "COMPLETED"), "PRODUCT_FILTERING is COMPLETED");
  assert(activities.some(a => a.type === "BUDGET_VALIDATION" && a.status === "COMPLETED"), "BUDGET_VALIDATION is COMPLETED when within budget");
  assert(activities.some(a => a.type === "INVENTORY_VALIDATION" && a.status === "COMPLETED"), "INVENTORY_VALIDATION is COMPLETED for in-stock items");
  assert(activities.some(a => a.type === "POLICY_VALIDATION" && a.status === "COMPLETED"), "POLICY_VALIDATION is COMPLETED for compliant cart");
  assert(activities.some(a => a.type === "PRODUCT_SELECTED" && a.title.includes("Decision Ready")), "PRODUCT_SELECTED is ready");
  assert(activities.some(a => a.type === "USER_APPROVAL_REQUIRED" && a.status === "IN_PROGRESS"), "USER_APPROVAL_REQUIRED is IN_PROGRESS before confirmation");

  // -------------------------------------------------------------
  // GROUP 2: Agent Decision Summary & Factors
  // -------------------------------------------------------------
  console.log("\n--- GROUP 2: Agent Decision Summary & Factors ---");

  const decisionSummary = buildDecisionSummary({
    intent: mockIntent,
    recommendation: mockCandidates[0],
    allProducts: getAllProducts(),
    candidates: mockCandidates,
    policyValidation: mockValidation,
    transactionState: "AWAITING_USER_APPROVAL"
  });

  assert(decisionSummary.merchantsEvaluated === 5, "Decision summary counts 5 demo merchants");
  assert(decisionSummary.productsEvaluated >= 48, "Decision summary counts 48+ catalog products");
  assert(decisionSummary.validCandidates > 0, "Decision summary counts valid candidate matches");
  assert(decisionSummary.selectedProduct.id === mockCandidates[0].product.id, "Decision summary matches selected product");
  assert(decisionSummary.budgetStatus === "WITHIN_BUDGET", "Budget status is WITHIN_BUDGET");
  assert(decisionSummary.inventoryStatus === "AVAILABLE" || decisionSummary.inventoryStatus === "LIMITED_AVAILABILITY", "Inventory status is verified");
  assert(decisionSummary.policyStatus === "VALID", "Policy status is VALID");
  assert(decisionSummary.decisionFactors.length >= 3, "Decision factors contain multiple positive/trade-off items");
  assert(decisionSummary.authorizationStatus === "PENDING_USER_APPROVAL", "Authorization status is PENDING_USER_APPROVAL before user confirmation");

  // -------------------------------------------------------------
  // GROUP 3: Guardrail Edge Cases (Budget, Inventory, Policy)
  // -------------------------------------------------------------
  console.log("\n--- GROUP 3: Guardrail Edge Cases (Budget, Inventory, Policy) ---");

  // 1. Budget Exceeded
  const highValidation = validateTransaction([mockCandidates[0].product], 500, 0); // budget 500 < product price 1999+
  const exceededSummary = buildDecisionSummary({
    intent: { productCategory: "Mechanical Keyboard", budget: 500 },
    recommendation: mockCandidates[0],
    allProducts: getAllProducts(),
    candidates: mockCandidates,
    policyValidation: highValidation,
    transactionState: "BLOCKED"
  });
  assert(exceededSummary.budgetStatus === "BUDGET_EXCEEDED", "Guardrail flags BUDGET_EXCEEDED when total > budget limit");

  // 2. Policy Blocked (e.g. excessive discount)
  const blockedValidation = validateTransaction([mockCandidates[0].product], 5000, 2000); // 2000 > 500 max discount
  assert(!blockedValidation.approved, "Policy engine blocks discount exceeding limit");
  const blockedActivities = buildAgentActivities({
    intent: mockIntent,
    recommendation: mockCandidates[0],
    candidateCount: mockCandidates.length,
    policyValidation: blockedValidation,
    transactionState: "BLOCKED",
    basketTotal: blockedValidation.finalAmount
  });
  assert(blockedActivities.some(a => a.type === "POLICY_VALIDATION" && a.status === "BLOCKED"), "Agent activities record POLICY_VALIDATION as BLOCKED");

  // -------------------------------------------------------------
  // GROUP 4: Trust Controls & Decision History
  // -------------------------------------------------------------
  console.log("\n--- GROUP 4: Trust Controls & Decision History ---");

  const trustControls = getStandardTrustControls();
  assert(trustControls.decisionControls.length >= 4, "Trust controls specify Decision Controls");
  assert(trustControls.paymentControls.length >= 4, "Trust controls specify Payment Controls");
  assert(trustControls.persistenceControls.length >= 3, "Trust controls specify Persistence Controls");

  let history = updateDecisionHistory(undefined, "Initial Recommendation", mockCandidates[0].product, "Recommended initial match");
  assert(history.length === 1 && history[0].stepNumber === 1, "Decision history initializes step 1");

  history = updateDecisionHistory(history, "User Requested Cheaper Option", mockCandidates[1].product, "Switched to cheaper alternative");
  assert(history.length === 2 && history[1].stepNumber === 2, "Decision history appends step 2");

  // -------------------------------------------------------------
  // GROUP 5: End-to-End Multi-Turn Session with Decision & Trust Layer
  // -------------------------------------------------------------
  console.log("\n--- GROUP 5: End-to-End Multi-Turn Session with Decision & Trust Layer ---");

  const sessId = "session-e2e-phase-5d";

  // Turn 1: Search
  const turn1 = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5000.", undefined, sessId);
  assert(turn1.success, "Turn 1: Workflow executes successfully");
  assert(turn1.agentActivities !== undefined && turn1.agentActivities.length > 0, "Turn 1: Returns agentActivities");
  assert(turn1.decisionSummary !== undefined, "Turn 1: Returns decisionSummary");
  assert(turn1.decisionSummary?.authorizationStatus === "PENDING_USER_APPROVAL", "Turn 1: Authorization is PENDING_USER_APPROVAL");
  assert(turn1.trustControls !== undefined, "Turn 1: Returns trustControls");
  assert(turn1.decisionHistory !== undefined && turn1.decisionHistory.length >= 1, "Turn 1: Returns decisionHistory");

  // Turn 2: Compare top 3
  const turn2 = await runAgentWorkflow("Compare the top 3.", undefined, sessId);
  assert(turn2.success, "Turn 2: Compare top 3 executes successfully");
  assert(turn2.productComparison !== undefined, "Turn 2: Retains comparison data");
  assert(turn2.decisionSummary !== undefined, "Turn 2: Generates decision summary for comparison");
  assert(Boolean(turn2.agentActivities?.some(a => a.type === "PRODUCT_COMPARISON")), "Turn 2: Agent activity records PRODUCT_COMPARISON");

  // Turn 3: Why this one?
  const turn3 = await runAgentWorkflow("Why this one?", undefined, sessId);
  assert(turn3.success, "Turn 3: 'Why this one?' executes successfully");
  assert(Boolean(turn3.decisionSummary?.decisionFactors.length !== undefined && turn3.decisionSummary.decisionFactors.length > 0), "Turn 3: Returns grounded decision factors");

  // Turn 4: User Override / Cheaper request
  const turn4 = await runAgentWorkflow("Show me a cheaper one.", undefined, sessId);
  assert(turn4.success, "Turn 4: Cheaper option request executes successfully");
  assert(Boolean(turn4.decisionHistory !== undefined && turn4.decisionHistory.length >= 2), "Turn 4: Decision history tracks user override progression");

  // Turn 5: User Confirmation & Payment Authorization
  const turn5 = await runAgentWorkflow("Okay, I'll take it.", undefined, sessId);
  assert(turn5.success, "Turn 5: Confirmation executes successfully");
  assert(turn5.transactionState === "USER_CONFIRMED", "Turn 5: Transaction state transitions to USER_CONFIRMED");
  assert(turn5.decisionSummary?.authorizationStatus === "USER_APPROVED", "Turn 5: Authorization status transitions to USER_APPROVED");
  assert(Boolean(turn5.agentActivities?.some(a => a.type === "USER_APPROVED" && a.status === "COMPLETED")), "Turn 5: Agent activity records USER_APPROVED as COMPLETED");

  // -------------------------------------------------------------
  // GROUP 6: Security & Invariant Verification
  // -------------------------------------------------------------
  console.log("\n--- GROUP 6: Security & Invariant Verification ---");

  // Verify authorization barrier: payment cannot happen before USER_CONFIRMED
  assert(turn1.transactionState !== "USER_CONFIRMED", "Fresh search NEVER bypasses user confirmation");
  assert(turn2.transactionState !== "USER_CONFIRMED", "Comparison mode NEVER bypasses user confirmation");
  assert(turn4.transactionState !== "USER_CONFIRMED", "Alternative selection NEVER bypasses user confirmation");
  assert(turn5.transactionState === "USER_CONFIRMED", "Explicit user confirmation correctly unlocks USER_CONFIRMED");

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`  PHASE 5D TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED (${Math.round((passCount / (passCount + failCount)) * 100)}%)`);
  console.log("=======================================================");

  if (failCount === 0) {
    console.log("🎉 ALL PHASE 5D VERIFICATION TESTS PASSED PERFECTLY!\n");
  } else {
    console.error(`💥 ${failCount} TESTS FAILED. Please review errors above.\n`);
    process.exit(1);
  }
}

runAllPhase5DTests().catch(err => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
