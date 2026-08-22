# AXIS ONE — AI Buyer Commerce Agent

AXIS ONE is a next-generation AI Buyer Commerce Agent designed for the Razorpay Buildathon.

The agent enables an AI buyer to understand a user's shopping intent, search a merchant catalog, rank products based on utility and budget, suggest cross-sells and upsell opportunities, validate actions against deterministic business policies, require explicit user approval, and complete Razorpay test transactions with a strict audit trail.

---

## 🏗️ Phase 1 Architecture

We prioritize modularity, safety, and predictability. The commerce engine logic is written in deterministic, strongly-typed TypeScript and is kept completely independent of the UI and LLM integrations. This guarantees that **AI never directly controls or modifies money-related operations**.

```
axis-one/
├── app/                  # Next.js App Router Pages
│   ├── globals.css       # Global styles (Tailwind V4)
│   ├── layout.tsx        # Base App layout configuration
│   └── page.tsx          # Phase 1 initialization & verification portal
│
├── data/                 # Static Product & Policy Database
│   ├── products.ts       # Nexora Tech fictional catalog (15 products)
│   ├── policies.ts       # Fictional merchant compliance & discount policies
│   └── bundles.ts        # Promotional product bundles
│
├── lib/                  # Foundational Commerce Engine Core
│   ├── types.ts          # Strong TypeScript type definitions
│   ├── catalog.ts        # Product query and lookup services
│   ├── ranking.ts        # Query and constraint-based product scoring
│   ├── upsell.ts         # Cross-sell & bundle upgrade suggestions
│   ├── policy.ts         # Budget, inventory, & price rule validation
│   └── audit.ts          # In-memory logging & action audit logs
│
└── README.md
```

---

## 📦 Fictional Merchant: Nexora Tech

For Phase 1, we model **Nexora Tech**, a premium consumer electronics and productivity accessory merchant.

The catalog contains **exactly 15 products** across 6 core categories:
1. **Mechanical Keyboards** (e.g., *NovaKey K75* - ₹4,499, *Apex Pro X* - ₹6,999)
2. **Wireless Mice** (e.g., *Precision Click Pro* - ₹2,499)
3. **Wrist Rests** (e.g., *ErgoRest Wrist Support* - ₹399)
4. **Mouse Pads** (e.g., *DeskMat Pro Minimal* - ₹799)
5. **Headphones** (e.g., *AuraSound ANC* - ₹4,999)
6. **Laptop Stands** (e.g., *FlexiStand Aluminum* - ₹1,599)

---

## 🛡️ Key Safety & Commercial Rules Implemented
- **Budget Validation:** Cart validation fails if total price exceeds user budget.
- **Inventory Check:** Prevents purchasing items exceeding available stock level.
- **Cross-Sell Discounts:** Evaluates discount triggers (e.g. 10% off `ErgoRest Wrist Support` when purchased alongside `NovaKey K75`).
- **Safety Limits:** Automatically blocks single transactions exceeding ₹10,000 to comply with Razorpay test-mode thresholds.
- **Audit Trails:** Logs every step of the transaction evaluation for security auditing.
