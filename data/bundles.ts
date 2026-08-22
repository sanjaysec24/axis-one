import { Product } from "../lib/types";

export interface ProductBundle {
  id: string;
  name: string;
  description: string;
  productIds: string[];
  discountPercentage: number;
}

export const productBundles: ProductBundle[] = [
  {
    id: "coder-starter-pack",
    name: "Nexora Coder Starter Pack",
    description: "Upgrade your workspace with NovaKey K75 and ErgoRest Wrist Support for a 10% discount.",
    productIds: ["novakey-k75", "ergorest-wrist-support"],
    discountPercentage: 10
  },
  {
    id: "premium-desk-setup",
    name: "Nexora Premium Workspace Setup",
    description: "Get the ultimate workspace combination: Apex Pro X, Precision Click Pro, and DeskMat Pro Minimal at 15% off.",
    productIds: ["apex-pro-x", "precision-click-pro", "deskmat-pro-minimal"],
    discountPercentage: 15
  }
];
