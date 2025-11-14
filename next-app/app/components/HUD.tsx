"use client";

interface HUDProps {
  mode: "live" | "replay";
  elapsed: number; // seconds
  title?: string;
  onToggleTranscript: () => void;
  onToggleFactFeed: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function HUD({
  mode,
  elapsed,
  title = "Universal Healthcare Debate",
  onToggleTranscript,
  onToggleFactFeed
}: HUDProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between items-center px-4 md:px-8 py-4 text-xs md:text-sm text-surface">
      {/* Left: Live/Replay indicator + time */}
      <div className="pointer-events-auto flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground">
          <span className={`h-2 w-2 rounded-full bg-foreground ${mode === "live" ? "animate-pulse" : ""}`} />
          {mode === "live" ? "Live" : "Replay"}
        </span>
        <span className="text-surface/90 tabular-nums">{formatTime(elapsed)}</span>
      </div>

      {/* Center: Title (hidden on mobile) */}
      <div className="hidden md:block text-surface font-medium">
        {title}
      </div>

      {/* Right: Control buttons */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={onToggleTranscript}
          className="rounded-full bg-surface/90 backdrop-blur-sm px-3 py-1 text-xs text-foreground hover:bg-surface transition-colors shadow-md"
        >
          Transcript
        </button>
        <button
          onClick={onToggleFactFeed}
          className="rounded-full bg-surface/90 backdrop-blur-sm px-3 py-1 text-xs text-foreground hover:bg-surface transition-colors shadow-md"
        >
          Fact Feed
        </button>
      </div>
    </div>
  );
}
