import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio payload" }, { status: 400 });
    }

    const apiKey =
      process.env.ELEVENLABS_API_KEY ||
      process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY not configured" },
        { status: 500 }
      );
    }

    const forwardForm = new FormData();
    const filename =
      (audioFile as File).name && (audioFile as File).name !== "blob"
        ? (audioFile as File).name
        : "audio.wav";

    forwardForm.append("file", audioFile, filename);
    forwardForm.append("model_id", formData.get("model_id")?.toString() || "scribe_v1");
    forwardForm.append("diarize", "true");
    forwardForm.append("timestamps_granularity", "word");

    const elevenResponse = await fetch(ELEVENLABS_API_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey
      },
      body: forwardForm
    });

    if (!elevenResponse.ok) {
      const details = await elevenResponse.text();
      console.error("ElevenLabs transcription failed:", details);
      return NextResponse.json(
        {
          error: "ElevenLabs transcription failed",
          details
        },
        { status: elevenResponse.status }
      );
    }

    const data = await elevenResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error proxying ElevenLabs transcription:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio with ElevenLabs" },
      { status: 500 }
    );
  }
}
