"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-24 text-center max-w-md mx-auto">
      <h1 className="display text-4xl">Something went out of tune.</h1>
      <p className="text-muted mt-3 mb-8">We hit a problem loading this page. It&apos;s probably temporary — try again in a moment.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Go home</Link>
      </div>
    </div>
  );
}
