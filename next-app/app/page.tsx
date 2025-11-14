import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black font-sans">
      <main className="flex flex-col items-center justify-center gap-8 px-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-4">DebateRef</h1>
          <p className="text-xl text-slate-400 mb-8">
            Real-time debate fact-checking and fallacy detection
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-md">
          <Link
            href="/live"
            className="flex h-16 items-center justify-center rounded-lg bg-red-600 px-6 text-lg font-semibold text-white transition-colors hover:bg-red-700"
          >
            Start Live Debate
          </Link>

          <Link
            href="/replay"
            className="flex h-16 items-center justify-center rounded-lg border border-slate-700 px-6 text-lg font-semibold text-white transition-colors hover:bg-slate-900"
          >
            View Replay Demo
          </Link>
        </div>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Camera and microphone access required for Live mode</p>
        </div>
      </main>
    </div>
  );
}
