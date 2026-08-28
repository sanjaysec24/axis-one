import { Product, RankedResult, MerchantComparisonSummary } from "./types";
import { getAllMerchants } from "../data/merchants";

/**
 * Compares candidates across different merchants and generates structured summary comparisons.
 */
export function buildMerchantComparison(
  candidates: RankedResult[],
  activeProduct?: Product
): MerchantComparisonSummary {
  if (!candidates || candidates.length === 0) {
    return {
      candidateCount: 0,
      merchantCount: 0,
      comparisonHighlights: [],
      comparisonText: "No candidate products available for merchant comparison."
    };
  }

  // Distinct merchants in candidates
  const merchantIds = Array.from(new Set(candidates.map(c => c.product.merchantId)));
  const merchantCount = merchantIds.length;

  // 1. Cheapest option
  let cheapest = candidates[0];
  for (const c of candidates) {
    if (c.product.price < cheapest.product.price) {
      cheapest = c;
    }
  }

  // 2. Best warranty option (looks for 3 Years or 2 Years)
  let bestWarranty = candidates[0];
  for (const c of candidates) {
    const wYears = ((c.product.warranty || "").match(/(\d+)\s*Year/i) || [])[1];
    const bestYears = ((bestWarranty.product.warranty || "").match(/(\d+)\s*Year/i) || [])[1];
    if (Number(wYears || 0) > Number(bestYears || 0)) {
      bestWarranty = c;
    }
  }

  // 3. Best match option
  const bestMatch = candidates[0];

  const highlights: string[] = [];

  // Detail highlights across merchants
  highlights.push(`${merchantCount} verified merchants have matching products in stock.`);
  
  if (cheapest) {
    const mName = cheapest.product.merchantName || "Store";
    highlights.push(
      `${mName} offers the lowest price with ${cheapest.product.name} at ₹${cheapest.product.price}.`
    );
  }

  if (bestWarranty && bestWarranty.product.id !== cheapest.product.id) {
    const mName = bestWarranty.product.merchantName || "Store";
    highlights.push(
      `${mName} provides the strongest coverage with a ${bestWarranty.product.warranty || "Standard"} warranty on ${bestWarranty.product.name} (₹${bestWarranty.product.price}).`
    );
  }

  if (bestMatch && bestMatch.product.id !== cheapest.product.id) {
    const mName = bestMatch.product.merchantName || "Store";
    highlights.push(
      `${mName} has the highest match score (${bestMatch.matchScore}%) with ${bestMatch.product.name} (₹${bestMatch.product.price}).`
    );
  }

  // Generate clear conversational paragraph
  let comparisonText = "";
  if (merchantCount === 1) {
    const mName = candidates[0].product.merchantName || "our store";
    comparisonText = `Found ${candidates.length} options from ${mName}. ${bestMatch.product.name} (₹${bestMatch.product.price}) is the top match with ${bestMatch.matchScore}% score.`;
  } else {
    const cheapStore = cheapest.product.merchantName || "Store A";
    const warStore = bestWarranty.product.merchantName || "Store B";
    const matchStore = bestMatch.product.merchantName || "Store C";
    const warText = bestWarranty.product.warranty || "extended warranty";
    comparisonText = `${merchantCount} merchants have valid matches. ${cheapStore} has the lowest price at ₹${cheapest.product.price} (${cheapest.product.name}), while ${warStore} offers the strongest warranty (${warText}). ${matchStore} offers the closest feature match with the ${bestMatch.product.name} (₹${bestMatch.product.price}).`;
  }

  return {
    candidateCount: candidates.length,
    merchantCount,
    cheapestOption: {
      product: cheapest.product,
      merchantName: cheapest.product.merchantName || "Store",
      price: cheapest.product.price
    },
    bestWarrantyOption: {
      product: bestWarranty.product,
      merchantName: bestWarranty.product.merchantName || "Store",
      warranty: bestWarranty.product.warranty || "1 Year Standard"
    },
    bestMatchOption: {
      product: bestMatch.product,
      merchantName: bestMatch.product.merchantName || "Store",
      matchScore: bestMatch.matchScore
    },
    comparisonHighlights: highlights,
    comparisonText
  };
}
