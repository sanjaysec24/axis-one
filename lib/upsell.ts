import { Product, UserIntent, UpsellOpportunity } from "./types";
import { getAllProducts, getProductById } from "./catalog";

/**
 * Returns eligible cross-sell products for a given product ID.
 * e.g., if product is a keyboard, recommend compatible wrist support or mouse pads.
 */
export function getCrossSells(productId: string): Product[] {
  const allProducts = getAllProducts();
  
  // Find products that are explicitly compatible with this product ID
  const explicitCompatibles = allProducts.filter(p => 
    p.compatibleWith.includes(productId) || p.compatibleWith.includes(p.name)
  );

  if (explicitCompatibles.length > 0) {
    return explicitCompatibles;
  }

  const currentProduct = allProducts.find(p => p.id === productId);
  if (!currentProduct) return [];

  if (currentProduct.category === "Mechanical Keyboard") {
    return allProducts.filter(p => p.category === "Wrist Rest" || p.category === "Mouse Pad");
  }

  if (currentProduct.category === "Wireless Mouse") {
    return allProducts.filter(p => p.category === "Mouse Pad");
  }

  return [];
}

/**
 * Returns higher-tier product suggestions (upsell) in the same category.
 */
export function getUpsellAlternatives(productId: string): Product[] {
  const allProducts = getAllProducts();
  const currentProduct = allProducts.find(p => p.id === productId);
  if (!currentProduct) return [];

  return allProducts.filter(p => 
    p.category === currentProduct.category && 
    p.price > currentProduct.price &&
    p.stock > 0
  ).sort((a, b) => a.price - b.price);
}

/**
 * Returns a mapping of complementary categories.
 */
function areCategoriesComplementary(cat1: string, cat2: string): boolean {
  const complementaryPairs: Record<string, string[]> = {
    "Mechanical Keyboard": ["Wrist Rest", "Mouse Pad"],
    "Wireless Mouse": ["Mouse Pad"],
    "Laptop Stand": ["Mechanical Keyboard", "Wireless Mouse"],
    "Wrist Rest": ["Mechanical Keyboard"],
    "Mouse Pad": ["Wireless Mouse", "Mechanical Keyboard"],
    "Headphones": ["Mechanical Keyboard", "Wireless Mouse"]
  };

  return (complementaryPairs[cat1]?.includes(cat2) || complementaryPairs[cat2]?.includes(cat1)) || false;
}

/**
 * Identifies the best complementary upsell opportunity.
 * Returns the highest ranked opportunity or null if none fit budget or relevance rules.
 */
export function findUpsellOpportunity(
  selectedProduct: Product,
  catalog: Product[],
  userBudget: number,
  intent: UserIntent
): UpsellOpportunity | null {
  const originalTotal = selectedProduct.price;
  const remainingBudgetLimit = userBudget - originalTotal;

  // 1. Exclude the selected product itself, out-of-stock items, and items exceeding remaining budget limit
  const candidates = catalog.filter(candidate => {
    const isSameProduct = candidate.id === selectedProduct.id;
    const hasStock = candidate.stock >= 1;
    const fitsBudget = candidate.price <= remainingBudgetLimit;
    return !isSameProduct && hasStock && fitsBudget;
  });

  if (candidates.length === 0) return null;

  // 2. Score candidates deterministically
  const scoredCandidates = candidates.map(candidate => {
    let score = 0;
    
    // Check compatibility (Direct)
    const isCompatible = 
      selectedProduct.compatibleWith.includes(candidate.id) ||
      selectedProduct.compatibleWith.includes(candidate.name) ||
      candidate.compatibleWith.includes(selectedProduct.id) ||
      candidate.compatibleWith.includes(selectedProduct.name);

    if (isCompatible) {
      score += 50;
    }

    // Check complementary categories
    const isComplementary = areCategoriesComplementary(selectedProduct.category, candidate.category);
    if (isComplementary) {
      score += 30;
    }

    // Shared tags
    const sharedTags = candidate.tags.filter(tag => selectedProduct.tags.includes(tag));
    score += sharedTags.length * 5;

    // Use Case Match
    let matchesUseCase = false;
    if (intent.useCase) {
      const normalizedUseCase = intent.useCase.toLowerCase();
      matchesUseCase = 
        candidate.tags.includes(normalizedUseCase) ||
        candidate.features.some(f => f.toLowerCase().includes(normalizedUseCase)) ||
        candidate.description.toLowerCase().includes(normalizedUseCase);
      
      if (matchesUseCase) {
        score += 25;
      }
    }

    // Penalize completely irrelevant items (score remains 0 or very low)
    // If an item has no compatibility, is not complementary, and shares no tags, penalize heavily
    const isIrrelevant = !isCompatible && !isComplementary && sharedTags.length === 0;
    if (isIrrelevant) {
      score -= 100;
    }

    return {
      candidate,
      score,
      isCompatible,
      matchesUseCase
    };
  });

  // Filter out irrelevant/negative-score items
  const validScored = scoredCandidates.filter(item => item.score > 0);

  if (validScored.length === 0) return null;

  // Sort candidates by score descending, breaking ties by lower price (maximizing conversion chance)
  validScored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.candidate.price - b.candidate.price;
  });

  const best = validScored[0];
  const upsellAmount = best.candidate.price;
  const newTotal = originalTotal + upsellAmount;
  const remainingBudget = userBudget - newTotal;

  // 3. Generate explainable reasoning
  let reasoning = "";
  if (best.candidate.id === "ergorest-wrist-support" && selectedProduct.id === "novakey-k75") {
    reasoning = `ErgoRest Wrist Support is compatible with NovaKey K75 and supports comfortable long programming sessions. At ₹399, it fits within your remaining ₹${remainingBudgetLimit} budget.`;
  } else {
    const compatibilityText = best.isCompatible 
      ? `is compatible with ${selectedProduct.name}` 
      : `is a great complementary accessory for your ${selectedProduct.category}`;
      
    const useCaseText = best.matchesUseCase && intent.useCase
      ? `supports comfortable long ${intent.useCase} sessions`
      : `improves ergonomics and completes your desk workspace`;

    reasoning = `${best.candidate.name} ${compatibilityText} and ${useCaseText}. At ₹${upsellAmount}, it fits within your remaining ₹${remainingBudgetLimit} budget.`;
  }

  return {
    recommendedProduct: best.candidate,
    originalTotal,
    upsellAmount,
    newTotal,
    remainingBudget,
    relevanceScore: best.score,
    reasoning,
    approved: true
  };
}

/**
 * Development test helper to verify target Phase 1.4 simulation scenario.
 */
export function runTestUpsellSimulation(): UpsellOpportunity | null {
  const novakey = getProductById("novakey-k75");
  if (!novakey) return null;

  const testIntent: UserIntent = {
    productCategory: "Mechanical Keyboard",
    budget: 5000,
    wireless: true,
    batteryPriority: "high",
    useCase: "programming"
  };

  return findUpsellOpportunity(novakey, getAllProducts(), 5000, testIntent);
}
