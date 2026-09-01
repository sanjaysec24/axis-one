/**
 * Core type definitions for the AXIS ONE commerce engine.
 */

export interface MerchantPolicyRules {
  freeShippingThreshold: number; // INR amount above which shipping is free
  returnWindowDays: number; // Number of days allowed for returns
  standardWarrantyMonths: number; // Standard warranty duration
  maxDiscountPercentage?: number; // Maximum allowed promotional discount %
  allowsBundleDiscounts?: boolean;
}

export interface Merchant {
  merchantId: string;
  merchantName: string;
  description: string;
  categories: string[];
  policyRules: MerchantPolicyRules;
  shippingPolicy: string;
  returnPolicy: string;
  discountPolicy: string;
  inventoryPolicy: string;
  rating: number; // e.g. 4.8
}

export interface ProductPolicyFlags {
  freeShipping: boolean;
  returnDays: number;
  bundleEligible?: boolean;
  codAvailable?: boolean;
}

export interface Product {
  id: string;
  merchantId?: string;
  merchantName?: string;
  name: string;
  category: string;
  subcategory?: string;
  price: number; // Integer representing price in INR (e.g. 4499)
  currency?: string;
  stock: number; // Integer representing stock count (backwards compatible alias for inventory)
  inventory?: number; // Integer representing stock count
  description: string;
  features: string[];
  connectivity?: "wireless" | "wired" | "bluetooth" | "dual-mode" | "tri-mode" | "usb-c" | "none";
  compatibility?: string[]; // e.g. ["Windows", "macOS", "Linux"]
  useCases?: string[]; // e.g. ["programming", "gaming", "office", "travel"]
  rating?: number; // e.g. 4.7
  deliveryEstimate?: string; // e.g. "2-3 business days"
  warranty?: string; // e.g. "1 Year Merchant Warranty"
  policyFlags?: ProductPolicyFlags;
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
  | 'MERCHANT_COMPARED'
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
  preferredMerchantId?: string;
}

export interface RankedResult {
  product: Product;
  matchScore: number; // Normalized percentage: 0 to 100
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  reasoning: string;
  merchantComparisonBadge?: string;
}

export interface MerchantComparisonSummary {
  candidateCount: number;
  merchantCount: number;
  cheapestOption?: { product: Product; merchantName: string; price: number };
  bestWarrantyOption?: { product: Product; merchantName: string; warranty: string };
  bestMatchOption?: { product: Product; merchantName: string; matchScore: number };
  comparisonHighlights: string[];
  comparisonText: string;
}

export interface ProductComparisonAttributeRow {
  attributeKey: string;
  label: string;
  values: Record<string, { displayValue: string; status: "supported" | "unavailable" | "limitation"; numericValue?: number }>;
  bestProductId?: string;
  highlightDifference?: string;
}

export interface ProductComparisonDifference {
  type: "PRICE" | "BATTERY" | "WARRANTY" | "CONNECTIVITY" | "USE_CASE" | "FEATURE";
  headline: string;
  detail: string;
  winnerProductId?: string;
}

export interface ProductComparisonData {
  comparedProducts: RankedResult[];
  attributeRows: ProductComparisonAttributeRow[];
  differences: ProductComparisonDifference[];
  bestOverall: Product;
  cheapest: Product;
  bestWarranty: Product;
  bestMatch: Product;
  bestForUseCase?: Product;
  comparisonSummary: string;
  groundedExplanation: string;
}

export type AgentActivityType =
  | "REQUIREMENTS_UNDERSTOOD"
  | "MERCHANT_SEARCH"
  | "PRODUCT_FILTERING"
  | "PRODUCT_COMPARISON"
  | "BUDGET_VALIDATION"
  | "INVENTORY_VALIDATION"
  | "POLICY_VALIDATION"
  | "PRODUCT_SELECTED"
  | "BASKET_BUILT"
  | "USER_APPROVAL_REQUIRED"
  | "USER_APPROVED"
  | "PAYMENT_INITIATED"
  | "PAYMENT_VERIFIED"
  | "ORDER_PERSISTED";

export type AgentActivityStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WARNING"
  | "BLOCKED";

export interface AgentActivity {
  id: string;
  type: AgentActivityType;
  status: AgentActivityStatus;
  title: string;
  summary: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface DecisionFactor {
  factor: string;
  status: "positive" | "neutral" | "tradeoff";
  detail: string;
}

export interface DecisionHistoryEntry {
  stepNumber: number;
  actionTitle: string;
  productName?: string;
  merchantName?: string;
  price?: number;
  detail: string;
  timestamp: string;
}

export interface AgentDecisionSummary {
  requirements: string[];
  merchantsEvaluated: number;
  productsEvaluated: number;
  validCandidates: number;
  selectedProduct: Product;
  matchScore: number;
  budgetStatus: "WITHIN_BUDGET" | "BUDGET_EXCEEDED" | "NO_BUDGET_SET";
  inventoryStatus: "AVAILABLE" | "LIMITED_AVAILABILITY" | "UNAVAILABLE";
  policyStatus: "VALID" | "BLOCKED";
  userLimit?: number;
  basketTotal: number;
  remainingBudget?: number;
  tradeoffs: string[];
  decisionFactors: DecisionFactor[];
  decisionHistory: DecisionHistoryEntry[];
  authorizationStatus: "PENDING_USER_APPROVAL" | "USER_APPROVED" | "PAYMENT_AUTHORIZED" | "PAYMENT_COMPLETED";
}

export interface TrustControls {
  decisionControls: string[];
  paymentControls: string[];
  persistenceControls: string[];
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
    merchantName?: string;
    price: number;
    matchScore: number;
    matchedCriteria: string[];
    unmatchedCriteria: string[];
    warranty?: string;
    deliveryEstimate?: string;
  };
  previousProduct?: {
    name: string;
    merchantName?: string;
    price: number;
  } | null;
  upsell: {
    name: string;
    merchantName?: string;
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
  merchantComparison?: MerchantComparisonSummary;
  alternativeCandidates?: RankedResult[];
  productComparison?: ProductComparisonData;
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
  | "KEEP_CURRENT_SELECTION"
  | "PAYMENT_GUIDANCE"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_CANCELLED"
  | "CLARIFICATION_REQUIRED"
  | "THANKS"
  | "FAREWELL"
  | "GENERAL_FOLLOW_UP";

export type ConversationAction =
  | "NEW_SEARCH"
  | "CHANGE_BUDGET"
  | "REMOVE_UPSELL"
  | "REMOVE_PRODUCT"
  | "REQUEST_CHEAPER"
  | "REQUEST_CHEAPER_OPTION"
  | "REQUEST_ALTERNATIVE"
  | "REQUEST_EXPLANATION"
  | "PRODUCT_COMPARISON"
  | "CHANGE_REQUIREMENT"
  | "MODIFY_REQUIREMENTS"
  | "CONFIRM_SELECTION"
  | "CONFIRM_REFERENCED_PRODUCT"
  | "KEEP_CURRENT_SELECTION"
  | "ADD_UPSELL"
  | "PAYMENT_GUIDANCE"
  | "CANCEL_SELECTION"
  | "GREETING"
  | "THANKS"
  | "FAREWELL"
  | "CLARIFICATION_REQUIRED"
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

export interface RouterResult {
  action: ConversationAction;
  confidence: number;
  targetProductId?: string;
  targetCandidateIndex?: number;
  extractedRequirements?: Partial<UserIntent>;
  clarificationPrompt?: string;
  directMessage?: string;
  reasoning?: string;
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
  candidatePool?: RankedResult[];
  merchantComparison?: MerchantComparisonSummary;
  productComparison?: ProductComparisonData;
  policyStatus?: boolean;
  transactionState: TransactionState;
  pendingAction?: "CONFIRM_CHECKOUT" | "ADD_UPSELL_PROMPT" | "CHEAPER_ALTERNATIVE_PROMPT" | "CLARIFY_REQUIREMENTS" | null;
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
  agentActivities?: AgentActivity[];
  decisionSummary?: AgentDecisionSummary;
  trustControls?: TrustControls;
  decisionHistory?: DecisionHistoryEntry[];
}

export interface WorkflowSuccessResponse {
  success: true;
  message: string;
  intent: UserIntent;
  recommendation: RankedResult;
  comparisonCandidates?: RankedResult[];
  merchantComparison?: MerchantComparisonSummary;
  productComparison?: ProductComparisonData;
  agentActivities?: AgentActivity[];
  decisionSummary?: AgentDecisionSummary;
  trustControls?: TrustControls;
  decisionHistory?: DecisionHistoryEntry[];
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
  merchantComparison?: MerchantComparisonSummary;
  productComparison?: ProductComparisonData;
  agentActivities?: AgentActivity[];
  decisionSummary?: AgentDecisionSummary;
  trustControls?: TrustControls;
  decisionHistory?: DecisionHistoryEntry[];
  auditTrail: AuditEvent[];
  explanation?: ExplanationResult;
  sessionId: string;
  conversationAction: ConversationAction;
  transactionState: TransactionState;
}

export interface ExplanationResult {
  recommendationExplanation: string;
  upsellExplanation: string;
  budgetExplanation: string;
  policyExplanation: string;
  summary: string;
  merchantComparisonExplanation?: string;
  productComparisonExplanation?: string;
  source: "GEMINI" | "FALLBACK";
}





