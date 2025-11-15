"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import VideoLayer from "../components/VideoLayer";
import HUD from "../components/HUD";
import { useDeepgramTranscription } from "../hooks/useDeepgramTranscription";
import type { Claim, SpeakerMap, FallacyInsight, Segment } from "../types";
import { analyzeSegmentChunk, startLiveSession, analyzeFallacies } from "../lib/factCheckApi";

interface NotificationToast {
  id: string;
  label: string;
  message: string;
  kind: "claim" | "fallacy";
}

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

const formatFallacyLabel = (value: string): string =>
  value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

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
  const [fallacies, setFallacies] = useState<FallacyInsight[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [factFeedError, setFactFeedError] = useState<string | null>(null);
  const [fallacyError, setFallacyError] = useState<string | null>(null);
  const [isAnalyzingClaims, setIsAnalyzingClaims] = useState(false);
  const [isAnalyzingFallacies, setIsAnalyzingFallacies] = useState(false);
  const [activeFeedTab, setActiveFeedTab] = useState<"claims" | "fallacies">("claims");
  const [notifications, setNotifications] = useState<NotificationToast[]>([]);

  // Use Deepgram for real-time transcription
  const { segments, isConnected, error: transcriptionError } = useDeepgramTranscription({
    stream: mediaStream,
    sessionId,
    enabled: true
  });
  const processedSegmentsRef = useRef<Set<string>>(new Set());
  const chunkBufferRef = useRef<Segment[]>([]);

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

  const handleStreamReady = useCallback((stream: MediaStream) => {
    setMediaStream(stream);
  }, []);

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleToggleFactFeed = () => {
    setShowFactFeed(!showFactFeed);
  };

  useEffect(() => {
    processedSegmentsRef.current = new Set();
    chunkBufferRef.current = [];
    setClaims([]);
    setFallacies([]);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);

    const run = async () => {
      try {
        const response = await startLiveSession(sessionId);
        if (response.sessionId !== sessionId) {
          console.warn(
            "Backend returned a different sessionId than requested. Using client sessionId."
          );
        }
        if (!cancelled) {
          setSessionReady(true);
          setFactFeedError(null);
        }
      } catch (error) {
        console.error("Failed to start live session", error);
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Unable to start live session.";
          setFactFeedError(message);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const newSegments = segments.filter((segment) => !processedSegmentsRef.current.has(segment.id));
    if (!newSegments.length) return;
    newSegments.forEach((segment) => {
      processedSegmentsRef.current.add(segment.id);
      chunkBufferRef.current.push(segment);
    });
  }, [segments]);

  const enqueueNotification = useCallback((notification: NotificationToast) => {
    setNotifications((prev) => [...prev, notification]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== notification.id));
    }, 5000);
  }, []);

  useEffect(() => {
    if (showFactFeed) {
      setNotifications([]);
    }
  }, [showFactFeed]);

  const flushChunk = useCallback(async () => {
    if (!sessionReady) return;
    if (!chunkBufferRef.current.length) return;

    const payload = [...chunkBufferRef.current];
    chunkBufferRef.current = [];

    setIsAnalyzingClaims(true);
    setIsAnalyzingFallacies(true);

    try {
      const analyzed = await analyzeSegmentChunk(sessionId, payload);
      if (analyzed?.length) {
        setClaims((prev) => {
          const merged = [...prev, ...analyzed];
          merged.sort((a, b) => {
            const aStart = typeof a.start === "number" ? a.start : 0;
            const bStart = typeof b.start === "number" ? b.start : 0;
            return aStart - bStart;
          });
          return merged;
        });

        if (!showFactFeed) {
          const falseVerdicts = new Set(["likely_false", "disputed"]);
          analyzed
            .filter((claim) => falseVerdicts.has(claim.verdict))
            .forEach((claim) => {
              enqueueNotification({
                id: `notif_claim_${claim.id}`,
                kind: "claim",
                label: "False Claim",
                message: claim.text
              });
            });
        }
      }
      setFactFeedError(null);
    } catch (error) {
      console.error("Failed to analyze chunk", error);
      const message =
        error instanceof Error ? error.message : "Unable to analyze transcript chunk.";
      setFactFeedError(message);
    } finally {
      setIsAnalyzingClaims(false);
    }

    try {
      const fallacyInsights = await analyzeFallacies(payload, sessionId);
      if (fallacyInsights?.length) {
        setFallacies((prev) => {
          const merged = [...prev, ...fallacyInsights];
          merged.sort((a, b) => {
            const aStart = typeof a.start === "number" ? a.start : 0;
            const bStart = typeof b.start === "number" ? b.start : 0;
            return aStart - bStart;
          });
          return merged;
        });

        if (!showFactFeed) {
          fallacyInsights
            .filter((insight) => insight.fallacy && insight.fallacy !== "none")
            .forEach((insight) => {
              enqueueNotification({
                id: `notif_fallacy_${insight.id}`,
                kind: "fallacy",
                label: `${formatFallacyLabel(insight.fallacy)} Fallacy`,
                message: insight.text
              });
            });
        }
      }
      setFallacyError(null);
    } catch (error) {
      console.error("Failed to analyze fallacies for chunk", error);
      const message =
        error instanceof Error ? error.message : "Unable to analyze fallacies.";
      setFallacyError(message);
    } finally {
      setIsAnalyzingFallacies(false);
    }
  }, [sessionId, sessionReady, showFactFeed, enqueueNotification]);

  useEffect(() => {
    if (!sessionReady) return;
    const interval = setInterval(() => {
      flushChunk();
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionReady, flushChunk]);

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
        <div className="fixed right-0 top-0 bottom-3 w-full md:w-[360px] max-h-[calc(100vh-0.75rem)] bg-surface/95 backdrop-blur-sm z-20 px-6 pt-6 pb-4 border-l border-border shadow-lg flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-foreground text-lg font-semibold">Fact Feed</h2>
            <button
              onClick={() => setShowFactFeed(false)}
              className="text-foreground/50 hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            {(["claims", "fallacies"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFeedTab(tab)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activeFeedTab === tab
                    ? "bg-primary text-foreground border-primary"
                    : "bg-transparent text-foreground/60 border-border hover:text-foreground"
                }`}
              >
                {tab === "claims" ? "Fact Checks" : "Fallacies"}
              </button>
            ))}
          </div>
          <div className="text-foreground/70 text-sm flex-1 flex flex-col overflow-hidden">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-foreground/50">
                {activeFeedTab === "claims" ? "Automatic claim analysis" : "Logical fallacy detection"}
              </p>
              <p>
                {activeFeedTab === "claims"
                  ? "Claude extracts claims from each transcript segment in real time and Factiverse verifies them."
                  : "Every few seconds, Claude reviews the latest transcript for rhetorical fallacies and flags suspicious arguments."}
              </p>
              {activeFeedTab === "claims" && factFeedError && (
                <p className="text-xs text-red-400">Error: {factFeedError}</p>
              )}
              {activeFeedTab === "fallacies" && fallacyError && (
                <p className="text-xs text-red-400">Error: {fallacyError}</p>
              )}
              {activeFeedTab === "claims" && isAnalyzingClaims && (
                <p className="text-xs text-foreground/50">Analyzing latest segment…</p>
              )}
              {activeFeedTab === "fallacies" && isAnalyzingFallacies && (
                <p className="text-xs text-foreground/50">Checking for fallacies…</p>
              )}
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {activeFeedTab === "claims" && (
                <>
                  {!claims.length && !isAnalyzingClaims && !factFeedError && (
                    <p className="text-sm italic text-foreground/50">
                      Waiting for the first claim to be spoken…
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
                </>
              )}

              {activeFeedTab === "fallacies" && (
                <>
                  {!fallacies.length && !isAnalyzingFallacies && !fallacyError && (
                    <p className="text-sm italic text-foreground/50">
                      No fallacies detected yet. Keep the debate going!
                    </p>
                  )}
                  {fallacies.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-3 bg-background-secondary shadow-sm"
                    >
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className="text-xs px-2 py-1 bg-amber-200/40 text-foreground rounded">
                          {item.fallacy.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm">{item.text}</div>
                      {item.reasoning && (
                        <div className="text-xs text-foreground/70 mt-2">
                          {item.reasoning}
                        </div>
                      )}
                      <div className="text-xs text-foreground/50 mt-2">
                        {speakers[item.speaker] ?? formatSpeakerLabel(item.speaker)} ·{" "}
                        {Math.floor(item.start ?? 0)}s
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!showFactFeed && notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="bg-background/95 border border-border rounded-xl px-4 py-3 shadow-lg w-64"
            >
              <p className="text-xs font-semibold text-primary mb-1">{notification.label}</p>
              <p className="text-sm text-foreground line-clamp-3">{notification.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
