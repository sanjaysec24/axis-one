import { Product } from "../lib/types";

export const products: Product[] = [
  // --- MECHANICAL KEYBOARDS ---
  {
    id: "novakey-k75",
    name: "NovaKey K75",
    category: "Mechanical Keyboard",
    price: 4499,
    stock: 18,
    description: "A wireless mechanical keyboard designed for long programming and productivity sessions.",
    features: [
      "Wireless connectivity",
      "80-hour battery life",
      "Mechanical switches",
      "Programmable keys",
      "Compact 75% layout"
    ],
    tags: ["wireless", "programming", "productivity", "mechanical", "keyboard", "battery"],
    image: "/placeholder-novakey-k75.png",
    batteryLife: "80 hours",
    compatibleWith: []
  },
  {
    id: "apex-pro-x",
    name: "Apex Pro X",
    category: "Mechanical Keyboard",
    price: 6999,
    stock: 12,
    description: "A premium wireless mechanical keyboard with advanced switches and premium construction.",
    features: [
      "Wireless",
      "Premium mechanical switches",
      "RGB lighting",
      "Aluminum construction",
      "Advanced customization"
    ],
    tags: ["wireless", "premium", "mechanical", "keyboard", "gaming", "productivity"],
    image: "/placeholder-apex-pro-x.png",
    batteryLife: "40 hours",
    compatibleWith: []
  },
  {
    id: "clickylite-wired",
    name: "ClickyLite Wired",
    category: "Mechanical Keyboard",
    price: 1899,
    stock: 25,
    description: "A budget-friendly tactile wired mechanical keyboard for reliable typing performance.",
    features: [
      "Wired USB-C connection",
      "Blue tactile switches",
      "Double-shot keycaps",
      "Rainbow backlighting",
      "Full size 104-key layout"
    ],
    tags: ["wired", "budget", "mechanical", "keyboard", "programming"],
    image: "/placeholder-clickylite-wired.png",
    batteryLife: null,
    compatibleWith: []
  },
  {
    id: "swifttype-travel",
    name: "SwiftType Travel",
    category: "Mechanical Keyboard",
    price: 2999,
    stock: 15,
    description: "Ultra-compact wireless mechanical keyboard ideal for travel and mobile workspaces.",
    features: [
      "Dual mode wireless (Bluetooth & 2.4GHz)",
      "Low-profile switches",
      "Compact 60% layout",
      "Multi-device pairing",
      "15-hour battery life (backlight on)"
    ],
    tags: ["wireless", "travel", "portable", "keyboard", "gaming"],
    image: "/placeholder-swifttype-travel.png",
    batteryLife: "15 hours",
    compatibleWith: []
  },

  // --- WIRELESS MICE ---
  {
    id: "aeroglide-wireless",
    name: "AeroGlide Wireless",
    category: "Wireless Mouse",
    price: 1299,
    stock: 22,
    description: "Lightweight wireless mouse with smooth tracking and long battery life.",
    features: [
      "Lag-free 2.4GHz wireless",
      "Up to 100 hours battery life",
      "Lightweight design (75g)",
      "Adjustable DPI (800-3200)",
      "Silent clicks"
    ],
    tags: ["wireless", "mouse", "productivity", "budget"],
    image: "/placeholder-aeroglide-wireless.png",
    batteryLife: "100 hours",
    compatibleWith: []
  },
  {
    id: "precision-click-pro",
    name: "Precision Click Pro",
    category: "Wireless Mouse",
    price: 2499,
    stock: 15,
    description: "Ergonomic productivity mouse featuring a precision scroll wheel and customizable side buttons.",
    features: [
      "Precision optical sensor",
      "Ergonomic thumb rest",
      "150-hour battery life",
      "Bluetooth & USB receiver connection",
      "Multi-device flow control"
    ],
    tags: ["wireless", "precision", "mouse", "productivity", "ergonomic"],
    image: "/placeholder-precision-click-pro.png",
    batteryLife: "150 hours",
    compatibleWith: []
  },
  {
    id: "titan-gaming-mouse",
    name: "Titan Gaming Mouse",
    category: "Wireless Mouse",
    price: 3499,
    stock: 10,
    description: "High-performance wireless gaming mouse with optical switches and customizable RGB lighting.",
    features: [
      "26K DPI optical sensor",
      "Ultra-low latency wireless",
      "Customizable RGB illumination",
      "6 programmable buttons",
      "50 hours battery life with RGB"
    ],
    tags: ["wireless", "gaming", "rgb", "mouse"],
    image: "/placeholder-titan-gaming-mouse.png",
    batteryLife: "50 hours",
    compatibleWith: []
  },

  // --- WRIST RESTS ---
  {
    id: "ergorest-wrist-support",
    name: "ErgoRest Wrist Support",
    category: "Wrist Rest",
    price: 399,
    stock: 30,
    description: "An ergonomic wrist support designed for comfortable long typing sessions.",
    features: [
      "Ergonomic support",
      "Memory foam",
      "Non-slip base",
      "Compatible with compact and full-size keyboards"
    ],
    tags: ["ergonomic", "programming", "keyboard-accessory", "comfort", "productivity"],
    image: "/placeholder-ergorest-wrist-support.png",
    batteryLife: null,
    compatibleWith: ["NovaKey K75"]
  },
  {
    id: "cloudfoam-wrist-support",
    name: "CloudFoam Wrist Support",
    category: "Wrist Rest",
    price: 499,
    stock: 20,
    description: "Plush, cloud-shaped memory foam wrist rest for keyboards of all layouts.",
    features: [
      "Premium slow-rebound foam",
      "Unique cloud design aesthetics",
      "Easy-to-clean PU leather surface",
      "Anti-skid rubber base"
    ],
    tags: ["wrist-rest", "comfort", "accessory", "ergonomic"],
    image: "/placeholder-cloudfoam-wrist-support.png",
    batteryLife: null,
    compatibleWith: []
  },

  // --- MOUSE PADS ---
  {
    id: "deskmat-pro-minimal",
    name: "DeskMat Pro Minimal",
    category: "Mouse Pad",
    price: 799,
    stock: 40,
    description: "Minimalist desk mat made of premium felt, providing a soft surface for your workspace setup.",
    features: [
      "Premium felt wool material",
      "Protects desk from scratches",
      "Large size for keyboard and mouse",
      "Stitched edges prevent fraying"
    ],
    tags: ["deskmat", "minimalist", "felt", "productivity"],
    image: "/placeholder-deskmat-pro-minimal.png",
    batteryLife: null,
    compatibleWith: []
  },
  {
    id: "deskmat-rgb-gamer",
    name: "DeskMat RGB Gamer",
    category: "Mouse Pad",
    price: 1199,
    stock: 15,
    description: "Water-resistant gaming desk mat with customizable edge-lit RGB lighting.",
    features: [
      "Micro-textured cloth surface",
      "12 dynamic RGB lighting modes",
      "Waterproof coating",
      "Extra-large coverage"
    ],
    tags: ["deskmat", "gaming", "rgb", "accessory"],
    image: "/placeholder-deskmat-rgb-gamer.png",
    batteryLife: null,
    compatibleWith: []
  },

  // --- HEADPHONES ---
  {
    id: "aurasound-anc",
    name: "AuraSound ANC",
    category: "Headphones",
    price: 4999,
    stock: 8,
    description: "Wireless over-ear headphones with active noise cancellation and crystal-clear audio quality.",
    features: [
      "Active Noise Cancellation (ANC)",
      "High-fidelity sound drivers",
      "Comfortable memory-foam earcups",
      "Built-in mic for calls",
      "30 hours battery life"
    ],
    tags: ["wireless", "anc", "audio", "headphones", "productivity"],
    image: "/placeholder-aurasound-anc.png",
    batteryLife: "30 hours",
    compatibleWith: []
  },
  {
    id: "echobass-wireless",
    name: "EchoBass Wireless",
    category: "Headphones",
    price: 2499,
    stock: 14,
    description: "Comfortable wireless headphones with punchy bass and quick charging.",
    features: [
      "Dynamic bass boost",
      "Bluetooth 5.2 connectivity",
      "Lightweight, foldable frame",
      "20 hours battery life",
      "Fast charge (10 min for 2 hours)"
    ],
    tags: ["wireless", "bass", "audio", "headphones", "budget"],
    image: "/placeholder-echobass-wireless.png",
    batteryLife: "20 hours",
    compatibleWith: []
  },

  // --- LAPTOP STANDS ---
  {
    id: "flexistand-aluminum",
    name: "FlexiStand Aluminum",
    category: "Laptop Stand",
    price: 1599,
    stock: 12,
    description: "Sturdy aluminum laptop stand with adjustable height and angles for better ergonomics.",
    features: [
      "High-grade aluminum alloy construction",
      "6 adjustable height angles",
      "Hollow design for heat dissipation",
      "Foldable and portable"
    ],
    tags: ["stand", "aluminum", "ergonomic", "productivity"],
    image: "/placeholder-flexistand-aluminum.png",
    batteryLife: null,
    compatibleWith: []
  },
  {
    id: "liftelevate-plastic",
    name: "LiftElevate Plastic",
    category: "Laptop Stand",
    price: 799,
    stock: 20,
    description: "Lightweight plastic laptop stand with rubberized grips for dual-angle viewing.",
    features: [
      "Durable ABS plastic structure",
      "Lightweight and compact",
      "Non-slip silicone pads",
      "Dual angle adjustment"
    ],
    tags: ["stand", "budget", "portable", "ergonomic"],
    image: "/placeholder-liftelevate-plastic.png",
    batteryLife: null,
    compatibleWith: []
  }
];
