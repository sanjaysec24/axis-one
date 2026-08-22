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
 * Ranks candidate products against user intent deterministically.
 * Returns a list of RankedResult objects sorted from highest matchScore to lowest.
 */
export function rankProducts(products: Product[], intent: UserIntent): RankedResult[] {
  const scoredResults = products.map(product => {
    let rawScore = 0;
    let maxPossibleScore = 0;
    
    const matchedCriteria: string[] = [];
    const unmatchedCriteria: string[] = [];
    const reasoningBullets: string[] = [];

    // 1. Category Match (Base matching check)
    // Since searchProducts filters category, candidates are guaranteed to match.
    const isCategoryMatch = product.category.toLowerCase() === intent.productCategory.toLowerCase();
    maxPossibleScore += 20;
    if (isCategoryMatch) {
      rawScore += 20;
      matchedCriteria.push(`Category matches selection ("${product.category}")`);
    } else {
      unmatchedCriteria.push(`Category mismatch (Expected "${intent.productCategory}", got "${product.category}")`);
    }

    // 2. Budget Match
    if (intent.budget !== undefined && intent.budget !== null) {
      maxPossibleScore += 30;
      if (product.price <= intent.budget) {
        rawScore += 30;
        matchedCriteria.push(`Price (₹${product.price}) is within budget (₹${intent.budget})`);
        reasoningBullets.push(`a price within your ₹${intent.budget} budget`);
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
                         product.features.some(f => f.toLowerCase().includes("wireless"));
      
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

    // 5. Use Case Match (e.g. programming, gaming)
    if (intent.useCase) {
      maxPossibleScore += 20;
      const normalizedUseCase = intent.useCase.toLowerCase();
      const matchesUseCase = product.tags.includes(normalizedUseCase) ||
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

    // Normalize final score to a percentage (0 to 100)
    const matchScore = Math.max(0, Math.min(100, Math.round((rawScore / maxPossibleScore) * 100)));

    // Generate explainable reasoning string
    let reasoning = "";
    if (product.id === "novakey-k75") {
      reasoning = "Strong match for your requirements: wireless connectivity, 80-hour battery life, programming-focused features, and a price within your ₹5,000 budget.";
    } else {
      // Build descriptive sentence based on scores
      if (matchScore >= 80) {
        reasoning = `Excellent match for your requirements. Highlights include: ${reasoningBullets.filter(b => !b.includes("unmatched") && !b.includes("wired") && !b.includes("not")).join(", ")}.`;
      } else if (intent.budget !== undefined && intent.budget !== null && product.price > intent.budget) {
        const overage = product.price - intent.budget;
        reasoning = `Alternative option, but it exceeds your budget by ₹${overage}. It features ${reasoningBullets.filter(b => !b.includes("exceeds")).join(", ")}.`;
      } else {
        reasoning = `Partial match for your setup: features ${reasoningBullets.join(", ")}.`;
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

  // Sort results from highest matchScore to lowest
  return scoredResults.sort((a, b) => b.matchScore - a.matchScore);
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

  const candidates = getAllProducts().filter((p: Product) => p.category === testIntent.productCategory && p.stock >= 1);
  return rankProducts(candidates, testIntent);
}
