import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { 
  UserIntent, 
  ExplanationContext, 
  ExplanationResult, 
  ConversationAction, 
  CommerceConversationContext,
  ResponseIntent 
} from "./types";
import { routeConversationalMessage } from "./conversationRouter";

/**
 * Validates the extracted intent object against the business rules.
 */
function validateExtractedIntent(intent: any): UserIntent {
  // Rule 1: productCategory must be a non-empty string
  if (typeof intent.productCategory !== "string" || intent.productCategory.trim() === "") {
    throw new Error("Extracted productCategory must be a non-empty string.");
  }

  // Rule 2: budget must be a positive number when provided
  if (intent.budget !== undefined && intent.budget !== null) {
    const budgetNum = Number(intent.budget);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      throw new Error("Extracted budget must be a positive number.");
    }
    intent.budget = Math.round(budgetNum); // Ensure integer representing INR
  }

  // Rule 3: wireless must be boolean when provided
  if (intent.wireless !== undefined && intent.wireless !== null) {
    if (typeof intent.wireless !== "boolean") {
      intent.wireless = intent.wireless === "true" || intent.wireless === 1;
    }
  }

  // Rule 4: batteryPriority must only be "low" | "medium" | "high" or omitted/null
  if (intent.batteryPriority !== undefined && intent.batteryPriority !== null) {
    const validPriorities = ["low", "medium", "high"];
    if (!validPriorities.includes(intent.batteryPriority)) {
      throw new Error(`Extracted batteryPriority must be low, medium, or high. Got: ${intent.batteryPriority}`);
    }
  }

  // Rule 5: useCase must be a string when provided
  if (intent.useCase !== undefined && intent.useCase !== null) {
    if (typeof intent.useCase !== "string") {
      intent.useCase = String(intent.useCase);
    }
  }

  // Return formatted type
  return {
    productCategory: intent.productCategory,
    ...(intent.budget !== undefined && intent.budget !== null ? { budget: intent.budget } : {}),
    ...(intent.wireless !== undefined && intent.wireless !== null ? { wireless: intent.wireless } : {}),
    ...(intent.batteryPriority ? { batteryPriority: intent.batteryPriority } : {}),
    ...(intent.useCase ? { useCase: intent.useCase } : {}),
    ...(intent.preferredMerchantId ? { preferredMerchantId: intent.preferredMerchantId } : {})
  };
}

/**
 * Executes a promise with an enforced timeout race to prevent UI freezing.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeoutFallback: () => T | Promise<T>): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(async () => {
      resolve(await onTimeoutFallback());
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Extracts structured UserIntent from natural language messages using fast heuristics or Gemini API.
 */
export async function extractIntentFromMessage(message: string): Promise<UserIntent> {
  // Fast Path: If deterministic pattern recognition recognizes category and constraints with high confidence, return immediately (<1ms)
  const quickFallback = extractIntentFromMessageFallback(message);
  const lower = message.toLowerCase();
  const hasObviousCategory = /\b(keyboard|mouse|headphone|earphone|monitor|webcam|hub|pad|rest|stand|dock)\b/i.test(lower);
  
  if (hasObviousCategory && quickFallback.productCategory && quickFallback.productCategory !== "Mechanical Keyboard") {
    return quickFallback;
  }
  if (hasObviousCategory && (quickFallback.budget || quickFallback.wireless !== undefined || quickFallback.useCase)) {
    return quickFallback;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return quickFallback;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const systemInstruction = 
    "You are the AXIS ONE intent extraction layer for a multi-merchant commerce system.\n\n" +
    "Convert the user's shopping request into structured requirements.\n\n" +
    "Extract only information that is explicitly stated or reasonably inferred.\n\n" +
    "Return valid structured data.\n\n" +
    "Do not recommend products.\n" +
    "Do not invent product names.\n" +
    "Do not invent prices.\n" +
    "Do not apply discounts.\n" +
    "Do not approve transactions.\n" +
    "Do not make merchant policy decisions.\n\n" +
    "Your only responsibility is understanding the user's shopping intent.";

  // Configure model with system instruction and structured output schema
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          productCategory: {
            type: SchemaType.STRING,
            description: "The shopping category requested, e.g. 'Mechanical Keyboard', 'Wireless Keyboard', 'Gaming Keyboard', 'Wireless Mouse', 'Wrist Rest', 'Mouse Pad', 'Headphones', 'Monitors', 'Webcams', 'USB Hubs', 'Laptop Accessories'."
          },
          budget: {
            type: SchemaType.INTEGER,
            description: "Maximum budget limit in INR as stated in the query."
          },
          wireless: {
            type: SchemaType.BOOLEAN,
            description: "Whether the user explicitly requests wireless/cordless connectivity."
          },
          batteryPriority: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["low", "medium", "high"],
            description: "Priority of battery life if mentioned."
          },
          useCase: {
            type: SchemaType.STRING,
            description: "The intended use case, e.g. 'gaming', 'programming', 'office', 'travel', 'ergonomics'."
          }
        },
        required: ["productCategory"]
      }
    }
  });

  const prompt = `Extract user shopping intent from this query:\n\n"${message}"`;

  try {
    return await withTimeout(
      (async () => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        if (!text) {
          return quickFallback;
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(text);
        } catch (err) {
          return quickFallback;
        }

        return validateExtractedIntent(parsedJson);
      })(),
      1500,
      () => quickFallback
    );
  } catch (error: any) {
    return quickFallback;
  }
}

/**
 * Derives a specific ResponseIntent based on action, query text, transaction state, and context.
 */
export function deriveResponseIntent(
  action?: ConversationAction,
  userQuery?: string,
  transactionState?: string,
  previousProduct?: { name: string; price: number } | null,
  recentMessages?: Array<{ role: "USER" | "AXIS_ONE"; content: string }>
): ResponseIntent {
  const query = (userQuery || "").toLowerCase().trim();

  // 1. Greetings
  if (action === "GREETING" || /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i.test(query) || query === "hi" || query === "hello" || query === "hey") {
    return "GREETING";
  }

  // 2. Direct payment inquiries
  if (action === "PAYMENT_GUIDANCE" || /\b(payment|checkout|how to pay|where to pay|proceed to pay|pay now)\b/i.test(query)) {
    return "PAYMENT_GUIDANCE";
  }

  // 3. Comparisons
  if (action === "PRODUCT_COMPARISON") {
    return "PRODUCT_COMPARISON";
  }

  // 4. Clarification
  if (action === "CLARIFICATION_REQUIRED") {
    return "CLARIFICATION_REQUIRED";
  }

  // 5. Thanks & Farewell
  if (action === "THANKS") {
    return "THANKS";
  }
  if (action === "FAREWELL") {
    return "FAREWELL";
  }

  // 6. User action mappings
  if (action === "CONFIRM_SELECTION" || action === "CONFIRM_REFERENCED_PRODUCT") {
    return "CONFIRMATION";
  }
  if (action === "KEEP_CURRENT_SELECTION") {
    return "KEEP_CURRENT_SELECTION";
  }
  if (action === "CANCEL_SELECTION") {
    return "PAYMENT_CANCELLED";
  }
  if (action === "REMOVE_UPSELL" || action === "REMOVE_PRODUCT") {
    return "REMOVE_UPSELL";
  }
  if (action === "ADD_UPSELL") {
    return "ADD_UPSELL";
  }
  if (action === "CHANGE_BUDGET") {
    return "BUDGET_UPDATE";
  }
  if (action === "REQUEST_CHEAPER" || action === "REQUEST_CHEAPER_OPTION") {
    return "CHEAPER_ALTERNATIVE";
  }
  if (action === "REQUEST_ALTERNATIVE") {
    return "PRODUCT_COMPARISON";
  }
  if (action === "REQUEST_EXPLANATION") {
    return "REQUEST_EXPLANATION";
  }
  if (action === "COMPARISON_QUESTION") {
    return "GENERAL_FOLLOW_UP";
  }
  if (action === "NEW_SEARCH" || !action) {
    return "INITIAL_RECOMMENDATION";
  }

  return "GENERAL_FOLLOW_UP";
}

/**
 * Explains the recommended products, upsell opportunity, budget fit, and policy checks using Gemini.
 */
export async function generateExplanation(
  context: ExplanationContext
): Promise<Omit<ExplanationResult, "source">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateFallbackExplanation(context);
  }

  const responseIntent = context.responseIntent || deriveResponseIntent(
    context.action,
    context.userQuery,
    context.transactionState,
    context.previousProduct,
    context.recentMessages
  );

  // Fast-path: For deterministic commerce actions, generate instant tailored explanation (<1ms)
  if (["GREETING", "CONFIRMATION", "CANCEL_SELECTION", "PAYMENT_GUIDANCE", "PRODUCT_COMPARISON", "CHEAPER_ALTERNATIVE", "REMOVE_UPSELL", "REMOVE_PRODUCT", "THANKS", "FAREWELL", "CLARIFICATION_REQUIRED"].includes(responseIntent)) {
    return generateFallbackExplanation(context);
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction = 
    "You are AXIS ONE, an intelligent multi-merchant AI commerce buyer.\n\n" +
    "Your job is to generate a helpful, natural, non-repetitive, context-aware response for the user based strictly on the provided structured commerce data.\n\n" +
    "CRITICAL CONVERSATIONAL RULES:\n" +
    "1. NEVER repeat generic canned pitches across multiple conversation turns.\n" +
    "2. If the user asks a specific question (e.g., 'Is it wireless?', 'Why did you recommend this?', 'Remove the wrist rest'), ANSWER THAT SPECIFIC QUESTION DIRECTLY in the 'summary' field.\n" +
    "3. GREETING: 1 natural sentence greeting the user and acknowledging their active item if one exists.\n" +
    "4. CONFIRMATION: 1 sentence confirming the basket is locked in for checkout, and directing them to click 'Pay securely via Razorpay' in the right-hand panel.\n" +
    "5. REMOVE_UPSELL / REMOVE_PRODUCT: 1 sentence confirming the removal and stating the updated basket total.\n" +
    "6. CHEAPER_ALTERNATIVE / REQUEST_CHEAPER: 2 sentences naming the cheaper option, merchant name, exact price, savings, and any trade-off.\n" +
    "7. PRODUCT_COMPARISON: Ground your summary directly on the provided structured comparison data and difference highlights. Accurately state the best overall, cheapest, and best warranty options using exact prices and warranties. NEVER invent missing specifications (if battery life is null, say it is not specified in catalog).\n" +
    "8. Use only the provided facts, prices, warranties, and merchant names. Do not invent features or prices.";

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          recommendationExplanation: {
            type: SchemaType.STRING,
            description: "Detailed explanation of why the product matches the requirements and merchant source."
          },
          upsellExplanation: {
            type: SchemaType.STRING,
            description: "Explanation of why the accessory complements the purchase and fits the budget."
          },
          budgetExplanation: {
            type: SchemaType.STRING,
            description: "Breakdown of the basket total against user budget."
          },
          policyExplanation: {
            type: SchemaType.STRING,
            description: "Verification results for inventory, discount rules, and safety caps."
          },
          summary: {
            type: SchemaType.STRING,
            description: "The primary conversational response message addressing the user directly."
          }
        },
        required: [
          "recommendationExplanation",
          "upsellExplanation",
          "budgetExplanation",
          "policyExplanation",
          "summary"
        ]
      }
    }
  });

  const prompt = `Generate an explanation for this commerce context (Intent Type: ${responseIntent}):\n\n${JSON.stringify(context, null, 2)}`;

  try {
    return await withTimeout(
      (async () => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (!text) {
          return generateFallbackExplanation(context);
        }

        const parsedJson = JSON.parse(text);
        return {
          recommendationExplanation: parsedJson.recommendationExplanation,
          upsellExplanation: parsedJson.upsellExplanation,
          budgetExplanation: parsedJson.budgetExplanation,
          policyExplanation: parsedJson.policyExplanation,
          summary: parsedJson.summary
        };
      })(),
      1500,
      () => generateFallbackExplanation(context)
    );
  } catch (error: any) {
    return generateFallbackExplanation(context);
  }
}

/**
 * Generates a clean, deterministic, multi-category fallback explanation without invoking Gemini.
 */
export function generateFallbackExplanation(
  context: ExplanationContext
): Omit<ExplanationResult, "source"> {
  const { intent, recommendation, upsell, basket, policyValidation, previousProduct, tradeoffs, action, userQuery, transactionState, recentMessages, merchantComparison } = context;

  const responseIntent = context.responseIntent || deriveResponseIntent(
    action,
    userQuery,
    transactionState,
    previousProduct,
    recentMessages
  );

  const query = (userQuery || "").toLowerCase().trim();

  // 1. Recommendation Explanation
  const merchantPart = recommendation.merchantName ? `from ${recommendation.merchantName}` : "";
  const batteryStr = recommendation.matchedCriteria.find(c => c.toLowerCase().includes("battery")) || "";
  const batteryPart = batteryStr ? `provides ${batteryStr.toLowerCase()}` : "";
  const wirelessPart = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless")) ? "wireless connectivity" : "";
  const useCasePart = intent.useCase ? `optimized for ${intent.useCase}` : "";
  const criteriaParts = [wirelessPart, batteryPart, useCasePart].filter(Boolean);
  const criteriaText = criteriaParts.length > 0 
    ? `featuring ${criteriaParts.join(" and ")}` 
    : "matching your requirements";

  const recExp = `${recommendation.name} ${merchantPart} at ₹${recommendation.price} fits your criteria (${criteriaText}).`;

  // 2. Upsell Explanation
  let upsellExp = "";
  if (upsell) {
    upsellExp = upsell.relevanceReason || `${upsell.name} (₹${upsell.price}) complements your selection for improved ergonomics.`;
  } else {
    upsellExp = "No complementary accessory is currently attached.";
  }

  // 3. Budget Explanation
  let budgetExp = "";
  const budgetLimit = intent.budget ?? (basket.total + basket.remainingBudget);
  if (policyValidation.approved) {
    budgetExp = `The total basket comes to ₹${basket.total}, leaving ₹${basket.remainingBudget} within your ₹${budgetLimit} budget.`;
  } else {
    const over = basket.total - budgetLimit;
    budgetExp = `The basket total is ₹${basket.total}, exceeding your budget by ₹${over}.`;
  }

  // 4. Policy Explanation
  let policyExp = policyValidation.approved
    ? "All items passed inventory, pricing, and merchant policy checks."
    : "Transaction could not be verified under current policy limits.";

  // 5. Context-Aware Adaptive Summary
  let summary = "";

  // Check for specific product feature / spec questions first
  if (query.includes("is it wireless") || query.includes("is it cordless") || query.includes("wireless?")) {
    const isWireless = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless"));
    if (isWireless) {
      summary = `Yes, the ${recommendation.name} is wireless, featuring dual-mode connectivity with long battery life.`;
    } else {
      summary = `No, the ${recommendation.name} is a wired keyboard connecting via a reliable USB-C cable for low latency.`;
    }
  } else if (query.includes("is it wired") || query.includes("wired?")) {
    const isWired = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wired")) || !recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless"));
    if (isWired) {
      summary = `Yes, the ${recommendation.name} is a wired model connected via USB-C.`;
    } else {
      summary = `No, the ${recommendation.name} is wireless with multi-device Bluetooth and 2.4GHz connectivity.`;
    }
  } else if (query.includes("battery") || query.includes("how long does battery") || query.includes("battery life")) {
    const batteryMatch = recommendation.matchedCriteria.find(c => c.toLowerCase().includes("battery"));
    if (batteryMatch) {
      summary = `The ${recommendation.name} provides ${batteryMatch.toLowerCase()} on a single charge.`;
    } else {
      summary = `The ${recommendation.name} is wired via USB-C, so it draws power directly without needing batteries.`;
    }
  } else if (query.includes("mac") || query.includes("macos") || query.includes("apple")) {
    summary = `Yes, the ${recommendation.name} works seamlessly with macOS, Windows, and Linux.`;
  } else {
    switch (responseIntent) {
      case "GREETING": {
        const mName = recommendation.merchantName ? ` from ${recommendation.merchantName}` : "";
        summary = `Hey! 👋 Your ${recommendation.name}${mName} selection (₹${recommendation.price}) is active. Want to compare alternatives, adjust your budget, or continue to checkout?`;
        break;
      }

      case "PRODUCT_COMPARISON": {
        if (merchantComparison && merchantComparison.comparisonText) {
          summary = merchantComparison.comparisonText;
        } else {
          const prevName = previousProduct ? previousProduct.name : "the previous option";
          const prevPrice = previousProduct ? `₹${previousProduct.price}` : "higher price";
          summary = `Compared to ${prevName} (${prevPrice}), ${recommendation.name} from ${recommendation.merchantName || "merchant"} (₹${recommendation.price}) adjusts your total to ₹${basket.total}.`;
        }
        break;
      }

      case "INITIAL_RECOMMENDATION": {
        const merchantTag = recommendation.merchantName ? ` from ${recommendation.merchantName}` : "";
        const budgetClause = intent.budget ? `Found top options within your ₹${intent.budget} budget.` : "Found top options matching your requirements.";
        const upsellClause = upsell ? ` Pair it with an optional ${upsell.name} (₹${upsell.price}) for enhanced ergonomics.` : "";
        summary = `${budgetClause} I recommend the ${recommendation.name}${merchantTag} at ₹${recommendation.price} (${recommendation.matchScore}% match).${upsellClause}`;
        break;
      }

      case "BUDGET_UPDATE": {
        const wirelessPreserved = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless")) ? " while preserving your wireless preference" : "";
        summary = `Got it — I've recalculated the options for your new ₹${intent.budget} budget. The ${recommendation.name} from ${recommendation.merchantName || "store"} (₹${recommendation.price}) fits best${wirelessPreserved}.`;
        break;
      }

      case "CHEAPER_ALTERNATIVE": {
        summary = `I found a cheaper option: ${recommendation.name} from ${recommendation.merchantName || "merchant"} at ₹${recommendation.price}.`;
        break;
      }

      case "REMOVE_UPSELL": {
        if (basket.total === 0) {
          summary = `Done — I removed the item. Your basket is now empty.`;
        } else {
          summary = `Done — I removed the accessory. Your ${recommendation.name} remains selected.`;
        }
        break;
      }

      case "ADD_UPSELL": {
        const upsellName = upsell ? upsell.name : "accessory";
        summary = `Added the ${upsellName} to your basket. Your updated total is ₹${basket.total}.`;
        break;
      }

      case "KEEP_CURRENT_SELECTION": {
        summary = `Understood — keeping your active selection of the ${recommendation.name} (₹${recommendation.price}). Take your time, and let me know when you're ready.`;
        break;
      }

      case "PRODUCT_COMPARISON": {
        if (context.productComparison && context.productComparison.comparedProducts.length > 0) {
          summary = context.productComparison.comparisonSummary;
        } else if (merchantComparison && merchantComparison.comparisonText) {
          summary = merchantComparison.comparisonText;
        } else {
          summary = `Here are the top options compared by price, features, merchant, and requirement match.`;
        }
        break;
      }

      case "REQUEST_EXPLANATION": {
        const matchCriteria = recommendation.matchedCriteria.length > 0 ? recommendation.matchedCriteria.join(", ") : "requirements";
        const mText = recommendation.merchantName ? ` from ${recommendation.merchantName}` : "";
        summary = `${recommendation.name}${mText} is the best match because it fits your budget and satisfies your ${matchCriteria} (₹${recommendation.price}).`;
        break;
      }

      case "CONFIRMATION": {
        summary = `Understood. Your selection is approved. You can now proceed to secure payment via Razorpay.`;
        break;
      }

      case "PAYMENT_GUIDANCE": {
        if (transactionState === "USER_CONFIRMED") {
          summary = `Your basket is confirmed! Click the 'Pay securely via Razorpay' button in the Proposed Basket panel on the right to complete checkout.`;
        } else if (transactionState === "PAYMENT_CANCELLED" || transactionState === "PAYMENT_FAILED") {
          summary = `Your basket is saved. Click 'Retry Payment Checkout' on the right whenever you're ready to proceed.`;
        } else {
          summary = `When you're ready to buy, simply say 'Okay, I'll take it' or 'confirm' to approve your basket and unlock the payment checkout button.`;
        }
        break;
      }

      case "THANKS": {
        summary = "You're very welcome! Let me know if you'd like to adjust your selection, compare stores, or proceed to checkout.";
        break;
      }

      case "FAREWELL": {
        summary = "Goodbye! Your basket and preferences will be ready whenever you return.";
        break;
      }

      case "CLARIFICATION_REQUIRED": {
        summary = `Sure — could you clarify what you mean, or tell me your budget and feature preferences?`;
        break;
      }

      case "PAYMENT_SUCCESS": {
        summary = `Payment verified successfully! Your order has been recorded in the database and your receipt is displayed on the right.`;
        break;
      }

      case "PAYMENT_FAILED": {
        summary = `The payment didn't go through, but your basket is safely retained. You can retry checkout whenever you're ready.`;
        break;
      }

      case "PAYMENT_CANCELLED": {
        summary = `Checkout was cancelled. Your proposed basket remains saved and ready for whenever you want to retry.`;
        break;
      }

      case "GENERAL_FOLLOW_UP":
      default: {
        summary = `${recommendation.name} from ${recommendation.merchantName || "merchant"} (₹${recommendation.price}) is active in your proposed basket (total: ₹${basket.total}).`;
        break;
      }
    }
  }

  return {
    recommendationExplanation: recExp,
    upsellExplanation: upsellExp,
    budgetExplanation: budgetExp,
    policyExplanation: policyExp,
    summary
  };
}

/**
 * Classifies user follow-up messages in context of the conversation.
 * Runs deterministic fast router BEFORE expensive Gemini call.
 */
export async function classifyFollowUp(
  message: string,
  context: CommerceConversationContext
): Promise<{
  action: ConversationAction;
  budget?: number;
  wireless?: boolean;
  batteryPriority?: "low" | "medium" | "high";
  useCase?: string;
  targetCandidateIndex?: number;
  directMessage?: string;
}> {
  // 1. Run deterministic fast router first
  const fastRoute = routeConversationalMessage(message, context);
  if (fastRoute.confidence >= 0.9 && fastRoute.action !== "UNKNOWN") {
    return {
      action: fastRoute.action,
      targetCandidateIndex: fastRoute.targetCandidateIndex,
      directMessage: fastRoute.directMessage,
      ...(fastRoute.extractedRequirements || {})
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return classifyFollowUpFallback(message, context);
  }

  const systemInstruction = 
    "You are the AXIS ONE conversational follow-up classification layer.\n\n" +
    "Analyze the user's follow-up message in context and classify it into exactly one action:\n" +
    "1. GREETING: Casual hello/greetings ('hi', 'hello').\n" +
    "2. CONFIRM_SELECTION: User confirms/accepts the basket ('confirm', 'buy', 'yes', 'proceed', 'looks good').\n" +
    "3. CANCEL_SELECTION: User cancels ('cancel', 'nevermind').\n" +
    "4. REMOVE_UPSELL: User drops the accessory ('remove the wrist rest', 'remove it', 'drop the accessory').\n" +
    "5. REMOVE_PRODUCT: User clears cart ('remove the keyboard').\n" +
    "6. REQUEST_CHEAPER_OPTION: User wants a cheaper option ('cheaper', 'anything cheaper?').\n" +
    "7. PRODUCT_COMPARISON: User compares stores or products ('compare', 'which merchant is cheaper?', 'show different stores').\n" +
    "8. REQUEST_ALTERNATIVE: User wants other options ('show alternative', 'what else?').\n" +
    "9. REQUEST_EXPLANATION: User asks why it was recommended ('why this one?', 'why?').\n" +
    "10. CHANGE_BUDGET: User updates budget ('My budget is 4000').\n" +
    "11. MODIFY_REQUIREMENTS: User updates features ('I prefer wired').\n" +
    "12. PAYMENT_GUIDANCE: User asks about payment ('how to pay', 'checkout').\n" +
    "13. NEW_SEARCH: User starts a fresh search ('search for mouse').\n\n" +
    "Return valid structured JSON.";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            action: {
              type: SchemaType.STRING,
              format: "enum",
              enum: [
                "GREETING",
                "CONFIRM_SELECTION",
                "CANCEL_SELECTION",
                "REMOVE_UPSELL",
                "REMOVE_PRODUCT",
                "REQUEST_CHEAPER_OPTION",
                "PRODUCT_COMPARISON",
                "REQUEST_ALTERNATIVE",
                "REQUEST_EXPLANATION",
                "CHANGE_BUDGET",
                "MODIFY_REQUIREMENTS",
                "PAYMENT_GUIDANCE",
                "GENERAL_QUESTION",
                "NEW_SEARCH"
              ],
              description: "The classified action for the user follow-up."
            },
            budget: {
              type: SchemaType.INTEGER,
              description: "Extracted budget amount in INR if changed."
            },
            wireless: {
              type: SchemaType.BOOLEAN,
              description: "Extracted wireless preference if changed."
            },
            batteryPriority: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["low", "medium", "high"],
              description: "Extracted battery priority if changed."
            },
            useCase: {
              type: SchemaType.STRING,
              description: "Extracted use case if changed."
            }
          },
          required: ["action"]
        }
      }
    });

    const conversationContextSummary = {
      originalIntent: context.originalIntent,
      latestIntent: context.latestIntent,
      recommendedProduct: context.recommendedProduct ? {
        name: context.recommendedProduct.name,
        price: context.recommendedProduct.price,
        merchantName: context.recommendedProduct.merchantName
      } : null,
      currentUpsell: context.currentUpsell ? {
        name: context.currentUpsell.name,
        price: context.currentUpsell.price
      } : null,
      recentMessages: context.recentMessages.slice(-5)
    };

    const prompt = `Classify this user message:\n\n"${message}"\n\nContext:\n${JSON.stringify(conversationContextSummary, null, 2)}`;
    
    return await withTimeout(
      (async () => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (!text) {
          return classifyFollowUpFallback(message, context);
        }

        const parsed = JSON.parse(text);
        return {
          action: parsed.action,
          ...(parsed.budget ? { budget: Math.round(Number(parsed.budget)) } : {}),
          ...(parsed.wireless !== undefined ? { wireless: !!parsed.wireless } : {}),
          ...(parsed.batteryPriority ? { batteryPriority: parsed.batteryPriority } : {}),
          ...(parsed.useCase ? { useCase: String(parsed.useCase) } : {})
        };
      })(),
      1200,
      () => classifyFollowUpFallback(message, context)
    );
  } catch (error: any) {
    return classifyFollowUpFallback(message, context);
  }
}

/**
 * Deterministic fallback parser to extract shopping intent from user message.
 */
export function extractIntentFromMessageFallback(message: string): UserIntent {
  const normalized = message.toLowerCase();

  // 1. Category extraction
  let productCategory = "Mechanical Keyboard"; // Default
  if (normalized.includes("keyboard") || normalized.includes("key board")) {
    productCategory = "Mechanical Keyboard";
  } else if (normalized.includes("mouse") || normalized.includes("mice")) {
    productCategory = "Wireless Mouse";
  } else if (normalized.includes("wrist") || normalized.includes("rest")) {
    productCategory = "Wrist Rest";
  } else if (normalized.includes("pad") || normalized.includes("mat")) {
    productCategory = "Mouse Pad";
  } else if (normalized.includes("headphone") || normalized.includes("earphone") || normalized.includes("headset") || normalized.includes("audio")) {
    productCategory = "Headphones";
  } else if (normalized.includes("monitor") || normalized.includes("screen") || normalized.includes("display")) {
    productCategory = "Monitors";
  } else if (normalized.includes("webcam") || normalized.includes("camera")) {
    productCategory = "Webcams";
  } else if (normalized.includes("stand")) {
    productCategory = "Laptop Accessories";
  } else if (normalized.includes("hub") || normalized.includes("dock")) {
    productCategory = "USB Hubs";
  }

  // 2. Budget extraction
  let budget: number | undefined;
  const budgetRegex = /(?:under|below|budget|price|rs\.?|inr|₹|to)\s*([0-9,]+)/i;
  const match = budgetRegex.exec(message);
  if (match) {
    const val = parseInt(match[1].replace(/,/g, ""), 10);
    if (!isNaN(val) && val > 0) {
      budget = val;
    }
  } else {
    // Search for numbers between 100 and 50000
    const numbers = message.match(/\b\d+(?:,\d{3})*\b/g);
    if (numbers) {
      for (const numStr of numbers) {
        const val = parseInt(numStr.replace(/,/g, ""), 10);
        if (!isNaN(val) && val >= 100 && val <= 50000) {
          budget = val;
        }
      }
    }
  }

  // 3. Wireless preference
  let wireless: boolean | undefined;
  if (normalized.includes("wireless") || normalized.includes("cordless") || normalized.includes("bluetooth")) {
    wireless = true;
  } else if (normalized.includes("wired") || normalized.includes("cable") || normalized.includes("cord")) {
    wireless = false;
  }

  // 4. Battery priority
  let batteryPriority: "low" | "medium" | "high" | undefined;
  if (normalized.includes("battery") || normalized.includes("hours") || normalized.includes("charging")) {
    batteryPriority = "high";
  }

  // 5. Use case
  let useCase: string | undefined;
  if (normalized.includes("programming") || normalized.includes("coding") || normalized.includes("coder") || normalized.includes("developer")) {
    useCase = "programming";
  } else if (normalized.includes("gaming") || normalized.includes("gamer") || normalized.includes("play") || normalized.includes("esports")) {
    useCase = "gaming";
  } else if (normalized.includes("office") || normalized.includes("work")) {
    useCase = "office";
  } else if (normalized.includes("travel") || normalized.includes("portable")) {
    useCase = "travel";
  } else if (normalized.includes("ergonomic") || normalized.includes("health") || normalized.includes("rsi")) {
    useCase = "ergonomics";
  }

  return {
    productCategory,
    ...(budget !== undefined ? { budget } : {}),
    ...(wireless !== undefined ? { wireless } : {}),
    ...(batteryPriority !== undefined ? { batteryPriority } : {}),
    ...(useCase !== undefined ? { useCase } : {})
  };
}

/**
 * Deterministic fallback classifier to route user follow-ups when Gemini is rate-limited or unavailable.
 */
export function classifyFollowUpFallback(
  message: string,
  context: CommerceConversationContext
): { action: ConversationAction; budget?: number; wireless?: boolean; batteryPriority?: "low" | "medium" | "high"; useCase?: string; targetCandidateIndex?: number; directMessage?: string } {
  const routerResult = routeConversationalMessage(message, context);
  if (routerResult.action !== "UNKNOWN") {
    return {
      action: routerResult.action,
      targetCandidateIndex: routerResult.targetCandidateIndex,
      directMessage: routerResult.directMessage,
      ...(routerResult.extractedRequirements || {})
    };
  }

  const normalized = message.toLowerCase().trim();

  const explanationWords = [
    "why choose", 
    "why x instead of y",
    "compare",
    "difference",
    "tradeoff",
    "trade-off",
    "trade off",
    "anything better",
    "better option"
  ];
  if (explanationWords.some(w => normalized.includes(w))) {
    return { action: "REQUEST_EXPLANATION" };
  }

  // 9. PRODUCT FACT / SPEC QUESTIONS
  const specQuestions = [
    "is it wireless",
    "is it wired",
    "battery life",
    "how long does the battery",
    "how long does battery",
    "bluetooth",
    "rgb",
    "mac",
    "macos",
    "apple",
    "compatible",
    "switches",
    "layout",
    "payment",
    "how to pay",
    "how do i pay",
    "checkout"
  ];
  if (specQuestions.some(w => normalized.includes(w))) {
    return { action: "GENERAL_QUESTION" };
  }

  // 10. CHANGE_BUDGET
  const budgetRegex = /(?:budget|limit|rs\.?|₹|inr|price|to)\s*([0-9,]+)/i;
  const budgetMatch = budgetRegex.exec(message);
  if (budgetMatch) {
    const val = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(val) && val >= 100) {
      return { action: "CHANGE_BUDGET", budget: val };
    }
  }

  // 11. MODIFY_REQUIREMENTS
  let wireless: boolean | undefined;
  let batteryPriority: "low" | "medium" | "high" | undefined;
  let useCase: string | undefined;
  let requirementsChanged = false;

  if (normalized.includes("wireless") || normalized.includes("cordless")) {
    wireless = true;
    requirementsChanged = true;
  } else if (normalized.includes("wired") || normalized.includes("cable")) {
    wireless = false;
    requirementsChanged = true;
  }

  if (normalized.includes("battery") || normalized.includes("hours")) {
    batteryPriority = "high";
    requirementsChanged = true;
  }

  if (normalized.includes("programming") || normalized.includes("coding")) {
    useCase = "programming";
    requirementsChanged = true;
  } else if (normalized.includes("gaming") || normalized.includes("gamer")) {
    useCase = "gaming";
    requirementsChanged = true;
  }

  if (requirementsChanged) {
    return {
      action: "MODIFY_REQUIREMENTS",
      ...(wireless !== undefined ? { wireless } : {}),
      ...(batteryPriority !== undefined ? { batteryPriority } : {}),
      ...(useCase !== undefined ? { useCase } : {})
    };
  }

  // 12. NEW_SEARCH
  const searchWords = ["i need a", "i want a", "look for", "search for", "find a", "looking for"];
  if (searchWords.some(w => normalized.includes(w))) {
    return { action: "NEW_SEARCH" };
  }

  return { action: "GENERAL_FOLLOW_UP" };
}
