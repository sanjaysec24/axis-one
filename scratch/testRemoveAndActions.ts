import { runAgentWorkflow } from "../lib/agentWorkflow";
import { clearSessionStore, getSession } from "../lib/session";
import { WorkflowSuccessResponse } from "../lib/types";

async function runVerification() {
  console.log("=======================================================");
  console.log("  AXIS ONE — ACTION EXECUTION & REMOVE TEST SUITE");
  console.log("=======================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, errorDetail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (errorDetail) console.error("   Detail:", errorDetail);
      failed++;
    }
  }

  // TEST 1: Exact Bug Scenario - remove wrist support
  console.log("--- TEST 1: Exact Remove Bug Scenario ---");
  clearSessionStore();
  const s1 = "sess-remove-1";
  const r1_1 = (await runAgentWorkflow("I need a mechanical keyboard under ₹5000", undefined, s1)) as WorkflowSuccessResponse;
  
  assert(r1_1.basket?.items.length === 2, "Turn 1: Initial basket has main item + upsell accessory", r1_1.basket?.items.map((p: any) => p.name));
  assert(r1_1.basket?.finalAmount === 1998, "Turn 1: Initial basket total is ₹1998", r1_1.basket?.finalAmount);
  
  const r1_2 = (await runAgentWorkflow("remove wrist support", undefined, s1)) as WorkflowSuccessResponse;
  assert(r1_2.conversationAction === "REMOVE_UPSELL", "Turn 2: Classified as REMOVE_UPSELL", r1_2.conversationAction);
  assert(r1_2.basket?.items.length === 1, "Turn 2: Basket length is exactly 1", r1_2.basket?.items.length);
  assert(r1_2.basket?.items[0].name === "Nexora Custom Mechanical Number Pad", "Turn 2: Main product retained", r1_2.basket?.items[0].name);
  assert(r1_2.basket?.finalAmount === 1599, "Turn 2: Basket total updated to ₹1599 (NOT ₹1998)", r1_2.basket?.finalAmount);
  assert(!r1_2.basket?.items.some((p: any) => p.name.toLowerCase().includes("wrist")), "Turn 2: Wrist support completely removed from basket");
  assert(r1_2.upsell === null, "Turn 2: Upsell is null");
  
  // Verify Session Store Read-Back
  const persisted1 = getSession(s1);
  assert(persisted1?.currentBasket.length === 1, "Turn 2: Persisted session basket has length 1");
  assert(persisted1?.currentBasket[0].price === 1599, "Turn 2: Persisted session basket item is ₹1599");
  assert(persisted1?.currentUpsell === null, "Turn 2: Persisted currentUpsell is null");

  // TEST 2: Contextual Remove ("remove it")
  console.log("\n--- TEST 2: Contextual Remove ('remove it') ---");
  clearSessionStore();
  const s2 = "sess-remove-2";
  await runAgentWorkflow("I need a mechanical keyboard under ₹5000", undefined, s2);
  const r2_2 = (await runAgentWorkflow("remove it", undefined, s2)) as WorkflowSuccessResponse;
  assert(r2_2.conversationAction === "REMOVE_UPSELL", "Turn 2: 'remove it' routes to REMOVE_UPSELL", r2_2.conversationAction);
  assert(r2_2.basket?.items.length === 1, "Turn 2: 'remove it' leaves only 1 item in basket", r2_2.basket?.items.length);
  assert(r2_2.basket?.finalAmount === 1599, "Turn 2: 'remove it' updates total to ₹1599", r2_2.basket?.finalAmount);

  // TEST 3: Cheaper Option Switch
  console.log("\n--- TEST 3: Cheaper Option Switch ---");
  clearSessionStore();
  const s3 = "sess-cheaper-1";
  await runAgentWorkflow("I need a wireless mechanical keyboard for gaming under 5000", undefined, s3);
  const r3_2 = (await runAgentWorkflow("cheaper", undefined, s3)) as WorkflowSuccessResponse;
  assert(r3_2.conversationAction === "REQUEST_CHEAPER_OPTION", "Turn 2: 'cheaper' routes to REQUEST_CHEAPER_OPTION");
  assert(r3_2.recommendation?.product.price < 4799, "Turn 2: Active product is cheaper than original KeyForge Air", r3_2.recommendation?.product.price);
  assert(r3_2.recommendation?.product.name === "Nexora Custom Mechanical Number Pad", "Turn 2: Cheaper product is Nexora Number Pad", r3_2.recommendation?.product.name);

  // TEST 4: Comparison & Ordinal Selection & Why
  console.log("\n--- TEST 4: Comparison, Ordinal Selection & Why ---");
  clearSessionStore();
  const s4 = "sess-comp-1";
  await runAgentWorkflow("I need a mechanical keyboard under ₹5000", undefined, s4);
  const r4_2 = (await runAgentWorkflow("compare the top 3", undefined, s4)) as WorkflowSuccessResponse;
  assert(r4_2.conversationAction === "PRODUCT_COMPARISON", "Turn 2: Routes to PRODUCT_COMPARISON");
  assert(r4_2.productComparison?.comparedProducts.length === 3, "Turn 2: Compares 3 products", r4_2.productComparison?.comparedProducts.length);
  
  const secondCandidate = r4_2.productComparison?.comparedProducts[1].product;
  const r4_3 = (await runAgentWorkflow("second one", undefined, s4)) as WorkflowSuccessResponse;
  assert(r4_3.conversationAction === "CONFIRM_REFERENCED_PRODUCT", "Turn 3: 'second one' routes to CONFIRM_REFERENCED_PRODUCT");
  assert(r4_3.recommendation?.product.id === secondCandidate?.id, "Turn 3: Active product switched to candidate #2", r4_3.recommendation?.product.name);

  const r4_4 = (await runAgentWorkflow("why?", undefined, s4)) as WorkflowSuccessResponse;
  assert(r4_4.conversationAction === "REQUEST_EXPLANATION", "Turn 4: 'why?' routes to REQUEST_EXPLANATION");
  assert(r4_4.recommendation?.product.id === secondCandidate?.id, "Turn 4: Explanation is grounded on the selected candidate #2");

  // TEST 5: Okayyy & Confirmation
  console.log("\n--- TEST 5: Okayyy & Authorization ---");
  clearSessionStore();
  const s5 = "sess-ok-1";
  await runAgentWorkflow("I need a mechanical keyboard under ₹5000", undefined, s5);
  const r5_2 = (await runAgentWorkflow("okayyy", undefined, s5)) as WorkflowSuccessResponse;
  assert(r5_2.conversationAction === "CONFIRM_SELECTION", "Turn 2: 'okayyy' routes to CONFIRM_SELECTION");
  assert(r5_2.transactionState === "USER_CONFIRMED", "Turn 2: Transaction state is USER_CONFIRMED");
  assert(r5_2.decisionSummary?.authorizationStatus === "USER_APPROVED", "Turn 2: Authorization status is USER_APPROVED");

  // TEST 6: Wait & Pause
  console.log("\n--- TEST 6: Wait & Pause ---");
  clearSessionStore();
  const s6 = "sess-wait-1";
  await runAgentWorkflow("I need a mechanical keyboard under ₹5000", undefined, s6);
  const r6_2 = (await runAgentWorkflow("wait", undefined, s6)) as WorkflowSuccessResponse;
  assert(r6_2.conversationAction === "KEEP_CURRENT_SELECTION", "Turn 2: 'wait' routes to KEEP_CURRENT_SELECTION");
  assert(r6_2.basket?.items.length === 2, "Turn 2: 'wait' retains basket items without resetting");
  assert(!r6_2.message.includes("updated your selection"), "Turn 2: 'wait' message does not say 'I have updated your selection'");

  console.log("\n=======================================================");
  console.log(`  TEST RESULTS: ${passed} / ${passed + failed} PASSED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
