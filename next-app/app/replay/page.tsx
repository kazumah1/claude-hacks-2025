"use client";

import { useState, useEffect } from "react";
import VideoLayer from "../components/VideoLayer";
import HUD from "../components/HUD";
import type { Segment, Claim, SpeakerMap } from "../types";

export default function ReplayPage() {
  const [elapsed, setElapsed] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFactFeed, setShowFactFeed] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Session state (will be populated from replay data)
  const [sessionId] = useState(`replay_${Date.now()}`);
  const [segments] = useState<Segment[]>([]);
  const [claims] = useState<Claim[]>([]);
  const [speakers] = useState<SpeakerMap>({
    spk_0: "Speaker A",
    spk_1: "Speaker B"
  });

  // Handle video time updates
  const handleTimeUpdate = (time: number) => {
    setElapsed(Math.floor(time));
  };

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
  };

  const handleToggleFactFeed = () => {
    setShowFactFeed(!showFactFeed);
  };

  return (
    <div className="relative w-screen h-screen bg-foreground overflow-hidden">
      {/* Video layer - replay video */}
      <VideoLayer 
        mode="replay" 
        videoUrl={videoUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* HUD overlay */}
      <HUD
        mode="replay"
        elapsed={elapsed}
        onToggleTranscript={handleToggleTranscript}
        onToggleFactFeed={handleToggleFactFeed}
      />

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
              onClick={() => {
                // TODO: Implement video file selection
                alert("Video selection coming soon");
              }}
              className="px-6 py-3 rounded-lg bg-primary text-foreground font-semibold hover:opacity-90 transition-all shadow-md"
            >
              Select Recording
            </button>
          </div>
        </div>
      )}

      {/* Temporary indicators for drawer states (for testing) */}
      {showTranscript && (
        <div className="fixed left-0 top-0 h-full w-full md:w-[360px] bg-surface/95 backdrop-blur-sm z-20 p-6 border-r border-border shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-foreground text-lg font-semibold">Transcript</h2>
            <button
              onClick={() => setShowTranscript(false)}
              className="text-foreground/50 hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="text-foreground/70 text-sm">
            <p className="italic">Transcript will appear here...</p>
            <div className="mt-4 space-y-4">
              {segments.map(seg => (
                <div key={seg.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-foreground/50 mb-1">
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
          <div className="text-foreground/70 text-sm">
            <p className="italic">Claims and fact-checks will appear here...</p>
            <div className="mt-4 space-y-4">
              {claims.map(claim => (
                <div key={claim.id} className="border border-border rounded-lg p-3 bg-background-secondary">
                  <div className="flex gap-2 mb-2">
                    <span className="text-xs px-2 py-1 bg-primary/20 text-foreground rounded">
                      {claim.fallacy.toUpperCase()}
                    </span>
                    <span className="text-xs px-2 py-1 bg-primary/10 text-foreground rounded">
                      {claim.verdict.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm">{claim.text}</div>
                  <div className="text-xs text-foreground/50 mt-2">
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

