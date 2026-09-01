import { Merchant } from "../lib/types";

export const merchants: Merchant[] = [
  {
    merchantId: "nexora-tech",
    merchantName: "Nexora Tech",
    description: "Specializes in high-productivity wireless peripherals, premium custom mechanical keyboards, and precision desk accessories.",
    categories: [
      "Mechanical Keyboard",
      "Wireless Keyboard",
      "Wireless Mouse",
      "Wrist Rest",
      "Mouse Pad",
      "Laptop Stand",
      "Desk Accessories"
    ],
    policyRules: {
      freeShippingThreshold: 2000,
      returnWindowDays: 7,
      standardWarrantyMonths: 12,
      maxDiscountPercentage: 15,
      allowsBundleDiscounts: true
    },
    shippingPolicy: "Free standard delivery across India on orders above ₹2,000. Typical dispatch within 24 hours (2-3 business days delivery).",
    returnPolicy: "7-day hassle-free returns for unopened hardware or defective units.",
    discountPolicy: "Up to 15% promotional or accessory bundle discounts allowed per verified transaction.",
    inventoryPolicy: "Live real-time warehouse allocation with guaranteed stock reservation on order creation.",
    rating: 4.8
  },
  {
    merchantId: "technova",
    merchantName: "TechNova",
    description: "High-performance gaming peripherals, esports grade switches, and ultra-durable aluminum hardware with industry-leading warranties.",
    categories: [
      "Mechanical Keyboard",
      "Gaming Keyboard",
      "Wireless Mouse",
      "Headphones",
      "Monitors",
      "Webcams"
    ],
    policyRules: {
      freeShippingThreshold: 3000,
      returnWindowDays: 10,
      standardWarrantyMonths: 24,
      maxDiscountPercentage: 10,
      allowsBundleDiscounts: false
    },
    shippingPolicy: "Express air shipping. Free delivery on orders over ₹3,000 (1-2 business days).",
    returnPolicy: "10-day replacement & return policy with zero restocking fee on tech components.",
    discountPolicy: "Strict 10% maximum margin discount; prioritizes long-term manufacturer warranty over price slashing.",
    inventoryPolicy: "Direct regional hub fulfillment with 99.8% on-time delivery record.",
    rating: 4.9
  },
  {
    merchantId: "bytemart",
    merchantName: "ByteMart",
    description: "Budget-friendly direct electronics, unbeatable value on mechanical switches, compact travel keyboards, and essential workspace adapters.",
    categories: [
      "Mechanical Keyboard",
      "Membrane Keyboard",
      "Wireless Keyboard",
      "Wireless Mouse",
      "USB Hubs",
      "Laptop Accessories",
      "Headphones"
    ],
    policyRules: {
      freeShippingThreshold: 1500,
      returnWindowDays: 14,
      standardWarrantyMonths: 6,
      maxDiscountPercentage: 20,
      allowsBundleDiscounts: true
    },
    shippingPolicy: "Economical ground shipping with free shipping on orders above ₹1,500 (3-5 business days).",
    returnPolicy: "Generous 14-day return window and fast 48-hour replacement turnaround.",
    discountPolicy: "Aggressive value pricing with direct volume discount support up to 20%.",
    inventoryPolicy: "High-volume discount inventory with rapid restock cycles.",
    rating: 4.5
  },
  {
    merchantId: "circuithub",
    merchantName: "CircuitHub",
    description: "Enthusiast studio equipment, custom hot-swappable 75% mechanical keyboards, studio webcams, and audiophile monitoring headphones.",
    categories: [
      "Mechanical Keyboard",
      "Wireless Keyboard",
      "Headphones",
      "Webcams",
      "USB Hubs",
      "Wrist Rest"
    ],
    policyRules: {
      freeShippingThreshold: 2500,
      returnWindowDays: 7,
      standardWarrantyMonths: 12,
      maxDiscountPercentage: 12,
      allowsBundleDiscounts: true
    },
    shippingPolicy: "Insured courier shipping with protective foam packaging. Free on orders above ₹2,500 (2-4 business days).",
    returnPolicy: "7-day return window for manufacturer defects or aesthetic switch inspection.",
    discountPolicy: "Specialized creator discounts and cross-accessory bundling.",
    inventoryPolicy: "Batch artisan stock with verified quality testing before shipment.",
    rating: 4.7
  },
  {
    merchantId: "geargrid",
    merchantName: "GearGrid",
    description: "Ergonomic workstations, high-refresh studio monitors, memory foam wrist supports, heavy-duty laptop stands, and ergonomic desk accessories.",
    categories: [
      "Monitors",
      "Laptop Accessories",
      "Desk Accessories",
      "Wrist Rest",
      "Mouse Pad",
      "Mechanical Keyboard",
      "Wireless Mouse"
    ],
    policyRules: {
      freeShippingThreshold: 3500,
      returnWindowDays: 30,
      standardWarrantyMonths: 36,
      maxDiscountPercentage: 10,
      allowsBundleDiscounts: true
    },
    shippingPolicy: "Heavy-goods white glove courier. Free shipping on orders over ₹3,500 (2-4 business days).",
    returnPolicy: "30-day ergonomic satisfaction guarantee with free return pickup.",
    discountPolicy: "Premium bundle promotions with ergonomic setup discounts.",
    inventoryPolicy: "Dedicated enterprise inventory with guaranteed stock reserve.",
    rating: 4.9
  }
];

export function getMerchantById(merchantId: string): Merchant | undefined {
  const norm = merchantId.toLowerCase().trim();
  return merchants.find(m => 
    m.merchantId.toLowerCase() === norm || 
    (m as any).id === norm || 
    m.merchantName.toLowerCase().replace(/\s+/g, "").includes(norm.replace(/\s+/g, "")) ||
    m.merchantId.toLowerCase().startsWith(norm) ||
    norm.startsWith(m.merchantId.toLowerCase())
  );
}

export function getAllMerchants(): Merchant[] {
  return merchants;
}

export const DEMO_MERCHANTS = merchants;


