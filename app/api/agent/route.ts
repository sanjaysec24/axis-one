import { NextRequest, NextResponse } from "next/server";
import { runAgentWorkflow } from "@/lib/agentWorkflow";

export async function POST(request: NextRequest) {
  try {
    // 1. Validate request body exists and is JSON
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid request body. Expected a JSON payload." },
        { status: 400 }
      );
    }

    const { message, sessionId, requestedDiscount } = body;

    // 2. Validate that message is a non-empty string
    if (message === undefined || message === null) {
      return NextResponse.json(
        { error: "Missing required parameter: 'message'." },
        { status: 400 }
      );
    }

    if (typeof message !== "string" || message.trim() === "") {
      return NextResponse.json(
        { error: "Parameter 'message' must be a non-empty string." },
        { status: 400 }
      );
    }

    // 3. Check for API key presence
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server Configuration Error: Gemini API Key is not set." },
        { status: 500 }
      );
    }

    // 4. Run the full integrated commerce workflow
    const result = await runAgentWorkflow(message, requestedDiscount, sessionId);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error("Agent Workflow Orchestration Error:", error);
    
    const message = error.message || "An unexpected error occurred during workflow execution.";
    const status = message.includes("not configured") || message.includes("Gemini API") ? 500 : 400;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
