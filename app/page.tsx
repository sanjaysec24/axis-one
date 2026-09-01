"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { getProductById, getAllProducts, searchProducts } from "@/lib/catalog";
import { validateTransaction } from "@/lib/policy";
import { rankProducts, runTestRankingSimulation } from "@/lib/ranking";
import { findUpsellOpportunity, runTestUpsellSimulation } from "@/lib/upsell";
import { clearAuditTrail } from "@/lib/audit";
import { runIntegrationSuccessTest, runIntegrationFailureTest } from "@/lib/testCommerceFlow";
import { merchantPolicyConfig, merchantPolicies } from "@/data/policies";
import { Product, ValidationResult, UserIntent, RankedResult, UpsellOpportunity, AuditEvent } from "@/lib/types";

// Premium SVG Category Icons
function CategoryIcon({ category, className = "h-8 w-8" }: { category: string; className?: string }) {
  if (category === "Mechanical Keyboard") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm2 4h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10" />
      </svg>
    );
  }
  if (category === "Wireless Mouse") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9m0 0a4 4 0 004 4h0a4 4 0 00-4-4V3m0 9H8a4 4 0 00-4 4v2a4 4 0 004 4h8a4 4 0 004-4v-2a4 4 0 00-4-4" />
      </svg>
    );
  }
  if (category === "Wrist Rest") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m-15 4h15M3 8h18a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z" />
      </svg>
    );
  }
  if (category === "Mouse Pad") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    );
  }
  if (category === "Headphones") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.5a6.5 6.5 0 01-6.5-6.5h0M12 18.5a6.5 6.5 0 006.5-6.5h0M5.5 12h-2a1 1 0 00-1 1v4a1 1 0 001 1h2a1 1 0 001-1v-4a1 1 0 00-1-1zm13 0h2a1 1 0 011 1v4a1 1 0 01-1 1h-2a1 1 0 01-1-1v-4a1 1 0 011-1z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

interface ChatMessage {
  id: string;
  role: "USER" | "AXIS_ONE";
  content: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"agent" | "policies" | "sandbox" | "orders">("agent");

  // Client-side mount indicator to prevent Next.js hydration mismatches
  const [mounted, setMounted] = useState(false);

  // Synchronous submission lock to prevent double API queries from quick clicks/keys
  const isSubmittingRef = useRef(false);

  // Inline error message state for fintech-grade Razorpay checkout triggers
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Conversational Agent State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: "msg_welcome", role: "AXIS_ONE", content: "Welcome to AXIS ONE. Describe what you're looking for, or paste in your budget and category preferences!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [workflowResponse, setWorkflowResponse] = useState<any | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState<any | null>(null);
  const [pastOrders, setPastOrders] = useState<any[]>([]);

  // Policy & Simulation tests states
  const [simulationAuditTrail, setSimulationAuditTrail] = useState<AuditEvent[]>([]);
  const [activeSim, setActiveSim] = useState<"success" | "failure" | null>(null);

  // Interactive Sandbox Cart Selection
  const [sandboxProducts, setSandboxProducts] = useState<Product[]>([]);
  const [sandboxBudget, setSandboxBudget] = useState(5000);
  const [sandboxDiscount, setSandboxDiscount] = useState(0);
  const [sandboxResult, setSandboxResult] = useState<ValidationResult | null>(null);

  // Sandbox Search parameters
  const [searchCategory, setSearchCategory] = useState("Mechanical Keyboard");
  const [searchBudget, setSearchBudget] = useState(5000);
  const [searchWireless, setSearchWireless] = useState<boolean>(true);
  const [searchBattery, setSearchBattery] = useState<"low" | "medium" | "high">("high");
  const [searchUseCase, setSearchUseCase] = useState("programming");
  const [sandboxRankedResults, setSandboxRankedResults] = useState<RankedResult[]>([]);
  const [sandboxUpsell, setSandboxUpsell] = useState<UpsellOpportunity | null>(null);

  // Load filesystem order history list
  const loadPastOrders = async () => {
    try {
      const res = await fetch("/api/payment/orders");
      const data = await res.json();
      if (data.success) {
        setPastOrders(data.orders || []);
      }
    } catch (e) {
      console.error("Failed to load historical orders:", e);
    }
  };

  // Reset the active conversational session
  const resetSession = () => {
    setActiveSessionId(null);
    setWorkflowResponse(null);
    setPaymentSuccessDetails(null);
    setPaymentError(null);
    setChatMessages([
      { id: "msg_reset", role: "AXIS_ONE", content: "Session reset. Let's start over! Describe your shopping requirements below." }
    ]);
    localStorage.removeItem("axis_session_id");
    localStorage.removeItem("axis_workflow_response");
    localStorage.removeItem("axis_chat_messages");
  };

  // Setup sample test results on mount
  useEffect(() => {
    setMounted(true);

    const savedSessionId = localStorage.getItem("axis_session_id");
    const savedWorkflowResponse = localStorage.getItem("axis_workflow_response");
    const savedChatMessages = localStorage.getItem("axis_chat_messages");

    if (savedSessionId) {
      setActiveSessionId(savedSessionId);
    }
    if (savedWorkflowResponse) {
      try {
        setWorkflowResponse(JSON.parse(savedWorkflowResponse));
      } catch (e) {
        console.error("Failed to parse saved workflow response:", e);
      }
    }
    if (savedChatMessages) {
      try {
        setChatMessages(JSON.parse(savedChatMessages));
      } catch (e) {
        console.error("Failed to parse saved chat messages:", e);
      }
    }

    // Audit log default success simulation
    const successRes = runIntegrationSuccessTest();
    setSimulationAuditTrail(successRes.auditTrail);
    setActiveSim("success");

    loadPastOrders();
  }, []);

  const triggerSuccessSimulation = () => {
    const res = runIntegrationSuccessTest();
    setSimulationAuditTrail(res.auditTrail);
    setActiveSim("success");
  };

  const triggerFailureSimulation = () => {
    const res = runIntegrationFailureTest();
    if (res) {
      setSimulationAuditTrail(res.auditTrail);
    }
    setActiveSim("failure");
  };

  // Send query message to agent
  const sendMessageToAgent = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const query = customMsg || chatInput.trim();
    
    // Prevent double queries using synchronous lock
    if (!query || agentLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Unconditionally clear the input field on message submission
    setChatInput("");
    
    const userMsgId = "msg_user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    setChatMessages(prev => {
      const updated = [...prev, { id: userMsgId, role: "USER" as const, content: query }];
      localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
      return updated;
    });
    setAgentLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          sessionId: activeSessionId
        })
      });

      const data = await res.json();
      if (data.error) {
        const errMsgId = "msg_err_" + Date.now();
        setChatMessages(prev => {
          const updated = [...prev, { id: errMsgId, role: "AXIS_ONE" as const, content: `Error: ${data.error}` }];
          localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
          return updated;
        });
      } else {
        setWorkflowResponse(data);
        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
          localStorage.setItem("axis_session_id", data.sessionId);
        }
        localStorage.setItem("axis_workflow_response", JSON.stringify(data));
        
        let contentText = data.explanation?.summary || data.message || "Product recommendation ready.";
        const agentMsgId = "msg_agent_" + Date.now();
        setChatMessages(prev => {
          // Safeguard: do not append duplicate consecutive agent response messages
          if (prev.length > 0 && prev[prev.length - 1].content === contentText) {
            return prev;
          }
          const updated = [...prev, { id: agentMsgId, role: "AXIS_ONE" as const, content: contentText }];
          localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err: any) {
      const connMsgId = "msg_conn_" + Date.now();
      setChatMessages(prev => {
        const updated = [...prev, { id: connMsgId, role: "AXIS_ONE" as const, content: `Connection error: ${err.message}` }];
        localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
        return updated;
      });
    } finally {
      setAgentLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Launch Razorpay Checkout in Test Mode
  const handleRazorpayPayment = async () => {
    if (!activeSessionId || paymentProcessing) return;
    setPaymentProcessing(true);
    setPaymentSuccessDetails(null);
    setPaymentError(null);

    try {
      console.log("[PAYMENT] User initiated checkout");
      console.log("[PAYMENT] Creating Razorpay order");
      
      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId })
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        console.error("[PAYMENT] Order creation failed:", orderData.error);
        throw new Error(orderData.error || "Order creation failed.");
      }

      console.log("[PAYMENT] Order created:", orderData.order.id);
      console.log("[PAYMENT] Transitioning state to PAYMENT_PROCESSING");

      // Transition server state to PAYMENT_PROCESSING
      await fetch("/api/payment/update-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, newState: "PAYMENT_PROCESSING" })
      });
      
      setWorkflowResponse((prev: any) => {
        const nextResp = prev ? { ...prev, transactionState: "PAYMENT_PROCESSING" } : null;
        if (nextResp) {
          localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
        }
        return nextResp;
      });

      console.log("[PAYMENT] Opening Razorpay checkout");
      const options = {
        key: orderData.checkout.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "AXIS ONE",
        description: "Nexora Tech Proposed Basket Payment",
        order_id: orderData.order.id,
        handler: async function (response: any) {
          console.log("[PAYMENT] Payment success callback received");
          setPaymentProcessing(true);
          try {
            console.log("[PAYMENT] Verifying payment");
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: activeSessionId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              console.log("[PAYMENT] Verification successful");
              setPaymentSuccessDetails(verifyData.payment);
              
              const successMsgId = "msg_success_" + Date.now();
              const successText = `🎉 Payment verified successfully! Payment ID: ${verifyData.payment.paymentId}. State set to PAYMENT_COMPLETED.`;
              setChatMessages(prev => {
                const updated = [...prev, { id: successMsgId, role: "AXIS_ONE" as const, content: successText }];
                localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
                return updated;
              });

              setWorkflowResponse((prev: any) => {
                const nextResp = prev ? { 
                  ...prev, 
                  transactionState: "PAYMENT_COMPLETED",
                  razorpayOrderId: verifyData.payment.orderId,
                  razorpayPaymentId: verifyData.payment.paymentId
                } : null;
                if (nextResp) {
                  localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
                }
                return nextResp;
              });
              loadPastOrders(); // Refresh filesystem list
            } else {
              console.error("[PAYMENT] Verification failed:", verifyData.error);
              throw new Error(verifyData.error || "Payment verification failed.");
            }
          } catch (err: any) {
            console.error("[PAYMENT] Verification error:", err);
            setPaymentError(err.message);
            
            // transition to FAILED
            try {
              await fetch("/api/payment/update-state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: activeSessionId, newState: "PAYMENT_FAILED", errorDetails: err.message })
              });
              setWorkflowResponse((prev: any) => {
                const nextResp = prev ? { ...prev, transactionState: "PAYMENT_FAILED" } : null;
                if (nextResp) {
                  localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
                }
                return nextResp;
              });
            } catch (stateErr) {
              console.error("Failed to update transition to PAYMENT_FAILED:", stateErr);
            }
          } finally {
            setPaymentProcessing(false);
          }
        },
        modal: {
          ondismiss: async function () {
            console.log("[PAYMENT] Payment cancelled");
            try {
              const res = await fetch("/api/payment/update-state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: activeSessionId, newState: "PAYMENT_CANCELLED" })
              });
              const data = await res.json();
              if (data.success) {
                const cancelMsgId = "msg_cancel_" + Date.now();
                setChatMessages(prev => {
                  const updated = [...prev, { id: cancelMsgId, role: "AXIS_ONE" as const, content: "❌ Payment checkout cancelled by the user." }];
                  localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
                  return updated;
                });
                
                setWorkflowResponse((prev: any) => {
                  const nextResp = prev ? { ...prev, transactionState: "PAYMENT_CANCELLED" } : null;
                  if (nextResp) {
                    localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
                  }
                  return nextResp;
                });
              }
            } catch (err: any) {
              console.error("Failed to cancel payment:", err);
            } finally {
              setPaymentProcessing(false);
            }
          }
        },
        prefill: {
          name: "Test Buyer",
          email: "buyer@example.com",
          contact: "9999999999"
        },
        notes: {
          sessionId: activeSessionId
        },
        theme: {
          color: "#4f46e5"
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', async function (response: any){
        console.error("[PAYMENT] Payment failed:", response.error?.description);
        setPaymentError(response.error?.description || "Payment failed");
        
        try {
          const res = await fetch("/api/payment/update-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: activeSessionId,
              newState: "PAYMENT_FAILED",
              errorDetails: response.error?.description || "Payment failed"
            })
          });
          const data = await res.json();
          if (data.success) {
            const failMsgId = "msg_fail_" + Date.now();
            setChatMessages(prev => {
              const updated = [...prev, { id: failMsgId, role: "AXIS_ONE" as const, content: `❌ Payment failed: ${response.error?.description || "Declined"}` }];
              localStorage.setItem("axis_chat_messages", JSON.stringify(updated));
              return updated;
            });
            
            setWorkflowResponse((prev: any) => {
              const nextResp = prev ? { ...prev, transactionState: "PAYMENT_FAILED" } : null;
              if (nextResp) {
                localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
              }
              return nextResp;
            });
          }
        } catch (err: any) {
          console.error("Failed to log payment failure:", err);
        } finally {
          setPaymentProcessing(false);
        }
      });
      rzp.open();

    } catch (err: any) {
      console.error("[PAYMENT] Checkout launch or process error:", err);
      setPaymentError(err.message);
      
      // transition to FAILED state if we progressed
      try {
        await fetch("/api/payment/update-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, newState: "PAYMENT_FAILED", errorDetails: err.message })
        });
        
        setWorkflowResponse((prev: any) => {
          const nextResp = prev ? { ...prev, transactionState: "PAYMENT_FAILED" } : null;
          if (nextResp) {
            localStorage.setItem("axis_workflow_response", JSON.stringify(nextResp));
          }
          return nextResp;
        });
      } catch (stateErr) {
        console.error("Failed to fallback transition to PAYMENT_FAILED:", stateErr);
      }
      setPaymentProcessing(false);
    }
  };

  // Interactive cart helper triggers
  const toggleSandboxProduct = (product: Product) => {
    if (sandboxProducts.some(p => p.id === product.id)) {
      setSandboxProducts(sandboxProducts.filter(p => p.id !== product.id));
    } else {
      setSandboxProducts([...sandboxProducts, product]);
    }
  };

  // Run manual cart policy checks
  useEffect(() => {
    const res = validateTransaction(sandboxProducts, sandboxBudget, sandboxDiscount);
    setSandboxResult(res);

    if (sandboxProducts.length > 0) {
      const mainProduct = sandboxProducts[0];
      const intent: UserIntent = {
        productCategory: mainProduct.category,
        budget: sandboxBudget,
        wireless: mainProduct.tags.includes("wireless"),
        useCase: searchUseCase
      };
      const recommendation = findUpsellOpportunity(mainProduct, getAllProducts(), sandboxBudget, intent);
      setSandboxUpsell(recommendation);
    } else {
      setSandboxUpsell(null);
    }
  }, [sandboxProducts, sandboxBudget, sandboxDiscount, searchUseCase]);

  // Run manual ranking sandbox query
  useEffect(() => {
    const intent: UserIntent = {
      productCategory: searchCategory,
      budget: searchBudget,
      wireless: searchWireless,
      batteryPriority: searchBattery,
      useCase: searchUseCase
    };

    const candidates = searchProducts(intent);
    const ranked = rankProducts(candidates, intent);
    setSandboxRankedResults(ranked);
  }, [searchCategory, searchBudget, searchWireless, searchBattery, searchUseCase]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-800">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      {/* 1. Global Navigation Header */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/80 backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center">
              AXIS<span className="text-indigo-600">ONE</span>
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600" />
            </span>
            <span className="hidden md:inline-block h-4 w-[1px] bg-slate-200" />
            <span className="hidden md:inline-block text-[11px] font-medium text-slate-400 uppercase tracking-widest">
              Your AI Buyer Commerce Agent
            </span>
          </div>

          {/* Navigation Pills */}
          <nav className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("agent")}
              className={`px-4 py-2 rounded-md transition-all ${
                activeTab === "agent" ? "bg-white text-indigo-600 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              AI Buyer
            </button>
            <button
              onClick={() => setActiveTab("policies")}
              className={`px-4 py-2 rounded-md transition-all ${
                activeTab === "policies" ? "bg-white text-indigo-600 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Merchant Policies
            </button>
            <button
              onClick={() => setActiveTab("sandbox")}
              className={`px-4 py-2 rounded-md transition-all ${
                activeTab === "sandbox" ? "bg-white text-indigo-600 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Interactive Sandbox
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-2 rounded-md transition-all ${
                activeTab === "orders" ? "bg-white text-indigo-600 shadow-xs font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Order History ({pastOrders.length})
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <span className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-600 border border-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              SYSTEM SECURE
            </span>
            <button
              onClick={resetSession}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline underline-offset-4 cursor-pointer"
            >
              Reset Session
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Two-Column Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        
        {/* LEFT COLUMN: ACTIVE WORKSPACE CONTENT */}
        <div className="flex-1 flex flex-col space-y-6">
          
          {/* TAB: AI BUYER INTERFACE */}
          {activeTab === "agent" && (
            <>
              {/* Landing Hero (shown if chat is only welcome message) */}
              {chatMessages.length <= 1 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-50/50 rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="space-y-4 max-w-2xl">
                    <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase bg-indigo-50 px-3 py-1 rounded-full">
                      Next-Gen Commerce Agent
                    </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                      Commerce, handled <span className="bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">intelligently</span>.
                    </h2>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Describe your shopping requirements in plain English. AXIS ONE scans the catalog, ranks products dynamically, audits merchant compliance, recommends best-fit accessories, and manages secure payment checkouts.
                    </p>
                  </div>

                  {/* Suggestions Panel */}
                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">
                      Try typing or clicking one of these suggestions:
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        "I need a wireless mechanical keyboard for programming under ₹5,000.",
                        "Looking for noise cancelling headphones for office use.",
                        "Find a stand for my laptop under ₹1,500."
                      ].map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessageToAgent(undefined, sug)}
                          className="text-left text-xs bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-200/60 rounded-lg px-4 py-2.5 text-slate-600 font-medium cursor-pointer"
                        >
                          "{sug}"
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Conversational Agent Chat Window */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col flex-1 min-h-[400px]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-indigo-600" />
                    <span className="text-sm font-bold text-slate-900">Secure AI Conversation</span>
                  </div>
                  {activeSessionId && (
                    <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-2.5 py-1 rounded-md">
                      ID: {activeSessionId.substring(0, 15)}...
                    </span>
                  )}
                </div>

                {/* Messages Feed */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[420px] bg-slate-50/30">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={msg.id || i}
                      className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-2xs ${
                          msg.role === "USER"
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-white border border-slate-200/80 text-slate-700 rounded-bl-none"
                        }`}
                      >
                        <span className="text-[9px] font-mono block text-slate-400 uppercase tracking-wider mb-1 font-bold">
                          {msg.role === "USER" ? "You" : "AXIS ONE agent"}
                        </span>
                        <div className="whitespace-pre-line">{msg.content}</div>
                      </div>
                    </div>
                  ))}

                  {/* Processing Status Pipeline */}
                  {agentLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-none p-4 max-w-[85%] space-y-3 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-3.5 w-3.5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Orchestrating Workflow...</span>
                        </div>
                        <div className="space-y-1.5 text-[10px] font-mono text-slate-400">
                          <div className="flex items-center gap-1.5 text-emerald-500">✓ Intent Analysed</div>
                          <div className="flex items-center gap-1.5 text-indigo-500 animate-pulse">● Catalog search running...</div>
                          <div className="flex items-center gap-1.5">○ Validating compliance rules...</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input form */}
                <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
                  <form onSubmit={(e) => sendMessageToAgent(e)} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask for items, change budgets, or say 'okay, I'll take it'..."
                      disabled={agentLoading}
                      className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-xs focus:outline-none text-slate-800 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={agentLoading || !chatInput.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold px-6 py-3 rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
                    >
                      {agentLoading ? "Wait" : "Send Query"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Dynamic Product Recommendation Card Render */}
              {workflowResponse && workflowResponse.recommendation && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <CategoryIcon category={workflowResponse.recommendation.product.category} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{workflowResponse.recommendation.product.name}</h4>
                          {workflowResponse.recommendation.product.merchantName && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              🏬 {workflowResponse.recommendation.product.merchantName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-indigo-500 tracking-wide uppercase font-mono">{workflowResponse.recommendation.product.category}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-indigo-600 font-mono">₹{workflowResponse.recommendation.product.price}</div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 font-mono">
                        {workflowResponse.recommendation.matchScore}% Score Match
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed italic">
                    💬 "{workflowResponse.recommendation.reasoning}"
                  </p>

                  {/* Attributes list */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] border border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[9px]">Merchant Store</span>
                      <span className="text-slate-800 font-bold font-mono truncate block">{workflowResponse.recommendation.product.merchantName || "Verified Merchant"}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] border border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[9px]">Warranty</span>
                      <span className="text-slate-700 font-semibold font-mono truncate block">{workflowResponse.recommendation.product.warranty || "1 Year Standard"}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] border border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[9px]">Delivery</span>
                      <span className="text-slate-700 font-semibold font-mono truncate block">{workflowResponse.recommendation.product.deliveryEstimate || "2-3 business days"}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] border border-slate-100">
                      <span className="text-slate-400 block uppercase font-bold text-[9px]">Stock</span>
                      <span className="text-slate-700 font-semibold font-mono">{workflowResponse.recommendation.product.stock} units</span>
                    </div>
                  </div>

                  {/* Multi-Merchant Comparison Candidates Panel */}
                  {workflowResponse.comparisonCandidates && workflowResponse.comparisonCandidates.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                          🏬 Multi-Merchant Options Compared ({workflowResponse.comparisonCandidates.length} Stores):
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {workflowResponse.comparisonCandidates.map((cand: any, cIdx: number) => {
                          const isSelected = cand.product.id === workflowResponse.recommendation.product.id;
                          return (
                            <div
                              key={cand.product.id || cIdx}
                              className={`p-3 rounded-xl border font-mono text-xs transition-all ${
                                isSelected
                                  ? "bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200"
                                  : "bg-slate-50/60 border-slate-200/70"
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-bold text-slate-900 block">{cand.product.name}</span>
                                  <span className="text-[10px] text-slate-500">{cand.product.merchantName}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-indigo-600">₹{cand.product.price}</span>
                                  {cand.merchantComparisonBadge && (
                                    <span className="block text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 mt-0.5">
                                      {cand.merchantComparisonBadge}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
                                <span>{cand.product.warranty}</span>
                                <button
                                  onClick={() => sendMessageToAgent(undefined, `select ${cand.product.name}`)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-indigo-600 text-white"
                                      : "bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                                  }`}
                                >
                                  {isSelected ? "Selected" : "Select this"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AXIS ONE • Intelligent Product Comparison Matrix */}
                  {workflowResponse.productComparison && workflowResponse.productComparison.comparedProducts.length >= 2 && (
                    <div className="mt-6 pt-5 border-t border-slate-200/80 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900 tracking-wider uppercase font-mono">
                            ⚡ AXIS ONE • Comparison Matrix
                          </span>
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 font-mono">
                            {workflowResponse.productComparison.comparedProducts.length} Products Analyzed
                          </span>
                        </div>
                      </div>

                      {/* Grounded Differences Highlights */}
                      {workflowResponse.productComparison.differences && workflowResponse.productComparison.differences.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {workflowResponse.productComparison.differences.map((diff: any, dIdx: number) => (
                            <div key={dIdx} className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs space-y-1">
                              <span className="font-bold text-slate-900 text-[11px] block font-mono">
                                {diff.type === "PRICE" ? "💰 " : diff.type === "BATTERY" ? "🔋 " : diff.type === "WARRANTY" ? "🛡️ " : "⚡ "}
                                {diff.headline}
                              </span>
                              <p className="text-[11px] text-slate-500 leading-relaxed">{diff.detail}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Structured Comparison Table */}
                      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-3 font-bold text-slate-600 text-[11px] uppercase tracking-wider font-mono w-1/4">Feature</th>
                              {workflowResponse.productComparison.comparedProducts.map((pRes: any) => {
                                const isRec = pRes.product.id === workflowResponse.productComparison.bestOverall?.id;
                                return (
                                  <th key={pRes.product.id} className={`p-3 font-mono ${isRec ? "bg-indigo-50/60" : ""}`}>
                                    <div className="font-extrabold text-slate-900 text-xs">{pRes.product.name}</div>
                                    <div className="text-[10px] text-slate-500">{pRes.product.merchantName}</div>
                                    <div className="font-black text-indigo-600 text-xs mt-1">₹{pRes.product.price}</div>
                                    {isRec && (
                                      <span className="inline-block mt-1 text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                                        Best Match
                                      </span>
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                            {workflowResponse.productComparison.attributeRows.map((row: any) => (
                              <tr key={row.attributeKey} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-700 bg-slate-50/30">{row.label}</td>
                                {workflowResponse.productComparison.comparedProducts.map((pRes: any) => {
                                  const cell = row.values[pRes.product.id] || { displayValue: "—", status: "unavailable" };
                                  return (
                                    <td key={pRes.product.id} className="p-3 text-slate-700">
                                      <div className="flex items-center gap-1.5">
                                        <span>
                                          {cell.status === "supported" ? "✓" : cell.status === "limitation" ? "⚠" : "—"}
                                        </span>
                                        <span className={cell.status === "supported" ? "font-semibold text-slate-900" : cell.status === "limitation" ? "text-amber-700" : "text-slate-400"}>
                                          {cell.displayValue}
                                        </span>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Recommendation & Selection Action Footer */}
                      <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block font-mono">AXIS ONE RECOMMENDATION</span>
                          <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                            {workflowResponse.productComparison.bestOverall?.name} ({workflowResponse.productComparison.bestOverall?.merchantName})
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{workflowResponse.productComparison.comparisonSummary}</p>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          {workflowResponse.productComparison.comparedProducts.map((pRes: any) => {
                            const isCurrent = pRes.product.id === workflowResponse.recommendation.product.id;
                            return (
                              <button
                                key={pRes.product.id}
                                onClick={() => sendMessageToAgent(undefined, `select ${pRes.product.name}`)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer font-mono ${
                                  isCurrent
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {isCurrent ? `✓ Selected: ${pRes.product.name.split(" ")[0]}` : `Select ${pRes.product.name.split(" ")[0]}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Display tradeoffs if applicable */}
                  {workflowResponse.tradeoffs && workflowResponse.tradeoffs.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3.5 text-xs text-amber-700 font-mono flex items-start gap-2.5">
                      <svg className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <strong className="block font-bold">Requirement trade-offs detected:</strong>
                        {workflowResponse.tradeoffs.map((t: string, i: number) => (
                          <div key={i} className="mt-0.5 text-[11px]">• {t}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB: MERCHANT POLICIES */}
          {activeTab === "policies" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Merchant Policies Config</h3>
                <p className="text-xs text-slate-500 mt-1">AXIS ONE deterministically verifies every proposed shopping transaction against these rules before payment.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {merchantPolicies.map(policy => (
                  <div key={policy.id} className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-slate-900">{policy.name}</span>
                      <span className="text-[10px] font-mono bg-indigo-50 border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded">
                        {policy.ruleType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{policy.description}</p>
                    <div className="text-[10px] font-mono text-slate-400">
                      Enabled: <span className="text-emerald-600 font-bold">YES</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Interactive Policy Audit Tester */}
              <div className="border-t border-slate-100 pt-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Chronological Policy Audit Ledger</h4>
                    <span className="text-xs text-slate-400">Renders chronological audit logs verified for the current sessions.</span>
                  </div>
                  <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-bold">
                    <button 
                      onClick={triggerSuccessSimulation} 
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${activeSim === "success" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Audit Success Flow
                    </button>
                    <button 
                      onClick={triggerFailureSimulation} 
                      className={`px-3 py-1.5 rounded transition-all cursor-pointer ${activeSim === "failure" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      Audit Failure Flow
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {simulationAuditTrail.map((event, idx) => (
                    <div key={event.id} className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 font-mono text-[11px] space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>ID: {event.id}</span>
                        <span>{event.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600">
                          {event.eventType}
                        </span>
                        <span className="text-slate-500 text-[10px]">Actor: {event.actor}</span>
                        <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-bold ${
                          event.status === "SUCCESS" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                        }`}>
                          {event.status}
                        </span>
                      </div>
                      <div className="text-slate-700 font-semibold mt-1">📢 {event.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: INTERACTIVE SANDBOX */}
          {activeTab === "sandbox" && (
            <div className="space-y-6">
              
              {/* Product search simulator */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase font-mono tracking-wider border-b border-slate-100 pb-2">
                  Sandbox Search & Product Ranking Simulation
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Category:</label>
                    <select
                      value={searchCategory}
                      onChange={(e) => setSearchCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-mono"
                    >
                      <option value="Mechanical Keyboard">Mechanical Keyboard</option>
                      <option value="Wireless Mouse">Wireless Mouse</option>
                      <option value="Wrist Rest">Wrist Rest</option>
                      <option value="Mouse Pad">Mouse Pad</option>
                      <option value="Headphones">Headphones</option>
                      <option value="Laptop Stand">Laptop Stand</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Max Budget limit:</label>
                    <input
                      type="number"
                      value={searchBudget}
                      onChange={(e) => setSearchBudget(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Use Case:</label>
                    <input
                      type="text"
                      value={searchUseCase}
                      onChange={(e) => setSearchUseCase(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2.5">
                    <input
                      type="checkbox"
                      id="sand-wireless"
                      checked={searchWireless}
                      onChange={(e) => setSearchWireless(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="sand-wireless" className="text-xs font-semibold text-slate-600 font-mono">Requires Wireless</label>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Battery Priority:</label>
                    <select
                      value={searchBattery}
                      onChange={(e) => setSearchBattery(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-mono"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>
                </div>

                {/* Ranked candidates list */}
                <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Simulated Rankings output:</span>
                  {sandboxRankedResults.map((result, idx) => (
                    <div key={result.product.id} className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl font-mono text-xs space-y-2">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-slate-900">Rank #{idx + 1} | {result.product.name} (₹{result.product.price})</span>
                        <span className="text-indigo-600">{result.matchScore}% Score</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed italic">"{result.reasoning}"</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cart builder sandbox */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase font-mono tracking-wider border-b border-slate-100 pb-2">
                  Sandbox Cart Builder & Policy Engine
                </h3>

                <div className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider">Select Catalog Items:</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto bg-slate-50 p-3 rounded-lg border border-slate-200/60">
                    {getAllProducts().map(product => {
                      const isSelected = sandboxProducts.some(p => p.id === product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => toggleSandboxProduct(product)}
                          className={`text-left p-2.5 rounded-lg text-xs transition-all border font-semibold ${
                            isSelected 
                              ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-2xs" 
                              : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <div>{product.name}</div>
                          <div className="font-mono text-slate-400 text-[10px] mt-0.5">₹{product.price}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Mock Budget (₹):</label>
                    <input
                      type="number"
                      value={sandboxBudget}
                      onChange={(e) => setSandboxBudget(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Mock Discount (₹):</label>
                    <input
                      type="number"
                      value={sandboxDiscount}
                      onChange={(e) => setSandboxDiscount(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs font-mono"
                    />
                  </div>
                </div>

                {sandboxResult && (
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-3 font-mono text-xs">
                    <div className="flex justify-between items-center border-b border-slate-200/50 pb-2">
                      <span className="font-bold text-slate-500">Policy Verdict:</span>
                      <span className={`font-black uppercase ${sandboxResult.approved ? "text-emerald-600" : "text-rose-600"}`}>
                        {sandboxResult.approved ? "APPROVED" : "REJECTED"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400">Cart Total</span>
                        <div className="font-bold mt-0.5">₹{sandboxResult.originalTotal}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Discount</span>
                        <div className="font-bold mt-0.5">₹{sandboxResult.requestedDiscount}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Final amount</span>
                        <div className="font-bold text-indigo-600 mt-0.5">₹{sandboxResult.finalAmount}</div>
                      </div>
                    </div>
                    {sandboxResult.failureReasons.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-600 p-2.5 rounded-lg text-[10px] space-y-0.5">
                        {sandboxResult.failureReasons.map((reason, i) => (
                          <div key={i}>• {reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ORDER HISTORY */}
          {activeTab === "orders" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Persistent Order History</h3>
                <p className="text-xs text-slate-500 mt-1">This list retrieves verified order details directly from Cloud Firestore database storage (<code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded text-indigo-600">orders</code> collection).</p>
              </div>

              {pastOrders.length > 0 ? (
                <div className="space-y-4">
                  {pastOrders.map((ord, i) => (
                    <div key={i} className="border border-slate-200/60 rounded-xl p-4 space-y-3 bg-slate-50/50 font-mono text-xs">
                      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-200/50 pb-2">
                        <div>
                          <strong className="text-slate-900">Order ID:</strong> {ord.orderId}
                        </div>
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold px-2 py-0.5 rounded text-[10px]">
                          {ord.transactionState}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-600">
                        <div>
                          <strong>Charged Amount:</strong> ₹{ord.amount} INR
                        </div>
                        <div>
                          <strong>Verified Payment ID:</strong> {ord.razorpayPaymentId || "N/A"}
                        </div>
                        <div>
                          <strong>Timestamp:</strong> {mounted ? new Date(ord.timestamp).toLocaleString() : "Loading..."}
                        </div>
                        <div>
                          <strong>Basket Items:</strong> {ord.basket?.length || 0} items
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 bg-white p-2 rounded border border-slate-200/40">
                        <strong>Basket Contents:</strong> {ord.basket?.map((p: any) => `${p.name} (₹${p.price})`).join(" + ")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 font-mono text-xs border border-dashed border-slate-200 rounded-2xl">
                  No persistently saved orders exist. Complete a Checkout flow to generate records!
                </div>
              )}
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: STICKY BASKET & CHECKOUT SIDEBAR */}
        <div className="w-full md:w-80 flex-shrink-0 space-y-6">
          
          {/* STICKY PROPOSED BASKET PANEL */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs sticky top-24 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="font-extrabold text-slate-900 text-sm font-mono tracking-wide uppercase flex items-center gap-1.5">
                <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Proposed Basket
              </span>
              
              {activeTab === "sandbox" ? (
                sandboxResult && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                    sandboxResult.approved 
                      ? "text-emerald-600 bg-emerald-50 border border-emerald-100" 
                      : "text-rose-600 bg-rose-50 border border-rose-100"
                  }`}>
                    {sandboxResult.approved ? "● Policy Validated" : "● Policy Rejected"}
                  </span>
                )
              ) : (
                workflowResponse && workflowResponse.policyValidation && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                    workflowResponse.policyValidation.approved 
                      ? "text-emerald-600 bg-emerald-50 border border-emerald-100" 
                      : "text-rose-600 bg-rose-50 border border-rose-100"
                  }`}>
                    {workflowResponse.policyValidation.approved ? "● Policy Validated" : "● Policy Rejected"}
                  </span>
                )
              )}
            </div>

            {/* Cart Items List */}
            {activeTab === "sandbox" ? (
              // Sandbox Cart Rendering
              sandboxProducts.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    {sandboxProducts.map(item => (
                      <div key={item.id} className="flex justify-between items-start text-xs font-semibold text-slate-800">
                        <span className="truncate max-w-[70%]">{item.name}</span>
                        <span className="font-mono text-slate-500">₹{item.price}</span>
                      </div>
                    ))}
                    {sandboxUpsell && (
                      <div className="flex justify-between items-start text-xs font-semibold text-slate-800 pl-3 border-l-2 border-indigo-100">
                        <span className="truncate max-w-[70%] text-slate-500 font-mono text-[11px]">{sandboxUpsell.recommendedProduct.name} (Accessory)</span>
                        <span className="font-mono text-slate-400 text-[11px]">₹{sandboxUpsell.recommendedProduct.price}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-100 pt-3.5 space-y-2 text-[11px] font-mono text-slate-500">
                    <div className="flex justify-between">
                      <span>Basket Subtotal</span>
                      <span>₹{sandboxResult?.originalTotal}</span>
                    </div>
                    {sandboxResult && sandboxResult.requestedDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>Applied Savings</span>
                        <span>-₹{sandboxResult.requestedDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold text-slate-900 border-t border-slate-100 pt-2 font-sans">
                      <span>Payable Net Total</span>
                      <span className="text-indigo-600 text-sm font-mono">₹{sandboxResult?.finalAmount}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 text-center italic mt-2">
                    Checkout is only available via the AI Buyer workflow tab.
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-xl">
                  Sandbox cart is empty. Check items in catalog to build it!
                </div>
              )
            ) : (
              // Conversational Agent Cart Rendering
              workflowResponse && workflowResponse.basket && workflowResponse.basket.items ? (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    {workflowResponse.basket.items.map((item: any) => {
                      const isAccessory = workflowResponse.upsell && (
                        item.id === workflowResponse.upsell.recommendedProduct?.id ||
                        item.id === workflowResponse.upsell.id ||
                        item.name === workflowResponse.upsell.recommendedProduct?.name ||
                        item.name === workflowResponse.upsell.name
                      );
                      return (
                        <div key={item.id} className={`flex justify-between items-start text-xs font-semibold text-slate-800 ${isAccessory ? "pl-3 border-l-2 border-indigo-50/70" : ""}`}>
                          <div className="truncate max-w-[70%]">
                            <div>{item.name} {isAccessory && <span className="text-[10px] text-indigo-500 font-mono font-bold">(Accessory)</span>}</div>
                            {item.merchantName && <div className="text-[10px] text-slate-400 font-mono font-normal">Sold by {item.merchantName}</div>}
                          </div>
                          <span className="font-mono text-slate-500">₹{item.price}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Subtotals & Discounts */}
                  <div className="border-t border-slate-100 pt-3.5 space-y-2 text-[11px] font-mono text-slate-500">
                    <div className="flex justify-between">
                      <span>Basket Subtotal</span>
                      <span>₹{workflowResponse.basket.originalTotal}</span>
                    </div>
                    {workflowResponse.basket.requestedDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>Applied Savings</span>
                        <span>-₹{workflowResponse.basket.requestedDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold text-slate-900 border-t border-slate-100 pt-2 font-sans">
                      <span>Payable Net Total</span>
                      <span className="text-indigo-600 text-sm font-mono">₹{workflowResponse.basket.finalAmount}</span>
                    </div>
                  </div>

                  {/* Inline error feedback component instead of raw alerts */}
                  {paymentError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-mono flex items-start gap-2.5">
                      <svg className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <strong className="block font-bold">Payment Status:</strong>
                        <div className="text-[10px] mt-0.5">{paymentError}</div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons & Status for Payment Flow */}
                  {["USER_CONFIRMED", "PAYMENT_PENDING", "PAYMENT_PROCESSING", "PAYMENT_FAILED", "PAYMENT_CANCELLED"].includes(workflowResponse.transactionState) && (
                    <div className="pt-2 space-y-2 font-mono">
                      <div className="text-[10px] text-slate-400">
                        {workflowResponse.transactionState === "PAYMENT_PROCESSING" && "🔄 Validating verification signature..."}
                        {workflowResponse.transactionState === "PAYMENT_PENDING" && "⏳ Order pending payment checkout..."}
                        {workflowResponse.transactionState === "PAYMENT_FAILED" && "❌ Payment declined or failed."}
                        {workflowResponse.transactionState === "PAYMENT_CANCELLED" && "⚠️ Checkout cancelled by buyer."}
                        {workflowResponse.transactionState === "USER_CONFIRMED" && "✓ Selection confirmed by buyer."}
                      </div>

                      <button
                        type="button"
                        onClick={handleRazorpayPayment}
                        disabled={paymentProcessing || workflowResponse.transactionState === "PAYMENT_PROCESSING"}
                        className={`w-full font-bold py-3 rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
                          workflowResponse.transactionState === "PAYMENT_PROCESSING"
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            : ["PAYMENT_FAILED", "PAYMENT_CANCELLED"].includes(workflowResponse.transactionState)
                              ? "bg-amber-500 hover:bg-amber-600 text-white"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        {paymentProcessing
                          ? "Launching Checkout..."
                          : workflowResponse.transactionState === "PAYMENT_PROCESSING"
                            ? "Verifying Signature..."
                            : ["PAYMENT_FAILED", "PAYMENT_CANCELLED"].includes(workflowResponse.transactionState)
                              ? "Retry Payment Checkout"
                              : "Pay securely via Razorpay"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-xl">
                  Cart is currently empty. Ask the agent to find products to build a basket!
                </div>
              )
            )}

            {/* Premium Order Summary Receipt */}
            {workflowResponse && workflowResponse.transactionState === "PAYMENT_COMPLETED" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-[11px] font-mono text-emerald-800 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-emerald-200">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-black uppercase tracking-wider text-xs">Payment Complete</span>
                </div>
                <div className="space-y-1">
                  <div><strong>Order ID:</strong> {workflowResponse.razorpayOrderId || (paymentSuccessDetails && paymentSuccessDetails.orderId) || "N/A"}</div>
                  <div><strong>Payment ID:</strong> {workflowResponse.razorpayPaymentId || (paymentSuccessDetails && paymentSuccessDetails.paymentId) || "N/A"}</div>
                  <div><strong>Amount:</strong> ₹{workflowResponse.basket?.finalAmount} INR</div>
                  <div><strong>Status:</strong> Verified (COMPLETED)</div>
                  <div><strong>Timestamp:</strong> {mounted ? new Date().toLocaleString() : "Loading..."}</div>
                </div>
                <div className="text-[10px] text-emerald-700 bg-white p-2 rounded border border-emerald-100 mt-1">
                  ✓ Persisted safely in server database.
                </div>
              </div>
            )}
          </div>

          {/* AGENT ACTIVITY LEDGER */}
          {workflowResponse && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs font-mono text-[10px] space-y-3">
              <span className="font-extrabold text-slate-400 uppercase tracking-widest block border-b border-slate-100 pb-1.5">Agent Pipeline checks:</span>
              <div className="space-y-1.5 text-slate-500">
                <div className="flex items-center gap-1.5 text-emerald-600">✓ Requirements parsed</div>
                <div className="flex items-center gap-1.5 text-emerald-600">✓ Match weights ranked</div>
                <div className="flex items-center gap-1.5 text-emerald-600">✓ Inventory verified</div>
                <div className="flex items-center gap-1.5 text-emerald-600">✓ Security cap audited</div>
                <div className="flex items-center gap-1.5 text-emerald-600">✓ Cross-sell optimized</div>
              </div>
            </div>
          )}

        </div>

      </main>
    </div>
  );
}
