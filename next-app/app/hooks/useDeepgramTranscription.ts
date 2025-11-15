"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Segment } from "../types";

const MERGE_GAP_SECONDS = 1.5;

const mergeSegmentsIfNeeded = (currentSegments: Segment[], nextSegment: Segment): Segment[] => {
  if (!currentSegments.length) {
    return [nextSegment];
  }

  const lastSegment = currentSegments[currentSegments.length - 1];
  const isSameSpeaker =
    lastSegment.sessionId === nextSegment.sessionId && lastSegment.speaker === nextSegment.speaker;
  const gap = nextSegment.start - lastSegment.end;

  if (isSameSpeaker && gap <= MERGE_GAP_SECONDS) {
    const mergedSegment: Segment = {
      ...lastSegment,
      end: Math.max(lastSegment.end, nextSegment.end),
      text: `${lastSegment.text}${lastSegment.text.endsWith(" ") ? "" : " "}${nextSegment.text}`
        .replace(/\s+/g, " ")
        .trim()
    };

    return [...currentSegments.slice(0, -1), mergedSegment];
  }

  return [...currentSegments, nextSegment];
};

interface UseDeepgramTranscriptionProps {
  stream: MediaStream | null;
  sessionId: string;
  enabled: boolean;
}

interface UseDeepgramTranscriptionReturn {
  segments: Segment[];
  isConnected: boolean;
  error: string | null;
}

export function useDeepgramTranscription({
  stream,
  sessionId,
  enabled
}: UseDeepgramTranscriptionProps): UseDeepgramTranscriptionReturn {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping MediaRecorder:", e);
      }
      mediaRecorderRef.current = null;
    }

    if (socketRef.current) {
      try {
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
        socketRef.current.close();
      } catch (e) {
        console.error("Error closing Deepgram socket:", e);
      }
      socketRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !stream) {
      cleanup();
      return;
    }

    let mounted = true;
    const setupDeepgram = async () => {
      try {
        console.log("Setting up Deepgram transcription (Flux)...");

        const tokenResponse = await fetch("/api/deepgram/token");
        if (!tokenResponse.ok) {
          throw new Error("Failed to fetch Deepgram token");
        }

        const { key } = await tokenResponse.json();
        if (!key) {
          throw new Error("Deepgram token missing from response");
        }
        const authKey = key as string;

        const getSupportedMimeType = () => {
          const types = [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/webm",
            "audio/mp4",
          ];

          for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
              console.log("Using mimeType:", type);
              return type;
            }
          }
          return "";
        };

        const mimeType = getSupportedMimeType();
        if (!mimeType) {
          console.warn("No preferred mimeType supported, using browser default");
        }

        const wsUrl = new URL("wss://api.deepgram.com/v1/listen");
        wsUrl.searchParams.set("diarize", "true");

        const ws = new WebSocket(wsUrl.toString(), ["token", authKey]);
        socketRef.current = ws;

        const readyStateLabel = () => {
          switch (ws.readyState) {
            case WebSocket.CONNECTING:
              return "CONNECTING";
            case WebSocket.OPEN:
              return "OPEN";
            case WebSocket.CLOSING:
              return "CLOSING";
            case WebSocket.CLOSED:
              return "CLOSED";
            default:
              return `${ws.readyState}`;
          }
        };

        const startMediaRecorder = () => {
          if (!stream) {
            throw new Error("No media stream available");
          }

          if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
            throw new Error("MediaRecorder is not supported in this environment");
          }

          const audioTracks = stream.getAudioTracks();
          if (!audioTracks.length) {
            throw new Error("No microphone audio track found. Please allow mic access.");
          }

          const audioStream = new MediaStream(audioTracks);

          let mediaRecorder: MediaRecorder;
          try {
            mediaRecorder = mimeType
              ? new MediaRecorder(audioStream, { mimeType })
              : new MediaRecorder(audioStream);
          } catch (err) {
            console.warn("Unable to use preferred mimeType, falling back to browser default:", err);
            mediaRecorder = new MediaRecorder(audioStream);
          }

          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            const socket = socketRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            if (event.data.size === 0) return;
            try {
              socket.send(event.data);
            } catch (e) {
              console.error("Error sending audio data:", e);
            }
          };

          mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event);
            setError("Audio recording error");
          };

          mediaRecorder.onstart = () => {
            console.log("✅ MediaRecorder started");
          };

          mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped");
          };

          try {
            mediaRecorder.start(250);
          } catch (err) {
            console.error("MediaRecorder failed to start:", err);
            throw err;
          }
        };

        ws.onopen = () => {
          if (!mounted) return;
          console.log("✅ Connected to Deepgram Flux");
          setIsConnected(true);
          setError(null);
          try {
            startMediaRecorder();
          } catch (err) {
            console.error("Failed to start MediaRecorder:", err);
            setError(err instanceof Error ? err.message : "Failed to start audio recording");
          }
        };

        ws.onmessage = (event) => {
          if (!mounted) return;

          try {
            const data = JSON.parse(event.data);

            if (data.type === "Results" && data.channel?.alternatives?.length) {
              const transcript = data.channel.alternatives[0];
              const text = transcript?.transcript?.trim();
              const isFinal = data.is_final ?? transcript?.is_final ?? true;
              if (!text || !isFinal) return;

              const words = transcript.words || [];
              const start = words[0]?.start ?? 0;
              const end = words[words.length - 1]?.end ?? start + 1;
              const speaker = words[0]?.speaker !== undefined ? `spk_${words[0].speaker}` : "spk_0";

              const segment: Segment = {
                id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sessionId,
                speaker,
                start,
                end,
                text
              };

              console.log("📝 Segment:", segment);
              setSegments((prev) => [...prev, segment]);
              return;
            }

            if (data.type === "Error" || data.type === "FatalError") {
              const desc = data.description || data.message || "Unknown error";
              console.error("❌ Deepgram error:", data);
              setError(`Transcription error: ${desc}`);
            }
          } catch (err) {
            console.error("Error parsing Deepgram message:", err);
          }
        };

        ws.onerror = () => {
          if (!mounted) return;
          const msg = `WebSocket connection error (Ready State: ${readyStateLabel()}, URL: ${ws.url})`;
          console.error("❌ WebSocket error:", msg);
          setError(`Transcription error: ${msg}`);
        };

        ws.onclose = (event) => {
          if (!mounted) return;
          console.log("🔌 Deepgram WebSocket closed:", event.code, event.reason);
          setIsConnected(false);
          if (!event.wasClean) {
            setError(
              `Transcription error: Connection closed (${event.code}) ${event.reason || ""}`.trim()
            );
          }
        };
      } catch (err) {
        if (!mounted) return;
        console.error("Failed to set up Deepgram:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize transcription");
      }
    };

    setupDeepgram();

    // Cleanup on unmount or when dependencies change
    return () => {
      mounted = false;
      cleanup();
    };
  }, [stream, sessionId, enabled, cleanup]);

  return {
    segments,
    isConnected,
    error
  };
}
