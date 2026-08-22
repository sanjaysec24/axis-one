import { runAgentWorkflow } from "../lib/agentWorkflow";

process.env.GEMINI_API_KEY = "dummy_test_key";

let mockGeminiFail = false;

// Mock Global Fetch for Gemini
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

    const promptText = body.contents?.[0]?.parts?.[0]?.text || "";
    const systemInstruction = body.systemInstruction?.parts?.[0]?.text || "";
    
    let textResponse = "";

    if (systemInstruction.includes("intent extraction")) {
      textResponse = JSON.stringify({
        productCategory: "Mechanical Keyboard",
        budget: 5000,
        wireless: true,
        batteryPriority: "high",
        useCase: "programming"
      });
    } 
    
    else if (systemInstruction.includes("classification")) {
      const msgMatch = promptText.match(/Classify this user message:\s*\n\s*"([^"]+)"/);
      const userMsg = msgMatch ? msgMatch[1].toLowerCase() : promptText.toLowerCase();

      if (userMsg.includes("why did you") || userMsg.includes("explain")) {
        textResponse = JSON.stringify({ action: "REQUEST_EXPLANATION" });
      } else if (userMsg.includes("cheaper")) {
        textResponse = JSON.stringify({ action: "REQUEST_CHEAPER_OPTION" });
      } else if (userMsg.includes("remove")) {
        textResponse = JSON.stringify({ action: "REMOVE_UPSELL" });
      } else if (userMsg.includes("take it") || userMsg.includes("okay")) {
        textResponse = JSON.stringify({ action: "CONFIRM_SELECTION" });
      } else if (userMsg.includes("hi") || userMsg.includes("hello")) {
        textResponse = JSON.stringify({ action: "GENERAL_FOLLOW_UP" });
      } else if (userMsg.includes("payment")) {
        textResponse = JSON.stringify({ action: "GENERAL_FOLLOW_UP" });
      } else {
        textResponse = JSON.stringify({ action: "GENERAL_FOLLOW_UP" });
      }
    } 
    
    else {
      // Explanation layer
      let parsedContext: any = null;
      try {
        const jsonMatch = promptText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContext = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {}

      let summary = "NovaKey K75 is recommended based on your preferences.";
      if (parsedContext) {
        if (parsedContext.responseIntent === "CONFIRMATION" || parsedContext.action === "CONFIRM_SELECTION") {
          summary = "Great choice! Your basket with NovaKey K75 is locked in and ready for secure checkout.";
        } else if (parsedContext.responseIntent === "REMOVE_UPSELL" || parsedContext.action === "REMOVE_UPSELL") {
          summary = "Done. I've removed the complementary wrist rest and kept NovaKey K75 as your primary selection. Your basket total is updated.";
        } else if (parsedContext.responseIntent === "CHEAPER_ALTERNATIVE" || parsedContext.action === "REQUEST_CHEAPER_OPTION") {
          summary = "I found a cheaper option: SwiftType Travel at ₹2,999 (saving ₹1,500). It retains wireless connectivity while fitting within a lower budget.";
        } else if (parsedContext.responseIntent === "REQUEST_EXPLANATION" || parsedContext.action === "REQUEST_EXPLANATION") {
          summary = "I recommended the NovaKey K75 because it satisfies your strongest requirements (wireless connectivity, mechanical switches, long battery life) at ₹4,499. It scored highest in our catalog evaluation with verified stock and merchant policy compliance.";
        } else if (parsedContext.responseIntent === "GREETING") {
          summary = "Hey! Your current selection of the NovaKey K75 (₹4,499) is active. Would you like to compare it, adjust your budget, or proceed to checkout?";
        } else if (parsedContext.responseIntent === "PAYMENT_GUIDANCE") {
          summary = "Your basket is confirmed! Click the 'Pay securely via Razorpay' button in the Proposed Basket panel on the right to complete checkout in test mode.";
        } else {
          summary = "Based on your ₹5,000 budget and preference for a wireless mechanical keyboard, I recommend the NovaKey K75 (₹4,499). It matches your programming requirements and leaves ₹501 in budget flexibility. I've also paired it with an optional wrist support for comfort.";
        }
      }

      textResponse = JSON.stringify({
        recommendationExplanation: "Matches wireless mechanical typing requirements.",
        upsellExplanation: "Wrist support adds comfort.",
        budgetExplanation: "Fits within the budget limit.",
        policyExplanation: "Passed all policy checks.",
        summary
      });
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: textResponse }] },
          finishReason: "STOP"
        }]
      }),
      text: async () => JSON.stringify({
        candidates: [{
          content: { parts: [{ text: textResponse }] },
          finishReason: "STOP"
        }]
      })
    } as any;
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "{}"
  } as any;
};

async function runConversationalQualityTests() {
  console.log("=== STARTING CONVERSATIONAL QUALITY & CONTEXT-AWARE TESTS ===");

  // Test 1: Initial search
  console.log("\n--- TEST 1: Initial Search ---");
  const t1 = await runAgentWorkflow("I need a wireless mechanical keyboard under ₹5000");
  if (!t1.success) throw new Error("Test 1 failed to run workflow.");
  console.log("Response Summary:\n" + t1.explanation.summary);
  if (t1.explanation.summary.length < 50) {
    throw new Error("Test 1 response is too short and generic.");
  }
  if (!t1.explanation.summary.includes("NovaKey K75")) {
    throw new Error("Test 1 response does not mention NovaKey K75.");
  }
  console.log(">> TEST 1 PASSED!");

  const sessionId = t1.sessionId;

  // Test 2: Explanation Request
  console.log("\n--- TEST 2: Request Explanation ('Why did you recommend this?') ---");
  const t2 = await runAgentWorkflow("Why did you recommend this?", undefined, sessionId);
  if (!t2.success) throw new Error("Test 2 failed.");
  console.log("Response Summary:\n" + t2.explanation.summary);
  if (!t2.explanation.summary.toLowerCase().includes("requirement") && !t2.explanation.summary.toLowerCase().includes("wireless") && !t2.explanation.summary.toLowerCase().includes("novakey")) {
    throw new Error("Test 2 explanation does not provide meaningful reasons.");
  }
  console.log(">> TEST 2 PASSED!");

  // Test 3: Cheaper Option
  console.log("\n--- TEST 3: Cheaper Option ('Anything cheaper?') ---");
  const t3 = await runAgentWorkflow("Anything cheaper?", undefined, sessionId);
  if (!t3.success) throw new Error("Test 3 failed.");
  console.log("Response Summary:\n" + t3.explanation.summary);
  if (!t3.explanation.summary.toLowerCase().includes("cheaper") && !t3.explanation.summary.toLowerCase().includes("swifttype") && !t3.explanation.summary.toLowerCase().includes("saving")) {
    throw new Error("Test 3 response does not explain cheaper option or trade-off.");
  }
  console.log(">> TEST 3 PASSED!");

  // Test 4: Remove Upsell
  console.log("\n--- TEST 4: Remove Upsell ('Remove the wrist rest') ---");
  const t4 = await runAgentWorkflow("Remove the wrist rest", undefined, sessionId);
  if (!t4.success) throw new Error("Test 4 failed.");
  console.log("Response Summary:\n" + t4.explanation.summary);
  if (!t4.explanation.summary.toLowerCase().includes("removed") && !t4.explanation.summary.toLowerCase().includes("basket total")) {
    throw new Error("Test 4 does not confirm removal of upsell.");
  }
  console.log(">> TEST 4 PASSED!");

  // Test 5: Greeting ('hi')
  console.log("\n--- TEST 5: Contextual Greeting ('hi') ---");
  const t5 = await runAgentWorkflow("hi", undefined, sessionId);
  if (!t5.success) throw new Error("Test 5 failed.");
  console.log("Response Summary:\n" + t5.explanation.summary);
  if (!t5.explanation.summary.toLowerCase().includes("selection") && !t5.explanation.summary.toLowerCase().includes("active") && !t5.explanation.summary.toLowerCase().includes("hey")) {
    throw new Error("Test 5 does not greet contextually.");
  }
  console.log(">> TEST 5 PASSED!");

  // Test 6: Confirmation ('Okay, I'll take it')
  console.log("\n--- TEST 6: Confirmation ('Okay, I'll take it') ---");
  const t6 = await runAgentWorkflow("Okay, I'll take it", undefined, sessionId);
  if (!t6.success) throw new Error("Test 6 failed.");
  console.log("Response Summary:\n" + t6.explanation.summary);
  console.log("Transaction State: " + t6.transactionState);
  if (t6.transactionState !== "USER_CONFIRMED") {
    throw new Error("Test 6 transaction state was not USER_CONFIRMED.");
  }
  if (!t6.explanation.summary.toLowerCase().includes("checkout") && !t6.explanation.summary.toLowerCase().includes("locked in") && !t6.explanation.summary.toLowerCase().includes("ready")) {
    throw new Error("Test 6 confirmation text does not indicate checkout readiness.");
  }
  console.log(">> TEST 6 PASSED!");

  // Test 7: Payment Guidance ('payment')
  console.log("\n--- TEST 7: Payment Guidance ('payment') ---");
  const t7 = await runAgentWorkflow("payment", undefined, sessionId);
  if (!t7.success) throw new Error("Test 7 failed.");
  console.log("Response Summary:\n" + t7.explanation.summary);
  if (!t7.explanation.summary.toLowerCase().includes("pay") && !t7.explanation.summary.toLowerCase().includes("razorpay") && !t7.explanation.summary.toLowerCase().includes("checkout")) {
    throw new Error("Test 7 does not guide to payment.");
  }
  console.log(">> TEST 7 PASSED!");

  // Test 8: Gemini 429 Quota Failure Fallback
  console.log("\n--- TEST 8: Gemini 429 Quota Failure Fallback ---");
  mockGeminiFail = true;
  const t8 = await runAgentWorkflow("I need a wireless mechanical keyboard for programming under ₹5,000");
  if (!t8.success) throw new Error("Test 8 fallback failed.");
  console.log("Fallback Response Summary:\n" + t8.explanation.summary);
  if (!t8.explanation.summary.includes("NovaKey K75") || !t8.explanation.summary.includes("₹4499")) {
    throw new Error("Test 8 fallback summary is missing product or price.");
  }
  if (t8.explanation.source !== "FALLBACK") {
    throw new Error("Test 8 source should be FALLBACK.");
  }
  console.log(">> TEST 8 PASSED!");

  console.log("\n=== ALL CONVERSATIONAL QUALITY TESTS PASSED SUCCESSFULLY ===");
}

runConversationalQualityTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
