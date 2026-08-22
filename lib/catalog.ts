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
 * Performs a keyword search if a string is provided, or filters candidate products based on category and stock if a UserIntent is provided.
 */
export function searchProducts(queryOrIntent: string | UserIntent): Product[] {
  if (typeof queryOrIntent === "string") {
    if (!queryOrIntent) return products;
    const normalizedQuery = queryOrIntent.toLowerCase().trim();
    
    return products.filter(product => {
      return (
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.tags.some(tag => tag.toLowerCase().includes(normalizedQuery)) ||
        product.features.some(feature => feature.toLowerCase().includes(normalizedQuery))
      );
    });
  } else {
    // 1. Filter products by the requested product category (case-insensitive)
    // 2. Exclude products with insufficient stock (stock < 1)
    return products.filter(product => {
      const categoryMatches = product.category.toLowerCase() === queryOrIntent.productCategory.toLowerCase();
      const hasStock = product.stock >= 1;
      return categoryMatches && hasStock;
    });
  }
}
