"use client";

import { useState, useEffect, useMemo } from "react";
import VideoLayer from "../components/VideoLayer";
import HUD from "../components/HUD";
import { useDeepgramTranscription } from "../hooks/useDeepgramTranscription";
import type { Claim, SpeakerMap } from "../types";
import { factCheckClaudeClaims, type ClaudeClaimPayload } from "../lib/factCheckApi";

const SAMPLE_CLAUDE_OUTPUT: ClaudeClaimPayload[] = [
  {
    text: "Mamdani wants to make NYC expensive and has no experience.",
    speaker: "spk_0",
    start: 12.3,
    end: 15.8
  },
  {
    text: "The congestion pricing plan will make it harder for small businesses to survive in NYC.",
    speaker: "spk_1",
    start: 31.0,
    end: 35.2
  }
];

const formatSpeakerLabel = (speakerId: string): string => {
  const match = speakerId.match(/spk_(\d+)/i);
  if (match) {
    const idx = Number.parseInt(match[1], 10);
    if (Number.isFinite(idx)) {
      return `Speaker ${idx + 1}`;
    }
  }
  return speakerId.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function LivePage() {
  const [elapsed, setElapsed] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFactFeed, setShowFactFeed] = useState(false);

  // Session state (will be populated as transcription happens)
  const [sessionId] = useState(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `live_${crypto.randomUUID()}`;
    }
    return `live_${Date.now()}`;
  });
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimInput, setClaimInput] = useState(() => JSON.stringify(SAMPLE_CLAUDE_OUTPUT, null, 2));
  const [factFeedError, setFactFeedError] = useState<string | null>(null);
  const [isFactChecking, setIsFactChecking] = useState(false);

  // Use Deepgram for real-time transcription
  const { segments, isConnected, error: transcriptionError } = useDeepgramTranscription({
    stream: mediaStream,
    sessionId,
    enabled: true
  });

  const speakers = useMemo(() => {
    const derived: SpeakerMap = {};
    for (const seg of segments) {
      if (!derived[seg.speaker]) {
        derived[seg.speaker] = formatSpeakerLabel(seg.speaker);
      }
    }
    return derived;
  }, [segments]);

  // Timer for elapsed time
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleStreamReady = (stream: MediaStream) => {
    setMediaStream(stream);
  };

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleToggleFactFeed = () => {
    setShowFactFeed(!showFactFeed);
  };

  const parseClaimsFromInput = (): ClaudeClaimPayload[] => {
    const raw = claimInput.trim();
    if (!raw) {
      return [];
    }

    const normalize = (entry: any, index: number): ClaudeClaimPayload | null => {
      if (typeof entry === "string") {
        const text = entry.trim();
        if (!text) return null;
        return { id: `input_${index}`, text };
      }
      if (entry && typeof entry === "object") {
        const text = typeof entry.text === "string" ? entry.text.trim() : "";
        if (!text) return null;
        const payload: ClaudeClaimPayload = {
          id: typeof entry.id === "string" ? entry.id : undefined,
          segmentId: typeof entry.segmentId === "string" ? entry.segmentId : undefined,
          text,
          speaker: typeof entry.speaker === "string" ? entry.speaker : undefined,
          start: typeof entry.start === "number" ? entry.start : undefined,
          end: typeof entry.end === "number" ? entry.end : undefined,
          fallacy: typeof entry.fallacy === "string" ? entry.fallacy : undefined,
          needsFactCheck:
            typeof entry.needsFactCheck === "boolean" ? entry.needsFactCheck : undefined
        };
        return payload;
      }
      return null;
    };

    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.claims)
        ? parsed.claims
        : [];

      return arr
        .map((entry, index) => normalize(entry, index))
        .filter(
          (claim): claim is ClaudeClaimPayload => !!claim && typeof claim.text === "string"
        )
        .map((claim, idx) => ({
          ...claim,
          id: claim.id ?? `input_${idx}`
        }));
    } catch {
      return raw
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((text, idx) => ({
          id: `manual_${idx}`,
          text
        }));
    }
  };

  const handleFactCheckClaims = async () => {
    setFactFeedError(null);
    const parsedClaims = parseClaimsFromInput();
    if (!parsedClaims.length) {
      setFactFeedError("Add at least one claim before fact-checking.");
      return;
    }

    setIsFactChecking(true);
    try {
      const results = await factCheckClaudeClaims(parsedClaims, sessionId);
      setClaims(results);
      if (!showFactFeed) {
        setShowFactFeed(true);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fact-check claims right now.";
      setFactFeedError(message);
    } finally {
      setIsFactChecking(false);
    }
  };

  const handleResetClaims = () => {
    setClaims([]);
    setFactFeedError(null);
  };

  return (
    <div className="relative w-screen h-screen bg-foreground overflow-hidden">
      {/* Video layer - full screen webcam */}
      <VideoLayer mode="live" onStreamReady={handleStreamReady} />

      {/* HUD overlay */}
      <HUD
        mode="live"
        elapsed={elapsed}
        onToggleTranscript={handleToggleTranscript}
        onToggleFactFeed={handleToggleFactFeed}
      />

      {/* Transcription status indicator */}
      <div className="absolute top-20 left-4 z-10 pointer-events-none">
        {isConnected && (
          <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/50 rounded-full px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-300 font-medium">Transcribing</span>
          </div>
        )}
        {transcriptionError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-2 max-w-xs">
            <span className="text-xs text-red-300">{transcriptionError}</span>
          </div>
        )}
      </div>

      {/* Placeholder for future components */}
      {/* PopupManager will go here */}
      {/* TranscriptDrawer will go here */}
      {/* FactFeedDrawer will go here */}

      {/* Temporary indicators for drawer states (for testing) */}
      {showTranscript && (
        <div className="fixed left-0 top-0 h-full w-full md:w-[360px] bg-surface/95 backdrop-blur-sm z-20 p-6 border-r border-border shadow-lg flex flex-col">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h2 className="text-foreground text-lg font-semibold">Transcript</h2>
            <button
              onClick={() => setShowTranscript(false)}
              className="text-foreground/50 hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="text-foreground/70 text-sm flex-1 overflow-y-auto pr-2">
            <p className="italic">Transcript will appear here as speech is detected...</p>
            <div className="mt-4 space-y-4 pb-6">
              {segments.map(seg => (
                <div key={seg.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-foreground/50 mb-1">
                    [{speakers[seg.speaker] ?? formatSpeakerLabel(seg.speaker)}] {Math.floor(seg.start)}s
                  </div>
                  <div>{seg.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFactFeed && (
        <div className="fixed right-0 top-0 h-full w-full md:w-[360px] bg-surface/95 backdrop-blur-sm z-20 p-6 border-l border-border shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-foreground text-lg font-semibold">Fact Feed</h2>
            <button
              onClick={() => setShowFactFeed(false)}
              className="text-foreground/50 hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="text-foreground/70 text-sm h-full flex flex-col">
            <div className="space-y-3">
              <label className="text-xs uppercase tracking-wide text-foreground/50">
                Paste Claude claims (JSON array or one per line)
              </label>
              <textarea
                value={claimInput}
                onChange={(event) => setClaimInput(event.target.value)}
                className="w-full h-40 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {factFeedError && (
                <p className="text-xs text-red-400">{factFeedError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleFactCheckClaims}
                  disabled={isFactChecking}
                  className="px-4 py-2 rounded-md bg-primary text-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {isFactChecking ? "Fact-checking..." : "Fact-check Claims"}
                </button>
                <button
                  onClick={handleResetClaims}
                  className="px-4 py-2 rounded-md border border-border text-sm text-foreground hover:bg-background-secondary"
                >
                  Clear Results
                </button>
              </div>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {isFactChecking && (
                <p className="text-xs text-foreground/50">Contacting Factiverse...</p>
              )}
              {!isFactChecking && !claims.length && (
                <p className="text-sm italic text-foreground/50">
                  Run the fact-check to populate the feed.
                </p>
              )}
              {claims.map(claim => (
                <div
                  key={claim.id}
                  className="border border-border rounded-lg p-3 bg-background-secondary shadow-sm"
                >
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-primary/20 text-foreground rounded">
                      {claim.fallacy.toUpperCase()}
                    </span>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-foreground rounded">
                      {claim.verdict.toUpperCase()}
                    </span>
                    {typeof claim.confidence === "number" && (
                      <span className="text-xs px-2 py-1 bg-primary/5 text-foreground rounded">
                        Confidence {(claim.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-sm">{claim.text}</div>
                  {claim.reasoning && (
                    <div className="text-xs text-foreground/70 mt-2">
                      {claim.reasoning}
                    </div>
                  )}
                  <div className="text-xs text-foreground/50 mt-2">
                    {claim.speaker
                      ? speakers[claim.speaker] ?? formatSpeakerLabel(claim.speaker)
                      : "Unknown speaker"}{" "}
                    · {Math.floor(claim.start ?? 0)}s
                  </div>
                  {claim.sources?.length ? (
                    <div className="mt-3">
                      <p className="text-[11px] uppercase text-foreground/50 mb-1">Sources</p>
                      <ul className="space-y-1">
                        {claim.sources.slice(0, 3).map((source) => (
                          <li key={`${claim.id}-${source.url}`} className="text-xs">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {source.title || source.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
