"use client";

import { startTransition, useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ChangeEvent } from "react";
import VideoLayer from "../components/VideoLayer";
import HUD from "../components/HUD";
import { useDeepgramTranscription } from "../hooks/useDeepgramTranscription";
import type { Claim, SpeakerMap, FallacyInsight, Segment } from "../types";
import { analyzeSegmentChunk, analyzeFallacies, startLiveSession } from "../lib/factCheckApi";

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

export default function ReplayPage() {
  const [elapsed, setElapsed] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFactFeed, setShowFactFeed] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session state (will be populated from replay data)
  const [sessionId] = useState(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `replay_${crypto.randomUUID()}`;
    }
    return `replay_${Date.now()}`;
  });
  const [claims, setClaims] = useState<Claim[]>([]);
  const [fallacies, setFallacies] = useState<FallacyInsight[]>([]);
  const [factFeedError, setFactFeedError] = useState<string | null>(null);
  const [fallacyError, setFallacyError] = useState<string | null>(null);
  const [isAnalyzingClaims, setIsAnalyzingClaims] = useState(false);
  const [isAnalyzingFallacies, setIsAnalyzingFallacies] = useState(false);
  const [activeFeedTab, setActiveFeedTab] = useState<"claims" | "fallacies">("claims");
  const [sessionReady, setSessionReady] = useState(false);

  const { segments, isConnected, error: transcriptionError } = useDeepgramTranscription({
    stream: mediaStream,
    sessionId,
    enabled: analysisEnabled && Boolean(mediaStream)
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

    if (Object.keys(derived).length === 0) {
      derived.spk_0 = "Speaker A";
      derived.spk_1 = "Speaker B";
    }
    return derived;
  }, [segments]);

  // Handle video time updates
  const handleTimeUpdate = useCallback((time: number) => {
    setElapsed(Math.floor(time));
  }, []);

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleToggleFactFeed = () => {
    setShowFactFeed(!showFactFeed);
  };

  const handleFileSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setVideoUrl(objectUrl);
    setAnalysisEnabled(false);
    setMediaStream(null);
  }, [videoUrl]);

  const handleReplayStreamReady = useCallback((stream: MediaStream) => {
    setMediaStream(stream);
  }, []);

  const handleStartAnalysis = useCallback(() => {
    if (mediaStream) {
      setAnalysisEnabled(true);
    }
  }, [mediaStream]);

  const flushChunk = useCallback(async () => {
    if (!sessionReady) return;
    if (!chunkBufferRef.current.length) return;
    const payload = [...chunkBufferRef.current];
    chunkBufferRef.current = [];

    startTransition(() => {
      setIsAnalyzingClaims(true);
      setIsAnalyzingFallacies(true);
    });

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
      }
      setFactFeedError(null);
    } catch (error) {
      console.error("Failed to analyze chunk", error);
      const message =
        error instanceof Error ? error.message : "Unable to analyze transcript chunk.";
      setFactFeedError(message);
    } finally {
      startTransition(() => setIsAnalyzingClaims(false));
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
      }
      setFallacyError(null);
    } catch (error) {
      console.error("Failed to analyze fallacies for chunk", error);
      const message =
        error instanceof Error ? error.message : "Unable to analyze fallacies.";
      setFallacyError(message);
    } finally {
      startTransition(() => setIsAnalyzingFallacies(false));
    }
  }, [sessionId, sessionReady]);

  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [mediaStream, videoUrl]);

  useEffect(() => {
    if (!analysisEnabled || !sessionReady) return;
    const interval = setInterval(() => {
      flushChunk();
    }, 12000);
    return () => clearInterval(interval);
  }, [analysisEnabled, sessionReady, flushChunk]);

  useEffect(() => {
    processedSegmentsRef.current = new Set();
    startTransition(() => {
      setClaims([]);
      setFallacies([]);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!analysisEnabled) return;
    const newSegments = segments.filter(
      (segment) => !processedSegmentsRef.current.has(segment.id)
    );
    if (!newSegments.length) return;
    newSegments.forEach((segment) => {
      processedSegmentsRef.current.add(segment.id);
      chunkBufferRef.current.push(segment);
    });
  }, [analysisEnabled, segments]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!analysisEnabled) {
        if (!cancelled) {
          startTransition(() => setSessionReady(false));
        }
        return;
      }

      startTransition(() => setSessionReady(false));

      try {
        await startLiveSession(sessionId);
        if (!cancelled) {
          startTransition(() => setSessionReady(true));
          setFactFeedError(null);
        }
      } catch (error) {
        console.error("Failed to start replay session", error);
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Unable to start replay analysis.";
          setFactFeedError(message);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [analysisEnabled, sessionId]);

  useEffect(() => {
    if (!analysisEnabled) {
      chunkBufferRef.current = [];
    }
  }, [analysisEnabled]);

  // fallacy analysis handled within flushChunk

  return (
    <div className="relative w-screen h-screen bg-foreground overflow-hidden">
      {/* Video layer - replay video */}
      <VideoLayer 
        mode="replay" 
        videoUrl={videoUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onStreamReady={handleReplayStreamReady}
      />

      {/* HUD overlay */}
      <HUD
        mode="replay"
        elapsed={elapsed}
        onToggleTranscript={handleToggleTranscript}
        onToggleFactFeed={handleToggleFactFeed}
      />

      {/* Transcription status indicator */}
      <div className="absolute top-20 left-4 z-10 pointer-events-none">
        {analysisEnabled && isConnected && (
          <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/50 rounded-full px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-xs text-blue-100 font-medium">Transcribing recording</span>
          </div>
        )}
        {transcriptionError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-2 max-w-xs">
            <span className="text-xs text-red-300">{transcriptionError}</span>
          </div>
        )}
      </div>

      {/* Placeholder for video selection if no video loaded */}
      {!videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center px-8 max-w-md">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
              No Recording Selected
            </h2>
            <p className="text-foreground/60 mb-6">
              Select a recorded debate to watch and analyze
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-lg bg-primary text-foreground font-semibold hover:opacity-90 transition-all shadow-md"
            >
              Select Recording
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {videoUrl && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col md:flex-row gap-3 bg-background/80 border border-border rounded-2xl px-4 py-3 backdrop-blur">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-full bg-background-secondary text-foreground text-sm font-medium hover:bg-background-secondary/80 transition-colors"
          >
            Choose Different File
          </button>
          <button
            onClick={handleStartAnalysis}
            disabled={!mediaStream}
            className="px-4 py-2 rounded-full bg-primary text-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-all"
          >
            {analysisEnabled ? "Analyzing…" : "Start Transcribing"}
          </button>
        </div>
      )}

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
            <p className="italic">
              {segments.length === 0
                ? "Upload a recording and start the transcription to populate this list."
                : "Latest transcript segments:"}
            </p>
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
                {activeFeedTab === "claims"
                  ? "Automatic claim analysis"
                  : "Logical fallacy detection"}
              </p>
              <p>
                {activeFeedTab === "claims"
                  ? "Claude extracts claims from the replay transcript and Factiverse verifies them."
                  : "Claude reviews the replay transcript for logical fallacies every few seconds."}
              </p>
              {activeFeedTab === "claims" && factFeedError && (
                <p className="text-xs text-red-400">Error: {factFeedError}</p>
              )}
              {activeFeedTab === "fallacies" && fallacyError && (
                <p className="text-xs text-red-400">Error: {fallacyError}</p>
              )}
              {activeFeedTab === "claims" && isAnalyzingClaims && analysisEnabled && (
                <p className="text-xs text-foreground/50">Analyzing latest segment…</p>
              )}
              {activeFeedTab === "fallacies" && isAnalyzingFallacies && analysisEnabled && (
                <p className="text-xs text-foreground/50">Checking for fallacies…</p>
              )}
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {activeFeedTab === "claims" && (
                <>
                  {!claims.length && analysisEnabled && !isAnalyzingClaims && !factFeedError && (
                    <p className="text-sm italic text-foreground/50">
                      Waiting for the first claim from this recording…
                    </p>
                  )}
                  {claims.map(claim => (
                    <div key={claim.id} className="border border-border rounded-lg p-3 bg-background-secondary">
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
                        {speakers[claim.speaker] ?? formatSpeakerLabel(claim.speaker)} ·{" "}
                        {Math.floor(claim.start ?? 0)}s
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
                  {!fallacies.length &&
                    analysisEnabled &&
                    !isAnalyzingFallacies &&
                    !fallacyError && (
                      <p className="text-sm italic text-foreground/50">
                        No fallacies detected yet in this recording.
                      </p>
                    )}
                  {fallacies.map((item) => (
                    <div key={item.id} className="border border-border rounded-lg p-3 bg-background-secondary">
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
    </div>
  );
}
