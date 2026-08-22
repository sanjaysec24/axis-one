import fs from "fs";
import path from "path";
import { PersistentOrder } from "./types";

const ORDERS_FILE_PATH = path.join(process.cwd(), "data", "orders.json");

/**
 * Ensures the data/ directory and the orders.json file exist.
 */
function ensureOrdersFileExists(): void {
  const dir = path.dirname(ORDERS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ORDERS_FILE_PATH)) {
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify([]), "utf-8");
  }
}

/**
 * Loads all persistent orders from filesystem.
 */
export function getAllOrders(): PersistentOrder[] {
  ensureOrdersFileExists();
  try {
    const data = fs.readFileSync(ORDERS_FILE_PATH, "utf-8");
    return JSON.parse(data || "[]");
  } catch (error) {
    console.error("Error reading persistent orders storage:", error);
    return [];
  }
}

/**
 * Retrieves a single persistent order by its orderId or Razorpay order ID.
 */
export function getOrderById(orderId: string): PersistentOrder | undefined {
  const orders = getAllOrders();
  return orders.find(o => o.orderId === orderId || o.razorpayOrderId === orderId);
}

/**
 * Persists an order to storage. Updates the record if orderId already exists, preventing duplicates.
 */
export function saveOrder(order: PersistentOrder): void {
  ensureOrdersFileExists();
  const orders = getAllOrders();
  const index = orders.findIndex(o => o.orderId === order.orderId);
  if (index >= 0) {
    orders[index] = order; // Update existing
  } else {
    orders.push(order); // Append new
  }
  fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), "utf-8");
}

/**
 * Development test helper to clear the orders JSON file.
 */
export function clearAllOrders(): void {
  ensureOrdersFileExists();
  fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify([]), "utf-8");
}
