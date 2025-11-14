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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between items-center px-4 md:px-8 py-4 text-xs md:text-sm text-slate-100">
      {/* Left: Live/Replay indicator + time */}
      <div className="pointer-events-auto flex items-center gap-2">
        <span className="flex items-center gap-1 rounded-full bg-red-500/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide">
          <span className={`h-2 w-2 rounded-full bg-white ${mode === "live" ? "animate-pulse" : ""}`} />
          {mode === "live" ? "Live" : "Replay"}
        </span>
        <span className="text-slate-300 tabular-nums">{formatTime(elapsed)}</span>
      </div>

      {/* Center: Title (hidden on mobile) */}
      <div className="hidden md:block text-slate-200 font-medium">
        {title}
      </div>

      {/* Right: Control buttons */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={onToggleTranscript}
          className="rounded-full bg-slate-900/80 px-3 py-1 text-xs hover:bg-slate-800 transition-colors"
        >
          Transcript
        </button>
        <button
          onClick={onToggleFactFeed}
          className="rounded-full bg-slate-900/80 px-3 py-1 text-xs hover:bg-slate-800 transition-colors"
        >
          Fact Feed
        </button>
      </div>
    </div>
  );
}
