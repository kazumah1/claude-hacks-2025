import Link from "next/link";
import Image from "next/image";

export default function About() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans relative">
      <div className="absolute top-3 left-3">
        <Link href="/" aria-label="Back to home">
          <Image
            src="/logo.png"
            alt="BeeHonest Logo"
            width={80}
            height={80}
            className="w-25 h-25 transition-opacity hover:opacity-80"
            priority
            quality={100}
          />
        </Link>
      </div>

      <main className="flex flex-col items-center gap-6 px-8 text-center">
        <div>
          <br></br>
          <br></br>
          <h1 className="text-4xl font-bold text-foreground">About</h1>
        </div>
        <p className="max-w-2xl text-base text-foreground/70">
BeeHonest improves political debate by providing unbiased, real-time fact-checking and fallacy detection, helping communities combat misinformation and engage in clearer, more trustworthy democratic dialogue.</p>
        <div className="rounded-2xl border border-border bg-surface/60 p-4 shadow-sm">
          <Image
            src="/flowchart.png"
            alt="BeeHonest conversation flowchart"
            width={960}
            height={540}
            className="h-auto w-[70vw] max-w-3xl rounded-xl"
            priority
            quality={100}
          />
        </div>
        <p className="max-w-2xl text-base text-foreground/70">
Created by Akshay Shivkumar, Kazuma Hakushi, and Yannan Cai</p>
<br></br>
      </main>
    </div>
  );
}
