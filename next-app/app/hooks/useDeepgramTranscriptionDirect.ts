"use client";

// This file previously opened a WebSocket directly to Deepgram from the browser.
// That approach leaked the API key and failed because Deepgram forbids long-lived
// browser tokens. We now obtain short-lived tokens from Next.js API routes instead.
export { useDeepgramTranscription } from "./useDeepgramTranscription";
