import { runAgentWorkflow } from "../lib/agentWorkflow";
import { routeConversationalMessage } from "../lib/conversationRouter";
import { resolveComparisonCandidates, buildProductComparison } from "../lib/productComparison";
import { getAllProducts, searchProducts } from "../lib/catalog";
import { rankProducts } from "../lib/ranking";
import { clearSessionStore, saveSession } from "../lib/session";
import { CommerceConversationContext, RankedResult, UserIntent } from "../lib/types";

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

async function runAllPhase5CTests() {
  console.log("=======================================================");
  console.log("  AXIS ONE — PHASE 5C AUTOMATED TEST SUITE (25+ TESTS)");
  console.log("=======================================================\n");

  clearSessionStore();

  // -------------------------------------------------------------
  // GROUP 1: Fast Conversational Router Comparison Triggers
  // -------------------------------------------------------------
  console.log("--- GROUP 1: Conversational Router Comparison Triggers ---");
  
  const r1 = routeConversationalMessage("compare");
  assert(r1.action === "PRODUCT_COMPARISON", "Router detects 'compare' as PRODUCT_COMPARISON");

  const r2 = routeConversationalMessage("compare top 3");
  assert(r2.action === "PRODUCT_COMPARISON", "Router detects 'compare top 3' as PRODUCT_COMPARISON");

  const r3 = routeConversationalMessage("compare the first and second");
  assert(r3.action === "PRODUCT_COMPARISON", "Router detects 'compare the first and second' as PRODUCT_COMPARISON");

  const r4 = routeConversationalMessage("what's the difference?");
  assert(r4.action === "PRODUCT_COMPARISON", "Router detects 'what's the difference?' as PRODUCT_COMPARISON");

  const r5 = routeConversationalMessage("which is better?");
  assert(r5.action === "PRODUCT_COMPARISON", "Router detects 'which is better?' as PRODUCT_COMPARISON");

  const r6 = routeConversationalMessage("which is cheaper?");
  assert(r6.action === "PRODUCT_COMPARISON", "Router detects 'which is cheaper?' as PRODUCT_COMPARISON");

  const r7 = routeConversationalMessage("which has better battery?");
  assert(r7.action === "PRODUCT_COMPARISON", "Router detects 'which has better battery?' as PRODUCT_COMPARISON");

  const r8 = routeConversationalMessage("which is better for programming?");
  assert(r8.action === "PRODUCT_COMPARISON", "Router detects 'which is better for programming?' as PRODUCT_COMPARISON");

  const r9 = routeConversationalMessage("show me the differences");
  assert(r9.action === "PRODUCT_COMPARISON", "Router detects 'show me the differences' as PRODUCT_COMPARISON");

  const r10 = routeConversationalMessage("compare these two");
  assert(r10.action === "PRODUCT_COMPARISON", "Router detects 'compare these two' as PRODUCT_COMPARISON");

  // -------------------------------------------------------------
  // GROUP 2: Context-Aware Candidate Resolution Engine
  // -------------------------------------------------------------
  console.log("\n--- GROUP 2: Context-Aware Candidate Resolution Engine ---");

  const mockIntent: UserIntent = { productCategory: "Mechanical Keyboard", budget: 5000, wireless: true };
  const mockCandidates = rankProducts(searchProducts(mockIntent), mockIntent);
  const mockContext: CommerceConversationContext = {
    sessionId: "test-sess-5c",
    originalIntent: mockIntent,
    latestIntent: mockIntent,
    currentBasket: [mockCandidates[0].product],
    recommendedProduct: mockCandidates[0].product,
    previousProduct: mockCandidates[1].product,
    candidatePool: mockCandidates,
    transactionState: "EXPLORING",
    recentMessages: []
  };

  const resTop3 = resolveComparisonCandidates("compare top 3", mockContext);
  assert(resTop3 !== null && resTop3.candidates.length === 3, "Resolves 'compare top 3' to exactly 3 candidates");

  const resFirstSecond = resolveComparisonCandidates("compare the first and second", mockContext);
  assert(
    resFirstSecond !== null && 
    resFirstSecond.candidates.length === 2 &&
    resFirstSecond.candidates[0].product.id === mockCandidates[0].product.id &&
    resFirstSecond.candidates[1].product.id === mockCandidates[1].product.id,
    "Resolves 'compare the first and second' to candidates[0] and candidates[1]"
  );

  const resPrevious = resolveComparisonCandidates("compare with previous one", mockContext);
  assert(
    resPrevious !== null &&
    resPrevious.candidates.some(c => c.product.id === mockCandidates[0].product.id) &&
    resPrevious.candidates.some(c => c.product.id === mockCandidates[1].product.id),
    "Resolves 'compare with previous one' using previousProduct from session"
  );

  const resCheaper = resolveComparisonCandidates("compare the cheaper one", mockContext);
  assert(
    resCheaper !== null && resCheaper.candidates.length === 2,
    "Resolves 'compare the cheaper one' against current recommendation"
  );

  const resExplicit = resolveComparisonCandidates("compare NovaKey and KeyForge", mockContext);
  assert(
    resExplicit !== null && resExplicit.candidates.length >= 2,
    "Resolves explicit product names 'NovaKey and KeyForge'"
  );

  // -------------------------------------------------------------
  // GROUP 3: Deterministic Difference & Comparison Engine
  // -------------------------------------------------------------
  console.log("\n--- GROUP 3: Deterministic Difference & Comparison Engine ---");

  const comparisonData = buildProductComparison(mockCandidates.slice(0, 3), mockIntent);
  assert(comparisonData.comparedProducts.length === 3, "Comparison data holds 3 compared products");
  assert(comparisonData.bestOverall !== undefined, "Comparison data identifies bestOverall product");
  assert(comparisonData.cheapest !== undefined, "Comparison data identifies cheapest product");
  assert(comparisonData.bestWarranty !== undefined, "Comparison data identifies bestWarranty product");
  assert(comparisonData.differences.length > 0, "Comparison data calculates deterministic differences");
  
  const priceDiff = comparisonData.differences.find(d => d.type === "PRICE");
  assert(priceDiff !== undefined && priceDiff.headline.includes("cheaper"), "Price difference is deterministically computed");

  const warDiff = comparisonData.differences.find(d => d.type === "WARRANTY");
  assert(warDiff !== undefined && warDiff.headline.includes("warranty"), "Warranty difference is deterministically computed");

  assert(comparisonData.attributeRows.some(r => r.attributeKey === "price"), "Attribute row includes Price");
  assert(comparisonData.attributeRows.some(r => r.attributeKey === "batteryLife"), "Attribute row includes Battery Life");
  assert(comparisonData.attributeRows.some(r => r.attributeKey === "warranty"), "Attribute row includes Warranty");

  // -------------------------------------------------------------
  // GROUP 4: Selection & Ordinal Resolution from Comparison
  // -------------------------------------------------------------
  console.log("\n--- GROUP 4: Selection & Ordinal Resolution from Comparison ---");

  const sel1 = routeConversationalMessage("choose the first one");
  assert(sel1.action === "CONFIRM_REFERENCED_PRODUCT" && sel1.targetCandidateIndex === 0, "Routes 'choose the first one' to index 0");

  const sel2 = routeConversationalMessage("select the second one");
  assert(sel2.action === "CONFIRM_REFERENCED_PRODUCT" && sel2.targetCandidateIndex === 1, "Routes 'select the second one' to index 1");

  const selCheapest = routeConversationalMessage("I'll go with the cheaper one");
  assert(selCheapest.action === "REQUEST_CHEAPER_OPTION", "Routes 'I'll go with the cheaper one' to REQUEST_CHEAPER_OPTION");

  const selByName = routeConversationalMessage("select NovaKey");
  assert(selByName.action === "CONFIRM_REFERENCED_PRODUCT" && selByName.targetProductId !== undefined, "Routes 'select NovaKey' with targetProductId");

  // -------------------------------------------------------------
  // GROUP 5: Edge Cases (Single/Zero Products & Ambiguity)
  // -------------------------------------------------------------
  console.log("\n--- GROUP 5: Edge Cases (Single/Zero Products & Ambiguity) ---");

  // Empty comparison query
  const emptyComparison = buildProductComparison([], { productCategory: "UnknownCategory" });
  assert(emptyComparison.comparedProducts.length === 0, "Zero products returns empty comparison without crash");
  assert(emptyComparison.groundedExplanation.includes("No comparable products"), "Empty comparison produces informative fallback");

  // -------------------------------------------------------------
  // GROUP 6: Strict Zero-Hallucination Grounding Test
  // -------------------------------------------------------------
  console.log("\n--- GROUP 6: Strict Zero-Hallucination Grounding Test ---");

  // Product without battery life in catalog
  const wiredProducts = getAllProducts().filter(p => !p.batteryLife);
  assert(wiredProducts.length > 0, "Catalog has wired products without battery life");

  const wiredComparison = buildProductComparison(rankProducts(wiredProducts.slice(0, 2), { productCategory: "Keyboard" }), { productCategory: "Keyboard" });
  const batRow = wiredComparison.attributeRows.find(r => r.attributeKey === "batteryLife");
  assert(batRow !== undefined, "Battery life row exists in matrix");
  
  const wiredCell = batRow ? batRow.values[wiredProducts[0].id] : null;
  assert(
    wiredCell !== null && (wiredCell.displayValue === "Not specified in catalog" || wiredCell.status === "unavailable"),
    "Wired product battery life is marked 'Not specified in catalog', NOT hallucinated with fake hours"
  );

  // -------------------------------------------------------------
  // GROUP 7: End-to-End Multi-Turn Conversational Session
  // -------------------------------------------------------------
  console.log("\n--- GROUP 7: End-to-End Multi-Turn Conversational Session ---");

  const sessId = "session-e2e-phase-5c";

  // Turn 1: Search
  const turn1 = await runAgentWorkflow("I need a wireless mechanical keyboard under ₹5000.", undefined, sessId);
  assert(turn1.success, "Turn 1: Search succeeds");
  assert(turn1.recommendation !== undefined, "Turn 1: Recommendation created");

  // Turn 2: Compare top 3
  const turn2 = await runAgentWorkflow("Compare the top 3.", undefined, sessId);
  assert(turn2.success, "Turn 2: Compare top 3 succeeds");
  assert(turn2.productComparison !== undefined, "Turn 2: productComparison data returned");
  assert(turn2.productComparison?.comparedProducts.length === 3, "Turn 2: Compares exactly 3 products");

  // Turn 3: Which is better for programming?
  const turn3 = await runAgentWorkflow("Which is better for programming?", undefined, sessId);
  assert(turn3.success, "Turn 3: 'Which is better for programming?' succeeds");
  assert(turn3.productComparison !== undefined, "Turn 3: Retains comparison data");

  // Turn 4: Which is cheaper?
  const turn4 = await runAgentWorkflow("Which is cheaper?", undefined, sessId);
  assert(turn4.success, "Turn 4: 'Which is cheaper?' succeeds");
  assert(turn4.productComparison?.cheapest !== undefined, "Turn 4: Identifies cheapest option");

  // Turn 5: Select the first one
  const turn5 = await runAgentWorkflow("I'll take the first one.", undefined, sessId);
  assert(turn5.success, "Turn 5: 'I'll take the first one' succeeds");
  assert(turn5.transactionState === "AWAITING_USER_APPROVAL", "Turn 5: State is AWAITING_USER_APPROVAL (not auto-confirmed)");

  // Turn 6: Confirm
  const turn6 = await runAgentWorkflow("Okay, I'll take it.", undefined, sessId);
  assert(turn6.success, "Turn 6: Explicit confirmation succeeds");
  assert(turn6.transactionState === "USER_CONFIRMED", "Turn 6: State transitions to USER_CONFIRMED");

  // -------------------------------------------------------------
  // GROUP 8: Invariant Protection (Razorpay & Firebase Safety)
  // -------------------------------------------------------------
  console.log("\n--- GROUP 8: Invariant Protection (Razorpay & Firebase Safety) ---");
  assert(turn5.transactionState !== "USER_CONFIRMED", "Comparison selection NEVER auto-triggers USER_CONFIRMED");
  assert(turn5.transactionState !== "PAYMENT_PENDING", "Comparison selection NEVER auto-initiates Razorpay payment");
  assert(turn6.transactionState === "USER_CONFIRMED", "Explicit user confirmation is mandatory before payment unlock");

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`  PHASE 5C TEST RESULTS: ${passCount} / ${passCount + failCount} PASSED (${Math.round((passCount / (passCount + failCount)) * 100)}%)`);
  console.log("=======================================================");

  if (failCount === 0) {
    console.log("🎉 ALL PHASE 5C VERIFICATION TESTS PASSED PERFECTLY!\n");
  } else {
    console.error(`💥 ${failCount} TESTS FAILED. Please review errors above.\n`);
    process.exit(1);
  }
}

runAllPhase5CTests().catch(err => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
