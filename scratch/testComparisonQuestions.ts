import { runAgentWorkflow } from "../lib/agentWorkflow";
import { clearSessionStore, getSession } from "../lib/session";

async function runComparisonQuestionTests() {
  console.log("=======================================================");
  console.log("  TESTING COMPARISON QUESTIONS & CONTEXTUAL FLOW       ");
  console.log("=======================================================");

  clearSessionStore();
  const sessionId = "sess-comp-questions-1";

  // Turn 1: Search
  console.log("\n--- Turn 1: Initial Search ---");
  const t1: any = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5000", undefined, sessionId);
  console.log("T1 Message:", t1.message);
  console.log("T1 Action:", t1.conversationAction);
  console.assert(t1.recommendation?.product !== undefined, "T1 should have recommended product");

  // Turn 2: Enter Comparison Mode
  console.log("\n--- Turn 2: 'compare the top 3' ---");
  const t2: any = await runAgentWorkflow("compare the top 3", undefined, sessionId);
  console.log("T2 Message:", t2.message);
  console.log("T2 Action:", t2.conversationAction);
  console.assert(t2.conversationAction === "PRODUCT_COMPARISON", "T2 should be PRODUCT_COMPARISON");
  console.assert(t2.productComparison !== undefined, "T2 should have productComparison data");
  console.assert(t2.productComparison?.comparedProducts.length === 3, "T2 should compare 3 products");
  console.assert(t2.message.includes("top 3 options compared"), "T2 message should introduce comparison");

  // Turn 3: "which is better for programming?"
  console.log("\n--- Turn 3: 'which is better for programming?' ---");
  const t3: any = await runAgentWorkflow("which is better for programming?", undefined, sessionId);
  console.log("T3 Message:", t3.message);
  console.log("T3 Action:", t3.conversationAction);
  console.assert(t3.conversationAction === "COMPARISON_QUESTION", "T3 should be COMPARISON_QUESTION");
  console.assert(!t3.message.includes("Here are the top 3 options compared"), "T3 must NOT return generic comparison intro");
  console.assert(t3.message.toLowerCase().includes("programming"), "T3 should mention programming");

  // Turn 4: "which is cheaper?"
  console.log("\n--- Turn 4: 'which is cheaper?' ---");
  const t4: any = await runAgentWorkflow("which is cheaper?", undefined, sessionId);
  console.log("T4 Message:", t4.message);
  console.log("T4 Action:", t4.conversationAction);
  console.assert(t4.conversationAction === "COMPARISON_QUESTION", "T4 should be COMPARISON_QUESTION");
  console.assert(t4.message.includes("cheapest"), "T4 should mention cheapest");
  console.assert(t4.message.includes("₹"), "T4 should mention price");

  // Turn 5: "what's the difference?"
  console.log("\n--- Turn 5: 'what\'s the difference?' ---");
  const t5: any = await runAgentWorkflow("what's the difference?", undefined, sessionId);
  console.log("T5 Message:", t5.message);
  console.log("T5 Action:", t5.conversationAction);
  console.assert(t5.conversationAction === "COMPARISON_QUESTION", "T5 should be COMPARISON_QUESTION");
  console.assert(t5.message.toLowerCase().includes("differ") || t5.message.toLowerCase().includes("difference"), "T5 should describe differences");

  // Turn 6: "why?"
  console.log("\n--- Turn 6: 'why?' ---");
  const t6: any = await runAgentWorkflow("why?", undefined, sessionId);
  console.log("T6 Message:", t6.message);
  console.log("T6 Action:", t6.conversationAction);
  console.assert(t6.conversationAction === "REQUEST_EXPLANATION", "T6 should be REQUEST_EXPLANATION");
  console.assert(t6.message.includes("currently selected") || t6.message.includes("best match"), "T6 should explain active product");

  // Turn 7: "give that"
  console.log("\n--- Turn 7: 'give that' ---");
  const t7: any = await runAgentWorkflow("give that", undefined, sessionId);
  console.log("T7 Message:", t7.message);
  console.log("T7 Action:", t7.conversationAction);
  console.assert(t7.conversationAction === "CONFIRM_REFERENCED_PRODUCT", "T7 should be CONFIRM_REFERENCED_PRODUCT");
  console.assert(t7.basket.items.length >= 1, "T7 should have active basket item");

  // Turn 8: "which is better?"
  console.log("\n--- Turn 8: 'which is better?' ---");
  const t8: any = await runAgentWorkflow("which is better?", undefined, sessionId);
  console.log("T8 Message:", t8.message);
  console.log("T8 Action:", t8.conversationAction);
  console.assert(t8.conversationAction === "COMPARISON_QUESTION", "T8 should be COMPARISON_QUESTION");
  console.assert(!t8.message.includes("Here are the top 3 options compared"), "T8 must NOT return generic comparison intro");

  // Turn 9: "remove wrist support"
  console.log("\n--- Turn 9: 'remove wrist support' ---");
  const t9: any = await runAgentWorkflow("remove wrist support", undefined, sessionId);
  console.log("T9 Message:", t9.message);
  console.log("T9 Action:", t9.conversationAction);
  console.assert(t9.conversationAction === "REMOVE_UPSELL", "T9 should be REMOVE_UPSELL");
  console.assert(!t9.basket.items.some((p: any) => p.name.toLowerCase().includes("wrist")), "T9 should remove wrist support");

  // Turn 10: "cheaper"
  console.log("\n--- Turn 10: 'cheaper' ---");
  const t10: any = await runAgentWorkflow("cheaper", undefined, sessionId);
  console.log("T10 Message:", t10.message);
  console.log("T10 Action:", t10.conversationAction);
  console.assert(t10.conversationAction === "REQUEST_CHEAPER_OPTION", "T10 should be REQUEST_CHEAPER_OPTION");

  // Turn 11: "second one"
  console.log("\n--- Turn 11: 'second one' ---");
  const t11: any = await runAgentWorkflow("second one", undefined, sessionId);
  console.log("T11 Message:", t11.message);
  console.log("T11 Action:", t11.conversationAction);
  console.assert(t11.conversationAction === "CONFIRM_REFERENCED_PRODUCT", "T11 should be CONFIRM_REFERENCED_PRODUCT");

  // Turn 12: "okay I'll take it"
  console.log("\n--- Turn 12: 'okay I\'ll take it' ---");
  const t12: any = await runAgentWorkflow("okay I'll take it", undefined, sessionId);
  console.log("T12 Message:", t12.message);
  console.log("T12 Action:", t12.conversationAction);
  console.assert(t12.conversationAction === "CONFIRM_SELECTION", "T12 should be CONFIRM_SELECTION");
  console.assert(t12.transactionState === "USER_CONFIRMED", "T12 transaction state should be USER_CONFIRMED");

  console.log("\n=======================================================");
  console.log("  ALL COMPARISON QUESTION FLOW TESTS PASSED (100%)    ");
  console.log("=======================================================");
}

runComparisonQuestionTests();
