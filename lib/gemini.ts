import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { 
  UserIntent, 
  ExplanationContext, 
  ExplanationResult, 
  ConversationAction, 
  CommerceConversationContext,
  ResponseIntent 
} from "./types";

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
    ...(intent.useCase ? { useCase: intent.useCase } : {})
  };
}

/**
 * Extracts structured UserIntent from natural language messages using the Gemini API.
 */
export async function extractIntentFromMessage(message: string): Promise<UserIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured on the server.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const systemInstruction = 
    "You are the AXIS ONE intent extraction layer for a merchant commerce system.\n\n" +
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
    model: "gemini-3.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          productCategory: {
            type: SchemaType.STRING,
            description: "The shopping category requested, e.g. 'Mechanical Keyboard', 'Wireless Mouse', 'Wrist Rest', 'Mouse Pad', 'Headphones', 'Laptop Stand'."
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
            description: "The intended use case, e.g. 'gaming', 'programming', 'office', 'travel'."
          }
        },
        required: ["productCategory"]
      }
    }
  });

  const prompt = `Extract user shopping intent from this query:\n\n"${message}"`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch (err) {
      throw new Error("Malformed JSON received from Gemini: " + text);
    }

    return validateExtractedIntent(parsedJson);
  } catch (error: any) {
    console.warn("Gemini Intent Extraction failed. Degrading to deterministic fallback. Error Details:", {
      selectedModel: "gemini-3.5-flash",
      apiKeyExists: !!apiKey,
      message: error.message,
      status: error.status || "N/A",
      errorStack: error.stack
    });
    return extractIntentFromMessageFallback(message);
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
  if (/\b(payment|checkout|how to pay|where to pay|proceed to pay|pay now)\b/i.test(query)) {
    return "PAYMENT_GUIDANCE";
  }

  // 3. User action mappings
  if (action === "CONFIRM_SELECTION") {
    return "CONFIRMATION";
  }
  if (action === "CANCEL_SELECTION") {
    return "PAYMENT_CANCELLED";
  }
  if (action === "REMOVE_UPSELL" || action === "REMOVE_PRODUCT") {
    return "REMOVE_UPSELL";
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
    if (previousProduct || /\b(compare|vs|instead of|difference|versus)\b/i.test(query)) {
      return "PRODUCT_COMPARISON";
    }
    return "REQUEST_EXPLANATION";
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
    throw new Error("GEMINI_API_KEY environment variable is not configured on the server.");
  }

  const responseIntent = context.responseIntent || deriveResponseIntent(
    context.action,
    context.userQuery,
    context.transactionState,
    context.previousProduct,
    context.recentMessages
  );

  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction = 
    "You are AXIS ONE, an intelligent AI commerce buyer and recommendation advisor.\n\n" +
    "Your job is to generate a helpful, natural, non-repetitive, context-aware response for the user based strictly on the provided structured commerce data.\n\n" +
    "CRITICAL CONVERSATIONAL RULES:\n" +
    "1. NEVER repeat generic canned pitches across multiple conversation turns.\n" +
    "2. If the user asks a specific question (e.g., 'Is it wireless?', 'Why did you recommend this?', 'Remove the wrist rest'), ANSWER THAT SPECIFIC QUESTION DIRECTLY in the 'summary' field.\n" +
    "3. GREETING: 1 short sentence greeting the user and acknowledging their active item if one exists.\n" +
    "4. CONFIRMATION: 1 sentence confirming the basket is locked in for checkout, and directing them to click 'Pay securely via Razorpay' in the right-hand panel.\n" +
    "5. REMOVE_UPSELL / REMOVE_PRODUCT: 1 sentence confirming the removal and stating the updated basket total.\n" +
    "6. CHEAPER_ALTERNATIVE / REQUEST_CHEAPER: 2 sentences naming the cheaper option, exact price, savings compared to previous selection, and any trade-off (e.g. wired vs wireless).\n" +
    "7. BUDGET_UPDATE: 2 sentences confirming the recalculated budget and why the new recommendation fits best.\n" +
    "8. REQUEST_EXPLANATION / PRODUCT_COMPARISON: 2–3 informative sentences detailing why this product scored highest, key matching criteria, and trade-offs.\n" +
    "9. Use only the provided facts, prices, discounts, and policy validation results. Do not invent features or prices.";

  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          recommendationExplanation: {
            type: SchemaType.STRING,
            description: "Concise explanation of why the recommended product matches the user requirements."
          },
          upsellExplanation: {
            type: SchemaType.STRING,
            description: "Concise explanation of why the upsell or cross-sell is relevant. If upsell is null, gracefully state that no complementary product was added."
          },
          budgetExplanation: {
            type: SchemaType.STRING,
            description: "Concise explanation of whether the basket fits the user's budget."
          },
          policyExplanation: {
            type: SchemaType.STRING,
            description: "Concise explanation of the policy validation outcome."
          },
          summary: {
            type: SchemaType.STRING,
            description: "The primary conversational response displayed to the user in the chat feed. Must answer the user's latest query directly."
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

  const prompt = `Generate an adaptive, context-aware commerce response for responseIntent="${responseIntent}" and userQuery="${context.userQuery || ''}" based ONLY on this structured recommendation context:\n\n${JSON.stringify({ ...context, responseIntent }, null, 2)}`;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    if (!text) {
      throw new Error("Gemini returned an empty explanation response.");
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch (err) {
      throw new Error("Malformed JSON received from Gemini: " + text);
    }

    // Validate fields in JSON response
    const fields = ["recommendationExplanation", "upsellExplanation", "budgetExplanation", "policyExplanation", "summary"];
    for (const field of fields) {
      if (typeof parsedJson[field] !== "string" || parsedJson[field].trim() === "") {
        throw new Error(`Invalid or missing field "${field}" in Gemini explanation response.`);
      }
    }

    return {
      recommendationExplanation: parsedJson.recommendationExplanation,
      upsellExplanation: parsedJson.upsellExplanation,
      budgetExplanation: parsedJson.budgetExplanation,
      policyExplanation: parsedJson.policyExplanation,
      summary: parsedJson.summary
    };
  } catch (error: any) {
    console.error("Gemini Explanation Generation Error Details:", {
      selectedModel: "gemini-3.5-flash",
      apiKeyExists: !!apiKey,
      message: error.message,
      status: error.status || "N/A",
      errorStack: error.stack
    });
    throw error;
  }
}

/**
 * Generates a clean, deterministic, multi-category fallback explanation without invoking Gemini.
 */
export function generateFallbackExplanation(
  context: ExplanationContext
): Omit<ExplanationResult, "source"> {
  const { intent, recommendation, upsell, basket, policyValidation, previousProduct, tradeoffs, action, userQuery, transactionState, recentMessages } = context;

  const responseIntent = context.responseIntent || deriveResponseIntent(
    action,
    userQuery,
    transactionState,
    previousProduct,
    recentMessages
  );

  const query = (userQuery || "").toLowerCase().trim();

  // 1. Recommendation Explanation
  const batteryStr = recommendation.matchedCriteria.find(c => c.toLowerCase().includes("battery")) || "";
  const batteryPart = batteryStr ? `provides ${batteryStr.toLowerCase()}` : "";
  const wirelessPart = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless")) ? "wireless connectivity" : "";
  const useCasePart = intent.useCase ? `optimized for ${intent.useCase}` : "";
  const criteriaParts = [wirelessPart, batteryPart, useCasePart].filter(Boolean);
  const criteriaText = criteriaParts.length > 0 
    ? `featuring ${criteriaParts.join(" and ")}` 
    : "matching your requirements";

  const recExp = `${recommendation.name} at ₹${recommendation.price} fits your criteria (${criteriaText}).`;

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
        summary = `Hey! Your current selection of the ${recommendation.name} (₹${recommendation.price}) is active. Would you like to compare it, adjust your budget, or proceed to checkout?`;
        break;
      }

      case "INITIAL_RECOMMENDATION": {
        const budgetClause = intent.budget ? `Based on your ₹${intent.budget} budget and preferences` : "Based on your requirements";
        const remainingClause = basket.remainingBudget > 0 ? ` It leaves ₹${basket.remainingBudget} in budget flexibility.` : "";
        const upsellClause = upsell ? ` I've also paired it with an optional ${upsell.name} (₹${upsell.price}) for better ergonomics.` : "";
        summary = `${budgetClause}, I recommend the ${recommendation.name} (₹${recommendation.price}).${remainingClause}${upsellClause}`;
        break;
      }

      case "BUDGET_UPDATE": {
        const wirelessPreserved = recommendation.matchedCriteria.some(c => c.toLowerCase().includes("wireless")) ? " while preserving your wireless preference" : "";
        summary = `Got it — I've recalculated the options for your new ₹${intent.budget} budget. The ${recommendation.name} (₹${recommendation.price}) fits best${wirelessPreserved}.`;
        break;
      }

      case "CHEAPER_ALTERNATIVE": {
        let tradeOffText = "";
        if (tradeoffs && tradeoffs.length > 0) {
          tradeOffText = ` The trade-off is: ${tradeoffs.join(" ")}`;
        } else {
          tradeOffText = " It provides essential core functionality at a lower price point.";
        }
        const savings = previousProduct ? previousProduct.price - recommendation.price : 0;
        const savingsText = savings > 0 ? ` (saving ₹${savings})` : "";
        summary = `I found a cheaper option: ${recommendation.name} at ₹${recommendation.price}${savingsText}.${tradeOffText}`;
        break;
      }

      case "REMOVE_UPSELL": {
        summary = `Done. I've removed the complementary accessory and kept the ${recommendation.name} as your primary selection. Your basket total is updated to ₹${basket.total}.`;
        break;
      }

      case "ADD_UPSELL": {
        const upsellName = upsell ? upsell.name : "accessory";
        summary = `Added the ${upsellName} to your basket. Your updated total is ₹${basket.total}, which stays within your budget.`;
        break;
      }

      case "REQUEST_EXPLANATION": {
        const matchCriteria = recommendation.matchedCriteria.length > 0 ? recommendation.matchedCriteria.join(", ") : "your search criteria";
        let tradeText = "";
        if (tradeoffs && tradeoffs.length > 0) {
          tradeText = ` Note trade-offs: ${tradeoffs.join(" ")}`;
        }
        summary = `I recommended the ${recommendation.name} because it satisfies your strongest requirements (${matchCriteria}) at ₹${recommendation.price}. It scored highest in our catalog evaluation with verified stock and merchant policy compliance.${tradeText}`;
        break;
      }

      case "PRODUCT_COMPARISON": {
        const prevName = previousProduct ? previousProduct.name : "the previous option";
        const prevPrice = previousProduct ? `₹${previousProduct.price}` : "higher price";
        let tradeText = "";
        if (tradeoffs && tradeoffs.length > 0) {
          tradeText = ` Key trade-offs: ${tradeoffs.join(" ")}`;
        }
        summary = `Compared to ${prevName} (${prevPrice}), the ${recommendation.name} (₹${recommendation.price}) adjusts your cost to ₹${basket.total}.${tradeText} Both fit within merchant policy rules.`;
        break;
      }

      case "CONFIRMATION": {
        summary = `Great choice! Your basket with ${recommendation.name} is locked in and ready for secure checkout.`;
        break;
      }

      case "PAYMENT_GUIDANCE": {
        if (transactionState === "USER_CONFIRMED") {
          summary = `Your basket is confirmed! Click the 'Pay securely via Razorpay' button in the Proposed Basket panel on the right to complete checkout in test mode.`;
        } else if (transactionState === "PAYMENT_CANCELLED" || transactionState === "PAYMENT_FAILED") {
          summary = `Your basket is saved. Click 'Retry Payment Checkout' on the right whenever you're ready to proceed.`;
        } else {
          summary = `When you're ready to buy, simply say 'Okay, I'll take it' to confirm your basket and unlock checkout.`;
        }
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
        if (previousProduct || (tradeoffs && tradeoffs.length > 0)) {
          let tradeText = tradeoffs && tradeoffs.length > 0 ? ` Note trade-offs: ${tradeoffs.join(" ")}` : "";
          const prevText = previousProduct ? ` This replaces ${previousProduct.name} (₹${previousProduct.price}).` : "";
          summary = `${recommendation.name} (₹${recommendation.price}) is selected.${prevText}${tradeText}`;
        } else {
          summary = `I've updated your selection with the ${recommendation.name} (₹${recommendation.price}). The basket total is ₹${basket.total}, which complies with all merchant policies.`;
        }
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
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return classifyFollowUpFallback(message, context);
  }

  const systemInstruction = 
    "You are the AXIS ONE conversational follow-up classification layer.\n\n" +
    "Your job is to analyze the user's follow-up message in the context of the ongoing commerce session and classify it into exactly one of the following actions:\n" +
    "1. GREETING: Casual hello/greetings (e.g. 'hi', 'hello', 'hey').\n" +
    "2. CONFIRM_SELECTION: User confirms they want to proceed, accept, or buy the proposed basket (e.g. 'Okay, I'll take it', 'I will buy this', 'confirm', 'buy', 'yes', 'proceed', 'looks good').\n" +
    "3. CANCEL_SELECTION: User wants to cancel or stop the purchase flow (e.g. 'cancel', 'I changed my mind', 'nevermind').\n" +
    "4. REMOVE_UPSELL: User explicitly rejects or wants to remove the recommended upsell/cross-sell accessory (e.g. 'I don't want the wrist rest', 'remove the support', 'remove it', 'drop the accessory').\n" +
    "5. REMOVE_PRODUCT: User wants to remove the main product or clear cart (e.g. 'remove the keyboard', 'clear cart').\n" +
    "6. REQUEST_CHEAPER_OPTION: User wants a cheaper alternative (e.g. 'make it cheaper', 'anything cheaper?', 'show me something cheaper', 'is there a cheaper one?', 'cheaper', 'expensive', 'too costly').\n" +
    "7. REQUEST_ALTERNATIVE: User wants to see other alternative options (e.g. 'show me another one', 'show alternative', 'what else do you have?').\n" +
    "8. REQUEST_EXPLANATION: User asks for an explanation, reasoning, comparison, or why it was recommended (e.g. 'Why did you recommend this?', 'Why this one?', 'Why ClickyLite instead of SwiftType?').\n" +
    "9. CHANGE_BUDGET: User wants to change their budget limit (e.g. 'My budget is 4000', 'under ₹3500', 'make my budget 3000').\n" +
    "10. MODIFY_REQUIREMENTS: User wants to change features (e.g. 'I prefer wired', 'I don't need wireless', 'need longer battery life').\n" +
    "11. GENERAL_QUESTION: User asks a specific product fact question (e.g. 'Is it wireless?', 'Does it work with Mac?', 'What is the battery life?', 'how to pay?').\n" +
    "12. NEW_SEARCH: User wants to start a fresh search for a different product or category (e.g. 'I need a wireless mouse', 'search for headphones').\n\n" +
    "Extract any new values mentioned (e.g. budget, wireless preference, battery priority, useCase) ONLY if relevant.\n\n" +
    "Return valid structured JSON.";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
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
                "REQUEST_ALTERNATIVE",
                "REQUEST_EXPLANATION",
                "CHANGE_BUDGET",
                "MODIFY_REQUIREMENTS",
                "GENERAL_QUESTION",
                "NEW_SEARCH"
              ],
              description: "The classified action for the user follow-up."
            },
            budget: {
              type: SchemaType.INTEGER,
              description: "Extracted budget amount in INR if the user changes their budget."
            },
            wireless: {
              type: SchemaType.BOOLEAN,
              description: "Extracted wireless preference if changed (true for wireless/cordless, false for wired)."
            },
            batteryPriority: {
              type: SchemaType.STRING,
              format: "enum",
              enum: ["low", "medium", "high"],
              description: "Extracted battery life priority if changed."
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
        category: context.recommendedProduct.category
      } : null,
      currentUpsell: context.currentUpsell ? {
        name: context.currentUpsell.name,
        price: context.currentUpsell.price
      } : null,
      recentMessages: context.recentMessages.slice(-5)
    };

    const prompt = `Classify this user message:\n\n"${message}"\n\nGiven the current conversation context:\n${JSON.stringify(conversationContextSummary, null, 2)}`;
    
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
  } catch (error: any) {
    console.warn("Gemini Classification failed. Degrading to deterministic fallback. Error Details:", {
      message: error.message,
      status: error.status || "N/A"
    });
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
  } else if (normalized.includes("headphone") || normalized.includes("earphone") || normalized.includes("audio")) {
    productCategory = "Headphones";
  } else if (normalized.includes("stand")) {
    productCategory = "Laptop Stand";
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
    // Search for numbers between 100 and 20000
    const numbers = message.match(/\b\d+(?:,\d{3})*\b/g);
    if (numbers) {
      for (const numStr of numbers) {
        const val = parseInt(numStr.replace(/,/g, ""), 10);
        if (!isNaN(val) && val >= 100 && val <= 20000) {
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
  } else if (normalized.includes("gaming") || normalized.includes("gamer") || normalized.includes("play")) {
    useCase = "gaming";
  } else if (normalized.includes("office") || normalized.includes("work")) {
    useCase = "office";
  } else if (normalized.includes("travel") || normalized.includes("portable")) {
    useCase = "travel";
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
): { action: ConversationAction; budget?: number; wireless?: boolean; batteryPriority?: "low" | "medium" | "high"; useCase?: string } {
  const normalized = message.toLowerCase().trim();

  // 1. GREETING
  if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))\b/i.test(normalized) || normalized === "hi" || normalized === "hello" || normalized === "hey") {
    return { action: "GREETING" };
  }

  // 2. CONFIRM_SELECTION
  const confirmWords = [
    "okay, i'll take it", 
    "okay i'll take it", 
    "okay i will take it",
    "i'll take it",
    "ill take it",
    "take it", 
    "confirm", 
    "buy", 
    "approve", 
    "accept", 
    "proceed", 
    "yes", 
    "looks good",
    "sounds good",
    "let's do it",
    "order this",
    "order it"
  ];
  if (confirmWords.some(w => normalized === w || normalized.includes(w))) {
    return { action: "CONFIRM_SELECTION" };
  }

  // 3. CANCEL_SELECTION
  const cancelWords = ["cancel", "i changed my mind", "stop", "nevermind", "discard", "cancel order"];
  if (cancelWords.some(w => normalized === w || normalized.includes(w))) {
    return { action: "CANCEL_SELECTION" };
  }

  // 4. REMOVE_UPSELL
  const removeUpsellWords = [
    "remove the wrist rest", 
    "remove wrist rest", 
    "dont want the wrist rest",
    "don't want the wrist rest", 
    "no wrist rest", 
    "without the wrist rest", 
    "remove the support", 
    "without support", 
    "remove accessory",
    "drop the accessory",
    "remove the optional",
    "drop the support",
    "drop it",
    "remove it",
    "remove"
  ];
  if (removeUpsellWords.some(w => normalized.includes(w))) {
    return { action: "REMOVE_UPSELL" };
  }

  // 5. REMOVE_PRODUCT
  const removeProductWords = ["remove the keyboard", "remove keyboard", "remove mouse", "clear basket", "empty basket", "clear cart"];
  if (removeProductWords.some(w => normalized.includes(w))) {
    return { action: "REMOVE_PRODUCT" };
  }

  // 6. REQUEST_CHEAPER_OPTION
  const cheaperWords = [
    "make it cheaper",
    "anything cheaper", 
    "something cheaper",
    "cheaper option",
    "cheaper", 
    "cheap", 
    "less price", 
    "lower price", 
    "expensive", 
    "too expensive", 
    "cheapest",
    "is there a cheaper"
  ];
  if (cheaperWords.some(w => normalized.includes(w))) {
    return { action: "REQUEST_CHEAPER_OPTION" };
  }

  // 7. REQUEST_ALTERNATIVE
  const alternativeWords = [
    "show me another one",
    "show another one",
    "another one",
    "show alternative",
    "what else do you have",
    "other options",
    "another keyboard",
    "another mouse",
    "show more options",
    "alternative"
  ];
  if (alternativeWords.some(w => normalized.includes(w))) {
    return { action: "REQUEST_ALTERNATIVE" };
  }

  // 8. REQUEST_EXPLANATION / COMPARISON
  const explanationWords = [
    "why did you recommend", 
    "why did you choose", 
    "why this one", 
    "why this", 
    "explain", 
    "why", 
    "reason", 
    "choose", 
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
