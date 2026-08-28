import { getAllMerchants, getMerchantById } from "../data/merchants";
import { getAllProducts, searchProducts, getProductById } from "../lib/catalog";
import { rankProducts } from "../lib/ranking";
import { buildMerchantComparison } from "../lib/merchantComparison";
import { routeConversationalMessage } from "../lib/conversationRouter";
import { runAgentWorkflow } from "../lib/agentWorkflow";
import { validateTransaction } from "../lib/policy";
import { getSession } from "../lib/session";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS ${totalTests}] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL ${totalTests}] ${testName} -> ${detail || "Assertion failed"}`);
  }
}

async function runPhase5BTestSuite() {
  console.log("\n=======================================================");
  console.log("  AXIS ONE — PHASE 5B AUTOMATED TEST SUITE (40 TESTS)");
  console.log("=======================================================\n");

  // -------------------------------------------------------------------------
  // GROUP 1: MULTI-MERCHANT CATALOG & MERCHANTS INTEGRITY (Tests 1 - 6)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 1: Multi-Merchant Catalog Integrity ---");
  const merchants = getAllMerchants();
  assert(merchants.length === 5, "Merchants dataset has exactly 5 fictional demo merchants", `Count: ${merchants.length}`);
  
  const expectedMerchantIds = ["nexora", "technova", "bytemart", "circuithub", "geargrid"];
  const hasAllMerchants = expectedMerchantIds.every(id => 
    merchants.some(m => m.merchantId.toLowerCase().includes(id) || m.merchantName.toLowerCase().includes(id))
  );
  assert(hasAllMerchants, "All 5 expected merchants exist (Nexora, TechNova, ByteMart, CircuitHub, GearGrid)");

  const allProducts = getAllProducts();
  assert(allProducts.length >= 45, `Catalog expanded to 45+ products across merchants`, `Actual count: ${allProducts.length}`);

  const productsHaveMerchants = allProducts.every(p => p.merchantId && p.merchantName && p.warranty && p.deliveryEstimate);
  assert(productsHaveMerchants, "Every product contains merchantId, merchantName, warranty, and deliveryEstimate");

  const distinctMerchantProducts = expectedMerchantIds.every(id => 
    allProducts.some(p => (p.merchantId || "").toLowerCase().includes(id) || (p.merchantName || "").toLowerCase().includes(id))
  );
  assert(distinctMerchantProducts, "Every merchant has products available in catalog");

  const validPricingAndStock = allProducts.every(p => p.price > 0 && (p.stock >= 0 || (p.inventory ?? 0) >= 0));
  assert(validPricingAndStock, "All products have valid positive prices and non-negative inventory");

  // -------------------------------------------------------------------------
  // GROUP 2: SYNONYM SEARCH & MULTI-MERCHANT CATALOG SEARCH (Tests 7 - 12)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 2: Catalog Search & Synonym Expansion ---");
  const kbMatches = searchProducts({ productCategory: "keyboard" });
  assert(kbMatches.length >= 10, "Search for 'keyboard' returns products across multiple keyboard subcategories", `Found: ${kbMatches.length}`);

  const mouseMatches = searchProducts({ productCategory: "mouse" });
  assert(mouseMatches.length >= 4, "Search for 'mouse' returns mice from multiple merchants", `Found: ${mouseMatches.length}`);

  const monitorMatches = searchProducts({ productCategory: "monitor" });
  assert(monitorMatches.length >= 3, "Search for 'monitor' returns monitors", `Found: ${monitorMatches.length}`);

  const headphoneMatches = searchProducts({ productCategory: "headphones" });
  assert(headphoneMatches.length >= 4, "Search for 'headphones' returns audio gear", `Found: ${headphoneMatches.length}`);

  const hubMatches = searchProducts({ productCategory: "usb hub" });
  assert(hubMatches.length >= 3, "Search for 'usb hub' returns USB hubs and docks", `Found: ${hubMatches.length}`);

  const budgetRestricted = searchProducts({ productCategory: "keyboard", budget: 3000 });
  const allUnder3k = budgetRestricted.every(p => p.price <= 3000);
  assert(allUnder3k && budgetRestricted.length > 0, "Search respects budget constraint", `Items: ${budgetRestricted.length}`);

  // -------------------------------------------------------------------------
  // GROUP 3: DETERMINISTIC RANKING & MERCHANT COMPARISON (Tests 13 - 18)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 3: Multi-Merchant Ranking & Comparison Engine ---");
  const rankedKbs = rankProducts(kbMatches, { productCategory: "Mechanical Keyboard", budget: 5000, wireless: true });
  assert(rankedKbs.length > 0, "Multi-merchant ranking produces ranked results");
  assert(rankedKbs[0].matchScore >= rankedKbs[rankedKbs.length - 1].matchScore, "Ranked results sorted by match score descending");

  const comparison = buildMerchantComparison(rankedKbs, rankedKbs[0].product);
  assert(comparison.merchantCount >= 2, "Merchant comparison captures multiple distinct merchants", `Count: ${comparison.merchantCount}`);
  assert(comparison.cheapestOption !== undefined, "Merchant comparison identifies cheapest option");
  assert(comparison.bestWarrantyOption !== undefined, "Merchant comparison identifies best warranty option");
  assert(comparison.comparisonHighlights.length > 0 && comparison.comparisonText.length > 20, "Merchant comparison produces explanatory highlights");

  // -------------------------------------------------------------------------
  // GROUP 4: FAST CONVERSATIONAL ROUTER — GREETINGS & AMENITIES (Tests 19 - 24)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 4: Fast Conversational Router — Short Amenities ---");
  const rGreeting = routeConversationalMessage("hi");
  assert(rGreeting.action === "GREETING", "Router detects 'hi' as GREETING");

  const rHello = routeConversationalMessage("hello there!");
  assert(rHello.action === "GREETING", "Router detects 'hello there!' as GREETING");

  const rThanks = routeConversationalMessage("thanks a lot");
  assert(rThanks.action === "THANKS", "Router detects 'thanks a lot' as THANKS");

  const rBye = routeConversationalMessage("goodbye");
  assert(rBye.action === "FAREWELL", "Router detects 'goodbye' as FAREWELL");

  const rHelp = routeConversationalMessage("help");
  assert(rHelp.action === "CLARIFICATION_REQUIRED" || rHelp.action === "GENERAL_QUESTION", "Router detects 'help' gracefully");

  const rWhatCanYouDo = routeConversationalMessage("what can you do");
  assert(rWhatCanYouDo.action === "CLARIFICATION_REQUIRED" || rWhatCanYouDo.action === "GENERAL_QUESTION", "Router explains capabilities for 'what can you do'");

  // -------------------------------------------------------------------------
  // GROUP 5: CONVERSATIONAL ROUTER — SHORT SHOPPING PHRASES (Tests 25 - 30)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 5: Conversational Router — Contextual Short Phrases ---");
  const rCheaper = routeConversationalMessage("cheaper");
  assert(rCheaper.action === "REQUEST_CHEAPER_OPTION", "Router classifies 'cheaper' as REQUEST_CHEAPER_OPTION");

  const rTooExpensive = routeConversationalMessage("too expensive");
  assert(rTooExpensive.action === "REQUEST_CHEAPER_OPTION", "Router classifies 'too expensive' as REQUEST_CHEAPER_OPTION");

  const rWhy = routeConversationalMessage("why?");
  assert(rWhy.action === "REQUEST_EXPLANATION", "Router classifies 'why?' as REQUEST_EXPLANATION");

  const rCompare = routeConversationalMessage("compare stores");
  assert(rCompare.action === "PRODUCT_COMPARISON", "Router classifies 'compare stores' as PRODUCT_COMPARISON");

  const rFirstOne = routeConversationalMessage("the first one");
  assert(rFirstOne.action === "CONFIRM_REFERENCED_PRODUCT" && rFirstOne.targetCandidateIndex === 0, "Router resolves 'the first one' with candidate index 0");

  const rSecondOne = routeConversationalMessage("second one");
  assert(rSecondOne.action === "CONFIRM_REFERENCED_PRODUCT" && rSecondOne.targetCandidateIndex === 1, "Router resolves 'second one' with candidate index 1");

  // -------------------------------------------------------------------------
  // GROUP 6: CONTEXTUAL AFFIRMATIONS & DISCONFIRMATIONS (Tests 31 - 34)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 6: Affirmations, Disconfirmations & Payment Guidance ---");
  const rYes = routeConversationalMessage("yes, let's do it");
  assert(rYes.action === "CONFIRM_SELECTION", "Router classifies 'yes, let's do it' as CONFIRM_SELECTION");

  const rSoundsGood = routeConversationalMessage("sounds good");
  assert(rSoundsGood.action === "CONFIRM_SELECTION", "Router classifies 'sounds good' as CONFIRM_SELECTION");

  const rNo = routeConversationalMessage("no, cancel");
  assert(rNo.action === "CANCEL_SELECTION", "Router classifies 'no, cancel' as CANCEL_SELECTION");

  const rHowToPay = routeConversationalMessage("how do i pay?");
  assert(rHowToPay.action === "PAYMENT_GUIDANCE", "Router classifies 'how do i pay?' as PAYMENT_GUIDANCE");

  // -------------------------------------------------------------------------
  // GROUP 7: MULTI-TURN WORKFLOW END-TO-END SIMULATION (Tests 35 - 38)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 7: End-to-End Multi-Turn Conversational Session ---");
  // Turn 1: Search
  const turn1 = await runAgentWorkflow("I want a wireless keyboard under ₹5,000 for programming");
  assert(turn1.success === true, "Turn 1: Initial search returns successfully");
  const sId = turn1.sessionId;
  const t1Success = turn1.success ? turn1 : null;
  assert(t1Success?.recommendation !== undefined, "Turn 1: Recommendation has valid product");
  const firstProdId = t1Success?.recommendation?.product.id;

  // Turn 2: "cheaper"
  const turn2 = await runAgentWorkflow("cheaper", 0, sId);
  assert(turn2.success === true, "Turn 2: 'cheaper' follow-up handled successfully");
  const t2Success = turn2.success ? turn2 : null;
  assert(
    t2Success?.recommendation !== undefined && 
    t2Success.recommendation.product.price <= (t1Success?.recommendation?.product.price || 99999), 
    "Turn 2: Selected option is cheaper or equal"
  );

  // Turn 3: "compare stores"
  const turn3 = await runAgentWorkflow("compare stores", 0, sId);
  assert(turn3.success === true, "Turn 3: 'compare stores' generates comparison", `Action: ${turn3.conversationAction}`);
  const t3Success = turn3.success ? turn3 : null;
  assert(
    t3Success?.merchantComparison !== undefined || 
    (t3Success?.comparisonCandidates !== undefined && t3Success.comparisonCandidates.length > 0), 
    "Turn 3: Comparison summary or candidates populated"
  );

  // Turn 4: "sounds good"
  const turn4 = await runAgentWorkflow("sounds good", 0, sId);
  assert(turn4.success === true, "Turn 4: 'sounds good' confirms selection");
  assert(turn4.transactionState === "USER_CONFIRMED", `Turn 4: Transaction state advanced to USER_CONFIRMED, actual: ${turn4.transactionState}`);

  // -------------------------------------------------------------------------
  // GROUP 8: DETERMINISTIC POLICY & CHECKOUT INTEGRITY (Tests 39 - 40)
  // -------------------------------------------------------------------------
  console.log("\n--- GROUP 8: Policy Engine & Checkout Invariant Protection ---");
  const novakey = getProductById("novakey-k75") || allProducts[0];
  const validBasket = validateTransaction([novakey], 5000, 0);
  assert(validBasket.approved === true, "Standard single-product basket is approved by policy engine");

  const excessiveDiscountBasket = validateTransaction([novakey], 5000, 1000);
  assert(excessiveDiscountBasket.approved === false, "Excessive discount (₹1000 > ₹500 limit) is strictly blocked by policy engine");

  console.log("\n=======================================================");
  console.log(`  PHASE 5B TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=======================================================\n");

  if (passedTests === totalTests) {
    console.log("🎉 ALL 40 PHASE 5B VERIFICATION TESTS PASSED PERFECTLY!");
  } else {
    process.exit(1);
  }
}

runPhase5BTestSuite().catch(err => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
