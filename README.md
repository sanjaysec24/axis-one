# AXIS ONE

## AI Buyer for Agentic Commerce

> **From understanding what you need to completing the purchase — with you always in control.**

AXIS ONE is an AI-powered Buyer Agent built for the future of **Agentic Commerce**.

Instead of making users search, compare, decide, and checkout manually, AXIS ONE allows users to describe what they need in natural language.

The agent then understands the request, searches across merchants, compares products, checks important constraints, explains its recommendation, and prepares the purchase.

The most important part is that **AXIS ONE cannot silently spend the user's money.**

Payment requires explicit user approval before the transaction can proceed through Razorpay.

---

# 🎯 The Problem

Online shopping usually requires the buyer to do everything manually:

- Search for products
- Open multiple product pages
- Compare prices
- Compare features
- Check whether the product fits their needs
- Check budget
- Decide which product is best
- Build the basket
- Checkout
- Make the payment

AI assistants can already recommend products.

But recommendation is only one part of commerce.

The bigger question is:

> **Can an AI agent help complete the buying journey while keeping the user in control of the transaction?**

AXIS ONE explores this problem.

---

# 💡 Our Solution

AXIS ONE works as a conversational AI Buyer.

Instead of saying:

> "Search for wireless keyboards."

A user can simply say:

> **"I need a wireless mechanical keyboard for programming under ₹5000."**

AXIS ONE understands the request and turns it into structured requirements.

It then:

1. Understands the buyer's intent
2. Searches across multiple merchants
3. Finds relevant products
4. Filters products based on requirements
5. Compares available options
6. Explains the recommendation
7. Maintains conversation context
8. Allows natural-language basket changes
9. Validates budget and commerce constraints
10. Requires explicit user approval
11. Opens Razorpay checkout
12. Verifies the payment
13. Stores the verified order in Firestore

---

# 🧠 How AXIS ONE Works

<img width="1672" height="941" alt="6120d6a6-5ef2-4095-a0d0-65ef3c7c03fe" src="https://github.com/user-attachments/assets/4037c4db-0044-443d-9a2e-7c6488281ff1" />


# 📁 Project Structure
```
axis-one/
│
├── app/
│   ├── api/
│   │   ├── agent/
│   │   ├── payment/
│   │   └── webhook/
│   │
│   └── page.tsx
│
├── lib/
│   ├── agentWorkflow.ts
│   ├── firebaseAdmin.ts
│   ├── gemini.ts
│   ├── orders.ts
│   ├── razorpay.ts
│   ├── session.ts
│   ├── stateTransition.ts
│   └── types.ts
│
├── public/
│
├── package.json
├── README.md
└── ...
```
```
⚙️ Local Setup
1. Clone the repository
git clone https://github.com/sanjaysec24/axis-one.git
cd axis-one
2. Install dependencies
npm install
3. Configure environment variables

Create a local file:

.env.local

Add the required credentials:

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

GEMINI_API_KEY=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

Never commit .env.local, Firebase private keys, API keys, or payment secrets to GitHub.

4. Start the development server
npm run dev

Open:

http://localhost:3000
5. Create a production build
npm run build
```

# Demo video link:
https://youtu.be/jNd8wT0jFSk?si=eEnihkaqN5NwSXiD
