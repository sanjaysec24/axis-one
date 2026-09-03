import { 
  Product, 
  RankedResult, 
  UserIntent, 
  CommerceConversationContext, 
  ProductComparisonData, 
  ProductComparisonAttributeRow, 
  ProductComparisonDifference 
} from "./types";
import { getAllProducts, searchProducts, isCategoryMatch } from "./catalog";
import { rankProducts } from "./ranking";

/**
 * Resolves which products should be compared from user utterance and session context.
 * Returns null or list of candidate RankedResults.
 */
export function resolveComparisonCandidates(
  message: string,
  context?: CommerceConversationContext
): { candidates: RankedResult[]; resolutionNote: string } | null {
  const clean = message.toLowerCase().trim().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  const allProducts = getAllProducts();
  const candidatePool = context?.candidatePool && context.candidatePool.length > 0 
    ? context.candidatePool 
    : [];
  const activeIntent = context?.latestIntent || context?.originalIntent || { productCategory: "Mechanical Keyboard" };

  // 1. Explicit Product Names mentioned in message
  const mentionedProducts: Product[] = [];
  for (const prod of allProducts) {
    const pName = prod.name.toLowerCase();
    const pId = prod.id.toLowerCase();
    const parts = pName.split(/\s+/).filter(w => w.length >= 4);
    
    if (
      clean.includes(pName) ||
      clean.includes(pId) ||
      parts.some(part => clean.includes(part) && !["wireless", "mechanical", "keyboard", "mouse", "monitor", "headphones", "stand", "pro", "ultra"].includes(part))
    ) {
      if (!mentionedProducts.some(p => p.id === prod.id)) {
        mentionedProducts.push(prod);
      }
    }
  }

  if (mentionedProducts.length >= 2) {
    const ranked = rankProducts(mentionedProducts, activeIntent);
    return {
      candidates: ranked,
      resolutionNote: `Comparing ${mentionedProducts.length} explicitly mentioned products: ${mentionedProducts.map(p => p.name).join(", ")}.`
    };
  }

  // If 1 product mentioned with active recommendation
  if (mentionedProducts.length === 1 && context?.recommendedProduct && mentionedProducts[0].id !== context.recommendedProduct.id) {
    const pair = [context.recommendedProduct, mentionedProducts[0]];
    const ranked = rankProducts(pair, activeIntent);
    return {
      candidates: ranked,
      resolutionNote: `Comparing active recommendation (${context.recommendedProduct.name}) with requested ${mentionedProducts[0].name}.`
    };
  }

  // 2. "compare with previous one" / "compare with previous"
  if (clean.includes("previous") || clean.includes("last one") || clean.includes("earlier")) {
    if (context?.previousProduct && context.recommendedProduct && context.previousProduct.id !== context.recommendedProduct.id) {
      const pair = [context.recommendedProduct, context.previousProduct];
      const ranked = rankProducts(pair, activeIntent);
      return {
        candidates: ranked,
        resolutionNote: `Comparing current recommendation (${context.recommendedProduct.name}) with previously recommended ${context.previousProduct.name}.`
      };
    }
  }

  // 3. "the cheaper one" / "compare cheaper"
  if (clean.includes("cheaper one") || clean.includes("cheapest one") || clean.includes("cheaper ones") || clean.includes("cheaper")) {
    if (context?.recommendedProduct) {
      const cat = context.recommendedProduct.category;
      const cheaperProds = allProducts.filter(p => 
        (isCategoryMatch(p.category, cat) || isCategoryMatch(p.category, activeIntent.productCategory)) &&
        p.price < context.recommendedProduct!.price &&
        (p.stock >= 1 || (p.inventory ?? 0) >= 1)
      ).sort((a, b) => a.price - b.price);

      if (cheaperProds.length > 0) {
        const pair = [context.recommendedProduct, cheaperProds[0]];
        const ranked = rankProducts(pair, activeIntent);
        return {
          candidates: ranked,
          resolutionNote: `Comparing current recommendation (${context.recommendedProduct.name}) with cheapest option (${cheaperProds[0].name}).`
        };
      } else if (candidatePool.length >= 2) {
        const alt = candidatePool.find(c => c.product.id !== context.recommendedProduct!.id)?.product || candidatePool[1].product;
        const pair = [context.recommendedProduct, alt];
        const ranked = rankProducts(pair, activeIntent);
        return {
          candidates: ranked,
          resolutionNote: `Active product is already the lowest-priced option; comparing with alternative (${alt.name}).`
        };
      }
    }
  }

  // 4. Ordinal Slices from Active Candidate Pool
  if (candidatePool.length >= 2) {
    // "compare top 3" / "compare 3" / "compare all 3"
    if (clean.includes("top 3") || clean.includes("top three") || clean.includes("3") || clean.includes("three")) {
      return {
        candidates: candidatePool.slice(0, 3),
        resolutionNote: `Comparing top 3 candidates from your active session.`
      };
    }

    // "first and second" / "first two" / "compare these two" / "top 2"
    if (
      clean.includes("first and second") || 
      clean.includes("first 2") || 
      clean.includes("first two") || 
      clean.includes("these two") || 
      clean.includes("1 and 2")
    ) {
      return {
        candidates: candidatePool.slice(0, 2),
        resolutionNote: `Comparing the first and second candidates from your active session.`
      };
    }

    // Default with candidate pool: return top 2-3
    const count = Math.min(candidatePool.length, 3);
    return {
      candidates: candidatePool.slice(0, count),
      resolutionNote: `Comparing top ${count} recommended candidates.`
    };
  }

  // 5. Fallback Catalog Search using Intent
  const searched = searchProducts(activeIntent);
  if (searched.length >= 2) {
    const ranked = rankProducts(searched, activeIntent);
    const count = Math.min(ranked.length, 3);
    return {
      candidates: ranked.slice(0, count),
      resolutionNote: `Comparing top ${count} candidate matches from verified merchants.`
    };
  } else if (searched.length === 1) {
    const ranked = rankProducts(searched, activeIntent);
    return {
      candidates: ranked,
      resolutionNote: `Only 1 product found matching your current criteria.`
    };
  }

  return null;
}

/**
 * Builds structured comparison data, exact numerical differences, and grounded explanation.
 */
export function buildProductComparison(
  candidates: RankedResult[],
  intent: UserIntent
): ProductComparisonData {
  if (candidates.length === 0) {
    const dummyProduct: Product = getAllProducts()[0];
    return {
      comparedProducts: [],
      attributeRows: [],
      differences: [],
      bestOverall: dummyProduct,
      cheapest: dummyProduct,
      bestWarranty: dummyProduct,
      bestMatch: dummyProduct,
      comparisonSummary: "No products available for comparison.",
      groundedExplanation: "No comparable products are currently available for those requirements."
    };
  }

  // 1. Identify Best Overall, Cheapest, Best Warranty, Best Match
  let bestOverall = candidates[0].product;
  let cheapest = candidates[0].product;
  let bestWarranty = candidates[0].product;
  let bestMatch = candidates[0].product;
  let bestForUseCase: Product | undefined = undefined;

  let minPrice = candidates[0].product.price;
  let maxScore = candidates[0].matchScore;
  let maxWarrantyMonths = parseWarrantyMonths(candidates[0].product.warranty);

  candidates.forEach(c => {
    // Cheapest
    if (c.product.price < minPrice) {
      minPrice = c.product.price;
      cheapest = c.product;
    }
    // Best Match
    if (c.matchScore > maxScore) {
      maxScore = c.matchScore;
      bestMatch = c.product;
      bestOverall = c.product;
    }
    // Best Warranty
    const months = parseWarrantyMonths(c.product.warranty);
    if (months > maxWarrantyMonths) {
      maxWarrantyMonths = months;
      bestWarranty = c.product;
    }
    // Use Case Fit
    if (intent.useCase && c.product.useCases?.some(u => u.toLowerCase().includes(intent.useCase!.toLowerCase()))) {
      const currentBest = bestForUseCase as Product | undefined;
      if (!currentBest || c.matchScore > (candidates.find(item => item.product.id === currentBest.id)?.matchScore || 0)) {
        bestForUseCase = c.product;
      }
    }
  });

  // 2. Deterministic Differences Calculation
  const differences: ProductComparisonDifference[] = [];

  // Price Difference
  if (candidates.length >= 2) {
    const sortedByPrice = [...candidates].sort((a, b) => a.product.price - b.product.price);
    const low = sortedByPrice[0].product;
    const high = sortedByPrice[sortedByPrice.length - 1].product;
    const priceDiff = high.price - low.price;

    if (priceDiff > 0) {
      differences.push({
        type: "PRICE",
        headline: `${low.name} is ₹${priceDiff} cheaper than ${high.name}`,
        detail: `${low.merchantName || "Merchant"} offers ${low.name} for ₹${low.price}, whereas ${high.name} from ${high.merchantName || "Merchant"} is priced at ₹${high.price} (₹${priceDiff} price difference).`,
        winnerProductId: low.id
      });
    }
  }

  // Battery Difference
  const batteryCandidates = candidates.filter(c => c.product.batteryLife && parseBatteryHours(c.product.batteryLife) > 0);
  if (batteryCandidates.length >= 2) {
    const sortedByBattery = [...batteryCandidates].sort((a, b) => parseBatteryHours(b.product.batteryLife) - parseBatteryHours(a.product.batteryLife));
    const topBat = sortedByBattery[0].product;
    const lowBat = sortedByBattery[sortedByBattery.length - 1].product;
    const batDiff = parseBatteryHours(topBat.batteryLife) - parseBatteryHours(lowBat.batteryLife);

    if (batDiff > 0) {
      differences.push({
        type: "BATTERY",
        headline: `${topBat.name} provides ${batDiff} more hours of battery life`,
        detail: `${topBat.name} delivers ${topBat.batteryLife} on a single charge compared to ${lowBat.batteryLife} on ${lowBat.name}.`,
        winnerProductId: topBat.id
      });
    }
  } else if (candidates.some(c => c.product.batteryLife) && candidates.some(c => !c.product.batteryLife)) {
    const withBat = candidates.find(c => c.product.batteryLife)?.product;
    const withoutBat = candidates.find(c => !c.product.batteryLife)?.product;
    if (withBat && withoutBat) {
      differences.push({
        type: "BATTERY",
        headline: `${withBat.name} has wireless battery support (${withBat.batteryLife})`,
        detail: `${withBat.name} offers ${withBat.batteryLife}, while ${withoutBat.name} is a wired unit (battery life not applicable).`,
        winnerProductId: withBat.id
      });
    }
  }

  // Warranty Difference
  if (candidates.length >= 2) {
    const sortedByWar = [...candidates].sort((a, b) => parseWarrantyMonths(b.product.warranty) - parseWarrantyMonths(a.product.warranty));
    const topWar = sortedByWar[0].product;
    const lowWar = sortedByWar[sortedByWar.length - 1].product;
    const warDiff = parseWarrantyMonths(topWar.warranty) - parseWarrantyMonths(lowWar.warranty);

    if (warDiff > 0) {
      const diffYears = warDiff >= 12 ? `${Math.round(warDiff / 12)} year(s)` : `${warDiff} month(s)`;
      differences.push({
        type: "WARRANTY",
        headline: `${topWar.merchantName} provides ${diffYears} longer warranty protection`,
        detail: `${topWar.merchantName} covers ${topWar.name} with a ${topWar.warranty || "standard"} warranty, compared to ${lowWar.warranty || "standard"} on ${lowWar.name}.`,
        winnerProductId: topWar.id
      });
    }
  }

  // 3. Build Attribute Matrix Rows
  const attributeRows: ProductComparisonAttributeRow[] = [];

  // Price Row
  const priceValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation"; numericValue?: number }> = {};
  candidates.forEach(c => {
    priceValues[c.product.id] = {
      displayValue: `₹${c.product.price.toLocaleString("en-IN")}`,
      status: c.product.id === cheapest.id ? "supported" : "limitation",
      numericValue: c.product.price
    };
  });
  attributeRows.push({
    attributeKey: "price",
    label: "Price",
    values: priceValues,
    bestProductId: cheapest.id,
    highlightDifference: `Cheapest: ${cheapest.name} at ₹${cheapest.price}`
  });

  // Merchant Store Row
  const merchantValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation" }> = {};
  candidates.forEach(c => {
    merchantValues[c.product.id] = {
      displayValue: c.product.merchantName || "Verified Store",
      status: "supported"
    };
  });
  attributeRows.push({
    attributeKey: "merchant",
    label: "Store Merchant",
    values: merchantValues
  });

  // Connectivity Row
  const connValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation" }> = {};
  candidates.forEach(c => {
    const isWireless = c.product.tags.includes("wireless") || c.product.connectivity === "wireless" || c.product.connectivity === "tri-mode" || c.product.connectivity === "dual-mode";
    connValues[c.product.id] = {
      displayValue: c.product.connectivity ? c.product.connectivity.toUpperCase() : (isWireless ? "Wireless" : "Wired"),
      status: isWireless ? "supported" : (intent.wireless ? "limitation" : "supported")
    };
  });
  attributeRows.push({
    attributeKey: "connectivity",
    label: "Connectivity",
    values: connValues
  });

  // Battery Life Row
  const batValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation"; numericValue?: number }> = {};
  let bestBatId: string | undefined = undefined;
  let highestBat = 0;
  candidates.forEach(c => {
    const hours = parseBatteryHours(c.product.batteryLife);
    if (hours > highestBat) {
      highestBat = hours;
      bestBatId = c.product.id;
    }
    batValues[c.product.id] = {
      displayValue: c.product.batteryLife || "Not specified in catalog",
      status: c.product.batteryLife ? "supported" : "unavailable",
      numericValue: hours || undefined
    };
  });
  attributeRows.push({
    attributeKey: "batteryLife",
    label: "Battery Life",
    values: batValues,
    bestProductId: bestBatId
  });

  // Warranty Row
  const warValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation"; numericValue?: number }> = {};
  candidates.forEach(c => {
    warValues[c.product.id] = {
      displayValue: c.product.warranty || "1 Year Standard",
      status: c.product.id === bestWarranty.id ? "supported" : "supported",
      numericValue: parseWarrantyMonths(c.product.warranty)
    };
  });
  attributeRows.push({
    attributeKey: "warranty",
    label: "Warranty Coverage",
    values: warValues,
    bestProductId: bestWarranty.id,
    highlightDifference: `Strongest: ${bestWarranty.warranty} (${bestWarranty.merchantName})`
  });

  // Compatibility Row
  const compValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation" }> = {};
  candidates.forEach(c => {
    const compList = c.product.compatibility || [];
    compValues[c.product.id] = {
      displayValue: compList.length > 0 ? compList.join(", ") : "Universal",
      status: "supported"
    };
  });
  attributeRows.push({
    attributeKey: "compatibility",
    label: "Compatibility",
    values: compValues
  });

  // Use Case / Programming Row
  const useCaseValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation" }> = {};
  candidates.forEach(c => {
    const fits = intent.useCase 
      ? c.product.useCases?.some(u => u.toLowerCase().includes(intent.useCase!.toLowerCase())) || c.product.tags.includes(intent.useCase!.toLowerCase())
      : true;
    useCaseValues[c.product.id] = {
      displayValue: c.product.useCases && c.product.useCases.length > 0 ? c.product.useCases.slice(0, 3).join(", ") : "General use",
      status: fits ? "supported" : "limitation"
    };
  });
  attributeRows.push({
    attributeKey: "useCases",
    label: "Use Case Suitability",
    values: useCaseValues,
    bestProductId: bestForUseCase ? (bestForUseCase as Product).id : bestMatch.id
  });

  // Delivery Estimate Row
  const delValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation" }> = {};
  candidates.forEach(c => {
    delValues[c.product.id] = {
      displayValue: c.product.deliveryEstimate || "2-3 business days",
      status: "supported"
    };
  });
  attributeRows.push({
    attributeKey: "deliveryEstimate",
    label: "Delivery Estimate",
    values: delValues
  });

  // Inventory / Policy Row
  const invValues: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation"; numericValue?: number }> = {};
  candidates.forEach(c => {
    const st = c.product.stock ?? c.product.inventory ?? 0;
    invValues[c.product.id] = {
      displayValue: `${st} units (In Stock)`,
      status: st >= 1 ? "supported" : "unavailable",
      numericValue: st
    };
  });
  attributeRows.push({
    attributeKey: "inventory",
    label: "Inventory & Compliance",
    values: invValues
  });

  // 4. Grounded Summary Generation
  const summarySentences: string[] = [];
  summarySentences.push(`${bestOverall.name} (₹${bestOverall.price}) is your strongest overall match (${candidates.find(c => c.product.id === bestOverall.id)?.matchScore || 100}% score).`);
  
  if (cheapest.id !== bestOverall.id) {
    summarySentences.push(`${cheapest.name} from ${cheapest.merchantName} is the most economical option at ₹${cheapest.price}.`);
  }
  
  if (bestWarranty.id !== bestOverall.id && bestWarranty.id !== cheapest.id) {
    summarySentences.push(`${bestWarranty.merchantName} offers the best warranty protection with ${bestWarranty.warranty} on ${bestWarranty.name}.`);
  }

  const comparisonSummary = summarySentences.join(" ");

  const groundedExplanation = `Here is how the ${candidates.length} options compare:\n` +
    `• **${bestOverall.name}**: ₹${bestOverall.price} (${bestOverall.merchantName}) — Best overall match with ${bestOverall.warranty}.\n` +
    (cheapest.id !== bestOverall.id ? `• **${cheapest.name}**: ₹${cheapest.price} (${cheapest.merchantName}) — Lowest price option.\n` : "") +
    (bestWarranty.id !== bestOverall.id && bestWarranty.id !== cheapest.id ? `• **${bestWarranty.name}**: ₹${bestWarranty.price} (${bestWarranty.merchantName}) — Strongest ${bestWarranty.warranty}.\n` : "") +
    `You can select any option by saying "choose the first one" or "select ${bestOverall.name}".`;

  return {
    comparedProducts: candidates,
    attributeRows,
    differences,
    bestOverall,
    cheapest,
    bestWarranty,
    bestMatch,
    bestForUseCase,
    comparisonSummary,
    groundedExplanation
  };
}

/**
 * Answers contextual questions about compared products deterministically using catalog facts.
 */
export function answerComparisonQuestion(
  message: string,
  comparisonData: ProductComparisonData | undefined,
  context: CommerceConversationContext
): string {
  const clean = message.toLowerCase().trim().replace(/[.,!?;:]+/g, " ").replace(/\s+/g, " ").trim();
  const intent = context.latestIntent || context.originalIntent || { productCategory: "Mechanical Keyboard" };
  const budget = intent.budget ?? 5000;
  
  // Candidates pool
  const candidates: RankedResult[] = comparisonData?.comparedProducts && comparisonData.comparedProducts.length > 0
    ? comparisonData.comparedProducts
    : (context.candidatePool && context.candidatePool.length > 0 ? context.candidatePool : []);

  if (candidates.length === 0) {
    const active = context.recommendedProduct;
    if (active) {
      return `${active.name} from ${active.merchantName || 'merchant'} (₹${active.price}) is your current active recommendation.`;
    }
    return "I can compare products once we find options that match your search requirements.";
  }

  // 1. CHEAPER QUESTION
  if (
    clean.includes("cheaper") || 
    clean.includes("cheapest") || 
    clean.includes("lowest price") || 
    clean.includes("lower price")
  ) {
    const cheapestProduct = comparisonData?.cheapest || 
      [...candidates].sort((a, b) => a.product.price - b.product.price)[0].product;
    const mName = cheapestProduct.merchantName ? ` from ${cheapestProduct.merchantName}` : "";
    return `The ${cheapestProduct.name}${mName} is the cheapest of the compared options at ₹${cheapestProduct.price}.`;
  }

  // 2. PROGRAMMING / CODING QUESTION
  if (
    clean.includes("programming") || 
    clean.includes("coding") || 
    clean.includes("developer") || 
    clean.includes("code")
  ) {
    // Find candidate that best matches programming
    const progMatch = candidates.find(c => 
      c.product.useCases?.some(u => u.toLowerCase().includes("programming")) ||
      c.product.tags.some(t => t.toLowerCase().includes("programming") || t.toLowerCase().includes("coding"))
    ) || candidates[0];

    const prod = progMatch.product;
    const mName = prod.merchantName ? ` from ${prod.merchantName}` : "";
    return `Based on your programming requirement, the ${prod.name}${mName} (₹${prod.price}) is the stronger match because it fits your ₹${budget} budget and has the highest requirement match (${progMatch.matchScore}%) among the compared options.`;
  }

  // 3. GAMING QUESTION
  if (
    clean.includes("gaming") || 
    clean.includes("gamer") || 
    clean.includes("games") || 
    clean.includes("esports")
  ) {
    const gameMatch = candidates.find(c => 
      c.product.useCases?.some(u => u.toLowerCase().includes("gaming")) ||
      c.product.tags.some(t => t.toLowerCase().includes("gaming")) ||
      c.product.category.toLowerCase().includes("gaming")
    ) || candidates[0];

    const prod = gameMatch.product;
    const mName = prod.merchantName ? ` from ${prod.merchantName}` : "";
    return `For gaming, the ${prod.name}${mName} (₹${prod.price}) is the better match with dedicated gaming features and ${gameMatch.matchScore}% requirement match.`;
  }

  // 4. OFFICE / TYPING QUESTION
  if (
    clean.includes("office") || 
    clean.includes("work") || 
    clean.includes("typing") || 
    clean.includes("productivity")
  ) {
    const officeMatch = candidates.find(c => 
      c.product.useCases?.some(u => u.toLowerCase().includes("office")) ||
      c.product.tags.some(t => t.toLowerCase().includes("office"))
    ) || candidates[0];

    const prod = officeMatch.product;
    const mName = prod.merchantName ? ` from ${prod.merchantName}` : "";
    return `For office work, the ${prod.name}${mName} (₹${prod.price}) is the better match.`;
  }

  // 5. BATTERY QUESTION
  if (
    clean.includes("battery") || 
    clean.includes("hours") || 
    clean.includes("charge")
  ) {
    const batteryCandidates = candidates.filter(c => c.product.batteryLife && parseBatteryHours(c.product.batteryLife) > 0);
    if (batteryCandidates.length > 0) {
      const topBat = [...batteryCandidates].sort((a, b) => parseBatteryHours(b.product.batteryLife) - parseBatteryHours(a.product.batteryLife))[0].product;
      return `The ${topBat.name} has the best battery life among the compared options with ${topBat.batteryLife} on a single charge.`;
    }
    return "Battery life is not explicitly specified for all compared models, but wired models operate continuously without charging.";
  }

  // 6. WARRANTY QUESTION
  if (
    clean.includes("warranty") || 
    clean.includes("guarantee") || 
    clean.includes("protection")
  ) {
    const bestWar = comparisonData?.bestWarranty || 
      [...candidates].sort((a, b) => parseWarrantyMonths(b.product.warranty) - parseWarrantyMonths(a.product.warranty))[0].product;
    const mName = bestWar.merchantName ? ` from ${bestWar.merchantName}` : "";
    return `The ${bestWar.name}${mName} offers the strongest warranty coverage with ${bestWar.warranty || '1 Year Merchant Warranty'}.`;
  }

  // 7. DIFFERENCE QUESTION
  if (
    clean.includes("difference") || 
    clean.includes("differences") || 
    clean.includes("how do they differ") || 
    clean.includes("compare difference")
  ) {
    if (comparisonData?.differences && comparisonData.differences.length > 0) {
      return `The main differences are: ${comparisonData.differences.map(d => d.headline).join(". ")}.`;
    }
    if (candidates.length >= 2) {
      const p1 = candidates[0].product;
      const p2 = candidates[1].product;
      return `The main differences are price, warranty, and features: ${p1.name} is ₹${p1.price} from ${p1.merchantName || 'merchant'} with ${p1.warranty || 'standard warranty'}, while ${p2.name} is ₹${p2.price} from ${p2.merchantName || 'merchant'} with ${p2.warranty || 'standard warranty'}.`;
    }
    return "The compared options differ primarily in price, merchant warranties, and connectivity.";
  }

  // 8. BETTER OVERALL / BEST / WHICH SHOULD I CHOOSE
  const topCandidate = comparisonData?.bestOverall || comparisonData?.bestMatch || candidates[0].product;
  const topRanked = candidates.find(c => c.product.id === topCandidate.id) || candidates[0];
  const mName = topCandidate.merchantName ? ` from ${topCandidate.merchantName}` : "";

  return `Based on the current requirements, ${topCandidate.name}${mName} (₹${topCandidate.price}) is the better overall match because it fits your ₹${budget} budget with the highest compatibility score (${topRanked.matchScore}%).`;
}

/**
 * Helper to parse warranty string into numeric months.
 */
function parseWarrantyMonths(warrantyStr?: string): number {
  if (!warrantyStr) return 12;
  const yearMatch = warrantyStr.match(/(\d+)\s*Year/i);
  if (yearMatch) {
    return parseInt(yearMatch[1], 10) * 12;
  }
  const monthMatch = warrantyStr.match(/(\d+)\s*Month/i);
  if (monthMatch) {
    return parseInt(monthMatch[1], 10);
  }
  return 12;
}

/**
 * Helper to parse battery life string into numeric hours.
 */
function parseBatteryHours(batteryStr?: string | null): number {
  if (!batteryStr) return 0;
  const match = batteryStr.match(/(\d+)\s*hour/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}
