// Fictional merchant policies config for Nexora Tech
export interface MerchantPolicy {
  id: string;
  name: string;
  description: string;
  ruleType: 'BUDGET' | 'INVENTORY' | 'DISCOUNT' | 'UPSELL' | 'TRANSACTION';
  enabled: boolean;
  parameters: Record<string, any>;
}

// Global Policy Configuration Values
export const merchantPolicyConfig = {
  maximumDiscount: 500, // INR
  minimumStockRequired: 1, // unit count
  maximumTransactionAmount: 10000, // INR
  requireUserApproval: true
};

export const merchantPolicies: MerchantPolicy[] = [
  {
    id: "max-budget-policy",
    name: "Max Budget Limit",
    description: "Ensures the total purchase cost does not exceed the customer's specified maximum budget.",
    ruleType: "BUDGET",
    enabled: true,
    parameters: {}
  },
  {
    id: "inventory-check-policy",
    name: "Inventory Validation",
    description: "Ensures the requested product quantities are available in stock.",
    ruleType: "INVENTORY",
    enabled: true,
    parameters: {
      minimumStockRequired: merchantPolicyConfig.minimumStockRequired
    }
  },
  {
    id: "max-discount-policy",
    name: "Maximum Discount Limit",
    description: "Restricts the absolute discount value to merchant maximum allowed discount.",
    ruleType: "DISCOUNT",
    enabled: true,
    parameters: {
      maximumDiscount: merchantPolicyConfig.maximumDiscount
    }
  },
  {
    id: "test-mode-transaction-limit",
    name: "Razorpay Test Mode Limit",
    description: "Restricts individual test transactions to prevent test abuse.",
    ruleType: "TRANSACTION",
    enabled: true,
    parameters: {
      maxAmountINR: merchantPolicyConfig.maximumTransactionAmount
    }
  }
];
