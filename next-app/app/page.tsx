import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans relative">
      {/* Logo in top left */}
      <div className="absolute top-3 left-3">
        <Image
          src="/logo.png"
          alt="BeeHonest Logo"
          width={100}
          height={100}
          className="w-25 h-25"
          priority
          quality={100}
        />
      </div>
      
      <main className="flex flex-col items-center justify-center gap-8 px-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-foreground mb-4">BeeHonest</h1>
          <p className="text-xl text-foreground/60 mb-8">
            Hard conversations require honesty and integrity.
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
            Watch Recorded Debate
          </Link>
        </div>

        <div className="mt-8 text-center text-sm text-foreground/50">
          <p>Camera and microphone access required for Live mode</p>
        </div>
      </main>
    </div>
  );
}
