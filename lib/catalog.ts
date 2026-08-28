import { products } from "../data/products";
import { Product, UserIntent } from "./types";

/**
 * Retrieves all products in the catalog.
 */
export function getAllProducts(): Product[] {
  return products;
}

/**
 * Retrieves a single product by its unique ID.
 */
export function getProductById(id: string): Product | undefined {
  return products.find(p => p.id === id);
}

/**
 * Retrieves all products for a specific merchant.
 */
export function getProductsByMerchant(merchantId: string): Product[] {
  return products.filter(p => p.merchantId === merchantId);
}

/**
 * Category synonym and fuzzy matching helper.
 */
export function isCategoryMatch(productCategory: string, requestedCategory: string): boolean {
  const normProd = productCategory.toLowerCase().trim();
  const normReq = requestedCategory.toLowerCase().trim();

  if (normProd === normReq) return true;

  // Generic "keyboard" matches all keyboard variants
  if (normReq === "keyboard" || normReq === "keyboards") {
    return normProd.includes("keyboard");
  }

  // Generic "mouse" matches mouse categories
  if (normReq === "mouse" || normReq === "mice") {
    return normProd.includes("mouse");
  }

  // "Wireless Keyboard" matches mechanical or membrane wireless keyboards
  if (normReq === "wireless keyboard") {
    return normProd.includes("keyboard");
  }

  // "Gaming Keyboard" matches mechanical or gaming keyboards
  if (normReq === "gaming keyboard") {
    return normProd.includes("keyboard") || normProd.includes("gaming");
  }

  // "Mechanical Keyboard" matches Mechanical Keyboard or Gaming Keyboard
  if (normReq === "mechanical keyboard") {
    return normProd === "mechanical keyboard" || normProd === "wireless keyboard" || normProd === "gaming keyboard";
  }

  // "Headphones" matches headphones / headsets
  if (normReq.includes("headphone") || normReq.includes("headset") || normReq.includes("earphone") || normReq.includes("audio")) {
    return normProd === "headphones";
  }

  // "Monitor" / "Monitors"
  if (normReq.includes("monitor") || normReq.includes("display") || normReq.includes("screen")) {
    return normProd === "monitors";
  }

  // "Webcam" / "Camera"
  if (normReq.includes("webcam") || normReq.includes("camera")) {
    return normProd === "webcams";
  }

  // "USB Hub" / "Dock"
  if (normReq.includes("hub") || normReq.includes("dock") || normReq.includes("adapter")) {
    return normProd === "usb hubs" || normProd === "laptop accessories";
  }

  // "Laptop Stand" / "Laptop Accessories"
  if (normReq.includes("stand") || normReq.includes("laptop")) {
    return normProd === "laptop accessories";
  }

  // "Wrist Rest"
  if (normReq.includes("wrist") || normReq.includes("rest") || normReq.includes("cushion")) {
    return normProd === "wrist rest";
  }

  // "Mouse Pad" / "Desk Mat"
  if (normReq.includes("pad") || normReq.includes("mat")) {
    return normProd === "mouse pad" || normProd === "desk accessories";
  }

  return normProd.includes(normReq) || normReq.includes(normProd);
}

/**
 * Performs a keyword search across all merchants if a string is provided,
 * or filters candidate products based on category, stock, and intent if a UserIntent is provided.
 */
export function searchProducts(queryOrIntent: string | UserIntent): Product[] {
  if (typeof queryOrIntent === "string") {
    if (!queryOrIntent) return products;
    const normalizedQuery = queryOrIntent.toLowerCase().trim();
    
    return products.filter(product => {
      const inStock = (product.stock ?? product.inventory ?? 0) >= 1;
      const matchesText = (
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        (product.merchantName || "").toLowerCase().includes(normalizedQuery) ||
        product.tags.some(tag => tag.toLowerCase().includes(normalizedQuery)) ||
        product.features.some(feature => feature.toLowerCase().includes(normalizedQuery)) ||
        (product.useCases || []).some(u => u.toLowerCase().includes(normalizedQuery))
      );
      return inStock && matchesText;
    });
  } else {
    // 1. Filter products by requested category across all merchants
    // 2. Exclude products with insufficient stock (stock < 1)
    // 3. If preferredMerchantId is set, filter by that merchant
    const matched = products.filter(product => {
      const categoryMatches = isCategoryMatch(product.category, queryOrIntent.productCategory);
      const hasStock = (product.stock ?? product.inventory ?? 0) >= 1;
      const merchantMatches = queryOrIntent.preferredMerchantId
        ? (product.merchantId === queryOrIntent.preferredMerchantId || (product.merchantId || "").startsWith(queryOrIntent.preferredMerchantId))
        : true;
      return categoryMatches && hasStock && merchantMatches;
    });

    if (queryOrIntent.budget !== undefined && queryOrIntent.budget > 0) {
      const underBudget = matched.filter(p => p.price <= queryOrIntent.budget!);
      if (underBudget.length > 0) {
        return underBudget;
      }
    }

    return matched;
  }
}
