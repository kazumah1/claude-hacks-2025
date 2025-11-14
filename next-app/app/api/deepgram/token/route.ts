import { NextResponse } from "next/server";
import { createClient } from "@deepgram/sdk";

export async function GET() {
  try {
    const baseKey = process.env.DEEPGRAM_API_KEY || process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

    if (!baseKey || baseKey === "your_deepgram_api_key_here") {
      return NextResponse.json(
        { error: "Deepgram API key not configured" },
        { status: 500 }
      );
    }

    const projectId = process.env.DEEPGRAM_PROJECT_ID;

    if (projectId) {
      const deepgram = createClient(baseKey);
      const { result, error } = await deepgram.manage.createProjectKey(projectId, {
        comment: "Temporary key for live transcription",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 600,
      });

      if (error) {
        console.error("Error creating temporary key:", error);
      } else if (result?.key) {
        return NextResponse.json({ key: result.key });
      }
    }

    // Fallback for local development: return the main key (do not use in production)
    return NextResponse.json({ key: baseKey });
  } catch (error) {
    console.error("Error in token route:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
