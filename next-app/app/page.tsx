import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <main className="flex flex-col items-center justify-center gap-8 px-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-foreground mb-4">DebateRef</h1>
          <p className="text-xl text-foreground/60 mb-8">
            Real-time debate fact-checking and fallacy detection
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-md">
          <Link
            href="/live"
            className="flex h-16 items-center justify-center rounded-lg bg-primary px-6 text-lg font-semibold text-foreground transition-all hover:opacity-90 shadow-md"
          >
            Start Live Debate
          </Link>

          <Link
            href="/replay"
            className="flex h-16 items-center justify-center rounded-lg border border-border bg-surface px-6 text-lg font-semibold text-foreground transition-all hover:bg-background-secondary"
          >
            View Replay Demo
          </Link>
        </div>

        <div className="mt-8 text-center text-sm text-foreground/50">
          <p>Camera and microphone access required for Live mode</p>
        </div>
      </main>
    </div>
  );
}
