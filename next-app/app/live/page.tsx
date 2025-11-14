"use client";

import { useState, useEffect } from "react";
import VideoLayer from "../components/VideoLayer";
import HUD from "../components/HUD";
import type { Segment, Claim, SpeakerMap } from "../types";

export default function LivePage() {
  const [isStarted, setIsStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFactFeed, setShowFactFeed] = useState(false);

  // Session state (will be populated as transcription happens)
  const [sessionId] = useState(`live_${Date.now()}`);
  const [segments] = useState<Segment[]>([]);
  const [claims] = useState<Claim[]>([]);
  const [speakers] = useState<SpeakerMap>({
    spk_0: "Speaker A",
    spk_1: "Speaker B"
  });

  // Timer for elapsed time
  useEffect(() => {
    if (!isStarted) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted]);

  const handleStart = () => {
    setIsStarted(true);
  };

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleToggleFactFeed = () => {
    setShowFactFeed(!showFactFeed);
  };

  if (!isStarted) {
    // Initial screen with "Start Live Debate" button
    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
        <button
          onClick={handleStart}
          className="px-8 py-4 text-xl font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors shadow-lg"
        >
          Start Live Debate
        </button>
        <div className="absolute bottom-8 text-center text-slate-400 text-sm">
          <p>Camera and microphone access will be requested</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Video layer - full screen webcam */}
      <VideoLayer mode="live" />

      {/* HUD overlay */}
      <HUD
        mode="live"
        elapsed={elapsed}
        onToggleTranscript={handleToggleTranscript}
        onToggleFactFeed={handleToggleFactFeed}
      />

      {/* Placeholder for future components */}
      {/* PopupManager will go here */}
      {/* TranscriptDrawer will go here */}
      {/* FactFeedDrawer will go here */}

      {/* Temporary indicators for drawer states (for testing) */}
      {showTranscript && (
        <div className="fixed left-0 top-0 h-full w-full md:w-[360px] bg-slate-900/95 backdrop-blur-sm z-20 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-lg font-semibold">Transcript</h2>
            <button
              onClick={() => setShowTranscript(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="text-slate-300 text-sm">
            <p className="italic">Transcript will appear here as speech is detected...</p>
            <div className="mt-4 space-y-4">
              {segments.map(seg => (
                <div key={seg.id} className="border-l-2 border-slate-700 pl-3">
                  <div className="text-xs text-slate-500 mb-1">
                    [{speakers[seg.speaker]}] {Math.floor(seg.start)}s
                  </div>
                  <div>{seg.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFactFeed && (
        <div className="fixed right-0 top-0 h-full w-full md:w-[360px] bg-slate-900/95 backdrop-blur-sm z-20 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-lg font-semibold">Fact Feed</h2>
            <button
              onClick={() => setShowFactFeed(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="text-slate-300 text-sm">
            <p className="italic">Claims and fact-checks will appear here...</p>
            <div className="mt-4 space-y-4">
              {claims.map(claim => (
                <div key={claim.id} className="border border-slate-700 rounded-lg p-3">
                  <div className="flex gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded">
                      {claim.fallacy.toUpperCase()}
                    </span>
                    <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded">
                      {claim.verdict.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm">{claim.text}</div>
                  <div className="text-xs text-slate-500 mt-2">
                    {speakers[claim.speaker]} · {Math.floor(claim.start)}s
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
