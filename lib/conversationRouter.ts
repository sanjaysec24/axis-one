import { 
  ConversationAction, 
  CommerceConversationContext, 
  RouterResult, 
  UserIntent, 
  RankedResult 
} from "./types";
import { getAllProducts, getProductById } from "./catalog";

/**
 * Deterministic Fast Conversational Router.
 * Evaluates short conversational messages, contextual references, and state transitions
 * BEFORE invoking expensive Gemini extraction.
 */
export function routeConversationalMessage(
  message: string,
  context?: CommerceConversationContext
): RouterResult {
  const clean = message.toLowerCase().trim().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  const normalized = clean;
  const words = clean.split(/\s+/);
  const wordCount = words.length;

  const lastAssistantMsg = context?.recentMessages
    ? [...context.recentMessages].reverse().find(m => m.role === "AXIS_ONE")?.content.toLowerCase() || ""
    : "";

  const pendingAction = context?.pendingAction;
  const activeProduct = context?.recommendedProduct || context?.currentProduct;
  const activeBasket = context?.currentBasket || [];
  const candidatePool = context?.candidatePool || [];

  // =========================================================================
  // 1. GREETINGS ("hi", "hello", "hey", "hello there", "good morning")
  // =========================================================================
  if (
    clean === "hi" || 
    clean === "hello" || 
    clean === "hey" || 
    clean.startsWith("hi ") || 
    clean.startsWith("hello ") || 
    clean.startsWith("hey ") ||
    /^(greetings|good\s*(morning|afternoon|evening|day)|yo|sup)$/i.test(clean)
  ) {
    if (activeProduct) {
      return {
        action: "GREETING",
        confidence: 1.0,
        directMessage: `Hey! 👋 Your ${activeProduct.name} selection from ${activeProduct.merchantName} (₹${activeProduct.price}) is still active. Want to compare alternatives, adjust your budget, or continue to checkout?`,
        reasoning: "Retained active session product on greeting."
      };
    }
    return {
      action: "GREETING",
      confidence: 1.0,
      directMessage: "Hey! I'm AXIS ONE, your AI Buyer Agent. Tell me what product you're looking for and your budget, and I'll find and validate the best options across our verified merchants.",
      reasoning: "New session greeting."
    };
  }

  // =========================================================================
  // 2. THANKS & FAREWELLS
  // =========================================================================
  if (
    clean.includes("thank") || 
    clean.includes("thanks") || 
    clean === "thx" || 
    clean === "ty" || 
    clean.includes("appreciate")
  ) {
    return {
      action: "THANKS",
      confidence: 1.0,
      directMessage: "You're very welcome! Let me know if you'd like to adjust your selection, compare with other stores, or proceed to payment.",
      reasoning: "User expressed gratitude."
    };
  }

  if (/^(bye|goodbye|see ya|cya|exit|quit|later|bye bye)$/i.test(clean) || clean.startsWith("bye ") || clean.startsWith("goodbye ")) {
    return {
      action: "FAREWELL",
      confidence: 1.0,
      directMessage: "Goodbye! Your cart and preferences will be ready whenever you return.",
      reasoning: "User signed off."
    };
  }

  // =========================================================================
  // 2B. HELP & AGENT CAPABILITIES
  // =========================================================================
  if (
    clean === "help" || 
    clean === "help me" || 
    clean === "what can you do" || 
    clean === "what do you do" ||
    clean.includes("how does this work") ||
    clean.includes("what can you help")
  ) {
    return {
      action: "CLARIFICATION_REQUIRED",
      confidence: 1.0,
      directMessage: "I'm AXIS ONE, your AI Buyer Agent across verified merchants (Nexora Tech, TechNova, ByteMart, CircuitHub, GearGrid). I can find products matching your exact budget and specs, compare merchant warranties and prices, recommend accessories, validate merchant compliance, and process Razorpay checkouts. Tell me what you're looking for!",
      clarificationPrompt: "Tell me what product you're looking for and your budget to get started!",
      reasoning: "Agent explained multi-merchant commerce capabilities."
    };
  }

  // =========================================================================
  // 3. CONTEXTUAL YES / NO & CANCEL RESOLUTION
  // =========================================================================
  const isYes = 
    clean === "yes" || 
    clean === "yeah" || 
    clean === "yep" || 
    clean === "yup" || 
    clean === "sure" || 
    clean === "ok" || 
    clean === "okay" || 
    clean.includes("yes") || 
    clean.includes("sounds good") || 
    clean.includes("let's do it") || 
    clean.includes("lets do it") || 
    clean.includes("go ahead") || 
    clean.includes("i'll take it") || 
    clean.includes("ill take it") || 
    clean.includes("take it") || 
    clean.includes("confirm");

  const isNo = 
    clean === "no" || 
    clean === "nah" || 
    clean === "nope" || 
    clean.includes("cancel") || 
    clean.includes("no thanks") || 
    clean.includes("don't want") || 
    clean.includes("dont want") || 
    clean.includes("drop it") || 
    clean.startsWith("no ");

  if (isYes || isNo) {
    // Check if the previous message or pending action was asking about upsell
    const isUpsellPrompt = pendingAction === "ADD_UPSELL_PROMPT" || 
      lastAssistantMsg.includes("wrist support") || 
      lastAssistantMsg.includes("wrist rest") || 
      lastAssistantMsg.includes("accessory") ||
      lastAssistantMsg.includes("add the");

    const isCheaperPrompt = pendingAction === "CHEAPER_ALTERNATIVE_PROMPT" || 
      lastAssistantMsg.includes("cheaper alternative") || 
      lastAssistantMsg.includes("switch to");

    const isCheckoutPrompt = pendingAction === "CONFIRM_CHECKOUT" || 
      lastAssistantMsg.includes("checkout") || 
      lastAssistantMsg.includes("ready for checkout") || 
      lastAssistantMsg.includes("proceed to payment") ||
      lastAssistantMsg.includes("proceed?");

    if (isUpsellPrompt) {
      if (isYes) {
        return {
          action: "ADD_UPSELL",
          confidence: 1.0,
          reasoning: "Contextual YES accepted proposed upsell accessory."
        };
      } else {
        return {
          action: "KEEP_CURRENT_SELECTION",
          confidence: 1.0,
          directMessage: `Kept your main selection (${activeProduct?.name || "product"}) without the accessory. Ready for checkout whenever you are!`,
          reasoning: "Contextual NO declined proposed upsell accessory."
        };
      }
    }

    if (isCheaperPrompt) {
      if (isYes) {
        return {
          action: "REQUEST_CHEAPER_OPTION",
          confidence: 1.0,
          reasoning: "Contextual YES requested cheaper alternative switch."
        };
      } else {
        return {
          action: "KEEP_CURRENT_SELECTION",
          confidence: 1.0,
          directMessage: `Understood — keeping your ${activeProduct?.name || "current selection"}.`,
          reasoning: "Contextual NO kept current recommendation over cheaper alternative."
        };
      }
    }

    if (isCheckoutPrompt) {
      if (isYes) {
        return {
          action: "CONFIRM_SELECTION",
          confidence: 1.0,
          reasoning: "Contextual YES confirmed checkout readiness."
        };
      } else {
        return {
          action: "KEEP_CURRENT_SELECTION",
          confidence: 1.0,
          directMessage: "No problem. Let me know if you want to explore other products or adjust features.",
          reasoning: "Contextual NO paused checkout confirmation."
        };
      }
    }

    // Generic YES confirms selection
    if (isYes) {
      return {
        action: "CONFIRM_SELECTION",
        confidence: 0.95,
        reasoning: "Affirmative message confirmed current selection."
      };
    }

    if (isNo) {
      if (clean.includes("cancel") || !context) {
        return {
          action: "CANCEL_SELECTION",
          confidence: 0.95,
          reasoning: "User cancelled selection."
        };
      }
      return {
        action: "KEEP_CURRENT_SELECTION",
        confidence: 0.95,
        directMessage: "Understood. Let me know what you'd like to change.",
        reasoning: "Negative response retained current state."
      };
    }
  }

  // =========================================================================
  // 4. EXPLANATION & "WHY" QUERIES ("why", "why this", "why this one", "why novakey?")
  // =========================================================================
  if (/^(why|why\?|why this|why this one|why this one\?|why did you choose this|why did you pick this|why did you recommend this|why recommend this|explain|tell me why|why this product|why this keyboard)\??$/i.test(normalized)) {
    return {
      action: "REQUEST_EXPLANATION",
      confidence: 1.0,
      reasoning: "User requested explanation of active product recommendation."
    };
  }

  // =========================================================================
  // 5. CHEAPER REQUESTS ("cheaper", "anything cheaper?", "is there a cheaper one?")
  // =========================================================================
  if (/^(cheaper|anything cheaper|anything cheaper\?|is there a cheaper one|is there a cheaper one\?|show me cheaper|show cheaper|make it cheaper|too expensive|cheaper alternative|cheapest option|lower price)\??$/i.test(normalized)) {
    return {
      action: "REQUEST_CHEAPER_OPTION",
      confidence: 1.0,
      reasoning: "User requested cheaper alternative product."
    };
  }

  // =========================================================================
  // 6. MERCHANT & PRODUCT COMPARISON ("compare", "which merchant is cheaper?")
  // =========================================================================
  if (
    /^(compare|compare\?|compare these|compare options|which merchant has the best option|which merchant has the best option\?|which merchant is better|which merchant is cheaper|which merchant is cheaper\?|which one has better warranty|which one has better warranty\?|show me options from different stores|show options from different stores|is there a better deal|is there a better deal\?|compare stores|merchant comparison)\??$/i.test(normalized) ||
    normalized.includes("compare") ||
    normalized.includes("which merchant") ||
    normalized.includes("different stores") ||
    normalized.includes("better warranty") ||
    normalized.includes("better deal")
  ) {
    return {
      action: "PRODUCT_COMPARISON",
      confidence: 1.0,
      reasoning: "User requested cross-merchant product comparison."
    };
  }

  // =========================================================================
  // 7. PAYMENT & CHECKOUT GUIDANCE ("payment", "checkout", "how to pay")
  // =========================================================================
  if (/^(payment|checkout|pay|how to pay|how do i pay|pay now|proceed to checkout|proceed to pay|payment options|payment methods)\??$/i.test(normalized)) {
    return {
      action: "PAYMENT_GUIDANCE",
      confidence: 1.0,
      reasoning: "User requested payment guidance."
    };
  }

  // =========================================================================
  // 8. ITEM REMOVAL ("remove it", "remove that", "drop accessory", "remove wrist rest")
  // =========================================================================
  if (
    /^(remove it|remove that|drop it|remove accessory|drop accessory|remove the accessory|remove the wrist rest|remove wrist rest|remove the support|remove support|dont want the accessory|no accessory|take it off)$/i.test(normalized)
  ) {
    // If an upsell item is currently in the basket or context
    if (context?.currentUpsell || activeBasket.length > 1) {
      return {
        action: "REMOVE_UPSELL",
        confidence: 1.0,
        reasoning: "User requested removal of referenced accessory/upsell."
      };
    }
    return {
      action: "REMOVE_PRODUCT",
      confidence: 0.9,
      reasoning: "User requested removal of main item."
    };
  }

  // =========================================================================
  // 9. REFERENCES & ORDINALS ("the cheaper one", "the first one", "this one", "that one")
  // =========================================================================
  if (/^(the cheaper one|cheaper one|pick the cheaper one|select the cheaper one)$/i.test(normalized)) {
    return {
      action: "REQUEST_CHEAPER_OPTION",
      confidence: 1.0,
      reasoning: "User selected the cheaper option via ordinal reference."
    };
  }

  if (/^(the first one|first one|option 1|rank 1|#1|the first)$/i.test(normalized)) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 0,
      confidence: 1.0,
      reasoning: "User selected candidate index 0 (the first one)."
    };
  }

  if (/^(the second one|second one|option 2|rank 2|#2|the second)$/i.test(normalized)) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 1,
      confidence: 1.0,
      reasoning: "User selected candidate index 1 (the second one)."
    };
  }

  if (/^(the third one|third one|option 3|rank 3|#3|the third)$/i.test(normalized)) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 2,
      confidence: 1.0,
      reasoning: "User selected candidate index 2 (the third one)."
    };
  }

  if (/^(this one|that one|i'll take this one|i'll take that one|select this|select that|this keyboard|that keyboard)$/i.test(normalized)) {
    if (activeProduct) {
      return {
        action: "CONFIRM_SELECTION",
        confidence: 1.0,
        targetProductId: activeProduct.id,
        reasoning: "User confirmed the current active recommended product."
      };
    }
  }

  // =========================================================================
  // 10. OKAY / CONFIRMATION ACKNOWLEDGEMENTS ("okay", "ok", "sounds good", "i'll take it")
  // =========================================================================
  if (
    /^(okay|ok|sounds good|looks good|i'll take it|ill take it|confirm|proceed|buy|buy now|let's do it|lets do it|fine|deal)$/i.test(normalized)
  ) {
    return {
      action: "CONFIRM_SELECTION",
      confidence: 1.0,
      reasoning: "User confirmed proposal."
    };
  }

  // =========================================================================
  // 11. AMBIGUOUS SHORT MESSAGES ("that", "this", "which", "what")
  // =========================================================================
  if (/^(that|this|which|what|it|option)$/i.test(normalized)) {
    const upsellName = context?.currentUpsell?.name;
    const prodName = activeProduct?.name;
    let clar = "Sure — could you clarify what you mean?";
    if (prodName && upsellName) {
      clar = `Sure — do you mean the ${prodName}, the ${upsellName}, or another option?`;
    } else if (prodName) {
      clar = `Sure — do you mean the ${prodName}, or would you like to compare other options?`;
    }
    return {
      action: "CLARIFICATION_REQUIRED",
      confidence: 1.0,
      directMessage: clar,
      clarificationPrompt: clar,
      reasoning: "Ambiguous pronoun message resolved to clarifying question without searching."
    };
  }

  // =========================================================================
  // 12. CATEGORY-ONLY / INCOMPLETE QUERIES ("keyboard", "mouse", "headphones")
  // =========================================================================
  const categoryKeywords: Record<string, string> = {
    "keyboard": "Mechanical Keyboard",
    "keyboards": "Mechanical Keyboard",
    "mechanical keyboard": "Mechanical Keyboard",
    "mouse": "Wireless Mouse",
    "mice": "Wireless Mouse",
    "headphones": "Headphones",
    "headset": "Headphones",
    "monitor": "Monitors",
    "monitors": "Monitors",
    "webcam": "Webcams",
    "laptop stand": "Laptop Accessories",
    "usb hub": "USB Hubs",
    "wrist rest": "Wrist Rest"
  };

  if (categoryKeywords[normalized]) {
    const cat = categoryKeywords[normalized];
    const prevIntent = context?.latestIntent || context?.originalIntent;

    // If context already exists with budget or preferences, reuse them!
    if (prevIntent && prevIntent.budget) {
      return {
        action: "NEW_SEARCH",
        extractedRequirements: {
          productCategory: cat,
          budget: prevIntent.budget,
          wireless: prevIntent.wireless,
          batteryPriority: prevIntent.batteryPriority,
          useCase: prevIntent.useCase
        },
        confidence: 0.9,
        reasoning: "Category query enhanced by preserving previous budget/wireless requirements."
      };
    }

    // If fresh / no budget context, prompt clarifying question
    return {
      action: "CLARIFICATION_REQUIRED",
      extractedRequirements: { productCategory: cat },
      confidence: 1.0,
      directMessage: `Sure! I can help you find a great ${cat}. What budget should I stay within, and do you prefer wireless or wired?`,
      clarificationPrompt: `What budget should I stay within for your ${cat}, and do you prefer wireless or wired?`,
      reasoning: "Incomplete single-category query prompted for budget & connectivity preferences."
    };
  }

  // If no fast deterministic match, return UNKNOWN to allow full extraction / classification
  return {
    action: "UNKNOWN",
    confidence: 0
  };
}
