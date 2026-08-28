import { NextRequest, NextResponse } from "next/server";
import { getAllOrders } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const orders = await getAllOrders();
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to load order history from persistent storage." },
      { status: 500 }
    );
  }
}
