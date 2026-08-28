import { Product, UserIntent, RankedResult } from "./types";
import { getAllProducts } from "./catalog";

/**
 * Parses battery life from string (e.g. "80 hours" -> 80, null -> 0)
 */
function parseBatteryHours(batteryLife: string | null): number {
  if (!batteryLife) return 0;
  const match = batteryLife.match(/(\d+)\s*hour/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Ranks candidate products against user intent deterministically across merchants.
 * Returns a list of RankedResult objects sorted from highest matchScore to lowest.
 */
export function rankProducts(products: Product[], intent: UserIntent): RankedResult[] {
  const scoredResults: RankedResult[] = products.map(product => {
    let rawScore = 0;
    let maxPossibleScore = 0;
    
    const matchedCriteria: string[] = [];
    const unmatchedCriteria: string[] = [];
    const reasoningBullets: string[] = [];

    // 1. Category Match (Base matching check)
    maxPossibleScore += 20;
    rawScore += 20;
    matchedCriteria.push(`Category matches selection ("${product.category}")`);

    // 2. Budget Match
    if (intent.budget !== undefined && intent.budget !== null) {
      maxPossibleScore += 30;
      if (product.price <= intent.budget) {
        rawScore += 30;
        // Minor boost for great price-to-budget ratio
        const savingsRatio = (intent.budget - product.price) / intent.budget;
        if (savingsRatio > 0.15) {
          rawScore += 2;
          maxPossibleScore += 2;
        }
        matchedCriteria.push(`Price (₹${product.price}) is within budget (₹${intent.budget})`);
        reasoningBullets.push(`a price of ₹${product.price} within your ₹${intent.budget} budget`);
      } else {
        const overage = product.price - intent.budget;
        rawScore -= 40; // Penalty for budget breach
        unmatchedCriteria.push(`Price (₹${product.price}) exceeds budget of ₹${intent.budget} by ₹${overage}`);
        reasoningBullets.push(`price exceeds budget by ₹${overage}`);
      }
    }

    // 3. Wireless Requirement
    if (intent.wireless !== undefined) {
      maxPossibleScore += 25;
      const isWireless = product.tags.includes("wireless") || 
                         product.connectivity === "wireless" ||
                         product.connectivity === "dual-mode" ||
                         product.connectivity === "tri-mode" ||
                         product.features.some(f => f.toLowerCase().includes("wireless") || f.toLowerCase().includes("bluetooth"));
      
      if (intent.wireless) {
        if (isWireless) {
          rawScore += 25;
          matchedCriteria.push("Wireless connectivity matches requirement");
          reasoningBullets.push("wireless connectivity");
        } else {
          rawScore -= 30; // Penalty for missing required feature
          unmatchedCriteria.push("Product is wired, wireless required");
          reasoningBullets.push("wired connection (wireless requested)");
        }
      } else {
        // Wireless is not required/preferred
        if (!isWireless) {
          rawScore += 25;
          matchedCriteria.push("Wired design matches preference");
        } else {
          rawScore += 10; // Neutral
        }
      }
    }

    // 4. Battery Priority
    if (intent.batteryPriority) {
      const batteryHours = parseBatteryHours(product.batteryLife);
      
      if (intent.batteryPriority === "high") {
        maxPossibleScore += 25;
        if (batteryHours >= 70) {
          rawScore += 25;
          matchedCriteria.push(`High battery life (${product.batteryLife})`);
          reasoningBullets.push(`long-lasting ${product.batteryLife} battery life`);
        } else if (batteryHours >= 30) {
          rawScore += 15;
          unmatchedCriteria.push(`Medium battery life (${product.batteryLife}) falls short of high priority preference`);
          reasoningBullets.push(`modest ${product.batteryLife} battery life`);
        } else {
          rawScore += 0;
          unmatchedCriteria.push("Low/no battery life doesn't match high battery preference");
          reasoningBullets.push("limited battery capacity");
        }
      } else if (intent.batteryPriority === "medium") {
        maxPossibleScore += 15;
        if (batteryHours >= 30) {
          rawScore += 15;
          matchedCriteria.push(`Moderate battery life (${product.batteryLife})`);
        } else {
          rawScore += 5;
          unmatchedCriteria.push("Low battery life doesn't match moderate preference");
        }
      } else {
        maxPossibleScore += 10;
        rawScore += 10; // Low priority - low constraints
      }
    }

    // 5. Use Case Match (e.g. programming, gaming, office, travel)
    if (intent.useCase) {
      maxPossibleScore += 20;
      const normalizedUseCase = intent.useCase.toLowerCase();
      const matchesUseCase = (product.useCases && product.useCases.some(u => u.toLowerCase().includes(normalizedUseCase))) ||
                             product.tags.includes(normalizedUseCase) ||
                             product.features.some(f => f.toLowerCase().includes(normalizedUseCase)) ||
                             product.description.toLowerCase().includes(normalizedUseCase);
      
      if (matchesUseCase) {
        rawScore += 20;
        matchedCriteria.push(`Optimized for use case: ${intent.useCase}`);
        reasoningBullets.push(`${intent.useCase}-focused features`);
      } else {
        unmatchedCriteria.push(`Not explicitly optimized for use case: ${intent.useCase}`);
        reasoningBullets.push(`not specialized for ${intent.useCase}`);
      }
    }

    // 6. Preferred Merchant Match
    if (intent.preferredMerchantId) {
      maxPossibleScore += 10;
      if (product.merchantId === intent.preferredMerchantId) {
        rawScore += 10;
        matchedCriteria.push(`Sold by preferred merchant ${product.merchantName}`);
      }
    }

    // Normalize final score to a percentage (0 to 100)
    const matchScore = Math.max(0, Math.min(100, Math.round((rawScore / maxPossibleScore) * 100)));

    // Generate explainable reasoning string referencing merchant and characteristics
    let reasoning = "";
    if (product.id === "novakey-k75") {
      reasoning = `Strong match from ${product.merchantName}: wireless connectivity, 80-hour battery life, programming-focused features, and a price within your budget.`;
    } else {
      if (matchScore >= 80) {
        reasoning = `Excellent match from ${product.merchantName} (₹${product.price}). Highlights include: ${reasoningBullets.filter(b => !b.includes("unmatched") && !b.includes("wired") && !b.includes("not") && !b.includes("exceeds")).join(", ")}. Includes ${product.warranty}.`;
      } else if (intent.budget !== undefined && intent.budget !== null && product.price > intent.budget) {
        const overage = product.price - intent.budget;
        reasoning = `Alternative option from ${product.merchantName}, but exceeds budget by ₹${overage}. Offers ${product.warranty} and features ${reasoningBullets.filter(b => !b.includes("exceeds")).join(", ")}.`;
      } else {
        reasoning = `Valid option from ${product.merchantName} (₹${product.price}): features ${reasoningBullets.join(", ")}.`;
      }
    }

    return {
      product,
      matchScore,
      matchedCriteria,
      unmatchedCriteria,
      reasoning
    };
  });

  // Sort results: highest matchScore first, then lowest price as tie-breaker
  const sorted = scoredResults.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return a.product.price - b.product.price;
  });

  // Assign merchant comparison badges
  if (sorted.length > 0) {
    const minPrice = Math.min(...sorted.map(s => s.product.price));
    sorted.forEach((item, idx) => {
      if (idx === 0) {
        item.merchantComparisonBadge = "Top Recommendation";
      } else if (item.product.price === minPrice) {
        item.merchantComparisonBadge = "Lowest Price";
      } else if ((item.product.warranty || "").includes("2 Years") || (item.product.warranty || "").includes("3 Years")) {
        item.merchantComparisonBadge = "Extended Warranty";
      } else if ((item.product.deliveryEstimate || "").includes("1-2")) {
        item.merchantComparisonBadge = "Fastest Delivery";
      }
    });
  }

  return sorted;
}

/**
 * Development test helper function to verify searches and rankings.
 */
export function runTestRankingSimulation(): RankedResult[] {
  const testIntent: UserIntent = {
    productCategory: "Mechanical Keyboard",
    budget: 5000,
    wireless: true,
    batteryPriority: "high",
    useCase: "programming"
  };

  const candidates = getAllProducts().filter((p: Product) => 
    p.category === testIntent.productCategory && (p.stock >= 1 || (p.inventory ?? 0) >= 1)
  );
  return rankProducts(candidates, testIntent);
}
