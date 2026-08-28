import { runAgentWorkflow } from "../lib/agentWorkflow";

// Ensure environment variables are defined so key validation checks pass
process.env.GEMINI_API_KEY = "dummy_key_for_testing";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret_for_unit_testing";

let mockAction: any = null;
let mockParams: any = {};
let mockGeminiFail = false;

// Mock global fetch to intercept Gemini API requests
const originalFetch = global.fetch;
global.fetch = async (url: any, options: any) => {
  const urlStr = String(url);
  
  if (urlStr.includes("generativelanguage.googleapis.com")) {
    if (mockGeminiFail) {
      throw new Error("[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent: [429 Too Many Requests] Quota exceeded for Gemini generateContent requests.");
    }
    let body: any = {};
    try {
      body = JSON.parse(options.body || "{}");
    } catch (e) {}

    const contentsText = JSON.stringify(body.contents || []);
    const systemInstruction = body.systemInstruction?.parts?.[0]?.text || "";
    
    let textResponse = "";

    if (systemInstruction.includes("intent extraction")) {
      if (contentsText.includes("Apex Pro X") || contentsText.includes("6,999")) {
        textResponse = JSON.stringify({
          productCategory: "Mechanical Keyboard",
          budget: 5000,
          useCase: "requesting discount"
        });
      } else {
        textResponse = JSON.stringify({
          productCategory: "Mechanical Keyboard",
          budget: 5000,
          wireless: true,
          batteryPriority: "high",
          useCase: "programming"
        });
      }
    } 
    
    else if (systemInstruction.includes("classification")) {
      textResponse = JSON.stringify({
        action: mockAction || "GENERAL_FOLLOW_UP",
        ...mockParams
      });
    } 
    
    else {
      // Explanation layer
      const promptText = body.contents?.[0]?.parts?.[0]?.text || "";
      let parsedContext: any = null;
      try {
        const jsonMatch = promptText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContext = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {}

      let summary = "NovaKey K75 is recommended.";
      if (parsedContext) {
        if (parsedContext.previousProduct && parsedContext.previousProduct.name === "SwiftType Travel") {
          summary = `ClickyLite Wired was recommended because you explicitly requested a cheaper alternative after reducing your budget to ₹3,500. At ₹1,899, it is cheaper than SwiftType Travel at ₹2,999. However, this recommendation involves a trade-off: ClickyLite Wired is wired, while your original request preferred a wireless keyboard.`;
        }
      }

      textResponse = JSON.stringify({
        recommendationExplanation: "NovaKey K75 matches your request because it is wireless, provides 80 hours of battery life, is suited to programming and productivity, and costs ₹4,499, staying within your ₹5,000 budget.",
        upsellExplanation: contentsText.includes("null") 
          ? "No relevant complementary product was added."
          : "ErgoRest Wrist Support complements the keyboard by improving comfort during long programming sessions. At ₹399, it fits within your remaining budget.",
        budgetExplanation: "The keyboard costs ₹4,499, staying within your budget.",
        policyExplanation: "The proposed basket passed inventory, budget, transaction amount, and other deterministic merchant policy checks.",
        summary
      });
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: textResponse
                }
              ]
            }
          }
        ]
      })
    } as any;
  }

  return originalFetch(url, options);
};

async function executeTests() {
  console.log("=== STARTING PHASE 2.4 CONVERSATIONAL TESTS ===");

  // --------------------------------------------------
  // TEST 1 — INITIAL REQUEST
  // --------------------------------------------------
  console.log("\n--- TEST 1: Initial Keyboard Request ---");
  mockAction = "NEW_SEARCH";
  const t1Res = await runAgentWorkflow(
    "I need a wireless mechanical keyboard for programming under ₹5,000 with good battery life."
  );

  if (!t1Res.success) {
    console.error("Test 1 Failed: Workflow did not return success.", t1Res);
    process.exit(1);
  }

  const { sessionId, recommendation, upsell, basket, transactionState, explanation } = t1Res;
  console.log("Session ID generated:", sessionId);
  console.log("Recommendation:", recommendation.product.name, `(₹${recommendation.product.price})`);
  console.log("Upsell:", upsell ? `${upsell.recommendedProduct.name} (₹${upsell.recommendedProduct.price})` : "null");
  console.log("Basket Total:", basket.finalAmount);
  console.log("Transaction State:", transactionState);
  console.log("Explanation recommendations:", explanation.recommendationExplanation);
  console.log("Explanation upsell:", explanation.upsellExplanation);
  console.log("Explanation budget:", explanation.budgetExplanation);

  // Assertions for Test 1
  if (recommendation.product.id !== "novakey-k75") {
    console.error("Test 1 Failure: Must recommend NovaKey K75");
    process.exit(1);
  }
  if (!upsell || upsell.recommendedProduct.id !== "ergorest-wrist-support") {
    console.error("Test 1 Failure: Upsell must be ErgoRest Wrist Support");
    process.exit(1);
  }
  if (basket.finalAmount !== 4898) {
    console.error("Test 1 Failure: Basket amount must be 4898");
    process.exit(1);
  }
  if (transactionState !== "AWAITING_USER_APPROVAL") {
    console.error("Test 1 Failure: Transaction state must be AWAITING_USER_APPROVAL");
    process.exit(1);
  }
  console.log(">> TEST 1 PASSED!");

  // --------------------------------------------------
  // TEST 2 — REMOVE UPSELL
  // --------------------------------------------------
  console.log("\n--- TEST 2: Remove Upsell ---");
  mockAction = "REMOVE_UPSELL";
  mockParams = {};
  
  const t2Res = await runAgentWorkflow(
    "I don't want the wrist rest.",
    undefined,
    sessionId
  );

  if (!t2Res.success) {
    console.error("Test 2 Failed: Workflow did not return success.", t2Res);
    process.exit(1);
  }

  console.log("Conversation Action:", t2Res.conversationAction);
  console.log("Recommendation:", t2Res.recommendation.product.name);
  console.log("Upsell:", t2Res.upsell ? t2Res.upsell.recommendedProduct.name : "null");
  console.log("Basket Total:", t2Res.basket.finalAmount);
  console.log("Transaction State:", t2Res.transactionState);

  // Assertions for Test 2
  if (t2Res.conversationAction !== "REMOVE_UPSELL") {
    console.error("Test 2 Failure: Action should be REMOVE_UPSELL");
    process.exit(1);
  }
  if (t2Res.upsell !== null) {
    console.error("Test 2 Failure: Upsell should be null");
    process.exit(1);
  }
  if (t2Res.basket.finalAmount !== 4499) {
    console.error("Test 2 Failure: Basket total should be 4499 (only keyboard)");
    process.exit(1);
  }
  if (t2Res.transactionState !== "AWAITING_USER_APPROVAL") {
    console.error("Test 2 Failure: Transaction state should be AWAITING_USER_APPROVAL");
    process.exit(1);
  }
  console.log(">> TEST 2 PASSED!");

  // --------------------------------------------------
  // TEST 3 — CHANGE BUDGET
  // --------------------------------------------------
  console.log("\n--- TEST 3: Change Budget ---");
  mockAction = "CHANGE_BUDGET";
  mockParams = { budget: 4000 };

  const t3Res = await runAgentWorkflow(
    "My budget is ₹4,000.",
    undefined,
    sessionId
  );

  if (!t3Res.success) {
    console.error("Test 3 Failed: Workflow did not return success.", t3Res);
    process.exit(1);
  }

  console.log("Conversation Action:", t3Res.conversationAction);
  console.log("New Recommendation:", t3Res.recommendation.product.name, `(₹${t3Res.recommendation.product.price})`);
  console.log("Basket Total:", t3Res.basket.finalAmount);
  console.log("Transaction State:", t3Res.transactionState);

  // Assertions for Test 3
  if (t3Res.conversationAction !== "CHANGE_BUDGET") {
    console.error("Test 3 Failure: Action should be CHANGE_BUDGET");
    process.exit(1);
  }
  if (t3Res.recommendation.product.price > 4000) {
    console.error("Test 3 Failure: Product price should be within budget limit (<= 4000)");
    process.exit(1);
  }
  console.log(">> TEST 3 PASSED!");

  // --------------------------------------------------
  // TEST 4 — CHEAPER OPTION
  // --------------------------------------------------
  console.log("\n--- TEST 4: Cheaper Option ---");
  
  mockAction = "NEW_SEARCH";
  await runAgentWorkflow("I need keyboard under 5000", undefined, sessionId);

  mockAction = "REQUEST_CHEAPER_OPTION";
  mockParams = {};

  const t4Res = await runAgentWorkflow(
    "Show me something cheaper.",
    undefined,
    sessionId
  );

  if (!t4Res.success) {
    console.error("Test 4 Failed: Workflow did not return success.", t4Res);
    process.exit(1);
  }

  console.log("Conversation Action:", t4Res.conversationAction);
  console.log("Cheaper Recommendation:", t4Res.recommendation.product.name, `(₹${t4Res.recommendation.product.price})`);

  // Assertions for Test 4
  if (t4Res.conversationAction !== "REQUEST_CHEAPER_OPTION" && t4Res.conversationAction !== "REQUEST_CHEAPER") {
    console.error("Test 4 Failure: Action should be REQUEST_CHEAPER_OPTION");
    process.exit(1);
  }
  if (t4Res.recommendation.product.price >= 4499) {
    console.error("Test 4 Failure: Recommended price should be strictly less than 4499");
    process.exit(1);
  }
  console.log(">> TEST 4 PASSED!");

  // --------------------------------------------------
  // TEST 5 — EXPLANATION
  // --------------------------------------------------
  console.log("\n--- TEST 5: Request Explanation ---");
  mockAction = "REQUEST_EXPLANATION";
  mockParams = {};

  const t5Res = await runAgentWorkflow(
    "Why did you choose this?",
    undefined,
    sessionId
  );

  if (!t5Res.success) {
    console.error("Test 5 Failed: Workflow did not return success.", t5Res);
    process.exit(1);
  }

  console.log("Conversation Action:", t5Res.conversationAction);
  console.log("Explanation recommendations:", t5Res.explanation.recommendationExplanation);
  console.log("Explanation summary:", t5Res.explanation.summary);

  // Assertions for Test 5
  if (t5Res.conversationAction !== "REQUEST_EXPLANATION") {
    console.error("Test 5 Failure: Action should be REQUEST_EXPLANATION");
    process.exit(1);
  }
  console.log(">> TEST 5 PASSED!");

  // --------------------------------------------------
  // TEST 6 — USER CONFIRMATION
  // --------------------------------------------------
  console.log("\n--- TEST 6: User Confirmation ---");
  mockAction = "CONFIRM_SELECTION";
  mockParams = {};

  const t6Res = await runAgentWorkflow(
    "Okay, I'll take it.",
    undefined,
    sessionId
  );

  if (!t6Res.success) {
    console.error("Test 6 Failed: Workflow did not return success.", t6Res);
    process.exit(1);
  }

  console.log("Conversation Action:", t6Res.conversationAction);
  console.log("Transaction State:", t6Res.transactionState);
  
  // Find USER_APPROVED event in audit trail
  const userApprovedEvent = t6Res.auditTrail.find(evt => evt.eventType === "USER_APPROVED");
  console.log("Audit Event 'USER_APPROVED' recorded:", !!userApprovedEvent);
  if (userApprovedEvent) {
    console.log("Audit event summary:", userApprovedEvent.summary);
    console.log("Audit event details:", userApprovedEvent.details);
  }

  // Assertions for Test 6
  if (t6Res.conversationAction !== "CONFIRM_SELECTION") {
    console.error("Test 6 Failure: Action should be CONFIRM_SELECTION");
    process.exit(1);
  }
  if (t6Res.transactionState !== "USER_CONFIRMED") {
    console.error("Test 6 Failure: State should be USER_CONFIRMED");
    process.exit(1);
  }
  if (!userApprovedEvent) {
    console.error("Test 6 Failure: USER_APPROVED event must be recorded");
    process.exit(1);
  }
  console.log(">> TEST 6 PASSED!");

  // --------------------------------------------------
  // TEST 7 — EXPLANATION AND PRODUCT COMPARISON BUG FIX
  // --------------------------------------------------
  console.log("\n--- TEST 7: Explanations, Tradeoffs, and Product Comparisons ---");
  
  // A. Start fresh search
  mockAction = "NEW_SEARCH";
  mockParams = {};
  const t7aRes = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5,000.");
  if (!t7aRes.success) { console.error("Test 7A Failed"); process.exit(1); }
  const t7SessionId = t7aRes.sessionId;
  console.log(" T7 A. Fresh Search Recommendation:", t7aRes.recommendation.product.name, `(₹${t7aRes.recommendation.product.price})`);

  // B. Change budget to 3500
  mockAction = "CHANGE_BUDGET";
  mockParams = { budget: 3500 };
  const t7bRes = await runAgentWorkflow("My budget is only ₹3500.", undefined, t7SessionId);
  if (!t7bRes.success) { console.error("Test 7B Failed"); process.exit(1); }
  console.log(" T7 B. Budget Change Recommendation:", t7bRes.recommendation.product.name, `(₹${t7bRes.recommendation.product.price})`);

  // C. Cheaper option
  mockAction = "REQUEST_CHEAPER_OPTION";
  mockParams = {};
  const t7cRes = await runAgentWorkflow("Is there anything cheaper?", undefined, t7SessionId);
  if (!t7cRes.success) { console.error("Test 7C Failed"); process.exit(1); }
  console.log(" T7 C. Cheaper Alternative:", t7cRes.recommendation.product.name, `(₹${t7cRes.recommendation.product.price})`);
  
  if (t7cRes.recommendation.product.id !== "clickylite-wired") {
    console.error("Test 7 Failure: Cheaper product should be ClickyLite Wired (₹1899)");
    process.exit(1);
  }

  // D. Ask "Why did you recommend this?"
  mockAction = "REQUEST_EXPLANATION";
  mockParams = {};
  const t7dRes = await runAgentWorkflow("Why did you recommend this?", undefined, t7SessionId);
  if (!t7dRes.success) { console.error("Test 7D Failed"); process.exit(1); }
  console.log(" T7 D. Explanation Action:", t7dRes.conversationAction);
  console.log(" T7 D. Recommendation remains ClickyLite Wired:", t7dRes.recommendation.product.name === "ClickyLite Wired");
  console.log(" T7 D. Basket remains unchanged:", t7dRes.basket.items.length === t7cRes.basket.items.length);
  console.log(" T7 D. Transaction state remains unchanged:", t7dRes.transactionState === t7cRes.transactionState);
  console.log(" T7 D. Explanation Summary:", t7dRes.explanation.summary);

  if (t7dRes.conversationAction !== "REQUEST_EXPLANATION") {
    console.error("Test 7 Failure: Action should be REQUEST_EXPLANATION");
    process.exit(1);
  }
  if (t7dRes.recommendation.product.id !== "clickylite-wired") {
    console.error("Test 7 Failure: Recommendation should not have changed");
    process.exit(1);
  }

  // E. Ask "Why did you choose ClickyLite Wired instead of SwiftType Travel?"
  const t7eRes = await runAgentWorkflow("Why did you choose ClickyLite Wired instead of SwiftType Travel?", undefined, t7SessionId);
  if (!t7eRes.success) { console.error("Test 7E Failed"); process.exit(1); }
  console.log(" T7 E. Comparison Explanation Summary:\n", t7eRes.explanation.summary);

  if (!t7eRes.explanation.summary.includes("ClickyLite Wired") || !t7eRes.explanation.summary.includes("SwiftType Travel")) {
    console.error("Test 7 Failure: Explanation should compare the two keyboards.");
    process.exit(1);
  }
  console.log(">> TEST 7 PASSED!");

  // --------------------------------------------------
  // TEST 8 — GRACEFUL GEMINI FAILURE FALLBACK RESILIENCY (SIMULATED 429)
  // --------------------------------------------------
  console.log("\n--- TEST 8: Graceful Gemini Failure Fallback Resiliency (Simulated 429) ---");
  mockGeminiFail = true;

  // A. Initial Shopping Request (TEST 1 of requirement)
  const t8aRes = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5,000.");
  if (!t8aRes.success) {
    console.error("Test 8 A Failed: Workflow must succeed even when Gemini fails!");
    process.exit(1);
  }
  const t8SessionId = t8aRes.sessionId;
  console.log(" T8 A. Fallback Recommendation (expected NovaKey K75):", t8aRes.recommendation.product.name);
  console.log(" T8 A. Fallback Basket Total:", t8aRes.basket.finalAmount);
  console.log(" T8 A. Fallback Explanation (Source should be FALLBACK):", t8aRes.explanation.source);
  
  if (t8aRes.recommendation.product.id !== "novakey-k75") {
    console.error("Test 8 A Failure: Should have recommended NovaKey K75 via fallback parsing.");
    process.exit(1);
  }
  if (t8aRes.explanation.source !== "FALLBACK") {
    console.error("Test 8 A Failure: Explanation source must be FALLBACK.");
    process.exit(1);
  }

  // B. "Remove the wrist rest" (TEST 2 of requirement)
  const t8bRes = await runAgentWorkflow("remove the wrist rest", undefined, t8SessionId);
  if (!t8bRes.success) {
    console.error("Test 8 B Failed: Workflow must succeed.");
    process.exit(1);
  }
  console.log(" T8 B. Fallback Action classified:", t8bRes.conversationAction);
  console.log(" T8 B. Recommendation (NovaKey K75):", t8bRes.recommendation.product.name);
  console.log(" T8 B. Upsell is removed:", t8bRes.upsell === null);
  console.log(" T8 B. Basket Total (keyboard price):", t8bRes.basket.finalAmount);

  if (t8bRes.conversationAction !== "REMOVE_UPSELL" || t8bRes.upsell !== null) {
    console.error("Test 8 B Failure: Should have classified REMOVE_UPSELL and removed upsell.");
    process.exit(1);
  }

  // C. "My budget is ₹3500" (TEST 3 of requirement)
  const t8cRes = await runAgentWorkflow("my budget is ₹3500", undefined, t8SessionId);
  if (!t8cRes.success) {
    console.error("Test 8 C Failed: Workflow must succeed.");
    process.exit(1);
  }
  console.log(" T8 C. Fallback Action classified:", t8cRes.conversationAction);
  console.log(" T8 C. New Recommendation within ₹3500 budget (SwiftType Travel):", t8cRes.recommendation.product.name);
  console.log(" T8 C. New Budget Context:", t8cRes.intent.budget);

  if (t8cRes.conversationAction !== "CHANGE_BUDGET" || t8cRes.recommendation.product.price > 3500) {
    console.error("Test 8 C Failure: Should have classified CHANGE_BUDGET and matched budget limit.");
    process.exit(1);
  }

  // D. "Is there anything cheaper?" (TEST 4 of requirement)
  const t8dRes = await runAgentWorkflow("is there anything cheaper?", undefined, t8SessionId);
  if (!t8dRes.success) {
    console.error("Test 8 D Failed: Workflow must succeed.");
    process.exit(1);
  }
  console.log(" T8 D. Fallback Action classified:", t8dRes.conversationAction);
  console.log(" T8 D. Cheaper Alternative (ClickyLite Wired):", t8dRes.recommendation.product.name);

  if ((t8dRes.conversationAction !== "REQUEST_CHEAPER_OPTION" && t8dRes.conversationAction !== "REQUEST_CHEAPER") || t8dRes.recommendation.product.id !== "clickylite-wired") {
    console.error("Test 8 D Failure: Should have classified REQUEST_CHEAPER_OPTION and recommended ClickyLite Wired.");
    process.exit(1);
  }

  // E. "Why did you recommend this?" (TEST 5 of requirement)
  const t8eRes = await runAgentWorkflow("why did you recommend this?", undefined, t8SessionId);
  if (!t8eRes.success) {
    console.error("Test 8 E Failed: Workflow must succeed.");
    process.exit(1);
  }
  console.log(" T8 E. Fallback Action classified:", t8eRes.conversationAction);
  console.log(" T8 E. Fallback Explanation Summary:\n", t8eRes.explanation.summary);

  if (t8eRes.conversationAction !== "REQUEST_EXPLANATION" || t8eRes.explanation.source !== "FALLBACK") {
    console.error("Test 8 E Failure: Should have classified REQUEST_EXPLANATION and returned FALLBACK explanation.");
    process.exit(1);
  }
  if (!t8eRes.explanation.summary.includes("ClickyLite Wired") || !t8eRes.explanation.summary.includes("SwiftType Travel")) {
    console.error("Test 8 E Failure: Fallback explanation must compare the current recommendation with SwiftType Travel.");
    process.exit(1);
  }

  // F. "Okay, I'll take it." (TEST 6 of requirement)
  const t8fRes = await runAgentWorkflow("okay, i'll take it", undefined, t8SessionId);
  if (!t8fRes.success) {
    console.error("Test 8 F Failed: Workflow must succeed.");
    process.exit(1);
  }
  console.log(" T8 F. Fallback Action classified:", t8fRes.conversationAction);
  console.log(" T8 F. Transaction State reached USER_CONFIRMED:", t8fRes.transactionState === "USER_CONFIRMED");

  if (t8fRes.conversationAction !== "CONFIRM_SELECTION" || t8fRes.transactionState !== "USER_CONFIRMED") {
    console.error("Test 8 F Failure: Should have classified CONFIRM_SELECTION and reached USER_CONFIRMED.");
    process.exit(1);
  }

  mockGeminiFail = false;
  console.log(">> TEST 8 PASSED!");

  console.log("\n=== ALL PHASE 2.4 TESTS PASSED SUCCESSFULLY ===");
}

executeTests().catch(err => {
  console.error("Unhandled testing exception:", err);
  process.exit(1);
});
