"use client";

// Historical note: this file originally exported a Deepgram-specific hook that
// opened a WebSocket directly from the browser. We now route audio chunks
// through Next.js API routes and proxy them to ElevenLabs for diarized
// transcription, but keep this re-export so existing imports continue to work.
export { useDeepgramTranscription } from "./useDeepgramTranscription";
