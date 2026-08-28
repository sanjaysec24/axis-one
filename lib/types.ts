/**
 * Core type definitions for the AXIS ONE commerce engine.
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // Integer representing price in INR (e.g. 4499)
  stock: number; // Integer representing stock count
  description: string;
  features: string[];
  tags: string[];
  image: string; // URL placeholder or local asset path
  batteryLife: string | null; // e.g. "80 hours" or null if not applicable
  compatibleWith: string[]; // List of product IDs or names this is compatible with
}

export interface PolicyValidationResult {
  isValid: boolean;
  reason?: string;
  errorCode?: 'BUDGET_EXCEEDED' | 'OUT_OF_STOCK' | 'POLICY_VIOLATION' | 'INVALID_QUANTITY';
}

export type AuditEventType =
  | 'INTENT_RECEIVED'
  | 'CATALOG_SEARCHED'
  | 'PRODUCTS_RANKED'
  | 'PRODUCT_SELECTED'
  | 'UPSELL_IDENTIFIED'
  | 'POLICY_VALIDATED'
  | 'USER_APPROVED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_COMPLETED'
  | 'ACTION_BLOCKED'
  | 'EXPLANATION_GENERATED';

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  actor: string;
  status: "SUCCESS" | "FAILED" | "BLOCKED" | "PENDING";
  summary: string;
  details: Record<string, any>;
}


export interface PolicyCheck {
  rule: string;
  status: "PASSED" | "FAILED";
  expected: string | number;
  actual: string | number;
  explanation: string;
}

export interface ValidationResult {
  approved: boolean;
  originalTotal: number;
  requestedDiscount: number;
  finalAmount: number;
  checks: PolicyCheck[];
  failureReasons: string[];
}

export interface UserIntent {
  productCategory: string;
  budget?: number;
  wireless?: boolean;
  batteryPriority?: "low" | "medium" | "high";
  useCase?: string;
}

export interface RankedResult {
  product: Product;
  matchScore: number; // Normalized percentage: 0 to 100
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  reasoning: string;
}

export interface UpsellOpportunity {
  recommendedProduct: Product;
  originalTotal: number;
  upsellAmount: number;
  newTotal: number;
  remainingBudget: number;
  relevanceScore: number;
  reasoning: string;
  approved: boolean;
}

export interface ExplanationContext {
  intent: {
    productCategory: string;
    budget?: number;
    wireless?: boolean;
    batteryPriority?: "low" | "medium" | "high";
    useCase?: string;
  };
  originalRequirements?: UserIntent;
  latestRequirements?: UserIntent;
  recommendation: {
    name: string;
    price: number;
    matchScore: number;
    matchedCriteria: string[];
    unmatchedCriteria: string[];
  };
  previousProduct?: {
    name: string;
    price: number;
  } | null;
  upsell: {
    name: string;
    price: number;
    relevanceReason: string;
  } | null;
  basket: {
    total: number;
    remainingBudget: number;
  };
  policyValidation: {
    approved: boolean;
    checks: PolicyCheck[];
  };
  tradeoffs?: string[];
  userQuery?: string;
  action?: ConversationAction;
  transactionState?: TransactionState;
  responseIntent?: ResponseIntent;
  recentMessages?: Array<{ role: "USER" | "AXIS_ONE"; content: string }>;
}

export type ResponseIntent =
  | "GREETING"
  | "INITIAL_RECOMMENDATION"
  | "BUDGET_UPDATE"
  | "CHEAPER_ALTERNATIVE"
  | "REMOVE_UPSELL"
  | "ADD_UPSELL"
  | "REQUEST_EXPLANATION"
  | "PRODUCT_COMPARISON"
  | "CONFIRMATION"
  | "PAYMENT_GUIDANCE"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELLED"
  | "GENERAL_FOLLOW_UP";

export interface ExplanationResult {
  recommendationExplanation: string;
  upsellExplanation: string;
  budgetExplanation: string;
  policyExplanation: string;
  summary: string;
  source: "GEMINI" | "FALLBACK";
}

export type ConversationAction =
  | "NEW_SEARCH"
  | "CHANGE_BUDGET"
  | "REMOVE_UPSELL"
  | "REMOVE_PRODUCT"
  | "REQUEST_CHEAPER"
  | "REQUEST_CHEAPER_OPTION"
  | "REQUEST_ALTERNATIVE"
  | "REQUEST_EXPLANATION"
  | "CHANGE_REQUIREMENT"
  | "MODIFY_REQUIREMENTS"
  | "CONFIRM_SELECTION"
  | "CANCEL_SELECTION"
  | "GREETING"
  | "GENERAL_QUESTION"
  | "GENERAL_FOLLOW_UP"
  | "UNKNOWN";

export type TransactionState =
  | "EXPLORING"
  | "AWAITING_USER_APPROVAL"
  | "UPDATED"
  | "BLOCKED"
  | "USER_CONFIRMED"
  | "PAYMENT_PENDING"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELLED";

export interface PersistentOrder {
  orderId: string;
  sessionId?: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  items?: Product[];
  basket: Product[];
  amount: number;
  currency: string;
  transactionState: TransactionState;
  createdAt?: string;
  updatedAt?: string;
  timestamp: string;
  auditEvents?: AuditEvent[];
  auditHistory: AuditEvent[];
}

export interface CommerceConversationContext {
  sessionId: string;
  originalIntent: UserIntent;
  originalRequirements?: UserIntent;
  latestIntent?: UserIntent;
  latestRequirements?: UserIntent;
  category?: string;
  budget?: number;
  preferredFeatures?: string[];
  excludedFeatures?: string[];
  recommendedProduct?: Product;
  currentProduct?: Product | null;
  previousProduct?: Product | null;
  currentUpsell?: Product | null;
  upsells?: Product[];
  currentBasket: Product[];
  previousBasket?: Product[];
  policyStatus?: boolean;
  transactionState: TransactionState;
  recentMessages: Array<{
    role: "USER" | "AXIS_ONE";
    content: string;
  }>;
  conversationHistory?: Array<{
    role: "USER" | "AXIS_ONE";
    content: string;
  }>;
  lastAction?: ConversationAction;
  lastUserQuery?: string;
  tradeoffs?: string[];
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  lastBasketHash?: string;
  requestedDiscount?: number;
}

export interface WorkflowSuccessResponse {
  success: true;
  message: string;
  intent: UserIntent;
  recommendation: RankedResult;
  upsell: UpsellOpportunity | null;
  basket: {
    items: Product[];
    originalTotal: number;
    requestedDiscount: number;
    finalAmount: number;
  };
  policyValidation: ValidationResult;
  transactionState: TransactionState;
  auditTrail: AuditEvent[];
  explanation: ExplanationResult;
  sessionId: string;
  conversationAction: ConversationAction;
}

export interface WorkflowFailureResponse {
  success: false;
  stage: "INTENT_EXTRACTION" | "CATALOG_SEARCH" | "POLICY_VALIDATION";
  message: string;
  policyValidation?: ValidationResult;
  alternatives: RankedResult[];
  auditTrail: AuditEvent[];
  explanation?: ExplanationResult;
  sessionId: string;
  conversationAction: ConversationAction;
  transactionState: TransactionState;
}




