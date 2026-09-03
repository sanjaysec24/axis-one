import { 
  ConversationAction, 
  CommerceConversationContext, 
  RouterResult, 
  UserIntent, 
  RankedResult,
  Product 
} from "./types";
import { getAllProducts, getProductById } from "./catalog";

/**
 * Deterministic Fast Conversational Router.
 * Evaluates short conversational messages, contextual references, item removals,
 * comparisons, and state transitions BEFORE invoking expensive Gemini extraction.
 */
export function routeConversationalMessage(
  message: string,
  context?: CommerceConversationContext
): RouterResult {
  const clean = message.toLowerCase().trim().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  const normalized = clean;
  const words = clean.split(/\s+/);

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
        directMessage: `Hey! 👋 Your ${activeProduct.name} selection from ${activeProduct.merchantName || "merchant"} (₹${activeProduct.price}) is still active. Want to compare alternatives, adjust your budget, or continue to checkout?`,
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
  // 2B. PAUSE / WAIT ("wait", "hold on", "pause", "give me a sec")
  // =========================================================================
  if (/^(wait|hold on|pause|give me a second|give me a sec|one second|one sec|wait a minute|wait a sec)$/i.test(clean)) {
    return {
      action: "KEEP_CURRENT_SELECTION",
      confidence: 1.0,
      directMessage: "No rush at all! Take your time, and let me know whenever you'd like to adjust items, compare stores, or proceed.",
      reasoning: "User asked to pause/wait."
    };
  }

  // =========================================================================
  // 2C. HELP & AGENT CAPABILITIES
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
  // 3. ITEM REMOVAL (PRIORITY 1 FOR COMMERCE ACTIONS)
  // "remove wrist support", "remove wrist rest", "remove wrist band", "remove the wrist support",
  // "remove ErgoBest Wrist Support", "remove it", "drop accessory", "without wrist rest", "remove keyboard"
  // =========================================================================
  const isRemoveIntent = 
    clean.startsWith("remove ") ||
    clean.startsWith("drop ") ||
    clean.startsWith("delete ") ||
    clean.startsWith("take off ") ||
    clean.startsWith("take out ") ||
    clean.startsWith("without ") ||
    clean.startsWith("exclude ") ||
    clean.startsWith("leave out ") ||
    clean.includes("don't want") ||
    clean.includes("dont want") ||
    clean.includes("no accessory") ||
    clean.includes("without the accessory") ||
    clean === "remove it" ||
    clean === "remove that" ||
    clean === "drop it" ||
    clean === "drop that" ||
    clean === "take it off";

  if (isRemoveIntent) {
    // Extract raw target item phrase
    const rawTarget = clean
      .replace(/^(remove|drop|delete|take off|take out|without|exclude|leave out|don't want|dont want)\s+(the\s+)?/i, "")
      .replace(/^(a\s+|an\s+)/i, "")
      .trim();

    // Check if user is referencing the upsell accessory generically or specifically
    const isGenericUpsellRef = 
      rawTarget === "it" || 
      rawTarget === "that" || 
      rawTarget === "accessory" || 
      rawTarget === "the accessory" || 
      rawTarget === "upsell" || 
      clean === "no accessory" || 
      clean === "without the accessory";

    // 1. Try matching against items in currentBasket
    if (activeBasket.length > 0) {
      // Find candidate match in basket
      const basketMatch = activeBasket.find(item => {
        const itemName = item.name.toLowerCase();
        const itemCat = item.category.toLowerCase();
        
        if (isGenericUpsellRef) {
          // If generic "it/accessory", match the item that is not the main recommended product
          return item.id !== activeProduct?.id;
        }

        // Exact or substring match on product name or category
        if (rawTarget.length >= 3 && (itemName.includes(rawTarget) || rawTarget.includes(itemName))) {
          return true;
        }

        // Token-based matching (e.g. "wrist support" matching "ErgoBest Wrist Support" or "Wrist Rest")
        const targetTokens = rawTarget.split(/\s+/).filter(t => t.length >= 3);
        if (targetTokens.length > 0) {
          const matchCount = targetTokens.filter(t => itemName.includes(t) || itemCat.includes(t)).length;
          return matchCount >= 1 && (item.id !== activeProduct?.id || targetTokens.some(t => itemCat.includes(t)));
        }

        return false;
      });

      if (basketMatch) {
        const isUpsell = basketMatch.id !== activeProduct?.id || basketMatch.id === context?.currentUpsell?.id;
        return {
          action: isUpsell ? "REMOVE_UPSELL" : "REMOVE_PRODUCT",
          targetProductId: basketMatch.id,
          confidence: 1.0,
          reasoning: `User requested removal of ${basketMatch.name} from basket.`
        };
      }
    }

    // 2. Try matching against currentUpsell even if not yet added to currentBasket
    if (context?.currentUpsell) {
      const upName = context.currentUpsell.name.toLowerCase();
      const upCat = context.currentUpsell.category.toLowerCase();
      if (
        isGenericUpsellRef || 
        (rawTarget.length >= 3 && (upName.includes(rawTarget) || rawTarget.includes(upName) || upCat.includes(rawTarget))) ||
        rawTarget.split(/\s+/).some(t => t.length >= 3 && (upName.includes(t) || upCat.includes(t)))
      ) {
        return {
          action: "REMOVE_UPSELL",
          targetProductId: context.currentUpsell.id,
          confidence: 1.0,
          reasoning: `User requested removal of proposed upsell accessory ${context.currentUpsell.name}.`
        };
      }
    }

    // If context has multiple items and remove requested with "it"
    if (activeBasket.length > 1) {
      const accessory = activeBasket.find(item => item.id !== activeProduct?.id);
      if (accessory) {
        return {
          action: "REMOVE_UPSELL",
          targetProductId: accessory.id,
          confidence: 1.0,
          reasoning: `User requested removal of accessory ${accessory.name}.`
        };
      }
    }

    // If only one item in basket and user asks to remove it
    if (activeBasket.length === 1) {
      return {
        action: "REMOVE_PRODUCT",
        targetProductId: activeBasket[0].id,
        confidence: 0.95,
        reasoning: `User requested removal of ${activeBasket[0].name}.`
      };
    }
  }

  // =========================================================================
  // 4. CHEAPER REQUESTS ("cheaper", "find something cheaper", "show cheaper", "cheaper option")
  // =========================================================================
  if (
    clean === "cheaper" ||
    clean === "cheaper?" ||
    clean === "cheapest" ||
    clean === "cheapest?" ||
    clean === "show cheaper" ||
    clean === "show me cheaper" ||
    clean === "find something cheaper" ||
    clean === "cheaper option" ||
    clean === "cheaper one" ||
    clean === "anything cheaper" ||
    clean === "anything cheaper?" ||
    clean === "is there a cheaper one" ||
    clean === "is there a cheaper one?" ||
    clean === "too expensive" ||
    clean === "lower price" ||
    clean.includes("the cheaper one") || 
    clean.includes("cheaper one") || 
    clean.includes("pick the cheaper") || 
    clean.includes("select the cheaper") ||
    clean.includes("go with the cheaper")
  ) {
    return {
      action: "REQUEST_CHEAPER_OPTION",
      confidence: 1.0,
      reasoning: "User requested cheaper alternative product."
    };
  }

  // =========================================================================
  // 5. PRODUCT & MERCHANT COMPARISON
  // ("compare", "compare the top 3", "compare these", "compare them", "what is the difference", "which is better")
  // =========================================================================
  if (
    clean === "compare" ||
    clean === "compare?" ||
    clean === "compare them" ||
    clean === "compare these" ||
    clean === "compare all" ||
    clean.startsWith("compare ") ||
    clean.includes("difference") ||
    clean.includes("differences") ||
    clean.includes("which is better") ||
    clean.includes("which one is better") ||
    clean.includes("which should i buy") ||
    clean.includes("which should i choose") ||
    clean.includes("which one should i buy") ||
    clean.includes("which one should i choose") ||
    clean.includes("which is cheaper") ||
    clean.includes("which one is cheaper") ||
    clean.includes("better battery") ||
    clean.includes("better warranty") ||
    clean.includes("better for programming") ||
    clean.includes("better for gaming") ||
    clean.includes("better for office") ||
    clean.includes("which merchant") ||
    clean.includes("different stores") ||
    clean.includes("better deal")
  ) {
    return {
      action: "PRODUCT_COMPARISON",
      confidence: 1.0,
      reasoning: "User requested intelligent product comparison."
    };
  }

  // =========================================================================
  // 6. REFERENCES, ORDINALS & SELECTIONS FROM COMPARISON
  // ("first one", "the first one", "choose the first one", "second one", "the second one", "choose the second one")
  // =========================================================================
  if (
    clean === "first" ||
    clean === "the first" ||
    clean === "first one" ||
    clean === "the first one" ||
    clean === "i want the first one" ||
    clean.includes("choose the first") ||
    clean.includes("select the first") ||
    clean.includes("take the first") ||
    clean.includes("i'll take the first") ||
    clean.includes("ill take the first") ||
    clean === "option 1" ||
    clean === "rank 1" ||
    clean === "#1"
  ) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 0,
      confidence: 1.0,
      reasoning: "User selected candidate index 0 (the first one)."
    };
  }

  if (
    clean === "second" ||
    clean === "the second" ||
    clean === "second one" ||
    clean === "the second one" ||
    clean === "i want the second one" ||
    clean.includes("choose the second") ||
    clean.includes("select the second") ||
    clean.includes("take the second") ||
    clean.includes("i'll take the second") ||
    clean.includes("ill take the second") ||
    clean === "option 2" ||
    clean === "rank 2" ||
    clean === "#2"
  ) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 1,
      confidence: 1.0,
      reasoning: "User selected candidate index 1 (the second one)."
    };
  }

  if (
    clean === "third" ||
    clean === "the third" ||
    clean === "third one" ||
    clean === "the third one" ||
    clean === "i want the third one" ||
    clean.includes("choose the third") ||
    clean.includes("select the third") ||
    clean.includes("take the third") ||
    clean.includes("i'll take the third") ||
    clean.includes("ill take the third") ||
    clean === "option 3" ||
    clean === "rank 3" ||
    clean === "#3"
  ) {
    return {
      action: "CONFIRM_REFERENCED_PRODUCT",
      targetCandidateIndex: 2,
      confidence: 1.0,
      reasoning: "User selected candidate index 2 (the third one)."
    };
  }

  // Explicit Selection by Name: "select NovaKey", "take KeyForge", "choose Pulse", "select Apex"
  if (
    clean.startsWith("select ") || 
    clean.startsWith("take ") || 
    clean.startsWith("choose ") || 
    clean.startsWith("pick ") ||
    clean.startsWith("i'll take ") ||
    clean.startsWith("ill take ")
  ) {
    const rawTarget = clean.replace(/^(select|take|choose|pick|i'll take|ill take)\s+(the\s+)?/i, "").trim();
    const all = getAllProducts();
    const matched = all.find(p => 
      p.name.toLowerCase().includes(rawTarget) || 
      p.id.toLowerCase().includes(rawTarget) ||
      rawTarget.split(/\s+/).some(part => part.length >= 4 && p.name.toLowerCase().includes(part))
    );

    if (matched) {
      return {
        action: "CONFIRM_REFERENCED_PRODUCT",
        targetProductId: matched.id,
        confidence: 1.0,
        reasoning: `User explicitly selected product ${matched.name}.`
      };
    }
  }

  // =========================================================================
  // 7. EXPLANATION & "WHY" QUERIES ("why", "why?", "why this one?", "why this product?")
  // =========================================================================
  if (/^(why|why\?|why this|why this one|why this one\?|why did you choose this|why did you pick this|why did you recommend this|why recommend this|explain|tell me why|why this product|why this keyboard|why this mouse)\??$/i.test(normalized)) {
    return {
      action: "REQUEST_EXPLANATION",
      confidence: 1.0,
      reasoning: "User requested explanation of active product recommendation."
    };
  }

  // =========================================================================
  // 8. PAYMENT & CHECKOUT GUIDANCE ("payment", "checkout", "how to pay")
  // =========================================================================
  if (/^(payment|checkout|pay|how to pay|how do i pay|pay now|proceed to checkout|proceed to pay|payment options|payment methods)\??$/i.test(clean)) {
    return {
      action: "PAYMENT_GUIDANCE",
      confidence: 1.0,
      reasoning: "User requested payment guidance."
    };
  }

  // =========================================================================
  // 9. EXPLICIT CONFIRMATION / APPROVAL ("okay", "okayyy", "ok", "yes", "confirm", "I'll take it")
  // =========================================================================
  const isExplicitConfirm = 
    clean.includes("i'll take it") || 
    clean.includes("ill take it") || 
    clean.includes("take it") || 
    clean.includes("confirm") || 
    clean.includes("buy now") || 
    clean.includes("let's do it") || 
    clean.includes("lets do it") || 
    clean.includes("proceed to checkout") || 
    clean.includes("proceed to payment") ||
    /^(okay|okayy|okayyy|ok|okk|okkk|yes|yess|yesss|sure|yep|yeah|deal|done|go ahead|sounds good|looks good)$/i.test(clean);

  if (isExplicitConfirm) {
    return {
      action: "CONFIRM_SELECTION",
      confidence: (activeProduct || activeBasket.length > 0) ? 1.0 : 0.95,
      reasoning: "User confirmed basket selection."
    };
  }

  // =========================================================================
  // 10. CANCEL SELECTION ("cancel", "no thanks", "nevermind")
  // =========================================================================
  if (
    clean === "cancel" || 
    clean === "nevermind" || 
    clean === "no" || 
    clean === "nah" || 
    clean === "nope" || 
    clean.includes("cancel") ||
    clean.includes("no thanks")
  ) {
    return {
      action: "CANCEL_SELECTION",
      confidence: 1.0,
      reasoning: "User cancelled selection."
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
    "wrist rest": "Wrist Rest",
    "wrist support": "Wrist Rest"
  };

  if (categoryKeywords[normalized]) {
    const cat = categoryKeywords[normalized];
    const prevIntent = context?.latestIntent || context?.originalIntent;

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
