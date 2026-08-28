import { runAgentWorkflow } from "../lib/agentWorkflow";
import { getSession } from "../lib/session";

process.env.GEMINI_API_KEY = "dummy_gemini_key_for_testing";
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret_for_unit_testing";

let mockAction: any = null;
let mockParams: any = {};
let mockGeminiFail = false;

// Mock global fetch for Gemini testing
const originalFetch = global.fetch;
global.fetch = async (url: any, options: any) => {
  const urlStr = String(url);

  if (urlStr.includes("generativelanguage.googleapis.com")) {
    if (mockGeminiFail) {
      throw new Error("[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent: [429 Too Many Requests] Quota exceeded for Gemini generateContent requests.");
    }
    let body: any = {};
    try {
      body = JSON.parse(options.body || "{}");
    } catch (e) {}

    const contentsText = JSON.stringify(body.contents || []);
    const systemInstruction = body.systemInstruction?.parts?.[0]?.text || "";
    let textResponse = "";

    if (systemInstruction.includes("intent extraction")) {
      const promptText = body.contents?.[0]?.parts?.[0]?.text || "";
      if (promptText.includes("quantum") || promptText.includes("spacecraft")) {
        textResponse = JSON.stringify({
          productCategory: "Spacecraft Propulsion",
          budget: 10,
          useCase: "interstellar travel"
        });
      } else if (promptText.includes("mouse")) {
        textResponse = JSON.stringify({
          productCategory: "Wireless Mouse",
          budget: 3000,
          wireless: true,
          useCase: "productivity"
        });
      } else if (promptText.includes("headphones")) {
        textResponse = JSON.stringify({
          productCategory: "Headphones",
          budget: 5000,
          wireless: true,
          useCase: "office"
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
      // Explanation generation
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
        if (parsedContext.responseIntent === "GREETING") {
          summary = `Hey! Your current selection of the ${parsedContext.recommendation?.name || "NovaKey K75"} is active. Would you like to compare it, adjust your budget, or proceed to checkout?`;
        } else if (parsedContext.responseIntent === "CONFIRMATION") {
          summary = `Great choice! Your basket with ${parsedContext.recommendation?.name} is locked in and ready for secure checkout. Click 'Pay securely via Razorpay' on the right to proceed.`;
        } else if (parsedContext.responseIntent === "REMOVE_UPSELL") {
          summary = `Done. I've removed the complementary wrist rest and kept ${parsedContext.recommendation?.name} as your primary selection. Your basket total is updated.`;
        } else if (parsedContext.responseIntent === "CHEAPER_ALTERNATIVE") {
          summary = `I found a cheaper option: ${parsedContext.recommendation?.name} at ₹${parsedContext.recommendation?.price}. It saves on cost while fitting within your budget.`;
        } else if (parsedContext.responseIntent === "BUDGET_UPDATE") {
          summary = `Got it — I've recalculated the options for your new budget. The ${parsedContext.recommendation?.name} (₹${parsedContext.recommendation?.price}) fits best.`;
        } else if (parsedContext.responseIntent === "PRODUCT_COMPARISON" || parsedContext.responseIntent === "REQUEST_EXPLANATION") {
          summary = `I recommended the ${parsedContext.recommendation?.name} because it satisfies your strongest requirements at ₹${parsedContext.recommendation?.price}. It scored highest in our catalog evaluation with verified stock and merchant policy compliance.`;
        } else if (parsedContext.userQuery && parsedContext.userQuery.toLowerCase().includes("wireless")) {
          summary = `Yes, the ${parsedContext.recommendation?.name} is wireless with dual-mode connectivity.`;
        } else {
          summary = `Based on your budget and preference for a wireless mechanical keyboard, I recommend the ${parsedContext.recommendation?.name} (₹${parsedContext.recommendation?.price}).`;
        }
      }

      textResponse = JSON.stringify({
        recommendationExplanation: "Matches your requirements.",
        upsellExplanation: "Complements your primary selection.",
        budgetExplanation: "Fits within your budget.",
        policyExplanation: "Passed merchant policy checks.",
        summary
      });
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: textResponse }] } }]
      })
    } as any;
  }

  return originalFetch(url, options);
};

async function runConversationalQualityTests() {
  console.log("=== STARTING FULL 16-POINT CONVERSATIONAL INTELLIGENCE MATRIX ===\n");

  // --------------------------------------------------
  // 1. Initial Search
  // --------------------------------------------------
  console.log("--- TEST 1: Initial Search ---");
  mockAction = "NEW_SEARCH";
  mockParams = {};
  const t1 = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5,000.");
  if (!t1.success || t1.recommendation.product.id !== "novakey-k75") {
    throw new Error("Test 1 Failed: Initial recommendation incorrect.");
  }
  const sessionId = t1.sessionId;
  console.log(" Response Summary:\n", t1.explanation.summary);
  console.log(">> TEST 1 PASSED!");

  // --------------------------------------------------
  // 2. Greeting
  // --------------------------------------------------
  console.log("\n--- TEST 2: Greeting ('hi') ---");
  mockAction = "GREETING";
  const t2 = await runAgentWorkflow("hi", undefined, sessionId);
  if (!t2.success || !t2.explanation.summary.toLowerCase().includes("novakey")) {
    throw new Error("Test 2 Failed: Greeting did not reference active selection.");
  }
  console.log(" Response Summary:\n", t2.explanation.summary);
  console.log(">> TEST 2 PASSED!");

  // --------------------------------------------------
  // 3. Cheaper Request
  // --------------------------------------------------
  console.log("\n--- TEST 3: Cheaper Request ('anything cheaper?') ---");
  mockAction = "REQUEST_CHEAPER_OPTION";
  const t3 = await runAgentWorkflow("anything cheaper?", undefined, sessionId);
  if (!t3.success || t3.recommendation.product.price >= 4499) {
    throw new Error("Test 3 Failed: Cheaper option price should be < 4499.");
  }
  console.log(" Cheaper Product:", t3.recommendation.product.name, `(₹${t3.recommendation.product.price})`);
  console.log(" Response Summary:\n", t3.explanation.summary);
  console.log(">> TEST 3 PASSED!");

  // --------------------------------------------------
  // 4. Budget Change
  // --------------------------------------------------
  console.log("\n--- TEST 4: Budget Change ('make my budget ₹3500') ---");
  mockAction = "CHANGE_BUDGET";
  mockParams = { budget: 3500 };
  const t4 = await runAgentWorkflow("make my budget ₹3500", undefined, sessionId);
  if (!t4.success || t4.recommendation.product.price > 3500) {
    throw new Error("Test 4 Failed: Recommendation exceeds new budget of 3500.");
  }
  console.log(" Selected Product:", t4.recommendation.product.name, `(₹${t4.recommendation.product.price})`);
  console.log(" Response Summary:\n", t4.explanation.summary);
  console.log(">> TEST 4 PASSED!");

  // --------------------------------------------------
  // 5. Remove Upsell
  // --------------------------------------------------
  console.log("\n--- TEST 5: Remove Upsell ('remove the wrist rest') ---");
  mockAction = "REMOVE_UPSELL";
  mockParams = {};
  const t5 = await runAgentWorkflow("remove the wrist rest", undefined, sessionId);
  if (!t5.success || t5.upsell !== null) {
    throw new Error("Test 5 Failed: Upsell was not removed.");
  }
  console.log(" Basket Total:", t5.basket.finalAmount);
  console.log(" Response Summary:\n", t5.explanation.summary);
  console.log(">> TEST 5 PASSED!");

  // --------------------------------------------------
  // 6. Remove Product
  // --------------------------------------------------
  console.log("\n--- TEST 6: Remove Product ('remove the keyboard') ---");
  mockAction = "REMOVE_PRODUCT";
  const t6 = await runAgentWorkflow("remove the keyboard", undefined, sessionId);
  if (!t6.success || t6.basket.items.length !== 0) {
    throw new Error("Test 6 Failed: Product was not removed from basket.");
  }
  console.log(" Basket Items Count:", t6.basket.items.length);
  console.log(">> TEST 6 PASSED!");

  // --------------------------------------------------
  // 7. Explanation Request
  // --------------------------------------------------
  console.log("\n--- TEST 7: Explanation Request ('why did you recommend this?') ---");
  mockAction = "NEW_SEARCH";
  const t7Search = await runAgentWorkflow("I need a wireless mechanical keyboard under ₹5,000.", undefined, sessionId);
  if (!t7Search.success) { throw new Error("Test 7 Search failed"); }

  mockAction = "REQUEST_EXPLANATION";
  const t7 = await runAgentWorkflow("why did you recommend this?", undefined, t7Search.sessionId);
  if (!t7.success || t7.conversationAction !== "REQUEST_EXPLANATION") {
    throw new Error("Test 7 Failed: Action should be REQUEST_EXPLANATION.");
  }
  console.log(" Response Summary:\n", t7.explanation.summary);
  console.log(">> TEST 7 PASSED!");

  // --------------------------------------------------
  // 8. Alternative Request
  // --------------------------------------------------
  console.log("\n--- TEST 8: Alternative Request ('show me another one') ---");
  mockAction = "REQUEST_ALTERNATIVE";
  const t8 = await runAgentWorkflow("show me another one", undefined, t7Search.sessionId);
  if (!t8.success || t8.recommendation.product.id === t7Search.recommendation.product.id) {
    throw new Error("Test 8 Failed: Did not return alternative keyboard.");
  }
  console.log(" Alternative Product:", t8.recommendation.product.name);
  console.log(">> TEST 8 PASSED!");

  // --------------------------------------------------
  // 9. Requirement Change
  // --------------------------------------------------
  console.log("\n--- TEST 9: Requirement Change ('I prefer wired') ---");
  mockAction = "MODIFY_REQUIREMENTS";
  mockParams = { wireless: false };
  const t9 = await runAgentWorkflow("I prefer wired", undefined, t7Search.sessionId);
  if (!t9.success || t9.intent.wireless !== false) {
    throw new Error("Test 9 Failed: Wireless requirement not updated.");
  }
  console.log(" New Intent Wireless:", t9.intent.wireless);
  console.log(" Recommended Product:", t9.recommendation.product.name);
  console.log(">> TEST 9 PASSED!");

  // --------------------------------------------------
  // 10. Product-Specific Question
  // --------------------------------------------------
  console.log("\n--- TEST 10: Product-Specific Question ('Is it wireless?') ---");
  mockAction = "GENERAL_QUESTION";
  const t10 = await runAgentWorkflow("Is it wireless?", undefined, t7Search.sessionId);
  if (!t10.success) {
    throw new Error("Test 10 Failed: Question handler failed.");
  }
  console.log(" Response Summary:\n", t10.explanation?.summary);
  console.log(">> TEST 10 PASSED!");

  // --------------------------------------------------
  // 11. Confirmation
  // --------------------------------------------------
  console.log("\n--- TEST 11: Confirmation ('Okay I'll take it') ---");
  mockAction = "CONFIRM_SELECTION";
  const t11 = await runAgentWorkflow("Okay I'll take it", undefined, t7Search.sessionId);
  if (!t11.success || t11.transactionState !== "USER_CONFIRMED") {
    throw new Error("Test 11 Failed: State should be USER_CONFIRMED.");
  }
  console.log(" Transaction State:", t11.transactionState);
  console.log(" Response Summary:\n", t11.explanation.summary);
  console.log(">> TEST 11 PASSED!");

  // --------------------------------------------------
  // 12. Full Multi-Turn Context Preservation
  // --------------------------------------------------
  console.log("\n--- TEST 12: Full Multi-Turn Context Preservation Flow ---");
  // Turn 1: Initial Search
  mockAction = "NEW_SEARCH";
  mockParams = {};
  const m1 = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5000.");
  if (!m1.success) { throw new Error("Turn 1 failed"); }
  const mSessionId = m1.sessionId;
  console.log(" Turn 1 Recommendation:", m1.recommendation.product.name, `(₹${m1.recommendation.product.price})`);

  // Turn 2: Explanation
  mockAction = "REQUEST_EXPLANATION";
  const m2 = await runAgentWorkflow("Why did you recommend this?", undefined, mSessionId);
  if (!m2.success) { throw new Error("Turn 2 failed"); }
  console.log(" Turn 2 Action:", m2.conversationAction, "| Product remains:", m2.recommendation.product.name);

  // Turn 3: Anything Cheaper
  mockAction = "REQUEST_CHEAPER_OPTION";
  const m3 = await runAgentWorkflow("Anything cheaper?", undefined, mSessionId);
  if (!m3.success) { throw new Error("Turn 3 failed"); }
  console.log(" Turn 3 Cheaper option:", m3.recommendation.product.name, `(₹${m3.recommendation.product.price})`);

  // Turn 4: Is it wireless?
  mockAction = "GENERAL_QUESTION";
  const m4 = await runAgentWorkflow("Is it wireless?", undefined, mSessionId);
  if (!m4.success) { throw new Error("Turn 4 failed"); }
  console.log(" Turn 4 Product Question answer:\n", m4.explanation?.summary);

  // Turn 5: Budget Change
  mockAction = "CHANGE_BUDGET";
  mockParams = { budget: 3500 };
  const m5 = await runAgentWorkflow("Make my budget ₹3500.", undefined, mSessionId);
  if (!m5.success) { throw new Error("Turn 5 failed"); }
  console.log(" Turn 5 New Budget Product:", m5.recommendation.product.name);

  // Turn 6: Remove wrist rest
  mockAction = "REMOVE_UPSELL";
  const m6 = await runAgentWorkflow("Remove the wrist rest.", undefined, mSessionId);
  if (!m6.success) { throw new Error("Turn 6 failed"); }
  console.log(" Turn 6 Upsell removed:", m6.upsell === null);

  // Turn 7: Confirmation
  mockAction = "CONFIRM_SELECTION";
  const m7 = await runAgentWorkflow("Okay I'll take it.", undefined, mSessionId);
  if (!m7.success) { throw new Error("Turn 7 failed"); }
  console.log(" Turn 7 Final State:", m7.transactionState);

  const sessionObj = getSession(mSessionId);
  console.log(" Session History Turns Count:", sessionObj?.recentMessages.length);
  if (!sessionObj || sessionObj.recentMessages.length < 14) {
    throw new Error("Test 12 Failed: Context history not preserved across all turns.");
  }
  console.log(">> TEST 12 PASSED!");

  // --------------------------------------------------
  // 13 & 14. Gemini 429 & Fallback Resiliency
  // --------------------------------------------------
  console.log("\n--- TEST 13 & 14: Gemini 429 Fallback Resiliency ---");
  mockGeminiFail = true;
  const fRes = await runAgentWorkflow("I need a wireless mechanical keyboard under ₹5000.");
  if (!fRes.success || fRes.explanation.source !== "FALLBACK") {
    throw new Error("Test 13/14 Failed: Fallback did not activate on simulated 429.");
  }
  console.log(" Fallback Recommendation:", fRes.recommendation.product.name);
  console.log(" Fallback Explanation Source:", fRes.explanation.source);
  console.log(">> TEST 13 & 14 PASSED!");

  // --------------------------------------------------
  // 15. No Product Found Response
  // --------------------------------------------------
  console.log("\n--- TEST 15: No Product Found Response ---");
  mockGeminiFail = false;
  mockAction = "NEW_SEARCH";
  const noMatchRes = await runAgentWorkflow("I need a quantum warp drive for spacecraft under ₹10.");
  if (noMatchRes.success !== false || noMatchRes.stage !== "CATALOG_SEARCH") {
    throw new Error("Test 15 Failed: Should have returned CATALOG_SEARCH failure.");
  }
  console.log(" Stage:", noMatchRes.stage);
  console.log(" Message:", noMatchRes.message);
  console.log(">> TEST 15 PASSED!");

  // --------------------------------------------------
  // 16. Invalid / Ambiguous Request
  // --------------------------------------------------
  console.log("\n--- TEST 16: Invalid / Ambiguous Request Handling ---");
  const ambigRes = await runAgentWorkflow("something random");
  if (!ambigRes.success && ambigRes.stage !== "INTENT_EXTRACTION" && ambigRes.stage !== "CATALOG_SEARCH") {
    throw new Error("Test 16 Failed: Ambiguous request not handled safely.");
  }
  console.log(" Handled gracefully. Success status:", ambigRes.success);
  console.log(">> TEST 16 PASSED!");

  console.log("\n==================================================================");
  console.log("     ALL 16 CONVERSATIONAL INTELLIGENCE MATRIX TESTS PASSED!      ");
  console.log("==================================================================");
}

runConversationalQualityTests().catch(e => {
  console.error("Test Suite Failed:", e);
  process.exit(1);
});
